import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import type { GuildlessEvent } from "../../../lib/mapping";

export const dynamic = "force-dynamic";

const EVENTS_FILE =
  process.env.GUILDLESS_EVENTS_FILE ??
  path.join(process.cwd(), "..", ".guildless", "events.jsonl");
const RUNS_DIR = path.join(process.cwd(), "..", ".guildless", "runs");

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

function readEvidence(runId: string): Record<string, unknown> | null {
  const dir = path.join(RUNS_DIR, runId);
  if (!existsSync(dir)) return null;
  let objective = "";
  try {
    const run = JSON.parse(readFileSync(path.join(dir, "run.json"), "utf8")) as { goal?: string };
    if (typeof run.goal === "string") objective = run.goal;
  } catch {
    try {
      const evidence = JSON.parse(readFileSync(path.join(dir, "evidence.json"), "utf8")) as { objective?: string };
      if (typeof evidence.objective === "string") objective = evidence.objective;
    } catch { /* no objective */ }
  }
  const changedFiles: string[] = [];
  const seen = new Set<string>();
  let findings = 0;
  let highFindings = 0;
  let latestFinding: { severity: string; summary: string; file?: string; fixed: boolean } | null = null;
  try {
    for (const name of readdirSync(path.join(dir, "agents"))) {
      if (!/\.out\.json$/.test(name)) continue;
      const output = JSON.parse(readFileSync(path.join(dir, "agents", name), "utf8")) as {
        artifacts?: string[];
        findings?: Array<{ severity?: string; description?: string; file?: string }>;
        status?: string;
      };
      if (Array.isArray(output.artifacts)) {
        for (const file of output.artifacts) {
          if (!seen.has(file)) {
            seen.add(file);
            changedFiles.push(file);
          }
        }
      }
      if (Array.isArray(output.findings)) {
        for (const finding of output.findings) {
          findings += 1;
          const severity = finding.severity ?? "low";
          if (severity === "high" || severity === "critical") highFindings += 1;
          if (!latestFinding) {
            latestFinding = {
              severity,
              summary: (finding.description ?? "").slice(0, 200),
              file: finding.file,
              fixed: false
            };
          }
        }
      }
    }
  } catch { /* evidence files may be partial */ }
  return { runId, objective, changedFiles, findings, highFindings, latestFinding };
}

export async function GET() {
  const events = readEvents();
  const runIds = [...new Set(events.map((event) => event.runId).filter(Boolean))];
  const latestRunId = runIds[runIds.length - 1] ?? null;
  const evidence = latestRunId ? readEvidence(latestRunId) : null;
  return NextResponse.json({
    file: EVENTS_FILE,
    exists: existsSync(EVENTS_FILE),
    events,
    runIds,
    latestRunId,
    evidence
  });
}
