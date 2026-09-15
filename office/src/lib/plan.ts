import type { GuildlessEvent } from "./mapping";
import { ROLE_DISPLAY, ROLE_PRESENT } from "./present";

export type StepStatus = "waiting" | "running" | "completed" | "failed";

export interface PlanStep {
  n: number;
  title: string;
  agent: string;
  status: StepStatus;
  why: string;
  output: string;
}

function has(events: GuildlessEvent[], fn: (e: GuildlessEvent) => boolean): boolean {
  return events.some(fn);
}

/** Human-readable plan derived from real events. */
export function planOf(events: GuildlessEvent[]): PlanStep[] {
  const plannerDone = has(events, (e) => e.type === "agent_end" && e.role === "planner");
  const builderStarted = has(events, (e) => e.type === "agent_start" && e.role === "builder");
  const builderDone = has(events, (e) => e.type === "agent_end" && e.role === "builder" && e.ok === true);
  const breakerStarted = has(events, (e) => e.type === "agent_start" && e.role === "breaker" || e.type === "stage" && e.stage === "verify");
  const reviewerDone = has(events, (e) => e.type === "agent_end" && e.role === "reviewer");
  const fixerDone = has(events, (e) => e.type === "agent_end" && e.role === "fixer" && e.ok === true);
  const verified = has(events, (e) => e.type === "verdict");
  const rejected = has(events, (e) => e.type === "verdict" && e.verdict === "REJECTED");

  const steps: PlanStep[] = [
    {
      n: 1,
      title: "Understand the existing project",
      agent: ROLE_DISPLAY.planner,
      status: builderStarted ? "completed" : plannerDone || builderStarted ? "running" : "waiting",
      why: ROLE_PRESENT.planner.why,
      output: ROLE_PRESENT.planner.output
    },
    {
      n: 2,
      title: "Implement the module",
      agent: ROLE_DISPLAY.builder,
      status: builderDone ? "completed" : builderStarted ? "running" : "waiting",
      why: ROLE_PRESENT.builder.why,
      output: "source code"
    },
    {
      n: 3,
      title: "Add tests",
      agent: ROLE_DISPLAY.builder,
      status: breakerStarted ? "completed" : builderDone ? "running" : "waiting",
      why: "The change must be proven before it is reviewed",
      output: "test files"
    },
    {
      n: 4,
      title: "Review for defects",
      agent: ROLE_DISPLAY.reviewer,
      status: reviewerDone ? "completed" : breakerStarted ? "running" : "waiting",
      why: ROLE_PRESENT.reviewer.why,
      output: "review findings"
    },
    {
      n: 5,
      title: "Fix findings",
      agent: ROLE_DISPLAY.builder,
      status: fixerDone ? "completed" : reviewerDone ? "running" : "waiting",
      why: ROLE_PRESENT.fixer.why,
      output: "fixed code"
    },
    {
      n: 6,
      title: "Verify the final result",
      agent: ROLE_DISPLAY.verifier,
      status: verified ? (rejected ? "failed" : "completed") : fixerDone ? "running" : "waiting",
      why: ROLE_PRESENT.verifier.why,
      output: "build, test and lint results"
    }
  ];
  return steps;
}
