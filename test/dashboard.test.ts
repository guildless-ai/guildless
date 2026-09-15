import assert from "node:assert/strict";
import test from "node:test";
import { aggregate, renderDashboardText } from "../src/orchestrator/dashboard.js";
import type { WorkEvent } from "../src/orchestrator/events.js";

const now = Date.parse("2026-08-02T03:00:00.000Z");

const events: WorkEvent[] = [
  { ts: "2026-08-02T03:00:00.000Z", runId: "r1", type: "run_start", objective: "Fix the bug" },
  { ts: "2026-08-02T03:00:00.100Z", runId: "r1", type: "stage", stage: "planner", status: "ok" },
  { ts: "2026-08-02T03:00:00.200Z", runId: "r1", type: "agent_start", role: "builder", id: "builder-1" },
  { ts: "2026-08-02T03:00:00.300Z", runId: "r1", type: "agent_end", role: "builder", id: "builder-1", ok: true, inputTokens: 100, outputTokens: 50, cost: 0 },
  { ts: "2026-08-02T03:00:00.400Z", runId: "r1", type: "progress", what: "builders", done: 1, total: 1 },
  { ts: "2026-08-02T03:00:00.500Z", runId: "r1", type: "stage", stage: "verify", status: "ok" },
  { ts: "2026-08-02T03:00:00.600Z", runId: "r1", type: "verify", label: "npm test", ok: true },
  { ts: "2026-08-02T03:00:00.700Z", runId: "r1", type: "verdict", verdict: "ACCEPTED" },
  { ts: "2026-08-02T03:00:00.800Z", runId: "r1", type: "summary", accepted: true, elapsedMs: 800, tokens: 150, cost: 0, humanInterventions: 0 }
];

test("aggregates events into a dashboard state", () => {
  const state = aggregate(events, now);
  assert.equal(state.runId, "r1");
  assert.equal(state.objective, "Fix the bug");
  assert.equal(state.agents.length, 1);
  assert.equal(state.agents[0].id, "builder-1");
  assert.equal(state.agents[0].status, "done");
  assert.equal(state.tokens, 150);
  assert.equal(state.cost, 0);
  assert.equal(state.humanInterventions, 0);
  assert.equal(state.verify.length, 1);
  assert.equal(state.verify[0].ok, true);
  assert.equal(state.verdict, "ACCEPTED");
  assert.equal(state.finished, true);
  assert.equal(state.elapsedMs, 800);
  assert.equal(state.progress.builders?.done, 1);
  assert.equal(state.stages.verify, "ok");
});

test("tracks live runtime before the run finishes", () => {
  const partial = events.filter((e) => e.type !== "summary");
  const state = aggregate(partial, now + 5000);
  assert.equal(state.finished, false);
  assert.equal(state.elapsedMs, 5000);
  assert.equal(state.verdict, "ACCEPTED");
});

test("renders a readable text snapshot", () => {
  const text = renderDashboardText(aggregate(events, now));
  assert.match(text, /GUILDLESS WATCH/);
  assert.match(text, /builder-1/);
  assert.match(text, /Verdict: ACCEPTED/);
  assert.match(text, /Human interventions: 0/);
});
