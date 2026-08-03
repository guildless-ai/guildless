import type { GuildlessEvent } from "./mapping";

export type FlowStage =
  | "issue"
  | "planning"
  | "building"
  | "review"
  | "fixing"
  | "verification"
  | "pr-ready"
  | "rejected";

export const FLOW_LABELS: Record<FlowStage, string> = {
  issue: "Request received",
  planning: "Director planning",
  building: "Engineer implementing",
  review: "Reviewer inspecting",
  fixing: "Engineer repairing",
  verification: "Engineer verifying",
  "pr-ready": "Completed — result ready",
  rejected: "Rejected"
};

export interface CompanyFlow {
  stage: FlowStage;
  label: string;
  issue: string;
  changedFiles: string[];
  findings: number;
  verdict: string | null;
  prState: "merge-waiting" | "none";
}

function issueTitle(events: GuildlessEvent[]): string {
  for (const event of events) {
    if (event.type === "run_start" && typeof event.objective === "string" && event.objective.trim()) {
      return event.objective.trim().replace(/\s+/g, " ").slice(0, 90);
    }
  }
  return "";
}

/** Derive the company-stage (Issue → Director → Builder → Reviewer → Verifier → PR) from real events. */
export function flowStageOf(events: GuildlessEvent[]): FlowStage {
  let stage: FlowStage = "issue";
  for (const event of events) {
    switch (event.type) {
      case "run_start":
        stage = "issue";
        break;
      case "stage":
        if (event.stage === "planner") stage = "planning";
        else if (event.stage === "build") stage = "building";
        else if (event.stage === "review") stage = "review";
        else if (event.stage === "breaker" || event.stage === "verify") stage = "verification";
        break;
      case "agent_start":
        if (event.role === "planner") stage = "planning";
        else if (event.role === "builder") stage = "building";
        else if (event.role === "reviewer") stage = "review";
        else if (event.role === "fixer") stage = "fixing";
        else if (event.role === "breaker") stage = "verification";
        break;
      case "verdict":
        stage = event.verdict === "ACCEPTED" ? "pr-ready" : "rejected";
        break;
      default:
        break;
    }
  }
  return stage;
}

export function companyFlow(
  events: GuildlessEvent[],
  evidence: { changedFiles?: string[]; findings?: number } = {}
): CompanyFlow {
  const stage = flowStageOf(events);
  const verdict = events.find((event) => event.type === "verdict" && event.verdict)?.verdict as string | null;
  return {
    stage,
    label: FLOW_LABELS[stage],
    issue: issueTitle(events),
    changedFiles: evidence.changedFiles ?? [],
    findings: evidence.findings ?? 0,
    verdict,
    prState: verdict === "ACCEPTED" ? "merge-waiting" : "none"
  };
}

export interface ActivityItem {
  ts: string;
  agent: string;
  action: string;
  result?: string;
}

/** Latest activity feed derived from real events (newest first). */
export function activityFeed(events: GuildlessEvent[]): ActivityItem[] {
  const items: ActivityItem[] = [];
  for (const event of events) {
    switch (event.type) {
      case "run_start":
        items.push({ ts: String(event.ts), agent: "System", action: "Request received" });
        break;
      case "stage":
        items.push({ ts: String(event.ts), agent: "System", action: `Stage: ${String(event.stage)}` });
        break;
      case "agent_start":
        items.push({ ts: String(event.ts), agent: String(event.role ?? "agent"), action: `${String(event.role ?? "agent")} started` });
        break;
      case "agent_end":
        items.push({
          ts: String(event.ts),
          agent: String(event.role ?? "agent"),
          action: `${String(event.role ?? "agent")} ${event.ok === true ? "finished" : "failed"}`,
          result: event.ok === true ? "ok" : "error"
        });
        break;
      case "verify":
        items.push({
          ts: String(event.ts),
          agent: "Verifier",
          action: String(event.label ?? "check"),
          result: event.ok === true ? "passed" : "failed"
        });
        break;
      case "verdict":
        items.push({ ts: String(event.ts), agent: "System", action: "Verdict", result: String(event.verdict ?? "") });
        break;
      default:
        break;
    }
  }
  return items.slice(-6).reverse();
}

export function gateStatus(events: GuildlessEvent[]): { build: boolean | null; lint: boolean | null } {
  let build: boolean | null = null;
  let lint: boolean | null = null;
  for (const event of events) {
    if (event.type !== "verify" || typeof event.ok !== "boolean") continue;
    const label = String(event.label ?? "");
    if (/build/i.test(label)) build = event.ok;
    if (/lint/i.test(label)) lint = event.ok;
  }
  return { build, lint };
}

export function runStartedAt(events: GuildlessEvent[]): string | null {
  const start = events.find((event) => event.type === "run_start");
  return start ? String(start.ts) : null;
}
