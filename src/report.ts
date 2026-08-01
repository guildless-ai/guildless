import type { CheckResult } from "./checks/types.js";

export interface VerificationReport {
  accepted: boolean;
  checks: CheckResult[];
}

export function renderReport(report: VerificationReport): string {
  const title = `GUILDLESS: ${report.accepted ? "ACCEPTED" : "REJECTED"}`;
  const checks = report.checks.map((check) => `${check.ok ? "✓" : "✗"} ${check.summary}`).join("\n");
  const conclusion = report.accepted
    ? "AI completion claim was accepted."
    : "AI completion claim was rejected.";
  return `${title}\n\n${checks}\n\n${conclusion}`;
}
