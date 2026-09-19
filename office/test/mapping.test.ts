import { describe, expect, it } from "vitest";
import {
  currentTask, eventToAction, findingsCount, latestProgress, testStatus, verdictOf,
  type GuildlessEvent
} from "../src/lib/mapping";

function ev(over: Partial<GuildlessEvent> & { type: string }): GuildlessEvent {
  return { runId: "r", ts: "2026-08-02T00:00:00.000Z", ...over };
}

describe("eventToAction", () => {
  it("routes the Issue flow: Director → meeting room, Director to Engineer, Reviewer to Engineer", () => {
    expect(eventToAction(ev({ type: "run_start" })).targets).toEqual([{ character: "director", zone: "planning" }]);
    expect(eventToAction(ev({ type: "agent_start", role: "planner", id: "p" })).targets).toEqual([{ character: "director", zone: "planning" }]);
    expect(eventToAction(ev({ type: "agent_start", role: "builder", id: "b" })).targets).toEqual([
      { character: "engineer", zone: "engineering" },
      { character: "director", zone: "engineering" }
    ]);
    expect(eventToAction(ev({ type: "agent_start", role: "reviewer", id: "r" })).targets).toEqual([{ character: "reviewer", zone: "engineering" }]);
    expect(eventToAction(ev({ type: "agent_start", role: "breaker", id: "k" })).targets).toEqual([{ character: "engineer", zone: "testing" }]);
    expect(eventToAction(ev({ type: "stage", stage: "deploy" })).targets).toEqual([{ character: "director", zone: "operations" }]);
  });

  it("maps ACCEPTED / REJECTED to one-shot expressions and summary to the break room", () => {
    expect(eventToAction(ev({ type: "verdict", verdict: "ACCEPTED" })).celebration).toBe(true);
    expect(eventToAction(ev({ type: "verdict", verdict: "REJECTED" })).warning).toBe(true);
    expect(eventToAction(ev({ type: "summary" })).breakroom).toBe(true);
  });
});

describe("status card derivation", () => {
  it("derives role and task from real events", () => {
    const events = [
      ev({ type: "agent_start", role: "builder", id: "b" }),
      ev({ type: "agent_start", role: "reviewer", id: "r" })
    ];
    expect(currentTask(events).role).toBe("reviewer");
    expect(currentTask(events).task).toMatch(/Reviewing/);
  });

  it("counts progress, tests and findings from real events", () => {
    const events = [
      ev({ type: "progress", what: "builders", done: 1, total: 2 }),
      ev({ type: "progress", what: "builders", done: 2, total: 2 }),
      ev({ type: "verify", label: "npm test", ok: true }),
      ev({ type: "verify", label: "npm run build", ok: false }),
      ev({ type: "agent_start", role: "reviewer", id: "r1" }),
      ev({ type: "agent_start", role: "reviewer", id: "r2" }),
      ev({ type: "verdict", verdict: "ACCEPTED" })
    ];
    expect(latestProgress(events)).toEqual({ what: "builders", done: 2, total: 2 });
    expect(testStatus(events)).toEqual({ passed: 1, total: 2 });
    expect(findingsCount(events)).toBe(2);
    expect(verdictOf(events)).toBe("ACCEPTED");
  });
});
