import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CheckResult } from "./checks/types.js";
import type { GuildlessContract } from "./contract.js";

export interface EvidencePayload {
  runId: string;
  timestamp: string;
  cwd: string;
  accepted: boolean;
  checks: CheckResult[];
  contract: GuildlessContract | null;
}

export function newRunId(now = new Date()): string {
  const pad = (n: number, width = 2): string => String(n).padStart(width, "0");
  const date = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}`;
  const time = `${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;
  const random = Math.floor(Math.random() * 0x10000).toString(16).padStart(4, "0");
  return `${date}-${time}-${random}`;
}

export async function saveEvidence(cwd: string, payload: EvidencePayload): Promise<string> {
  const file = path.join(cwd, ".guildless", "runs", payload.runId, "evidence.json");
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return path.relative(cwd, file).replaceAll("\\", "/");
}
