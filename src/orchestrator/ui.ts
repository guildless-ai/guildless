import type { OrchestrationResult, StageStatus } from "./types.js";

function icon(status: StageStatus): string {
  switch (status) {
    case "ok": return "✓";
    case "fail": return "✗";
    case "running": return "…";
    case "skipped": return "-";
    default: return "•";
  }
}

export function renderStatusBoard(result: OrchestrationResult): string {
  const lines: string[] = ["GUILDLESS ORCHESTRATION", ""];
  lines.push(`Objective: ${result.objective}`);
  lines.push("");
  lines.push(`Planner       ${icon(result.status.planner)}`);
  const buildersOk = result.builders.filter((b) => b.status === "ok").length;
  lines.push(`Builders      ${result.status.build === "skipped" ? "-" : `${buildersOk}/${result.config.agents.builders}`}`);
  lines.push(`Reviews       ${result.reviews.length}${result.consensus.length > 0 ? `  findings: ${result.consensus.length} (high: ${result.consensus.filter((f) => f.severity === "high").length})` : ""}`);
  lines.push(`Fix round     ${result.fixRound}/${result.config.verification.maxFixRounds}`);
  lines.push(`Breaker       ${icon(result.status.break)}`);
  const verifyOk = result.verify.filter((v) => v.ok).length;
  const verifyLabel = result.status.verify === "ok" ? "PASS" : `FAIL (${verifyOk} of ${result.verify.length} checks)`;
  lines.push(`Verifier      ${verifyLabel}`);
  const metrics = renderMetrics(result);
  if (metrics.length > 0) {
    lines.push("");
    lines.push(...metrics);
  }
  lines.push("");
  if (result.errors.length > 0) {
    lines.push(`Errors: ${result.errors.join("; ")}`);
    lines.push("");
  }
  lines.push(`Verdict: ${result.verdict}`);
  if (result.evidencePath) lines.push(`Evidence: ${result.evidencePath}`);
  return lines.join("\n");
}

function renderMetrics(result: OrchestrationResult): string[] {
  if (result.agentMetrics.length === 0) return [];
  const lines: string[] = [];
  const input = result.agentMetrics.reduce((sum, m) => sum + (m.inputTokens ?? 0), 0);
  const output = result.agentMetrics.reduce((sum, m) => sum + (m.outputTokens ?? 0), 0);
  const cost = result.agentMetrics.reduce((sum, m) => sum + (m.cost ?? 0), 0);
  const models = new Set(result.agentMetrics.map((m) => m.model).filter((m): m is string => Boolean(m)));
  lines.push(`Agents        ${result.agentMetrics.length}`);
  if (input > 0 || output > 0) lines.push(`Tokens        ${input.toLocaleString()} in / ${output.toLocaleString()} out`);
  if (models.size > 0) lines.push(`Model         ${[...models].join(", ")}`);
  if (cost > 0) lines.push(`Cost          $${cost.toFixed(4)}`);
  const elapsed = Date.parse(result.finishedAt) - Date.parse(result.startedAt);
  if (Number.isFinite(elapsed) && elapsed > 0) lines.push(`Elapsed       ${formatElapsed(elapsed)}`);
  return lines;
}

function formatElapsed(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest > 0 ? `${minutes}m ${rest}s` : `${minutes}m`;
}

export function renderQuietVerdict(result: OrchestrationResult): string {
  if (result.verdict === "ACCEPTED") return "";
  const verifyFailed = result.verify.filter((v) => !v.ok).length;
  if (result.status.verify === "fail" && verifyFailed > 0) {
    return `GUILDLESS: REJECTED: verification failed (${verifyFailed} of ${result.verify.length} checks)`;
  }
  return `GUILDLESS: REJECTED: ${result.errors[0] ?? "orchestration failed"}`;
}
