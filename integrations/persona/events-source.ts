import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { GuildlessEvent } from "./mapping.js";

export function readEventsFile(file: string): GuildlessEvent[] {
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch {
    return [];
  }
  const events: GuildlessEvent[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line) as GuildlessEvent);
    } catch { /* skip malformed lines without crashing */ }
  }
  return events;
}

/** Persisted set of already-processed dedupe keys so a restart resumes safely. */
export class SeenStore {
  private readonly keys = new Set<string>();

  constructor(private readonly file: string) {
    mkdirSync(path.dirname(file), { recursive: true });
    try {
      for (const key of readFileSync(file, "utf8").split("\n")) {
        if (key.trim()) this.keys.add(key.trim());
      }
    } catch { /* start empty */ }
  }

  has(key: string): boolean { return this.keys.has(key); }

  add(key: string): void {
    this.keys.add(key);
  }

  save(): void {
    try {
      writeFileSync(this.file, `${[...this.keys].join("\n")}\n`, "utf8");
    } catch { /* persistence must not block the bridge */ }
  }

  get size(): number { return this.keys.size; }
}

/** High-severity findings from a run's reviewer evidence (optional feed for the alert action). */
export interface FindingFeedItem {
  ts: string;
  runId: string;
  role: string;
  severity: string;
  summary: string;
}

export function readReviewerFindings(evidenceDir: string): FindingFeedItem[] {
  const findings: FindingFeedItem[] = [];
  let entries: string[];
  try {
    entries = readdirSync(evidenceDir);
  } catch {
    return [];
  }
  for (const name of entries) {
    if (!/^reviewer-\d+$/.test(name)) continue;
    const outputFile = path.join(evidenceDir, name, "output.json");
    try {
      const output = JSON.parse(readFileSync(outputFile, "utf8")) as { findings?: Array<{ severity?: string; description?: string }> };
      for (const finding of output.findings ?? []) {
        if (finding.severity === "high" || finding.severity === "critical") {
          findings.push({
            ts: new Date(0).toISOString(),
            runId: "evidence",
            role: name,
            severity: finding.severity,
            summary: (finding.description ?? "").slice(0, 120)
          });
        }
      }
    } catch { /* missing or unreadable reviewer output */ }
  }
  return findings;
}
