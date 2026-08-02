import assert from "node:assert/strict";
import test from "node:test";
import { classifyDifficulty } from "../src/orchestrator/hunt.js";
import { resultRecordFor } from "../src/orchestrator/work.js";
import type { OrchestrationResult } from "../src/orchestrator/types.js";

test("classifies difficulty by title and stars", () => {
  assert.equal(classifyDifficulty("fix typo in README", [], 5000), "easy");
  assert.equal(classifyDifficulty("Refactor the auth module to use DI", [], 50), "hard");
  assert.equal(classifyDifficulty("Migrate to new database schema", [], 10), "hard");
  assert.equal(classifyDifficulty("add unit tests for parser", [], 900), "easy");
  assert.equal(classifyDifficulty("Improve error handling in downloader", [], 50), "easy");
  assert.equal(classifyDifficulty("Unrelated medium feature", [], 800), "medium");
  assert.equal(classifyDifficulty("Add a badge to README", [], 100000), "easy");
});

test("builds a result record with tests/build/lint flags", () => {
  const base: OrchestrationResult = {
    runId: "r1",
    objective: "x",
    config: {
      objective: "x",
      agents: { planner: 1, builders: 1, reviewers: 1, breakers: 1, fixers: 1 },
      reviewPolicy: { selfReview: false, crossReview: true, minimumReviewsPerTask: 1 },
      verification: { commands: ["npm test"], gitDiffCheck: true, http: [], maxFixRounds: 1 },
      agentCommands: { planner: "x", builder: "x", reviewer: "x", fixer: "x", breaker: "x" },
      agentTimeoutMs: 1000
    },
    status: { planner: "ok", build: "ok", review: "ok", fix: "ok", break: "ok", verify: "ok" },
    planner: { status: "ok", tasks: [] },
    builders: [],
    reviews: [],
    consensus: [],
    fixes: [],
    fixRound: 0,
    breaker: null,
    verify: [
      { id: "command-1", kind: "command", label: "npm test", ok: true },
      { id: "command-2", kind: "command", label: "npm run build", ok: false }
    ],
    verdict: "ACCEPTED",
    errors: [],
    agentMetrics: [{ role: "builder", id: "b1", inputTokens: 100, outputTokens: 50, cost: 0.01 }],
    evidencePath: null,
    startedAt: "2026-08-02T00:00:00.000Z",
    finishedAt: "2026-08-02T00:01:00.000Z"
  };
  const record = resultRecordFor(base, "owner/repo", "12");
  assert.equal(record.accepted, true);
  assert.equal(record.repository, "owner/repo");
  assert.equal(record.issue, "12");
  assert.equal(record.tests_passed, true);
  assert.equal(record.build_passed, false);
  assert.equal(record.tokens, 150);
  assert.equal(record.cost_usd, 0.01);
  assert.equal(record.elapsed_seconds, 60);
  assert.equal(record.human_interventions, 0);
});
