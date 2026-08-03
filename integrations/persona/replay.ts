import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { readEventsFile } from "./events-source.js";
import { mapEvent } from "./mapping.js";
import { PersonaClient } from "./persona-client.js";
import { buildOverlayState, renderOverlayText } from "./overlay.js";

export interface ReplayResult {
  runId: string;
  events: number;
  mapped: number;
  actions: Array<{ action: string; target: string; label: string; atMs: number }>;
  finalVerdict: string | null;
  metrics: Record<string, unknown> | null;
  overlay: string;
  elapsedMs: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Replays real stored GUILDLESS events at an accelerated speed.
 * Preserves event order, never invents events, and finishes on the real verdict.
 * Real metrics come from the run's evidence.json when available.
 */
export async function replayRun(options: {
  file: string;
  runId: string;
  speed: number;
  evidenceDir?: string;
  runContext?: { repo?: string; issue?: string };
  client?: PersonaClient;
  onAction?: (action: { action: string; target: string; label: string; atMs: number }) => void;
}): Promise<ReplayResult> {
  const events = readEventsFile(options.file)
    .filter((event) => event.runId === options.runId)
    .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));

  const client = options.client ?? new PersonaClient();
  const actions: ReplayResult["actions"] = [];
  const started = Date.now();
  let previousTs: number | null = null;
  let mapped = 0;

  for (const event of events) {
    const eventTs = Date.parse(event.ts) || started;
    if (previousTs !== null) {
      const gap = Math.max(0, eventTs - previousTs) / options.speed;
      await sleep(gap);
    }
    previousTs = eventTs;

    const action = mapEvent(event);
    if (!action) continue;
    mapped += 1;
    await client.play(action.target, action.action, action.label);
    const atMs = Date.now() - started;
    actions.push({ action: action.action, target: action.target, label: action.label, atMs });
    options.onAction?.({ action: action.action, target: action.target, label: action.label, atMs });
  }

  const evidenceDir = options.evidenceDir ?? path.join(path.dirname(options.file), "runs", options.runId);
  let metrics: Record<string, unknown> | null;
  try {
    metrics = JSON.parse(readFileSync(path.join(evidenceDir, "final-evidence.json"), "utf8")) as Record<string, unknown>;
  } catch {
    metrics = null;
  }

  const state = buildOverlayState(events, { runContext: options.runContext, evidenceDir });
  const result: ReplayResult = {
    runId: options.runId,
    events: events.length,
    mapped,
    actions,
    finalVerdict: state.verdict,
    metrics,
    overlay: renderOverlayText(state),
    elapsedMs: Date.now() - started
  };
  return result;
}

export function writeReplayResult(outDir: string, result: ReplayResult): string {
  mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, `replay-${result.runId}.json`);
  writeFileSync(file, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  return path.relative(path.resolve(outDir, ".."), file).replaceAll("\\", "/");
}
