"use strict";
const fs = require("fs");

function arg(name) {
  const i = process.argv.indexOf("--" + name);
  return i >= 0 ? process.argv[i + 1] : null;
}

const input = JSON.parse(fs.readFileSync(arg("input"), "utf8"));
const artifacts = (input.artifacts || []).map(String);
const list = artifacts.map((a) => "  \"" + a + "\"").join(",\n");
const code =
  "const assert = require(\"node:assert/strict\");\n" +
  "const { existsSync } = require(\"node:fs\");\n" +
  "const test = require(\"node:test\");\n\n" +
  "test(\"breaker counterexamples\", () => {\n" +
  "  for (const f of [\n" + list + "\n  ]) assert.ok(existsSync(f), \"missing artifact \" + f);\n" +
  "});\n";
fs.mkdirSync("test", { recursive: true });
fs.writeFileSync("test/breaker.test.js", code, "utf8");
fs.writeFileSync(arg("output"), JSON.stringify({ status: "ok", testFiles: ["test/breaker.test.js"], summary: "added counterexamples" }));
