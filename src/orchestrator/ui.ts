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
  lines.push(`Reviews       ${result.reviews.length}${result.consensus.length > 0 ? `  findings: ${result.consensus.length}` : ""}`);
  lines.push(`Fix round     ${result.fixRound}/${result.config.verification.maxFixRounds}`);
  lines.push(`Breaker       ${icon(result.status.break)}`);
  const verifyOk = result.verify.filter((v) => v.ok).length;
  const verifyLabel = result.status.verify === "ok" ? "PASS" : `FAIL (${verifyOk} of ${result.verify.length} checks)`;
  lines.push(`Verifier      ${verifyLabel}`);
  lines.push("");
  if (result.errors.length > 0) {
    lines.push(`Errors: ${result.errors.join("; ")}`);
    lines.push("");
  }
  lines.push(`Verdict: ${result.verdict}`);
  if (result.evidencePath) lines.push(`Evidence: ${result.evidencePath}`);
  return lines.join("\n");
}

export function renderQuietVerdict(result: OrchestrationResult): string {
  if (result.verdict === "ACCEPTED") return "";
  const verifyFailed = result.verify.filter((v) => !v.ok).length;
  if (result.status.verify === "fail" && verifyFailed > 0) {
    return `GUILDLESS: REJECTED: verification failed (${verifyFailed} of ${result.verify.length} checks)`;
  }
  return `GUILDLESS: REJECTED: ${result.errors[0] ?? "orchestration failed"}`;
}
