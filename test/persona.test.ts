import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { PersonaBridge } from "../integrations/persona/bridge.js";
import { findingsToAlert, mapEvent, type GuildlessEvent } from "../integrations/persona/mapping.js";
import { PersonaClient } from "../integrations/persona/persona-client.js";
import { buildOverlayState, renderOverlayText } from "../integrations/persona/overlay.js";
import { replayRun } from "../integrations/persona/replay.js";
import { ROLE_CONFIGS } from "../integrations/persona/types.js";

function ev(over: Partial<GuildlessEvent> & { type: string }): GuildlessEvent {
  return { ts: "2026-08-02T00:00:00.000Z", runId: "run-1", ...over };
}

test("maps every GUILDLESS event type to the required action", () => {
  assert.equal(mapEvent(ev({ type: "run_start" }))?.action, "wave");
  assert.equal(mapEvent(ev({ type: "stage", stage: "planner" }))?.action, "thinking");
  assert.equal(mapEvent(ev({ type: "agent_start", role: "builder", id: "b" }))?.action, "typing");
  assert.equal(mapEvent(ev({ type: "agent_start", role: "reviewer", id: "r" }))?.action, "inspect");
  assert.equal(mapEvent(ev({ type: "agent_start", role: "breaker", id: "k" }))?.action, "attack");
  assert.equal(mapEvent(ev({ type: "agent_start", role: "fixer", id: "f" }))?.action, "repair");
  assert.equal(mapEvent(ev({ type: "stage", stage: "verify" }))?.action, "checking");
  assert.equal(mapEvent(ev({ type: "agent_end", role: "builder", id: "b", ok: true }))?.action, "nod");
  assert.equal(mapEvent(ev({ type: "agent_end", role: "builder", id: "b", ok: false }))?.action, "disappointed");
  assert.equal(mapEvent(ev({ type: "verdict", verdict: "ACCEPTED" }))?.action, "celebrate");
  assert.equal(mapEvent(ev({ type: "verdict", verdict: "REJECTED" }))?.action, "reject");
  assert.equal(mapEvent(ev({ type: "summary" }))?.action, "idle");
  assert.equal(findingsToAlert("r", "t", "high", "overflow", "reviewer").action, "alert");
});

test("supports all six logical roles with distinct display identity", () => {
  const ids = Object.keys(ROLE_CONFIGS);
  assert.equal(ids.length, 6);
  for (const id of ["planner", "builder", "reviewer", "breaker", "fixer", "verifier"]) assert.ok(ROLE_CONFIGS[id]);
  const displays = new Set(ids.map((id) => ROLE_CONFIGS[id].display));
  const colors = new Set(ids.map((id) => ROLE_CONFIGS[id].color));
  const positions = new Set(ids.map((id) => ROLE_CONFIGS[id].position));
  assert.equal(displays.size, 6);
  assert.equal(colors.size, 6);
  assert.equal(positions.size, 6);
});

