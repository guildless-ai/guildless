import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { readEventsFile, readReviewerFindings, SeenStore } from "./events-source.js";
import { dedupeKey, findingsToAlert, mapEvent, type GuildlessEvent } from "./mapping.js";
import { PersonaClient } from "./persona-client.js";
import type { BridgeConfig, BridgeLogEntry, MappedAction } from "./types.js";

function appendLog(file: string, entry: BridgeLogEntry): void {
  try {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify(entry)}\n`, "utf8");
  } catch { /* logging must not break the bridge */ }
}

/**
 * Bridges real GUILDLESS events (.guildless/events.jsonl) to Persona actions.
 * - tails the events file
 * - skips malformed lines
 * - deduplicates by event identity (resume-safe via a persisted SeenStore)
 * - maps events to character actions and sends them to Persona
 * - logs every mapping decision to .guildless/persona-events.jsonl
 */
export class PersonaBridge {
  private readonly client: PersonaClient;
  private readonly seen: SeenStore;
  private timer: NodeJS.Timeout | null = null;
  private readonly findingsSeen = new Set<string>();

  constructor(private readonly config: BridgeConfig, client?: PersonaClient) {
    this.client = client ?? new PersonaClient();
    this.seen = new SeenStore(config.keysFile);
  }

  get status(): { file: string; keys: number; running: boolean } {
    return { file: this.config.file, keys: this.seen.size, running: this.timer !== null };
  }

  start(): void {
    if (this.timer) return;
    const interval = this.config.intervalMs ?? 300;
    void this.poll();
    this.timer = setInterval(() => void this.poll(), interval);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.seen.save();
  }

  /** One-shot processing of the current file (also used by replay/tests). */
  async processOnce(): Promise<BridgeLogEntry[]> {
    const logged: BridgeLogEntry[] = [];
    for (const event of readEventsFile(this.config.file)) {
      const entry = await this.processEvent(event);
      if (entry) logged.push(entry);
    }
    if (this.config.evidenceDir) await this.processFindings(logged);
    this.seen.save();
    return logged;
  }

  private poll(): void {
    void this.processOnce().catch(() => { /* keep polling */ });
  }

  private async processFindings(logged: BridgeLogEntry[]): Promise<void> {
    for (const finding of readReviewerFindings(this.config.evidenceDir!)) {
      const action = findingsToAlert(finding.runId, finding.ts, finding.severity, finding.summary, "reviewer");
      if (this.findingsSeen.has(action.key)) continue;
      this.findingsSeen.add(action.key);
      const entry = await this.send(action, finding.summary);
      logged.push(entry);
    }
  }

  private async processEvent(event: GuildlessEvent): Promise<BridgeLogEntry | null> {
    const key = dedupeKey(event);
    if (this.seen.has(key)) return null;
    const mapped = mapEvent(event);
    if (!mapped) {
      this.seen.add(key);
      return null;
    }
    const entry = await this.send(mapped, mapped.label);
    this.seen.add(key);
    return entry;
  }

  private async send(action: MappedAction, label: string): Promise<BridgeLogEntry> {
    const result = await this.client.play(action.target, action.action, label);
    const entry: BridgeLogEntry = {
      ts: new Date().toISOString(),
      runId: action.runId,
      key: action.key,
      source: action.source,
      target: action.target,
      action: action.action,
      label,
      sent: result.ok,
      error: result.error
    };
    appendLog(this.config.logFile, entry);
    return entry;
  }
}
