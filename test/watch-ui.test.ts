import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToString } from "ink";
import { aggregate } from "../src/orchestrator/dashboard.js";
import { Dashboard } from "../src/orchestrator/watch-ui.js";
import type { WorkEvent } from "../src/orchestrator/events.js";

test("renders the Ink dashboard from aggregated events", async () => {
  const events: WorkEvent[] = [
    { ts: "2026-08-02T03:00:00.000Z", runId: "r1", type: "run_start", objective: "Fix the bug" },
    { ts: "2026-08-02T03:00:00.100Z", runId: "r1", type: "stage", stage: "planner", status: "ok" },
    { ts: "2026-08-02T03:00:00.200Z", runId: "r1", type: "agent_start", role: "builder", id: "builder-1" },
    { ts: "2026-08-02T03:00:00.300Z", runId: "r1", type: "agent_end", role: "builder", id: "builder-1", ok: true, inputTokens: 100, outputTokens: 50, cost: 0 },
    { ts: "2026-08-02T03:00:00.400Z", runId: "r1", type: "verdict", verdict: "ACCEPTED" },
    { ts: "2026-08-02T03:00:00.500Z", runId: "r1", type: "summary", accepted: true, elapsedMs: 500, tokens: 150, cost: 0, humanInterventions: 0 }
  ];
  const state = aggregate(events);
  const output = await renderToString(React.createElement(Dashboard, { state, file: "unused.jsonl" }));
  assert.match(output, /GUILDLESS WATCH/);
  assert.match(output, /builder-1/);
  assert.match(output, /Verdict: ACCEPTED/);
  assert.match(output, /Human interventions: 0/);
});
