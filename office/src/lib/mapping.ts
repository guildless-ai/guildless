import { roleToCharacter, type CharacterId, type ZoneId } from "./zones";

export interface OfficeTarget {
  character: CharacterId;
  zone: ZoneId;
}

export interface OfficeAction {
  targets: OfficeTarget[];
  breakroom?: boolean;
  celebration?: boolean;
  warning?: boolean;
}

export interface GuildlessEvent {
  type: string;
  runId?: string;
  role?: string;
  stage?: string;
  verdict?: string;
  what?: string;
  done?: number;
  total?: number;
  ok?: boolean;
  [key: string]: unknown;
}

function zoneForRole(role: string): ZoneId | null {
  switch (role) {
    case "planner": case "director": return "planning";
    case "builder": case "fixer": return "engineering";
    case "reviewer": return "engineering"; // Reviewer walks to the Engineer
    case "breaker": case "verifier": return "testing";
    case "deploy": case "monitor": case "operator": return "operations";
    default: return null;
  }
}

function zoneForStage(stage: string): ZoneId | null {
  switch (stage) {
    case "planner": return "planning";
    case "build": case "fixer": return "engineering";
    case "review": return "engineering";
    case "breaker": case "verify": case "testing": return "testing";
    case "deploy": case "health": case "monitor": case "incident": case "rollback": return "operations";
    default: return null;
  }
}

/** Map one real GUILDLESS event to character movements and/or expressions. */
export function eventToAction(event: GuildlessEvent): OfficeAction {
  switch (event.type) {
    case "run_start":
      return { targets: [{ character: "director", zone: "planning" }] };
    case "stage": {
      const stage = String(event.stage ?? "");
      const zone = zoneForStage(stage);
      const character = roleToCharacter(stage);
      if (!zone) return { targets: [] };
      if (stage === "build") {
        // Director walks to the Engineer to supervise.
        return { targets: [{ character: "engineer", zone: "engineering" }, { character: "director", zone: "engineering" }] };
      }
      return { targets: [{ character, zone }] };
    }
    case "agent_start": {
      const role = String(event.role ?? "");
      const zone = zoneForRole(role);
      const character = roleToCharacter(role);
      if (!zone) return { targets: [] };
      if (role === "builder") {
        return { targets: [{ character: "engineer", zone: "engineering" }, { character: "director", zone: "engineering" }] };
      }
      return { targets: [{ character, zone }] };
    }
    case "verdict":
      if (event.verdict === "ACCEPTED") return { targets: [], celebration: true };
      return { targets: [], warning: true };
    case "summary":
      return { targets: [], breakroom: true };
    default:
      return { targets: [] };
  }
}

export interface TaskLabel {
  role: string | null;
  task: string;
}

const ROLE_TASKS: Record<string, string> = {
  planner: "Planning in the meeting room",
  director: "Directing the work",
  builder: "Writing code",
  reviewer: "Reviewing at the Engineer's desk",
  breaker: "Attempting to break it",
  fixer: "Repairing defects",
  verifier: "Running machine checks",
  deploy: "Deploying",
  monitor: "Monitoring production"
};

/** Latest role + task label derived from real events. */
export function currentTask(events: GuildlessEvent[]): TaskLabel {
  let role: string | null = null;
  for (const event of events) {
    if (event.type === "agent_start" && event.role) role = String(event.role);
    if (event.type === "stage" && (event.stage === "verify" || event.stage === "deploy" || event.stage === "monitor")) role = String(event.stage);
  }
  return { role, task: role ? (ROLE_TASKS[role] ?? "Working") : "Standing by" };
}

export interface ProgressState {
  what: string | null;
  done: number;
  total: number;
}

export function latestProgress(events: GuildlessEvent[]): ProgressState | null {
  let progress: ProgressState | null = null;
  for (const event of events) {
    if (event.type === "progress" && typeof event.what === "string") {
      progress = { what: event.what, done: Number(event.done ?? 0), total: Number(event.total ?? 1) };
    }
  }
  return progress;
}

export function testStatus(events: GuildlessEvent[]): { passed: number; total: number } {
  let passed = 0;
  let total = 0;
  for (const event of events) {
    if (event.type === "verify") {
      total += 1;
      if (event.ok === true) passed += 1;
    }
  }
  return { passed, total };
}

export function findingsCount(events: GuildlessEvent[]): number {
  return events.filter((event) => event.type === "agent_start" && event.role === "reviewer").length;
}

export function verdictOf(events: GuildlessEvent[]): string | null {
  for (const event of events) {
    if (event.type === "verdict" && event.verdict) return String(event.verdict);
  }
  return null;
}
