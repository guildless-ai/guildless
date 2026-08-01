#!/usr/bin/env node
import { access } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadContract } from "./contract.js";
import { checkCommands } from "./checks/command.js";
import { checkCommitMatch } from "./checks/commit-match.js";
import { checkGitClean } from "./checks/git-clean.js";
import { checkHttp } from "./checks/http.js";
import { checkUnverifiedScope } from "./checks/unverified-scope.js";
import type { CheckResult } from "./checks/types.js";
import { renderReport, type VerificationReport } from "./report.js";

function usage(): string {
  return "Usage: guildless verify [--config <path>] [--json]";
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
  if (argv[0] !== "verify") {
    console.error(usage());
    return 2;
  }
  const json = argv.includes("--json");
  const configIndex = argv.indexOf("--config");
  const config = configIndex >= 0 ? argv[configIndex + 1] : await defaultConfig(cwd);
  if (!config) {
    console.error("--config requires a path");
    return 2;
  }

  let report: VerificationReport;
  try {
    const contract = await loadContract(path.resolve(cwd, config));
    const checks: CheckResult[] = [];
    checks.push(await checkGitClean(cwd));
    checks.push(await checkCommitMatch(cwd, contract.testedCommit));
    checks.push(await checkCommands(cwd, contract.commands));
    checks.push(await checkHttp(contract.urls));
    checks.push(checkUnverifiedScope(contract.unverifiedScope));
    report = { accepted: checks.every((check) => check.ok), checks };
  } catch (error) {
    report = {
      accepted: false,
      checks: [{ id: "unverified-scope", ok: false, summary: "Verification contract is invalid", detail: String(error) }]
    };
  }

  console.log(json ? JSON.stringify(report, null, 2) : renderReport(report));
  return report.accepted ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = await main();
}