test("bridge skips malformed lines, deduplicates, and resumes after restart", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "persona-bridge-"));
  try {
    const file = path.join(dir, "events.jsonl");
    const keysFile = path.join(dir, "keys.json");
    const logFile = path.join(dir, "persona-events.jsonl");
    await writeFile(file, `{"type":"run_start","runId":"r","ts":"t","objective":"x"}\nTHIS IS NOT JSON\n{"type":"agent_start","role":"builder","id":"b","runId":"r","ts":"t"}\n`);

    const sent: string[] = [];
    const client = { play: async (target: string, action: string) => { sent.push(`${target}:${action}`); return { ok: true }; } } as unknown as PersonaClient;

    const bridge1 = new PersonaBridge({ file, keysFile, logFile }, client);
    const first = await bridge1.processOnce();
    assert.equal(first.length, 2, "malformed line skipped, two events mapped");
    assert.deepEqual(sent, ["planner:wave", "builder:typing"]);

    const bridge2 = new PersonaBridge({ file, keysFile, logFile }, client);
    const second = await bridge2.processOnce();
    assert.equal(second.length, 0, "dedupe across restart via persisted keys");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("bridge survives an unavailable Persona and logs the decision as unsent", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "persona-unavail-"));
  try {
    const file = path.join(dir, "events.jsonl");
    const logFile = path.join(dir, "persona-events.jsonl");
    await writeFile(file, `${JSON.stringify(ev({ type: "verdict", verdict: "ACCEPTED" }))}\n`);
    const client = { play: async () => ({ ok: false, error: "persona unreachable" }) } as unknown as PersonaClient;
    const bridge = new PersonaBridge({ file, keysFile: path.join(dir, "k.json"), logFile }, client);
    const logged = await bridge.processOnce();
    assert.equal(logged.length, 1);
    assert.equal(logged[0].sent, false);
    assert.match(logged[0].error ?? "", /unreachable/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("bridge log and overlay never leak secrets", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "persona-redact-"));
  try {
    const file = path.join(dir, "events.jsonl");
    const logFile = path.join(dir, "persona-events.jsonl");
    await writeFile(file, `${JSON.stringify({ type: "run_start", runId: "r", ts: "t", objective: "apiKey SUPER-SECRET-123" })}\n`);
    const client = { play: async () => ({ ok: true }) } as unknown as PersonaClient;
    const bridge = new PersonaBridge({ file, keysFile: path.join(dir, "k.json"), logFile }, client);
    await bridge.processOnce();
    const log = await readFile(logFile, "utf8");
    assert.doesNotMatch(log, /SUPER-SECRET-123/);

    const overlay = renderOverlayText(buildOverlayState([
      { type: "run_start", runId: "r", ts: "t", objective: "apiKey SUPER-SECRET-123" },
      { type: "verdict", runId: "r", ts: "t", verdict: "ACCEPTED" }
    ]));
    assert.doesNotMatch(overlay, /SUPER-SECRET-123/);
    assert.match(overlay, /ACCEPTED/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("replay preserves event order and compresses time by speed", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "persona-replay-"));
  try {
    const file = path.join(dir, "events.jsonl");
    await writeFile(file, [
      `${JSON.stringify({ type: "run_start", runId: "r", ts: "2026-08-02T00:00:00.000Z" })}`,
      `${JSON.stringify({ type: "agent_start", role: "builder", id: "b", runId: "r", ts: "2026-08-02T00:00:05.000Z" })}`,
      `${JSON.stringify({ type: "agent_end", role: "builder", id: "b", ok: true, runId: "r", ts: "2026-08-02T00:00:10.000Z" })}`,
      `${JSON.stringify({ type: "verdict", verdict: "ACCEPTED", runId: "r", ts: "2026-08-02T00:00:15.000Z" })}`
    ].join("\n"));
    // events intentionally reversed to prove ordering is restored
    const reversed = await readFile(file, "utf8");
    const lines = reversed.trim().split("\n").reverse();
    await writeFile(file, `${lines.join("\n")}\n`);

    const actions: string[] = [];
    const started = Date.now();
    const result = await replayRun({
      file, runId: "r", speed: 100,
      client: { play: async (_t: string, a: string) => { actions.push(a); return { ok: true }; } } as unknown as PersonaClient,
      onAction: () => undefined
    });
    const elapsed = Date.now() - started;
    assert.deepEqual(actions, ["wave", "typing", "nod", "celebrate"], "order restored from ts");
    assert.ok(elapsed < 500, `time compressed (elapsed ${elapsed}ms vs 15s of gaps)`);
    assert.equal(result.finalVerdict, "ACCEPTED");
    assert.equal(result.events, 4);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("overlay derives real state for ACCEPTED and REJECTED flows", () => {
  const accepted = [
    { type: "run_start", runId: "r", ts: "t" },
    { type: "agent_start", role: "reviewer", id: "r1", runId: "r", ts: "t" },
    { type: "verify", label: "npm test", ok: true, runId: "r", ts: "t" },
    { type: "verify", label: "npm run build", ok: true, runId: "r", ts: "t" },
    { type: "summary", accepted: true, humanInterventions: 0, runId: "r", ts: "t" }
  ];
  const ok = buildOverlayState(accepted as GuildlessEvent[]);
  assert.equal(ok.verdict, "ACCEPTED");
  assert.equal(ok.role, "reviewer");
  assert.equal(ok.testsPassed, 2);
  assert.equal(ok.testsTotal, 2);
  assert.equal(ok.humanInterventions, 0);

  const rejected = buildOverlayState([
    { type: "verdict", verdict: "REJECTED", runId: "r", ts: "t" }
  ] as GuildlessEvent[]);
  assert.equal(rejected.verdict, "REJECTED");
  assert.equal(rejected.accepted, false);
});

test("persona client reports unavailable without throwing", async () => {
  const client = new PersonaClient({
    mcpUrl: "http://127.0.0.1:1/mcp",
    fetchFn: async () => { throw new Error("connection refused"); }
  });
  const status = await client.status();
  assert.equal(status.ok, false);
  const sent = await client.play("planner", "wave", "hi");
  assert.equal(sent.ok, false);
  assert.equal(sent.method, "mcp");
});

test("persona client parses an MCP JSON-RPC success response", async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const client = new PersonaClient({
    mcpUrl: "http://127.0.0.1:47831/mcp",
    fetchFn: async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { ok: true } }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
  });
  const sent = await client.play("builder", "typing", "working");
  assert.equal(sent.ok, true);
  assert.equal(sent.method, "mcp");
  assert.ok(JSON.parse(String(calls[0]?.init?.body)).params.name, "tools/call sent with tool name");
});
