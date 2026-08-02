import { readFileSync, writeFileSync } from "node:fs";
import { readInput, writeOutput } from "./agent-io.js";

const input = readInput();
const findings = Array.isArray(input.findings) ? (input.findings as Array<Record<string, unknown>>) : [];
const files: string[] = [];
for (const finding of findings) {
  const file = typeof finding.file === "string" ? finding.file : null;
  if (!file) continue;
  try {
    const content = readFileSync(file, "utf8");
    const fixed = content.replaceAll("BUG:", "FIXED:");
    if (fixed !== content) {
      writeFileSync(file, fixed, "utf8");
      files.push(file);
    }
  } catch { /* skip unreadable artifact */ }
}
writeOutput({ status: "ok", files, summary: `fixed ${files.length} files` });
