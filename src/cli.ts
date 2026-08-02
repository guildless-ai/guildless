#!/usr/bin/env node
import { access } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadContract, type GuildlessContract } from "./contract.js";
import { checkCommands } from "./checks/command.js";
import { checkCommitMatch } from "./checks/commit-match.js";
import { checkDesign } from "./checks/design.js";
import { checkGitClean } from "./checks/git-clean.js";
import { checkHttp } from "./checks/http.js";
import { checkUnverifiedScope } from "./checks/unverified-scope.js";
import type { CheckResult } from "./checks/types.js";
import { newRunId, saveEvidence } from "./evidence.js";
import { orchestrateCommand } from "./orchestrator/command.js";
import { batchCommand } from "./orchestrator/batch.js";
import { huntCommand } from "./orchestrator/hunt.js";
import { runCommand } from "./orchestrator/run.js";
import { statsCommand, workCommand } from "./orchestrator/work.js";
import { watchCommand } from "./orchestrator/watch.js";
import { renderReport, type VerificationReport } from "./report.js";

function usage(): string {
  return "Usage:\n" +
    "  guildless run \"<goal>\" [--config <path>] [--json] [--quiet]\n" +
    "  guildless orchestrate [--config <path>] [--json] [--quiet]\n" +
    "  guildless work --repo <owner/repo> --issue <number> [--config <path>] [--push] [--dry-run] [--json] [--quiet]\n" +
    "  guildless hunt [--language ts|python|both] [--limit N] [--json]\n" +
    "  guildless batch --hunt <file> [--limit N] [--dry-run|--push] [--json]\n" +
    "  guildless stats [--json] [--markdown] [--check-merged]\n" +
    "  guildless watch [--file <path>] [--json] [--once] [--interval <ms>]\n" +
    "  guildless verify [--config <path>] [--json] [--verbose] [--quiet]";
}

async function defaultConfig(cwd: string): Promise<string> {
  for (const name of ["guildless.yml", "guildless.yaml"]) {
    try { await access(path.join(cwd, name)); return name; } catch { /* try next */ }
  }
  return "guildless.yml";
}

export async function main(argv = process.argv.slice(2), cwd = process.cwd()): Promise<number> {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(usage());
    return 0;
  }
  if (argv[0] === "orchestrate") {
    return orchestrateCommand(argv.slice(1), cwd);
  }
  if (argv[0] === "work") {
    return workCommand(argv.slice(1), cwd);
  }
  if (argv[0] === "stats") {
    return statsCommand(argv.slice(1), cwd);
  }
  if (argv[0] === "hunt") {
    return huntCommand(argv.slice(1), cwd);
  }
  if (argv[0] === "batch") {
    return batchCommand(argv.slice(1), cwd);
  }
  if (argv[0] === "watch") {
    return watchCommand(argv.slice(1), cwd);
  }
  if (argv[0] === "run") {
    return runCommand(argv.slice(1), cwd);
  }
  if (argv[0] !== "verify") {
    console.error(usage());
    return 2;
  }
  const json = argv.includes("--json");
  const quiet = argv.includes("--quiet");
  const verbose = argv.includes("--verbose");
  const configIndex = argv.indexOf("--config");
  const config = configIndex >= 0 ? argv[configIndex + 1] : await defaultConfig(cwd);
  if (!config) {
    console.error("--config requires a path");
    return 2;
  }

  let report: VerificationReport;
  let contract: GuildlessContract | null = null;
  try {
    contract = await loadContract(path.resolve(cwd, config));
    const checks: CheckResult[] = [];
    checks.push(await checkGitClean(cwd));
    checks.push(await checkCommitMatch(cwd, contract.testedCommit));
    checks.push(await checkCommands(cwd, contract.commands));
    checks.push(await checkHttp(contract.urls));
    checks.push(checkUnverifiedScope(contract.unverifiedScope));
    if (contract.design) checks.push(await checkDesign(cwd, contract.design));
    report = { accepted: checks.every((check) => check.ok), checks, runId: null, evidencePath: null, evidenceError: null };
  } catch (error) {
    report = {
      accepted: false,
      checks: [{
        id: "contract",
        ok: false,
        summary: "Verification contract is invalid",
        detail: String(error),
        recommendation: "Fix guildless.yml and re-run"
      }],
      runId: null,
      evidencePath: null,
      evidenceError: null
    };
  }

  const runId = newRunId();
  report.runId = runId;
  try {
    report.evidencePath = await saveEvidence(cwd, {
      runId,
      timestamp: new Date().toISOString(),
      cwd,
      accepted: report.accepted,
      checks: report.checks,
      contract
    });
  } catch (error) {
    report.evidenceError = String(error);
  }

  if (json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    const mode = quiet ? "quiet" : verbose ? "verbose" : "normal";
    const text = renderReport(report, mode);
    if (text) console.log(text);
  }
  return report.accepted ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = await main();
}
