import { readFileSync } from "node:fs";
import { readInput, writeOutput } from "./agent-io.js";

interface ReviewFinding {
  id: string;
  target: string;
  focus: string;
  severity: "high" | "medium" | "low";
  message: string;
  file: string;
  line: number;
}

const input = readInput();
const artifacts = Array.isArray(input.artifacts) ? (input.artifacts as string[]) : [];
const focus = typeof input.focus === "string" ? input.focus : "general";
const findings: ReviewFinding[] = [];
for (const artifact of artifacts) {
  let content = "";
  try { content = readFileSync(artifact, "utf8"); } catch { /* artifact missing */ }
  content.split("\n").forEach((line, index) => {
    if (line.includes("BUG:")) {
      findings.push({
        id: `${artifact}#${index + 1}`,
        target: artifact,
        focus,
        severity: "medium",
        message: line.trim(),
        file: artifact,
        line: index + 1
      });
    }
  });
}
writeOutput({ status: "ok", findings });
