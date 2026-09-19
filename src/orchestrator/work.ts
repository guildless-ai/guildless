import { execFile } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { newRunId } from "../evidence.js";
import { loadOrchestraConfig } from "./config.js";
import { detectSecretFiles } from "./isolation.js";
import { EventLog } from "./events.js";
import { appendLedger, readLedger, summarizeLedger, type LedgerEntry } from "./ledger.js";
import type { OrchestraConfig, OrchestrationResult } from "./types.js";
import { orchestrate } from "./workflow.js";

const execFileAsync = promisify(execFile);

export interface ResultRecord {
  repository: string;
  issue: string;
  accepted: boolean;
  human_interventions: number;
  elapsed_seconds: number;
  tokens: number;
  cost_usd: number;
  tests_passed: boolean;
  build_passed: boolean;
  lint_passed: boolean;
  pr_url?: string;
  run_id?: string;
  error?: string;
}

const PACKAGE_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ADAPTER = path.join(PACKAGE_ROOT, "adapters", "deepseek-agent.js");

function defaultWorkConfig(): OrchestraConfig {
  const adapter = `node ${ADAPTER}`;
  return {
    objective: "",
    agents: { planner: 1, builders: 2, reviewers: 3, breakers: 1, fixers: 2 },
    reviewPolicy: { selfReview: false, crossReview: true, minimumReviewsPerTask: 2 },
    verification: { commands: ["npm test"], gitDiffCheck: true, http: [], maxFixRounds: 2, commandTimeoutMs: 600_000 },
    agentCommands: { planner: adapter, builder: adapter, reviewer: adapter, fixer: adapter, breaker: adapter },
    agentTimeoutMs: 900_000
  };
}

function flag(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 ? argv[index + 1] : undefined;
}

interface WorkRequest {
  repo: string;
  issue?: string;
  title?: string;
  body?: string;
  configPath?: string;
  push: boolean;
  dryRun: boolean;
  ledgerCwd?: string;
  resultsDir?: string;
}

function matchesOk(verify: OrchestrationResult["verify"], pattern: RegExp): boolean {
  const relevant = verify.filter((v) => pattern.test(v.label));
  return relevant.length === 0 || relevant.every((v) => v.ok);
}

export function resultRecordFor(result: OrchestrationResult, repo: string, issue: string): ResultRecord {
  const tokens = result.agentMetrics.reduce((sum, m) => sum + (m.inputTokens ?? 0) + (m.outputTokens ?? 0), 0);
  const pr = result.verify.find((v) => v.id === "pr");
  const record: ResultRecord = {
    repository: repo,
    issue,
    accepted: result.verdict === "ACCEPTED",
    human_interventions: 0,
    elapsed_seconds: Math.max(0, (Date.parse(result.finishedAt) - Date.parse(result.startedAt)) / 1000),
    tokens,
    cost_usd: result.agentMetrics.reduce((sum, m) => sum + (m.cost ?? 0), 0),
    tests_passed: matchesOk(result.verify, /test/i),
    build_passed: matchesOk(result.verify, /build/i),
    lint_passed: matchesOk(result.verify, /lint/i),
    pr_url: pr?.detail,
    run_id: result.runId
  };
  if (result.errors.length > 0) record.error = result.errors.join("; ");
  return record;
}

function saveResult(cwd: string, record: ResultRecord): void {
  const dir = path.join(cwd, ".guildless", "results");
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${record.repository.replaceAll("/", "__")}-${record.issue}-${record.run_id ?? newRunId()}.json`);
  writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`, "utf8");
}

async function fetchIssue(repo: string, issue: string): Promise<{ title: string; body: string }> {
  const { stdout } = await execFileAsync("gh", ["issue", "view", repo, issue, "--json", "title,body"], { encoding: "utf8" });
  const parsed = JSON.parse(stdout) as { title?: unknown; body?: unknown };
  if (typeof parsed.title !== "string" || parsed.title.trim() === "") {
    throw new Error(`issue ${repo}#${issue} has no title`);
  }
  return { title: parsed.title, body: typeof parsed.body === "string" ? parsed.body : "" };
}

