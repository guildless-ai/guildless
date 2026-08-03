export type RoleId = "planner" | "builder" | "reviewer" | "breaker" | "fixer" | "verifier";

export interface RoleConfig {
  display: string;
  color: string;
  position: string;
  task: string;
}

export const ROLE_CONFIGS: Record<RoleId, RoleConfig> = {
  planner: { display: "Planner", color: "#7c5cff", position: "left", task: "Planning the work" },
  builder: { display: "Builder", color: "#22c55e", position: "center-left", task: "Writing code" },
  reviewer: { display: "Reviewer", color: "#f59e0b", position: "center-right", task: "Inspecting changes" },
  breaker: { display: "Breaker", color: "#ef4444", position: "right", task: "Attempting to break it" },
  fixer: { display: "Fixer", color: "#3b82f6", position: "right-center", task: "Repairing defects" },
  verifier: { display: "Verifier", color: "#14b8a6", position: "bottom", task: "Running machine checks" }
};

export type ActionName =
  | "attention" | "wave" | "thinking" | "typing" | "working" | "inspect" | "reading"
  | "warning" | "attack" | "repair" | "checking" | "alert" | "nod" | "disappointed"
  | "error" | "celebrate" | "reject" | "idle";

export interface PersonaAction {
  target: RoleId;
  action: ActionName;
  label: string;
  accent?: string;
}

export interface MappedAction extends PersonaAction {
  source: string;         // human-readable source event description
  runId: string;
  ts: string;
  key: string;            // dedupe key
}

export interface BridgeLogEntry {
  ts: string;
  runId: string;
  key: string;
  source: string;
  target: RoleId;
  action: ActionName;
  label: string;
  sent: boolean;
  error?: string;
}

export interface OverlayState {
  runId: string | null;
  role: RoleId | null;
  task: string;
  repoIssue: string;
  findings: number;
  reviewsDone: number;
  testsPassed: number;
  testsTotal: number;
  humanInterventions: number;
  verdict: string | null;
  accepted: boolean | null;
  finished: boolean;
}

export interface PersonaClientConfig {
  mcpUrl?: string;
  toolName?: string;
  httpUrl?: string;
  fetchFn?: typeof fetch;
}

export interface BridgeConfig {
  file: string;
  keysFile: string;
  logFile: string;
  intervalMs?: number;
  runContext?: { repo?: string; issue?: string };
  evidenceDir?: string;
}

export interface PersonaStateFile {
  pid?: number;
  file?: string;
  startedAt?: string;
  running?: boolean;
}
