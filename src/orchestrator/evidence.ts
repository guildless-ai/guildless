import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { OrchestrationResult } from "./types.js";

export function saveOrchestraEvidence(cwd: string, result: OrchestrationResult): string {
  const file = path.join(cwd, ".guildless", "runs", result.runId, "evidence.json");
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  return path.relative(cwd, file).replaceAll("\\", "/");
}