export async function workOnIssue(cwd: string, request: WorkRequest): Promise<OrchestrationResult> {
  const secrets = await detectSecretFiles(cwd);
  if (secrets.length > 0) {
    throw new Error(`refusing to run: committed secret files detected (${secrets.join(", ")})`);
  }

  const runId = newRunId();
  const branch = `guildless/${request.issue ?? "task"}-${runId}`;
  const worktreeDir = path.join(cwd, ".guildless", "worktrees", runId);
  mkdirSync(path.dirname(worktreeDir), { recursive: true });
  await execFileAsync("git", ["worktree", "add", "-b", branch, worktreeDir, "HEAD"], { cwd });

  let config: OrchestraConfig;
  try {
    config = request.configPath
      ? await loadOrchestraConfig(path.resolve(cwd, request.configPath))
      : defaultWorkConfig();
    config.objective = `${request.title}\n\n${request.body ?? ""}`.trim();
  } catch (error) {
    await removeWorktree(cwd, worktreeDir);
    throw error;
  }

  const result = await orchestrate(worktreeDir, config, new EventLog(request.ledgerCwd ?? cwd));
  let prUrl: string | undefined;

  if (result.verdict === "ACCEPTED" && !request.dryRun && request.push) {
    try {
      await execFileAsync("git", ["add", "-A"], { cwd: worktreeDir });
      await execFileAsync("git", ["reset", "-q", "--", ".guildless"], { cwd: worktreeDir });
      await execFileAsync("git", ["commit", "-m", `guildless: resolve ${request.issue ? `#${request.issue}` : "task"}`], { cwd: worktreeDir });
      await execFileAsync("git", ["push", "origin", branch], { cwd: worktreeDir });
      const { stdout } = await execFileAsync("gh", [
        "pr", "create", "--repo", request.repo, "--base", "main", "--head", branch,
        "--title", request.title ?? "guildless", "--body", "Generated by GUILDLESS cross-review orchestration."
      ], { cwd, encoding: "utf8" });
      prUrl = stdout.trim();
      result.verify.push({ id: "pr", kind: "command", label: "PR created", ok: true, detail: prUrl });
    } catch (error) {
      result.errors.push(`push/pr failed: ${String(error)}`);
    }
  } else if (result.verdict === "ACCEPTED" && !request.dryRun) {
    result.verify.push({ id: "pr", kind: "command", label: "PR skipped (no --push)", ok: true });
  }

  const metrics = result.agentMetrics;
  const entry: LedgerEntry = {
    runId,
    ts: new Date().toISOString(),
    repo: request.repo,
    issue: request.issue,
    title: request.title,
    verdict: result.verdict,
    prUrl,
    elapsedMs: Date.parse(result.finishedAt) - Date.parse(result.startedAt),
    inputTokens: metrics.reduce((sum, m) => sum + (m.inputTokens ?? 0), 0),
    outputTokens: metrics.reduce((sum, m) => sum + (m.outputTokens ?? 0), 0),
    cost: metrics.reduce((sum, m) => sum + (m.cost ?? 0), 0),
    humanCorrection: false,
    error: result.errors.length > 0 ? result.errors.join("; ") : undefined
  };
  const ledgerDir = request.ledgerCwd ?? cwd;
  appendLedger(ledgerDir, entry);
  const record = resultRecordFor(result, request.repo, request.issue ?? "");
  if (request.resultsDir) saveResult(request.resultsDir, record);

  await removeWorktree(cwd, worktreeDir);
  return result;
}

async function removeWorktree(cwd: string, worktreeDir: string): Promise<void> {
  try {
    await execFileAsync("git", ["worktree", "remove", "--force", worktreeDir], { cwd });
  } catch { /* best-effort cleanup */ }
}

function usage(): string {
  return "Usage:\n" +
    "  guildless work --repo <owner/repo> --issue <number> [--config <path>] [--push] [--dry-run] [--json] [--quiet]\n" +
    "  guildless work --repo <owner/repo> --title <text> [--config <path>] [--dry-run]\n" +
    "  guildless stats [--json]";
}

export async function workCommand(argv: string[], cwd: string): Promise<number> {
  const json = argv.includes("--json");
  const quiet = argv.includes("--quiet");
  const repo = flag(argv, "repo");
  const issue = flag(argv, "issue");
  const title = flag(argv, "title");
  const configPath = flag(argv, "config");
  const push = argv.includes("--push");
  const dryRun = argv.includes("--dry-run");

  if (!repo) {
    console.error("--repo <owner/repo> is required");
    console.error(usage());
    return 2;
  }
  if (!issue && !title) {
    console.error("--issue <number> or --title <text> is required");
    console.error(usage());
    return 2;
  }

  let request: WorkRequest;
  try {
    const issueTitle = issue ? (await fetchIssue(repo, issue)).title : title ?? "";
    const issueBody = issue ? (await fetchIssue(repo, issue)).body : "";
    request = { repo, issue, title: issueTitle, body: issueBody, configPath, push, dryRun };
  } catch (error) {
    if (json) {
      process.stdout.write(`${JSON.stringify({ error: String(error) }, null, 2)}\n`);
    } else {
      console.error(`Issue error: ${String(error)}`);
    }
    return 2;
  }

  let result: OrchestrationResult;
  try {
    result = await workOnIssue(cwd, request);
  } catch (error) {
    if (json) {
      process.stdout.write(`${JSON.stringify({ error: String(error) }, null, 2)}\n`);
    } else {
      console.error(`Work error: ${String(error)}`);
    }
    return 1;
  }

  if (json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else if (quiet) {
    if (result.verdict === "ACCEPTED") {
      console.log(`GUILDLESS: ACCEPTED${result.verify.some((v) => v.id === "pr") && result.verify.find((v) => v.id === "pr")?.detail ? ` ${result.verify.find((v) => v.id === "pr")?.detail}` : ""}`);
    } else {
      console.log("GUILDLESS: REJECTED");
    }
  } else {
    console.log(renderWorkBoard(result));
  }
  return result.verdict === "ACCEPTED" ? 0 : 1;
}

function renderWorkBoard(result: OrchestrationResult): string {
  const board = [
    "GUILDLESS WORK",
    "",
    `Verdict: ${result.verdict}`,
    `Agents:  ${result.agentMetrics.length}`,
    `Reviews: ${result.reviews.length}  findings: ${result.consensus.length} (high: ${result.consensus.filter((f) => f.severity === "high").length})`,
    `Verify:  ${result.status.verify === "ok" ? "PASS" : "FAIL"}`
  ];
  const pr = result.verify.find((v) => v.id === "pr");
  if (pr?.detail && pr.detail !== "PR skipped (no --push)") board.push(`PR:      ${pr.detail}`);
  if (result.errors.length > 0) board.push(`Errors:  ${result.errors.join("; ")}`);
  if (result.evidencePath) board.push(`Evidence: ${result.evidencePath}`);
  return board.join("\n");
}

export async function statsCommand(argv: string[], cwd: string): Promise<number> {
  const json = argv.includes("--json");
  const markdown = argv.includes("--markdown");
  const checkMerged = argv.includes("--check-merged");
  const entries = readLedger(cwd);
  const summary = summarizeLedger(entries);

  let merged = 0;
  if (checkMerged) {
    for (const entry of entries) {
      if (!entry.prUrl) continue;
      try {
        const { stdout } = await execFileAsync("gh", ["pr", "view", entry.prUrl, "--json", "mergedAt", "--jq", ".mergedAt"], { encoding: "utf8" });
        if (stdout.trim() && stdout.trim() !== "null") merged += 1;
      } catch { /* unreachable or not merged */ }
    }
  }

  const kpi = {
    runs: summary.runs,
    accepted: summary.accepted,
    rejected: summary.rejected,
    humanInterventions: summary.humanCorrections,
    mergedPr: merged,
    avgRuntimeSeconds: summary.runs > 0 ? summary.elapsedMs / summary.runs / 1000 : 0,
    avgCostUsd: summary.runs > 0 ? summary.cost / summary.runs : 0,
    avgTokens: summary.runs > 0 ? (summary.inputTokens + summary.outputTokens) / summary.runs : 0
  };

  if (json) {
    process.stdout.write(`${JSON.stringify(kpi, null, 2)}\n`);
    return 0;
  }
  if (markdown) {
    const lines = [
      "| KPI | Value |",
      "|-----|-------|",
      `| Runs | ${kpi.runs} |`,
      `| Accepted | ${kpi.accepted} |`,
      `| Rejected | ${kpi.rejected} |`,
      `| Human interventions | ${kpi.humanInterventions} |`,
      `| Merged PR | ${kpi.mergedPr} |`,
      `| Average runtime | ${kpi.avgRuntimeSeconds.toFixed(0)}s |`,
      `| Average cost | $${kpi.avgCostUsd.toFixed(4)} |`,
      `| Average tokens | ${Math.round(kpi.avgTokens).toLocaleString()} |`
    ];
    console.log(lines.join("\n"));
    return 0;
  }
  const lines = [
    "GUILDLESS STATS",
    "",
    `Runs:              ${kpi.runs}`,
    `Accepted:          ${kpi.accepted}`,
    `Rejected:          ${kpi.rejected}`,
    `Human interventions: ${kpi.humanInterventions}`,
    `Merged PR:         ${kpi.mergedPr}`,
    `Average runtime:   ${kpi.avgRuntimeSeconds.toFixed(0)}s`,
    `Average cost:      $${kpi.avgCostUsd.toFixed(4)}`,
    `Average tokens:    ${Math.round(kpi.avgTokens).toLocaleString()}`
  ];
  console.log(lines.join("\n"));
  return 0;
}
