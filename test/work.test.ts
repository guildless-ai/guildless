import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { detectSecretFiles } from "../src/orchestrator/isolation.js";
import { appendLedger, readLedger, summarizeLedger } from "../src/orchestrator/ledger.js";
import { workCommand, workOnIssue } from "../src/orchestrator/work.js";

const exec = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const agentCommand = (name: string): string => `node ${path.join(here, "fixtures", "agents", `${name}.cjs`).replaceAll("\\", "/")} --input {input} --output {output}`;

async function tempRepo(): Promise<string> {
  const cwd = await mkdtemp(path.join(tmpdir(), "guildless-work-"));
  await exec("git", ["init"], { cwd });
  await exec("git", ["config", "user.email", "test@example.com"], { cwd });
  await exec("git", ["config", "user.name", "Test"], { cwd });
  await writeFile(path.join(cwd, "base.txt"), "base");
  await exec("git", ["add", "base.txt"], { cwd });
  await exec("git", ["commit", "-m", "seed"], { cwd });
  return cwd;
}

const WORK_CONFIG = (): string => `objective: "fix"
agents:
  planner: 1
  builders: 1
  reviewers: 1
  breakers: 0
  fixers: 1
review_policy:
  self_review: false
  cross_review: true
  minimum_reviews_per_task: 1
agent_commands:
  planner: "${agentCommand("planner")}"
  builder: "${agentCommand("builder")}"
  reviewer: "${agentCommand("reviewer")}"
  fixer: "${agentCommand("fixer")}"
  breaker: "${agentCommand("breaker")}"
verification:
  commands:
    - node -e "require('fs').existsSync('src/task-a.ts') || process.exit(1)"
  git_diff_check: false
  max_fix_rounds: 1
`;

test("refuses real secrets but allows env templates", async () => {
  const cwd = await tempRepo();
  try {
    await writeFile(path.join(cwd, ".env"), "SECRET=1");
    await writeFile(path.join(cwd, ".env.example"), "KEY=value");
    await exec("git", ["add", "-A"], { cwd });
    await exec("git", ["commit", "-m", "add env files"], { cwd });
    const detected = await detectSecretFiles(cwd);
    assert.deepEqual(detected, [".env"]);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("refuses to run when committed secret files exist", async () => {
  const cwd = await tempRepo();
  try {
    await writeFile(path.join(cwd, ".env"), "SECRET=1");
    await exec("git", ["add", ".env"], { cwd });
    await exec("git", ["commit", "-m", "add env"], { cwd });
    const detected = await detectSecretFiles(cwd);
    assert.ok(detected.includes(".env"));
    await assert.rejects(
      () => workOnIssue(cwd, { repo: "x/y", title: "t", dryRun: true, push: false }),
      /refusing to run/
    );
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("runs an isolated worktree and records the ledger (dry run)", async () => {
  const cwd = await tempRepo();
  try {
    await writeFile(path.join(cwd, "guildless.work.yml"), WORK_CONFIG());
    const code = await workCommand(["--repo", "x/y", "--title", "Fix the tests", "--config", "guildless.work.yml", "--dry-run"], cwd);
    assert.equal(code, 0);

    const entries = readLedger(cwd);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].verdict, "ACCEPTED");
    assert.equal(entries[0].humanCorrection, false);
    assert.ok(entries[0].runId);

    const worktrees = path.join(cwd, ".guildless", "worktrees");
    const remaining = existsSync(worktrees) ? await readdir(worktrees) : [];
    assert.equal(remaining.length, 0, "worktree must be cleaned up");

    const { stdout } = await exec("git", ["branch", "--list", `guildless/task-${entries[0].runId}`], { cwd });
    assert.ok(stdout.includes(entries[0].runId), "branch must exist after worktree removal");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("summarizes the ledger for KPI reporting", async () => {
  const cwd = await tempRepo();
  try {
    appendLedger(cwd, { runId: "r1", ts: "t", repo: "x/y", issue: "1", title: "a", verdict: "ACCEPTED", prUrl: "https://github.com/x/y/pull/1", elapsedMs: 1000, inputTokens: 10, outputTokens: 5, cost: 0, humanCorrection: false });
    appendLedger(cwd, { runId: "r2", ts: "t", repo: "x/y", issue: "2", title: "b", verdict: "REJECTED", elapsedMs: 500, inputTokens: 4, outputTokens: 2, cost: 0, humanCorrection: true, error: "failed" });
    const summary = summarizeLedger(readLedger(cwd));
    assert.equal(summary.runs, 2);
    assert.equal(summary.accepted, 1);
    assert.equal(summary.rejected, 1);
    assert.equal(summary.prsCreated, 1);
    assert.equal(summary.humanCorrections, 1);
    assert.equal(summary.inputTokens, 14);
    assert.equal(summary.elapsedMs, 1500);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
