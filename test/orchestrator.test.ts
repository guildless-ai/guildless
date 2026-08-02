import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { loadOrchestraConfig } from "../src/orchestrator/config.js";
import { EventLog, readEventsFile } from "../src/orchestrator/events.js";
import { aggregateFindings, buildReviewMatrix } from "../src/orchestrator/review.js";
import { renderQuietVerdict, renderStatusBoard } from "../src/orchestrator/ui.js";
import { computeVerdict, orchestrate } from "../src/orchestrator/workflow.js";
import type { ConsensusFinding, OrchestraConfig, OrchestrationResult, ReviewOutput, StageName, StageStatus } from "../src/orchestrator/types.js";

const exec = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.join(here, "fixtures", "agents");
const agentCommand = (name: string): string => `node ${path.join(fixtures, `${name}.cjs`)} --input {input} --output {output}`;

function makeConfig(overrides: Partial<OrchestraConfig> = {}): OrchestraConfig {
  return {
    objective: "test objective",
    agents: { planner: 1, builders: 2, reviewers: 2, breakers: 1, fixers: 1 },
    reviewPolicy: { selfReview: false, crossReview: true, minimumReviewsPerTask: 1 },
    verification: { commands: ["node -e \"process.exit(0)\""], gitDiffCheck: false, http: [], maxFixRounds: 2 },
    agentCommands: {
      planner: agentCommand("planner"),
      builder: agentCommand("builder"),
      reviewer: agentCommand("reviewer"),
      fixer: agentCommand("fixer"),
      breaker: agentCommand("breaker")
    },
    agentTimeoutMs: 30_000,
    ...overrides
  };
}

async function tempRepo(): Promise<string> {
  const cwd = await mkdtemp(path.join(tmpdir(), "guildless-orch-"));
  await exec("git", ["init"], { cwd });
  await exec("git", ["config", "user.email", "test@example.com"], { cwd });
  await exec("git", ["config", "user.name", "Test"], { cwd });
  await writeFile(path.join(cwd, "base.txt"), "base");
  await exec("git", ["add", "base.txt"], { cwd });
  await exec("git", ["commit", "-m", "seed"], { cwd });
  return cwd;
}

