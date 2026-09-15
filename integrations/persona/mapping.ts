import { ROLE_CONFIGS, type ActionName, type MappedAction, type RoleId } from "./types.js";

export interface GuildlessEvent {
  ts: string;
  runId: string;
  type: string;
  [key: string]: unknown;
}

function roleFor(role?: unknown, stage?: unknown): RoleId {
  const value = String(role ?? stage ?? "");
  if (value.startsWith("planner")) return "planner";
  if (value.startsWith("builder")) return "builder";
  if (value.startsWith("reviewer")) return "reviewer";
  if (value.startsWith("breaker")) return "breaker";
  if (value.startsWith("fixer")) return "fixer";
  if (value.startsWith("verify") || value.startsWith("verifier")) return "verifier";
  return "planner";
}

function keyFor(event: GuildlessEvent): string {
  const role = String(event.role ?? event.stage ?? event.id ?? "");
  return `${event.runId}|${event.ts}|${event.type}|${role}|${event.verdict ?? event.status ?? ""}`;
}

export function dedupeKey(event: GuildlessEvent): string {
  return keyFor(event);
}

/** Map one real GUILDLESS event to a character action, or null when it has no visual meaning. */
export function mapEvent(event: GuildlessEvent): MappedAction | null {
  const runId = event.runId;
  const ts = event.ts;
  const key = keyFor(event);
  const role = roleFor(event.role, event.stage);
  const config = ROLE_CONFIGS[role];

  switch (event.type) {
    case "run_start":
      return { target: role, action: "wave", label: "Run started", accent: config.color, source: "run_start", runId, ts, key };
    case "stage": {
      if (String(event.stage) === "planner") {
        return { target: "planner", action: "thinking", label: "Planning", accent: ROLE_CONFIGS.planner.color, source: "stage planner", runId, ts, key };
      }
      if (String(event.stage) === "verify") {
        return { target: "verifier", action: "checking", label: "Running machine checks", accent: ROLE_CONFIGS.verifier.color, source: "stage verify", runId, ts, key };
      }
      return null;
    }
    case "agent_start": {
      const action: ActionName =
        role === "builder" ? "typing" :
        role === "reviewer" ? "inspect" :
        role === "breaker" ? "attack" :
        role === "fixer" ? "repair" :
        role === "verifier" ? "checking" : "attention";
      return { target: role, action, label: config.task, accent: config.color, source: `agent_start ${role}`, runId, ts, key };
    }
    case "agent_end": {
      const ok = event.ok === true;
      return {
        target: role,
        action: ok ? "nod" : "disappointed",
        label: ok ? `${config.display} finished` : `${config.display} failed`,
        accent: config.color,
        source: `agent_end ${role} ${ok ? "ok" : "error"}`,
        runId,
        ts,
        key
      };
    }
    case "verdict":
      if (event.verdict === "ACCEPTED") {
        return { target: "builder", action: "celebrate", label: "ACCEPTED", accent: "#22c55e", source: "verdict ACCEPTED", runId, ts, key };
      }
      return { target: "builder", action: "reject", label: "REJECTED", accent: "#ef4444", source: "verdict REJECTED", runId, ts, key };
    case "summary":
      return { target: "planner", action: "idle", label: "Run complete", accent: ROLE_CONFIGS.planner.color, source: "summary", runId, ts, key };
    default:
      return null;
  }
}

export function findingsToAlert(runId: string, ts: string, severity: string, summary: string, role: RoleId): MappedAction {
  const key = `finding|${runId}|${ts}|${severity}|${summary}`;
  return {
    target: role,
    action: "alert",
    label: severity === "high" ? "High severity finding" : "Finding",
    accent: severity === "critical" || severity === "high" ? "#ef4444" : "#f59e0b",
    source: `finding ${severity}`,
    runId,
    ts,
    key
  };
}
