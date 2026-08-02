import type { BuilderOutput, ConsensusFinding, ReviewOutput } from "./types.js";

const FOCUSES = ["bugs and requirements", "security and permissions", "test coverage and error paths"];

export interface ReviewSpec {
  id: string;
  reviewerId: string;
  builderId: string;
  focus: string;
  artifacts: string[];
}

export function buildReviewMatrix(
  builders: BuilderOutput[],
  reviewerCount: number,
  policy: { selfReview: boolean; minimumReviewsPerTask: number }
): ReviewSpec[] {
  const specs: ReviewSpec[] = [];
  const counts = new Map<string, number>();

  for (let r = 0; r < reviewerCount; r++) {
    for (let b = 0; b < builders.length; b++) {
      if (!policy.selfReview && r === b) continue;
      specs.push({
        id: `reviewer-${r + 1}-builder-${b + 1}`,
        reviewerId: `reviewer-${r + 1}`,
        builderId: builders[b].id,
        focus: FOCUSES[r % FOCUSES.length],
        artifacts: builders[b].artifacts
      });
      counts.set(builders[b].id, (counts.get(builders[b].id) ?? 0) + 1);
    }
  }

  for (let b = 0; b < builders.length; b++) {
    let guard = 0;
    while ((counts.get(builders[b].id) ?? 0) < policy.minimumReviewsPerTask && guard++ < reviewerCount * 2) {
      const r = (b + (counts.get(builders[b].id) ?? 0)) % reviewerCount;
      if (!policy.selfReview && r === b) break;
      specs.push({
        id: `reviewer-${r + 1}-builder-${b + 1}`,
        reviewerId: `reviewer-${r + 1}`,
        builderId: builders[b].id,
        focus: FOCUSES[r % FOCUSES.length],
        artifacts: builders[b].artifacts
      });
      counts.set(builders[b].id, (counts.get(builders[b].id) ?? 0) + 1);
    }
  }

  return specs;
}

function severityRank(severity: "high" | "medium" | "low"): number {
  return severity === "high" ? 3 : severity === "medium" ? 2 : 1;
}

export function aggregateFindings(reviews: ReviewOutput[]): ConsensusFinding[] {
  const map = new Map<string, ConsensusFinding>();
  for (const review of reviews) {
    for (const finding of review.findings) {
      const key = `${finding.target}|${finding.message.toLowerCase().replace(/\s+/g, " ").trim()}`;
      const existing = map.get(key);
      if (existing) {
        existing.reports += 1;
        if (severityRank(finding.severity) > severityRank(existing.severity)) existing.severity = finding.severity;
        if (!existing.focuses.includes(finding.focus)) existing.focuses.push(finding.focus);
      } else {
        map.set(key, {
          target: finding.target,
          severity: finding.severity,
          message: finding.message,
          file: finding.file,
          line: finding.line,
          reports: 1,
          focuses: [finding.focus]
        });
      }
    }
  }
  return [...map.values()].sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
}
