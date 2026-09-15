import { readFileSync } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { buildReplaySchedule } from "../../../lib/replay";
import type { GuildlessEvent } from "../../../lib/mapping";

export const dynamic = "force-dynamic";

const EVENTS_FILE =
  process.env.GUILDLESS_EVENTS_FILE ??
  path.join(process.cwd(), "..", ".guildless", "events.jsonl");

function readEvents(): GuildlessEvent[] {
  try {
    const raw = readFileSync(EVENTS_FILE, "utf8");
    const events: GuildlessEvent[] = [];
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      try {
        events.push(JSON.parse(line) as GuildlessEvent);
      } catch { /* skip malformed */ }
    }
    return events;
  } catch {
    return [];
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const runId = searchParams.get("runId") ?? "";
  const speed = Math.max(1, Number(searchParams.get("speed") ?? "15") || 1);
  if (!runId) return NextResponse.json({ error: "runId is required" }, { status: 400 });
  const schedule = buildReplaySchedule(readEvents(), runId, speed);
  return NextResponse.json({ ...schedule, speed, file: EVENTS_FILE });
}
