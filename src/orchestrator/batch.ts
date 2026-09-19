import { execFile } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { workOnIssue, type ResultRecord } from "./work.js";
import type { HuntedIssue } from "./hunt.js";
import type { OrchestraConfig } from "./types.js";

const execFileAsync = promisify(execFile);
const PACKAGE_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ADAPTER = path.join(PACKAGE_ROOT, "adapters", "deepseek-agent.js");

function flag(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 ? argv[index + 1] : undefined;
}

interface Scripts {
  test?: string;
  build?: string;
  lint?: string;
}

function readScripts(dir: string): Scripts {
  try {
    const pkg = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8")) as { scripts?: Record<string, string> };
    const scripts = pkg.scripts ?? {};
    return { test: scripts.test, build: scripts.build, lint: scripts.lint };
  } catch {
    return {};
  }
}

function isPython(dir: string): boolean {
  return existsSync(path.join(dir, "pyproject.toml")) ||
    existsSync(path.join(dir, "requirements.txt")) ||
    existsSync(path.join(dir, "setup.py"));
}

function configForRepo(dir: string): OrchestraConfig {
  const base: OrchestraConfig = {
    objective: "",
    agents: { planner: 1, builders: 2, reviewers: 3, breakers: 1, fixers: 2 },
    reviewPolicy: { selfReview: false, crossReview: true, minimumReviewsPerTask: 2 },
    verification: { commands: [], gitDiffCheck: true, http: [], maxFixRounds: 2, commandTimeoutMs: 600_000 },
    agentCommands: { planner: "", builder: "", reviewer: "", fixer: "", breaker: "" },
    agentTimeoutMs: 900_000
  };
  const commands: string[] = [];
  if (isPython(dir)) {
    commands.push("python -m pip install -q -e .");
    commands.push("python -m pytest");
  } else {
    commands.push("npm install --no-audit --no-fund");
    const scripts = readScripts(dir);
    if (scripts.test) commands.push("npm test");
    if (scripts.build) commands.push("npm run build");
    if (scripts.lint) commands.push("npm run lint");
    if (!scripts.test) commands.push("npm test");
  }
  base.verification.commands = commands;
  return base;
}

function writeWorkConfig(dir: string, config: OrchestraConfig, adapter: string): string {
  const file = path.join(dir, "guildless.work.yml");
  const agent = `node ${adapter.replaceAll("\\", "/")}`;
  const yaml =
    `objective: "pending"\n` +
    `agents:\n  planner: ${config.agents.planner}\n  builders: ${config.agents.builders}\n  reviewers: ${config.agents.reviewers}\n  breakers: ${config.agents.breakers}\n  fixers: ${config.agents.fixers}\n` +
    `review_policy:\n  self_review: ${config.reviewPolicy.selfReview}\n  cross_review: ${config.reviewPolicy.crossReview}\n  minimum_reviews_per_task: ${config.reviewPolicy.minimumReviewsPerTask}\n` +
    `agent_commands:\n  planner: "${agent}"\n  builder: "${agent}"\n  reviewer: "${agent}"\n  fixer: "${agent}"\n  breaker: "${agent}"\n` +
    `agent_timeout_ms: ${config.agentTimeoutMs}\n` +
    `verification:\n  commands:\n${config.verification.commands.map((c) => `    - "${c.replaceAll('"', '\\"')}"`).join("\n")}\n` +
    `  git_diff_check: ${config.verification.gitDiffCheck}\n  max_fix_rounds: ${config.verification.maxFixRounds}\n`;
  writeFileSync(file, yaml, "utf8");
  return "guildless.work.yml";
}

async function cloneRepo(repo: string, issue: string, root: string): Promise<string> {
  const dir = path.join(root, `${repo.replaceAll("/", "__")}-${issue}`);
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  mkdirSync(root, { recursive: true });
  await execFileAsync("git", ["clone", "--depth", "1", `https://github.com/${repo}`, dir], { timeout: 300_000 });
  return dir;
}

