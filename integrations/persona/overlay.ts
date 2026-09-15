import { ROLE_CONFIGS, type OverlayState, type RoleId } from "./types.js";
import { readReviewerFindings } from "./events-source.js";
import type { GuildlessEvent } from "./mapping.js";

function roleFor(role?: unknown, stage?: unknown): RoleId {
  const value = String(role ?? stage ?? "");
  if (value.startsWith("builder")) return "builder";
  if (value.startsWith("reviewer")) return "reviewer";
  if (value.startsWith("breaker")) return "breaker";
  if (value.startsWith("fixer")) return "fixer";
  if (value.startsWith("verify") || value.startsWith("verifier")) return "verifier";
  return "planner";
}

export function buildOverlayState(
  events: GuildlessEvent[],
  options: { runContext?: { repo?: string; issue?: string }; evidenceDir?: string } = {}
): OverlayState {
  const state: OverlayState = {
    runId: null,
    role: null,
    task: "Standing by",
    repoIssue: options.runContext?.repo
      ? `${options.runContext.repo}${options.runContext.issue ? `#${options.runContext.issue}` : ""}`
      : "",
    findings: 0,
    reviewsDone: 0,
    testsPassed: 0,
    testsTotal: 0,
    humanInterventions: 0,
    verdict: null,
    accepted: null,
    finished: false
  };

  let latestRole: RoleId | null = null;
  let verifyOk = 0;
  let verifyTotal = 0;
  let hasVerdict = false;

  for (const event of events) {
    state.runId = event.runId;
    switch (event.type) {
      case "stage":
        if (String(event.stage) === "planner") latestRole = "planner";
        if (String(event.stage) === "verify") latestRole = "verifier";
        break;
      case "agent_start":
        latestRole = roleFor(event.role, event.stage);
        if (latestRole === "reviewer") state.reviewsDone += 1;
        break;
      case "verify":
        verifyTotal += 1;
        if (event.ok === true) verifyOk += 1;
        break;
      case "verdict":
        hasVerdict = true;
        state.verdict = String(event.verdict ?? "");
        state.accepted = event.verdict === "ACCEPTED";
        break;
      case "summary":
        state.finished = true;
        if (typeof event.humanInterventions === "number") state.humanInterventions = event.humanInterventions;
        if (!hasVerdict) {
          state.accepted = event.accepted === true;
          state.verdict = state.accepted ? "ACCEPTED" : "REJECTED";
        }
        break;
      default:
        break;
    }
  }

  if (latestRole) state.role = latestRole;
  if (state.role) state.task = ROLE_CONFIGS[state.role].task;
  if (state.finished) state.task = "Done";

  state.testsPassed = verifyOk;
  state.testsTotal = verifyTotal;
  if (options.evidenceDir) {
    state.findings = readReviewerFindings(options.evidenceDir).length;
  }
  return state;
}

export function renderOverlayText(state: OverlayState): string {
  const role = state.role ? ROLE_CONFIGS[state.role].display : "—";
  const lines = [
    `Role: ${role}`,
    `Task: ${state.task}`,
    `Repo/Issue: ${state.repoIssue || "—"}`,
    `Reviews done: ${state.reviewsDone}`,
    `Findings: ${state.findings}`,
    `Tests: ${state.testsTotal ? `${state.testsPassed}/${state.testsTotal}` : "—"}`,
    `Human intervention: ${state.humanInterventions}`,
    `Verdict: ${state.verdict ?? "running…"}`
  ];
  return lines.join("\n");
}

function esc(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Minimal transparent HTML overlay to place beside the Persona window. */
export function renderOverlayHtml(state: OverlayState): string {
  const role = state.role ? ROLE_CONFIGS[state.role] : null;
  const accent = role?.color ?? "#14b8a6";
  const verdictColor = state.accepted ? "#22c55e" : state.verdict === "REJECTED" ? "#ef4444" : "#f59e0b";
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { background: transparent; font-family: 'Segoe UI', sans-serif; color: #e5e7eb; margin: 0; }
  #card { background: rgba(15, 23, 42, 0.72); border: 1px solid ${accent}; border-left: 4px solid ${accent};
          border-radius: 8px; padding: 10px 14px; width: 260px; }
  .row { font-size: 12px; line-height: 1.5; }
  .role { font-size: 15px; font-weight: 600; color: ${accent}; }
  .verdict { font-weight: 700; color: ${verdictColor}; }
</style>
</head>
<body>
<div id="card">
  <div class="role">${esc(role?.display ?? "—")}</div>
  <div class="row">Task: ${esc(state.task)}</div>
  <div class="row">Repo/Issue: ${esc(state.repoIssue || "—")}</div>
  <div class="row">Reviews: ${state.reviewsDone} · Findings: ${state.findings}</div>
  <div class="row">Tests: ${state.testsTotal ? `${state.testsPassed}/${state.testsTotal}` : "—"}</div>
  <div class="row">Human intervention: ${state.humanInterventions}</div>
  <div class="row verdict">${esc(state.verdict ?? "running…")}</div>
</div>
</body>
</html>`;
}
