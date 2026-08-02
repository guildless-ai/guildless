import path from "node:path";
import { loadOrchestraConfig } from "./config.js";
import { EventLog } from "./events.js";
import type { OrchestraConfig } from "./types.js";
import { orchestrate } from "./workflow.js";
import { renderStatusBoard } from "./ui.js";

function flag(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 ? argv[index + 1] : undefined;
}

function defaultRunConfig(): OrchestraConfig {
  const tool = `node {tool}/`;
  return {
    objective: "",
    agents: { planner: 1, builders: 2, reviewers: 2, breakers: 1, fixers: 1 },
    reviewPolicy: { selfReview: false, crossReview: true, minimumReviewsPerTask: 1 },
    verification: { commands: ["npm test"], gitDiffCheck: true, http: [], maxFixRounds: 2, commandTimeoutMs: 600_000 },
    agentCommands: {
      planner: `${tool}planner.js --input {input} --output {output}`,
      builder: `${tool}builder.js --input {input} --output {output}`,
      reviewer: `${tool}reviewer.js --input {input} --output {output}`,
      fixer: `${tool}fixer.js --input {input} --output {output}`,
      breaker: `${tool}breaker.js --input {input} --output {output}`
    },
    agentTimeoutMs: 600_000
  };
}

export async function runCommand(argv: string[], cwd: string): Promise<number> {
  const json = argv.includes("--json");
  const quiet = argv.includes("--quiet");
  const configPath = flag(argv, "config");
  const goal = argv[0] && !argv[0].startsWith("--") ? argv[0] : undefined;

  if (!goal) {
    console.error('Usage: guildless run "<goal>" [--config <path>] [--json] [--quiet]');
    return 2;
  }

  let config: OrchestraConfig;
  try {
    config = configPath
      ? await loadOrchestraConfig(path.resolve(cwd, configPath))
      : defaultRunConfig();
    config.objective = goal;
  } catch (error) {
    console.error(`Config error: ${String(error)}`);
    return 2;
  }

  const result = await orchestrate(cwd, config, new EventLog(cwd));
  if (json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else if (!quiet) {
    console.log(renderStatusBoard(result));
  }
  return result.verdict === "ACCEPTED" ? 0 : 1;
}