function usage(): string {
  return "Usage:\n  guildless batch --hunt <file> [--limit N] [--dry-run|--push] [--root <dir>] [--json]";
}

export async function batchCommand(argv: string[], cwd: string): Promise<number> {
  const json = argv.includes("--json");
  const push = argv.includes("--push");
  const dryRun = !push;
  const huntPath = flag(argv, "hunt");
  const limit = Number(flag(argv, "limit") ?? "10");
  const root = flag(argv, "root") ?? path.join(cwd, ".guildless", "repos");
  const adapter = ADAPTER;

  if (!huntPath) {
    console.error("--hunt <file> is required (output of `guildless hunt`)");
    console.error(usage());
    return 2;
  }

  let hunt: HuntedIssue[];
  try {
    hunt = JSON.parse(readFileSync(path.resolve(cwd, huntPath), "utf8")) as HuntedIssue[];
  } catch (error) {
    console.error(`Cannot read hunt file: ${String(error)}`);
    return 2;
  }

  const easy = hunt.filter((item) => item.difficulty === "easy").slice(0, limit);
  const records: ResultRecord[] = [];

  for (const item of easy) {
    let cloneDir: string | null = null;
    try {
      cloneDir = await cloneRepo(item.repo, item.issue, root);
      const config = configForRepo(cloneDir);
      const configPath = writeWorkConfig(cloneDir, config, adapter);
      const result = await workOnIssue(cloneDir, {
        repo: item.repo,
        issue: item.issue,
        configPath,
        push,
        dryRun,
        ledgerCwd: cwd,
        resultsDir: cwd
      });
      records.push(resultRecordForResult(result, item));
    } catch (error) {
      records.push({ repository: item.repo, issue: item.issue, accepted: false, human_interventions: 0, elapsed_seconds: 0, tokens: 0, cost_usd: 0, tests_passed: false, build_passed: false, lint_passed: false, error: String(error) });
    } finally {
      if (cloneDir) {
        try { rmSync(cloneDir, { recursive: true, force: true }); } catch { /* best effort */ }
      }
    }
  }

  if (json) {
    process.stdout.write(`${JSON.stringify(records, null, 2)}\n`);
  } else {
    const lines = ["GUILDLESS BATCH", "", `${records.length} easy issue(s) processed (${push ? "push" : "dry-run"})`, ""];
    for (const record of records) {
      lines.push(`[${record.accepted ? "ACCEPTED" : "REJECTED"}] ${record.repository}#${record.issue} ${record.elapsed_seconds}s ${record.tokens} tokens${record.error ? ` error=${record.error}` : ""}`);
    }
    console.log(lines.join("\n"));
  }
  return records.some((record) => record.accepted) ? 0 : 1;
}

function resultRecordForResult(result: Awaited<ReturnType<typeof workOnIssue>>, item: HuntedIssue): ResultRecord {
  const tokens = result.agentMetrics.reduce((sum, m) => sum + (m.inputTokens ?? 0) + (m.outputTokens ?? 0), 0);
  const pr = result.verify.find((v) => v.id === "pr");
  const record: ResultRecord = {
    repository: item.repo,
    issue: item.issue,
    accepted: result.verdict === "ACCEPTED",
    human_interventions: 0,
    elapsed_seconds: Math.max(0, (Date.parse(result.finishedAt) - Date.parse(result.startedAt)) / 1000),
    tokens,
    cost_usd: result.agentMetrics.reduce((sum, m) => sum + (m.cost ?? 0), 0),
    tests_passed: result.verify.filter((v) => /test/i.test(v.label)).every((v) => v.ok),
    build_passed: result.verify.filter((v) => /build/i.test(v.label)).every((v) => v.ok),
    lint_passed: result.verify.filter((v) => /lint/i.test(v.label)).every((v) => v.ok),
    pr_url: pr?.detail,
    run_id: result.runId
  };
  if (result.errors.length > 0) record.error = result.errors.join("; ");
  return record;
}
