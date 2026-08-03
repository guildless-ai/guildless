import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PersonaBridge } from "./bridge.js";
import { PersonaClient } from "./persona-client.js";
import { replayRun, writeReplayResult } from "./replay.js";
import type { PersonaStateFile } from "./types.js";

function flag(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 ? argv[index + 1] : undefined;
}

function stateFile(cwd: string): string {
  return path.join(cwd, ".guildless", "persona.json");
}

function readState(cwd: string): PersonaStateFile {
  try {
    return JSON.parse(readFileSync(stateFile(cwd), "utf8")) as PersonaStateFile;
  } catch {
    return {};
  }
}

function writeState(cwd: string, state: PersonaStateFile): void {
  writeFileSync(stateFile(cwd), `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function eventsFileFor(cwd: string, override?: string): string {
  return override ? path.resolve(cwd, override) : path.join(cwd, ".guildless", "events.jsonl");
}

function usage(): string {
  return [
    "guildless persona start [--file <path>] [--evidence <dir>]",
    "guildless persona stop",
    "guildless persona status",
    "guildless persona replay <run-id> [--speed <number>] [--file <path>] [--json]"
  ].join("\n");
}

export async function personaCommand(argv: string[], cwd: string): Promise<number> {
  const sub = argv[0];
  if (!sub || !["start", "stop", "status", "replay"].includes(sub)) {
    console.error(usage());
    return 2;
  }

  if (sub === "status") {
    const client = new PersonaClient();
    const status = await client.status();
    const state = readState(cwd);
    const file = state.file ?? eventsFileFor(cwd);
    console.log(`Persona: ${status.ok ? "CONNECTED" : "UNAVAILABLE"} (${status.detail})`);
    console.log(`Events file: ${file}`);
    console.log(`Bridge running: ${state.running === true}${state.startedAt ? ` since ${state.startedAt}` : ""}`);
    return status.ok ? 0 : 1;
  }

  if (sub === "stop") {
    const state = readState(cwd);
    state.running = false;
    state.pid = undefined;
    writeState(cwd, state);
    console.log("Persona bridge stopped.");
    return 0;
  }

  if (sub === "start") {
    const file = eventsFileFor(cwd, flag(argv, "file"));
    const evidence = flag(argv, "evidence");
    const bridge = new PersonaBridge({
      file,
      keysFile: path.join(cwd, ".guildless", "persona-keys.json"),
      logFile: path.join(cwd, ".guildless", "persona-events.jsonl"),
      runContext: { repo: flag(argv, "repo"), issue: flag(argv, "issue") },
      evidenceDir: evidence ? path.resolve(cwd, evidence) : undefined
    });
    bridge.start();
    writeState(cwd, { running: true, file, startedAt: new Date().toISOString() });
    console.log(`Persona bridge started. Tailing: ${file}`);
    console.log("Press Ctrl+C to stop. (Real Persona MCP must be reachable for actions to display.)");
    return await new Promise<number>((resolve) => {
      process.on("SIGINT", () => {
        bridge.stop();
        writeState(cwd, { running: false, file, startedAt: new Date().toISOString() });
        resolve(0);
      });
    });
  }

  // replay
  const runId = argv[1];
  const json = argv.includes("--json");
  const speed = Math.max(1, Number(flag(argv, "speed") ?? "10") || 1);
  const file = eventsFileFor(cwd, flag(argv, "file"));
  if (!runId) {
    console.error("A run-id is required: guildless persona replay <run-id> [--speed N]");
    return 2;
  }
  const client = new PersonaClient();
  const personaStatus = await client.status();
  const result = await replayRun({
    file,
    runId,
    speed,
    runContext: { repo: flag(argv, "repo"), issue: flag(argv, "issue") },
    client,
    onAction: (a) => console.log(`  [${(a.atMs / 1000).toFixed(1)}s] ${a.target}: ${a.action} — ${a.label}`)
  });
  writeReplayResult(path.join(cwd, "outputs", "persona"), result);
  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`Replay of ${runId}: ${result.events} real events, ${result.mapped} mapped actions, ${(result.elapsedMs / 1000).toFixed(1)}s at ${speed}x`);
    console.log(`Persona: ${personaStatus.ok ? "CONNECTED" : "UNAVAILABLE (actions logged but not displayed)"}`);
    console.log("--- final overlay ---");
    console.log(result.overlay);
    if (result.metrics) {
      const m = result.metrics as { cost?: unknown };
      console.log(`Real metrics from evidence: ${JSON.stringify({ accepted: result.metrics?.accepted, cost: m.cost ?? null })}`);
    }
  }
  return result.finalVerdict === "ACCEPTED" ? 0 : 1;
}
