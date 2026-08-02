import { access } from "node:fs/promises";
import path from "node:path";
import { loadOrchestraConfig } from "./config.js";
import { renderQuietVerdict, renderStatusBoard } from "./ui.js";
import { orchestrate } from "./workflow.js";

async function defaultConfig(cwd: string): Promise<string> {
  for (const name of ["guildless.orchestra.yml", "guildless.orchestra.yaml"]) {
    try { await access(path.join(cwd, name)); return name; } catch { /* try next */ }
  }
  return "guildless.orchestra.yml";
}

export async function orchestrateCommand(argv: string[], cwd: string): Promise<number> {
  const json = argv.includes("--json");
  const quiet = argv.includes("--quiet");
  const configIndex = argv.indexOf("--config");
  const config = configIndex >= 0 ? argv[configIndex + 1] : await defaultConfig(cwd);
  if (!config) {
    console.error("--config requires a path");
    return 2;
  }

  let contract;
  try {
    contract = await loadOrchestraConfig(path.resolve(cwd, config));
  } catch (error) {
    if (json) {
      process.stdout.write(`${JSON.stringify({ error: String(error) }, null, 2)}\n`);
    } else {
      console.error(`Config error: ${String(error)}`);
    }
    return 2;
  }

  const result = await orchestrate(cwd, contract);
  if (json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else if (quiet) {
    const text = renderQuietVerdict(result);
    if (text) console.log(text);
  } else {
    console.log(renderStatusBoard(result));
  }
  return result.verdict === "ACCEPTED" ? 0 : 1;
}
