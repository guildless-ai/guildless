import type { CheckResult } from "./checks/types.js";

export interface VerificationReport {
  accepted: boolean;
  checks: CheckResult[];
  runId: string | null;
  evidencePath: string | null;
  evidenceError: string | null;
}

export type RenderMode = "normal" | "verbose" | "quiet";

function title(report: VerificationReport): string {
  return `GUILDLESS: ${report.accepted ? "ACCEPTED" : "REJECTED"}`;
}

function statusLine(check: CheckResult): string {
  return `${check.ok ? "✓" : "✗"} ${check.id}: ${check.summary}`;
}

function nextActions(report: VerificationReport): string[] {
  const actions: string[] = [];
  for (const check of report.checks) {
    if (!check.ok && check.recommendation && !actions.includes(check.recommendation)) {
      actions.push(check.recommendation);
    }
  }
  return actions;
}

function appendEvidence(lines: string[], report: VerificationReport): void {
  if (report.evidencePath) {
    lines.push(`Evidence: ${report.evidencePath}`);
  } else {
    lines.push(`Evidence: not saved${report.evidenceError ? ` (${report.evidenceError})` : ""}`);
  }
}

export function renderNormal(report: VerificationReport): string {
  const lines = [title(report), ""];
  for (const check of report.checks) lines.push(statusLine(check));
  lines.push("");
  const actions = nextActions(report);
  if (report.accepted) {
    lines.push("Next: no action required.");
  } else if (actions.length > 0) {
    lines.push("Next:");
    for (const action of actions) lines.push(`  • ${action}`);
    lines.push("  Re-run: guildless verify");
  } else {
    lines.push("Next: re-run `guildless verify` after fixing the failures.");
  }
  appendEvidence(lines, report);
  return lines.join("\n");
}

export function renderVerbose(report: VerificationReport): string {
  const lines = [title(report)];
  if (report.runId) lines.push(`Run: ${report.runId}`);
  lines.push("");
  for (const check of report.checks) {
    lines.push(statusLine(check));
    if (check.detail) {
      for (const line of check.detail.split("\n")) lines.push(`    ${line}`);
    }
  }
  lines.push("");
  appendEvidence(lines, report);
  return lines.join("\n");
}

export function renderQuiet(report: VerificationReport): string {
  if (report.accepted) return "";
  const failed = report.checks.find((check) => !check.ok);
  return `GUILDLESS: REJECTED: ${failed ? failed.summary : "verification failed"}`;
}

export function renderReport(report: VerificationReport, mode: RenderMode = "normal"): string {
  switch (mode) {
    case "verbose": return renderVerbose(report);
    case "quiet": return renderQuiet(report);
    default: return renderNormal(report);
  }
}
