import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

export interface LedgerEntry {
  runId: string;
  ts: string;
  repo?: string;
  issue?: string;
  title?: string;
  verdict: "ACCEPTED" | "REJECTED";
  prUrl?: string;
  elapsedMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  cost?: number;
  humanCorrection: boolean;
  error?: string;
}

export function ledgerFile(cwd: string): string {
  return path.join(cwd, ".guildless", "ledger.jsonl");
}

export function appendLedger(cwd: string, entry: LedgerEntry): string {
  const file = ledgerFile(cwd);
  mkdirSync(path.dirname(file), { recursive: true });
  appendFileSync(file, `${JSON.stringify(entry)}\n`, "utf8");
  return path.relative(cwd, file).replaceAll("\\", "/");
}

export function readLedger(cwd: string): LedgerEntry[] {
  const file = ledgerFile(cwd);
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch {
    return [];
  }
  const entries: LedgerEntry[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line) as LedgerEntry);
    } catch { /* skip malformed */ }
  }
  return entries;
}

export interface LedgerSummary {
  runs: number;
  accepted: number;
  rejected: number;
  prsCreated: number;
  humanCorrections: number;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  elapsedMs: number;
}

export function summarizeLedger(entries: LedgerEntry[]): LedgerSummary {
  return {
    runs: entries.length,
    accepted: entries.filter((e) => e.verdict === "ACCEPTED").length,
    rejected: entries.filter((e) => e.verdict === "REJECTED").length,
    prsCreated: entries.filter((e) => Boolean(e.prUrl)).length,
    humanCorrections: entries.filter((e) => e.humanCorrection).length,
    inputTokens: entries.reduce((sum, e) => sum + (e.inputTokens ?? 0), 0),
    outputTokens: entries.reduce((sum, e) => sum + (e.outputTokens ?? 0), 0),
    cost: entries.reduce((sum, e) => sum + (e.cost ?? 0), 0),
    elapsedMs: entries.reduce((sum, e) => sum + (e.elapsedMs ?? 0), 0)
  };
}
