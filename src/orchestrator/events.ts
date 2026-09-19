import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

export type WorkEvent =
  | { ts: string; runId: string; type: "run_start"; objective: string }
  | { ts: string; runId: string; type: "stage"; stage: string; status: string }
  | { ts: string; runId: string; type: "agent_start"; role: string; id: string }
  | { ts: string; runId: string; type: "agent_end"; role: string; id: string; ok: boolean; inputTokens?: number; outputTokens?: number; cost?: number; error?: string }
  | { ts: string; runId: string; type: "progress"; what: string; done: number; total: number }
  | { ts: string; runId: string; type: "verify"; label: string; ok: boolean }
  | { ts: string; runId: string; type: "verdict"; verdict: string }
  | { ts: string; runId: string; type: "summary"; accepted: boolean; elapsedMs: number; tokens: number; cost: number; humanInterventions: number };

export class EventLog {
  readonly file: string;

  constructor(baseDir: string) {
    this.file = EventLog.eventsFile(baseDir);
    mkdirSync(path.dirname(this.file), { recursive: true });
  }

  static eventsFile(baseDir: string): string {
    return path.join(baseDir, ".guildless", "events.jsonl");
  }

  emit(event: { runId: string; type: string; [key: string]: unknown }): void {
    try {
      appendFileSync(this.file, `${JSON.stringify({ ts: new Date().toISOString(), ...event })}\n`, "utf8");
    } catch { /* event logging must never block the pipeline */ }
  }
}

export function readEventsFile(file: string): WorkEvent[] {
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch {
    return [];
  }
  const events: WorkEvent[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line) as WorkEvent);
    } catch { /* skip malformed */ }
  }
  return events;
}
