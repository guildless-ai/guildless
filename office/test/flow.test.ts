import { describe, expect, it } from "vitest";
import { companyFlow, flowStageOf } from "../src/lib/flow";
import type { GuildlessEvent } from "../src/lib/mapping";

function ev(over: Partial<GuildlessEvent> & { type: string }): GuildlessEvent {
  return { runId: "r", ts: "2026-08-02T00:00:00.000Z", ...over };
}

describe("flowStageOf", () => {
  it("traces the Issue → Director → Builder → Reviewer → Verifier → PR journey", () => {
    expect(flowStageOf([ev({ type: "run_start" })])).toBe("issue");
    expect(flowStageOf([ev({ type: "agent_start", role: "planner", id: "p" })])).toBe("planning");
    expect(flowStageOf([ev({ type: "agent_start", role: "builder", id: "b" })])).toBe("building");
    expect(flowStageOf([ev({ type: "agent_start", role: "reviewer", id: "r" })])).toBe("review");
    expect(flowStageOf([ev({ type: "agent_start", role: "fixer", id: "f" })])).toBe("fixing");
    expect(flowStageOf([ev({ type: "stage", stage: "verify" })])).toBe("verification");
    expect(flowStageOf([ev({ type: "verdict", verdict: "ACCEPTED" })])).toBe("pr-ready");
    expect(flowStageOf([ev({ type: "verdict", verdict: "REJECTED" })])).toBe("rejected");
  });
});

describe("companyFlow", () => {
  it("reports the real issue, changed files, and honest PR state", () => {
    const events = [
      ev({ type: "run_start", objective: "Create a TypeScript greeting module with tests" }),
      ev({ type: "agent_start", role: "builder", id: "b" }),
      ev({ type: "verdict", verdict: "ACCEPTED" })
    ];
    const flow = companyFlow(events, { changedFiles: ["src/greeting.ts"], findings: 2 });
    expect(flow.issue).toContain("greeting");
    expect(flow.changedFiles).toEqual(["src/greeting.ts"]);
    expect(flow.findings).toBe(2);
    expect(flow.prState).toBe("merge-waiting");
    expect(flow.label).toMatch(/result ready/);
  });

  it("does not claim merge-waiting on rejection", () => {
    const flow = companyFlow([ev({ type: "verdict", verdict: "REJECTED" })]);
    expect(flow.prState).toBe("none");
    expect(flow.stage).toBe("rejected");
  });

  it("keeps the issue label when no objective is present", () => {
    const flow = companyFlow([ev({ type: "run_start" })]);
    expect(flow.issue).toBe("");
    expect(flow.stage).toBe("issue");
  });
});