test("runs planner, parallel builders, cross-review fix loop, breaker and verify to ACCEPTED", async () => {
  const cwd = await tempRepo();
  try {
    const config = makeConfig({
      verification: {
        commands: [
          "node --test test/breaker.test.js",
          "node -e \"require('fs').existsSync('src/task-a.ts') && require('fs').existsSync('src/task-b.ts') || process.exit(1)\""
        ],
        gitDiffCheck: false,
        http: [],
        maxFixRounds: 2
      }
    });
    const result = await orchestrate(cwd, config);

    assert.equal(result.verdict, "ACCEPTED");
    assert.equal(result.status.planner, "ok");
    assert.equal(result.status.build, "ok");
    assert.equal(result.status.review, "ok");
    assert.equal(result.status.break, "ok");
    assert.equal(result.status.verify, "ok");
    assert.equal(result.builders.length, 2);
    assert.ok(existsSync(path.join(cwd, "src/task-a.ts")));
    assert.ok(existsSync(path.join(cwd, "src/task-b.ts")));
    assert.equal(result.fixRound, 1, "review finding should consume one fix round");
    assert.equal(result.consensus.length, 0, "finding resolved after fix");
    assert.equal(result.breaker?.testFiles[0], "test/breaker.test.js");
    assert.ok(result.verify.every((v) => v.ok));
    assert.ok(result.evidencePath, "evidence must be saved");
    assert.ok(existsSync(path.join(cwd, result.evidencePath ?? "")));
    const evidence = JSON.parse(await readFile(path.join(cwd, result.evidencePath ?? ""), "utf8"));
    assert.equal(evidence.verdict, "ACCEPTED");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("builds a cross-review matrix without self review", async () => {
  const cwd = await tempRepo();
  try {
    const config = makeConfig({
      agents: { planner: 1, builders: 3, reviewers: 3, breakers: 1, fixers: 1 },
      reviewPolicy: { selfReview: false, crossReview: true, minimumReviewsPerTask: 2 }
    });
    process.env.PLANNER_FILES = "src/t1.ts,src/t2.ts,src/t3.ts";
    const result = await orchestrate(cwd, config);
    delete process.env.PLANNER_FILES;

    assert.equal(result.verdict, "ACCEPTED");
    assert.equal(result.fixRound, 0);
    const reviews = result.reviews;
    assert.equal(reviews.length, 6, "3 builders x 3 reviewers minus self-review");
    for (const review of reviews) {
      assert.notEqual(review.reviewer, review.builder, "no self review allowed");
    }
    const perBuilder = new Map<string, number>();
    for (const review of reviews) {
      perBuilder.set(review.builder, (perBuilder.get(review.builder) ?? 0) + 1);
    }
    for (const count of perBuilder.values()) {
      assert.equal(count, 2, "each builder must be reviewed twice");
    }
  } finally {
    delete process.env.PLANNER_FILES;
    await rm(cwd, { recursive: true, force: true });
  }
});

test("reruns fixers until the mechanical verification passes", async () => {
  const cwd = await tempRepo();
  try {
    process.env.PLANNER_FILES = "src/task-x.ts,src/task-y.ts";
    const config = makeConfig({
      verification: {
        commands: ["node -e \"require('fs').existsSync('.guildless/fixtures/.verify-fixed') ? process.exit(0) : process.exit(1)\""],
        gitDiffCheck: false,
        http: [],
        maxFixRounds: 1
      }
    });
    const result = await orchestrate(cwd, config);
    delete process.env.PLANNER_FILES;

    assert.equal(result.verdict, "ACCEPTED");
    assert.equal(result.fixRound, 1);
    assert.ok(result.verify.every((v) => v.ok));
    assert.ok(existsSync(path.join(cwd, ".guildless/fixtures/.verify-fixed")));
  } finally {
    delete process.env.PLANNER_FILES;
    await rm(cwd, { recursive: true, force: true });
  }
});

test("rejects when verification cannot be fixed within the round budget", async () => {
  const cwd = await tempRepo();
  try {
    const config = makeConfig({
      verification: { commands: ["node -e \"process.exit(1)\""], gitDiffCheck: false, http: [], maxFixRounds: 1 }
    });
    const result = await orchestrate(cwd, config);
    assert.equal(result.verdict, "REJECTED");
    assert.equal(result.status.verify, "fail");
    assert.equal(result.fixRound, 1);
    assert.ok(result.verify.some((v) => !v.ok));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("rejects when the planner agent fails", async () => {
  const cwd = await tempRepo();
  try {
    const config = makeConfig({
      agentCommands: { ...makeConfig().agentCommands, planner: "node -e \"process.exit(9)\"" }
    });
    const result = await orchestrate(cwd, config);
    assert.equal(result.verdict, "REJECTED");
    assert.equal(result.status.planner, "fail");
    assert.match(result.errors.join(" "), /planner failed/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("verdict is machine-first: only unresolved high findings reject", () => {
  const high: ConsensusFinding = { target: "src/a.ts", severity: "high", message: "x", file: "src/a.ts", reports: 1, focuses: [] };
  const low: ConsensusFinding = { target: "src/a.ts", severity: "low", message: "y", file: "src/a.ts", reports: 1, focuses: [] };
  assert.equal(computeVerdict(false, []), "REJECTED");
  assert.equal(computeVerdict(true, [high]), "REJECTED");
  assert.equal(computeVerdict(true, [low]), "ACCEPTED");
  assert.equal(computeVerdict(true, []), "ACCEPTED");
});

test("emits live events to the event log while orchestrating", async () => {
  const cwd = await tempRepo();
  try {
    const events = new EventLog(cwd);
    const result = await orchestrate(cwd, makeConfig(), events);
    assert.equal(result.verdict, "ACCEPTED");
    const logged = readEventsFile(events.file);
    assert.ok(logged.length > 0);
    const types = new Set(logged.map((e) => e.type));
    assert.ok(types.has("run_start"));
    assert.ok(types.has("agent_start"));
    assert.ok(types.has("agent_end"));
    assert.ok(types.has("verdict"));
    assert.ok(types.has("summary"));
    assert.equal(logged[logged.length - 1].type, "summary");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("supports the stdin/stdout JSON agent protocol", async () => {
  const cwd = await tempRepo();
  try {
    const config = makeConfig({
      agentCommands: { ...makeConfig().agentCommands, planner: `node ${path.join(fixtures, "planner-pipe.cjs")}` }
    });
    const result = await orchestrate(cwd, config);
    assert.equal(result.verdict, "ACCEPTED");
    assert.equal(result.planner?.status, "ok");
    assert.equal(result.planner?.tasks.length, 2);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("verifier checks design deliverables when configured", async () => {
  const cwd = await tempRepo();
  try {
    const config = makeConfig({
      verification: {
        commands: ["node -e \"process.exit(0)\""],
        gitDiffCheck: false,
        http: [],
        maxFixRounds: 1,
        designDocuments: ["requirements.md", "api-spec.yaml"]
      }
    });
    const missing = await orchestrate(cwd, config);
    assert.equal(missing.verdict, "REJECTED");
    assert.equal(missing.verify.find((v) => v.kind === "design")?.ok, false);

    await writeFile(path.join(cwd, "requirements.md"), "# requirements");
    await writeFile(path.join(cwd, "api-spec.yaml"), "openapi: 3.0.3\ninfo:\n  title: t\n  version: 1.0.0\npaths: {}\n");
    const present = await orchestrate(cwd, config);
    assert.equal(present.verify.find((v) => v.kind === "design")?.ok, true);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("loads and validates an orchestra config", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "guildless-orchcfg-"));
  try {
    const file = path.join(dir, "guildless.orchestra.yml");
    await writeFile(file, `objective: test\nagents:\n  planner: 1\n  builders: 2\n  reviewers: 2\n  breakers: 1\n  fixers: 1\nreview_policy:\n  self_review: false\nverification:\n  commands:\n    - npm test\n`);
    const config = await loadOrchestraConfig(file);
    assert.equal(config.agents.builders, 2);
    assert.equal(config.reviewPolicy.selfReview, false);
    assert.equal(config.reviewPolicy.crossReview, true);
    assert.equal(config.verification.maxFixRounds, 2);
    assert.match(config.agentCommands.planner, /\{tool\}/);

    await writeFile(file, "agents:\n  planner: 1\n  builders: 0\n  reviewers: 1\n  breakers: 1\n  fixers: 1\n");
    await assert.rejects(() => loadOrchestraConfig(file), /agents\.builders/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("aggregates duplicate review findings into a consensus", () => {
  const reviews: ReviewOutput[] = [
    {
      id: "r1", reviewer: "reviewer-1", builder: "builder-1", focus: "bugs and requirements", status: "ok",
      findings: [{ id: "f1", reviewer: "reviewer-1", focus: "bugs and requirements", target: "src/a.ts", severity: "high", message: "unsafe", file: "src/a.ts" }]
    },
    {
      id: "r2", reviewer: "reviewer-2", builder: "builder-1", focus: "security and permissions", status: "ok",
      findings: [{ id: "f2", reviewer: "reviewer-2", focus: "security and permissions", target: "src/a.ts", severity: "medium", message: "unsafe", file: "src/a.ts" }]
    }
  ];
  const consensus = aggregateFindings(reviews);
  assert.equal(consensus.length, 1);
  assert.equal(consensus[0].reports, 2);
  assert.equal(consensus[0].severity, "high");
  assert.deepEqual(consensus[0].focuses, ["bugs and requirements", "security and permissions"]);
});

test("review matrix meets the minimum review count", () => {
  const builders = [
    { id: "builder-1", status: "ok" as const, tasks: [], artifacts: ["a"], summary: undefined },
    { id: "builder-2", status: "ok" as const, tasks: [], artifacts: ["b"], summary: undefined }
  ];
  const specs = buildReviewMatrix(builders, 2, { selfReview: false, minimumReviewsPerTask: 2 });
  assert.equal(specs.length, 4);
  assert.equal(specs.filter((s) => s.builderId === "builder-1").length, 2);
  assert.equal(specs.filter((s) => s.builderId === "builder-2").length, 2);
});

test("renders the status board and quiet verdict", () => {
  const status: Record<StageName, StageStatus> = {
    planner: "ok", build: "ok", review: "ok", fix: "ok", break: "ok", verify: "ok"
  };
  const result: OrchestrationResult = {
    runId: "r1",
    objective: "test",
    config: makeConfig(),
    status,
    planner: { status: "ok", tasks: [] },
    builders: [
      { id: "builder-1", status: "ok", tasks: [], artifacts: [], summary: undefined },
      { id: "builder-2", status: "ok", tasks: [], artifacts: [], summary: undefined }
    ],
    reviews: [],
    consensus: [],
    fixes: [],
    fixRound: 1,
    breaker: { id: "breaker", status: "ok", testFiles: [], summary: undefined },
    verify: [{ id: "v", kind: "command", label: "npm test", ok: true }],
    verdict: "ACCEPTED",
    errors: [],
    agentMetrics: [
      { role: "planner", id: "planner", model: "opencode/deepseek-v4-flash-free", inputTokens: 120, outputTokens: 30, elapsedMs: 1000, cost: 0 },
      { role: "builder", id: "builder-1", model: "opencode/deepseek-v4-flash-free", inputTokens: 500, outputTokens: 200, elapsedMs: 2000, cost: 0 }
    ],
    evidencePath: ".guildless/runs/r1/evidence.json",
    startedAt: "t",
    finishedAt: "t"
  };
  const board = renderStatusBoard(result);
  assert.match(board, /Verdict: ACCEPTED/);
  assert.match(board, /Builders\s+2\/2/);
  assert.match(board, /Verifier\s+PASS/);
  assert.match(board, /Agents\s+2/);
  assert.equal(renderQuietVerdict(result), "");

  const rejected: OrchestrationResult = {
    ...result,
    verdict: "REJECTED",
    status: { ...status, verify: "fail" },
    verify: [{ id: "v", kind: "command", label: "npm test", ok: false }]
  };
  assert.match(renderQuietVerdict(rejected), /^GUILDLESS: REJECTED:/);
});
