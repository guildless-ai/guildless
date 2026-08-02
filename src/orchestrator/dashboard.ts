import type { WorkEvent } from "./events.js";

export interface DashboardAgent {
  role: string;
  id: string;
  status: "running" | "done" | "failed";
  inputTokens: number;
  outputTokens: number;
  cost: number;
}

export interface DashboardState {
  runId: string | null;
  objective: string;
  startedAt: number | null;
  stages: Record<string, string>;
  agents: DashboardAgent[];
  progress: Record<string, { done: number; total: number }>;
  verify: Array<{ label: string; ok: boolean }>;
  verdict: string | null;
  accepted: boolean | null;
  humanInterventions: number;
  elapsedMs: number;
  tokens: number;
  cost: number;
  finished: boolean;
}

export function emptyState(): DashboardState {
  return {
    runId: null,
    objective: "",
    startedAt: null,
    stages: {},
    agents: [],
    progress: {},
    verify: [],
    verdict: null,
    accepted: null,
    humanInterventions: 0,
    elapsedMs: 0,
    tokens: 0,
    cost: 0,
    finished: false
  };
}

export function aggregate(events: WorkEvent[], now = Date.now()): DashboardState {
  const state = emptyState();
  if (events.length === 0) return state;

  const latestRun = events[events.length - 1].runId;
  const runEvents = events.filter((event) => event.runId === latestRun);
  const agentById = new Map<string, DashboardAgent>();
  let summaryEvent: { ts: string; elapsedMs: number; tokens: number; cost: number; humanInterventions: number; accepted: boolean } | null = null;

  for (const event of runEvents) {
    switch (event.type) {
      case "run_start":
        state.runId = event.runId;
        state.objective = event.objective;
        state.startedAt = Date.parse(event.ts);
        break;
      case "stage":
        state.stages[event.stage] = event.status;
        break;
      case "agent_start":
        agentById.set(event.id, { role: event.role, id: event.id, status: "running", inputTokens: 0, outputTokens: 0, cost: 0 });
        break;
      case "agent_end": {
        const agent = agentById.get(event.id) ?? { role: event.role, id: event.id, status: "running" as const, inputTokens: 0, outputTokens: 0, cost: 0 };
        agent.status = event.ok ? "done" : "failed";
        agent.inputTokens = event.inputTokens ?? 0;
        agent.outputTokens = event.outputTokens ?? 0;
        agent.cost = event.cost ?? 0;
        agentById.set(event.id, agent);
        break;
      }
      case "progress":
        state.progress[event.what] = { done: event.done, total: event.total };
        break;
      case "verify":
        state.verify.push({ label: event.label, ok: event.ok });
        if (state.verify.length > 14) state.verify.shift();
        break;
      case "verdict":
        state.verdict = event.verdict;
        break;
      case "summary":
        summaryEvent = event;
        break;
    }
  }

  state.agents = [...agentById.values()];
  state.accepted = state.verdict === "ACCEPTED" || summaryEvent?.accepted === true || null;
  state.humanInterventions = summaryEvent?.humanInterventions ?? 0;
  state.tokens = state.agents.reduce((sum, a) => sum + a.inputTokens + a.outputTokens, 0);
  state.cost = state.agents.reduce((sum, a) => sum + a.cost, 0);

  if (summaryEvent) {
    state.finished = true;
    state.elapsedMs = summaryEvent.elapsedMs;
    state.tokens = summaryEvent.tokens;
    state.cost = summaryEvent.cost;
    if (state.accepted === null) state.accepted = summaryEvent.accepted;
  } else if (state.startedAt) {
    state.elapsedMs = now - state.startedAt;
  }

  return state;
}

export function formatElapsed(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest > 0 ? `${minutes}m ${rest}s` : `${minutes}m`;
}

export function renderDashboardText(state: DashboardState): string {
  const lines: string[] = [];
  lines.push(`GUILDLESS WATCH  ${state.runId ?? "(waiting)"}`);
  if (state.objective) lines.push(`Objective: ${state.objective.slice(0, 90)}`);
  lines.push("");
  const stageOrder = ["planner", "build", "review", "fix", "break", "verify"];
  const stageLine = stageOrder.map((stage) => {
    const status = state.stages[stage] ?? "pending";
    const icon = status === "ok" ? "✓" : status === "fail" ? "✗" : status === "running" ? "…" : status === "skipped" ? "-" : "•";
    return `${stage} ${icon}`;
  }).join("   ");
  lines.push(stageLine);
  lines.push("");

  if (state.agents.length > 0) {
    lines.push("Agents:");
    for (const agent of state.agents) {
      const icon = agent.status === "done" ? "✓" : agent.status === "failed" ? "✗" : "…";
      lines.push(`  ${icon} ${agent.id.padEnd(14)} ${(agent.inputTokens + agent.outputTokens).toLocaleString()} tokens`);
    }
    lines.push("");
  }

  const progress = Object.entries(state.progress).filter(([, p]) => p.total > 0);
  if (progress.length > 0) {
    lines.push(progress.map(([what, p]) => `${what}: ${p.done}/${p.total}`).join("   "));
    lines.push("");
  }

  if (state.verify.length > 0) {
    lines.push("Verify:");
    for (const v of state.verify.slice(-8)) {
      lines.push(`  ${v.ok ? "✓" : "✗"} ${v.label}`);
    }
    lines.push("");
  }

  lines.push(`Human interventions: ${state.humanInterventions}`);
  lines.push(`Runtime: ${formatElapsed(state.elapsedMs)}`);
  lines.push(`Tokens: ${state.tokens.toLocaleString()}`);
  lines.push(`Cost: $${state.cost.toFixed(4)}`);
  lines.push(`Verdict: ${state.verdict ?? "running…"}`);
  return lines.join("\n");
}
