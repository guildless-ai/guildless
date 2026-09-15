import type { GuildlessEvent } from "./mapping";

export interface ScheduledEvent {
  event: GuildlessEvent;
  atMs: number; // offset from the start of replay
}

export interface ReplaySchedule {
  runId: string;
  events: number;
  durationMs: number;
  schedule: ScheduledEvent[];
}

/**
 * Build a replay schedule from REAL stored events only.
 * - preserves event order (sorted by ts)
 * - never invents events
 * - compresses the real inter-event gaps by `speed`
 * - finishes on the real final event (the verdict/summary)
 */
export function buildReplaySchedule(
  allEvents: GuildlessEvent[],
  runId: string,
  speed: number
): ReplaySchedule {
  const runEvents = allEvents
    .filter((event) => event.runId === runId)
    .slice()
    .sort((a, b) => Date.parse(String(a.ts)) - Date.parse(String(b.ts)));

  const schedule: ScheduledEvent[] = [];
  let previousTs: number | null = null;
  let atMs = 0;
  for (const event of runEvents) {
    const eventTs = Date.parse(String(event.ts)) || 0;
    if (previousTs !== null) {
      atMs += Math.max(0, eventTs - previousTs) / Math.max(1, speed);
    }
    previousTs = eventTs;
    schedule.push({ event, atMs });
  }
  const last = schedule[schedule.length - 1];
  return { runId, events: runEvents.length, durationMs: last ? last.atMs : 0, schedule };
}

/** Compute the speed that compresses a real run to ~targetMs (min 1x). */
export function speedForDuration(allEvents: GuildlessEvent[], runId: string, targetMs: number): number {
  const runEvents = allEvents
    .filter((event) => event.runId === runId)
    .slice()
    .sort((a, b) => Date.parse(String(a.ts)) - Date.parse(String(b.ts)));
  if (runEvents.length < 2) return 1;
  let totalGap = 0;
  let previous: number | null = null;
  for (const event of runEvents) {
    const eventTs = Date.parse(String(event.ts)) || 0;
    if (previous !== null) totalGap += Math.max(0, eventTs - previous);
    previous = eventTs;
  }
  if (totalGap <= 0) return 1;
  return Math.max(1, Math.round(totalGap / Math.max(1000, targetMs)));
}
