import { mkdirSync, writeFileSync } from "node:fs";
import { readInput, writeOutput } from "./agent-io.js";

const input = readInput();
const artifacts = Array.isArray(input.artifacts) ? (input.artifacts as string[]).map(String) : [];
const list = artifacts.map((artifact) => `  "${artifact}"`).join(",\n");
const code =
  `import assert from "node:assert/strict";\n` +
  `import { existsSync } from "node:fs";\n` +
  `import test from "node:test";\n\n` +
  `test("breaker counterexamples: artifacts exist", () => {\n` +
  `  for (const f of [\n${list}\n  ]) assert.ok(existsSync(f), "missing artifact " + f);\n` +
  `});\n`;
const file = "test/orchestration-breaker.test.ts";
mkdirSync("test", { recursive: true });
writeFileSync(file, code, "utf8");
writeOutput({ status: "ok", testFiles: [file], summary: "added counterexample test" });
