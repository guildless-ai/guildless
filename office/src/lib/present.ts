import type { GuildlessEvent } from "./mapping";

export interface PresentAction {
  action: string;
  why: string;
  output: string;
}

/** Deterministic plain-language translation of GUILDLESS roles. */
export const ROLE_PRESENT: Record<string, PresentAction> = {
  planner: {
    action: "Understanding the request and planning the work",
    why: "The goal must be clear before any code is written",
    output: "a plan and a file allowlist"
  },
  director: {
    action: "Directing the work",
    why: "Someone must keep the whole workflow moving",
    output: "clear direction"
  },
  builder: {
    action: "Implementing the requested change",
    why: "The requested feature must actually be built",
    output: "source code"
  },
  reviewer: {
    action: "Independently checking the implementation",
    why: "A separate review catches defects the author missed",
    output: "review findings"
  },
  breaker: {
    action: "Testing edge cases and trying to break the result",
    why: "Counterexample tests prove the change is robust",
    output: "regression tests"
  },
  fixer: {
    action: "Repairing defects found during review",
    why: "Findings must be resolved before the result is accepted",
    output: "fixed code"
  },
  verifier: {
    action: "Running final machine checks",
    why: "Only machine-verified work is accepted",
    output: "build, test and lint results"
  },
  deploy: {
    action: "Publishing the verified result",
    why: "The verified change must reach the users",
    output: "a deployed environment"
  },
  monitor: {
    action: "Checking the delivered software stays healthy",
    why: "Delivered software must keep working over time",
    output: "health status"
  }
};

export const ROLE_DISPLAY: Record<string, string> = {
  planner: "Director",
  director: "Director",
  builder: "Engineer",
  reviewer: "Reviewer",
  breaker: "Engineer",
  fixer: "Engineer",
  verifier: "Engineer",
  deploy: "Director",
  monitor: "Director"
};

export function presentFor(role: string | null): PresentAction {
  return ROLE_PRESENT[role ?? ""] ?? { action: "Working", why: "The next step is in progress", output: "progress" };
}

/** Business-level update phrases, so non-engineers never see raw event names. */
export function businessUpdates(events: GuildlessEvent[]): string[] {
  const updates: string[] = [];
  let findings = 0;
  let testsPassed = 0;
  for (const event of events) {
    switch (event.type) {
      case "run_start":
        updates.push("Request understood");
        break;
      case "agent_end":
        if (event.role === "planner") updates.push("Plan prepared");
        if (event.role === "builder" && event.ok === true) updates.push("Implementation completed");
        if (event.role === "reviewer" && event.ok === true) findings = 0;
        if (event.role === "fixer" && event.ok === true) updates.push("Defects fixed");
        break;
      case "agent_start":
        if (event.role === "builder") updates.push("Engineer started implementing");
        if (event.role === "reviewer") updates.push("Independent review started");
        if (event.role === "breaker") updates.push("Testing edge cases");
        if (event.role === "verifier") updates.push("Running final checks");
        break;
      case "verify":
        if (event.ok === true) testsPassed += 1;
        break;
      case "verdict":
        updates.push(event.verdict === "ACCEPTED" ? "Result accepted" : "Result rejected");
        break;
      default:
        break;
    }
  }
  if (findings > 0) updates.push(`${findings} defect${findings > 1 ? "s" : ""} found`);
  if (testsPassed > 0) updates.push(`${testsPassed} test${testsPassed > 1 ? "s" : ""} passed`);
  return updates.slice(-6);
}
