import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";

test("breaker counterexamples: artifacts exist", () => {
  for (const f of [
  "src/runtime/gate-1.ts",
  "src/runtime/gate-3.ts",
  "src/runtime/gate-2.ts"
  ]) assert.ok(existsSync(f), "missing artifact " + f);
});
