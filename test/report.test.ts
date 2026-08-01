import assert from "node:assert/strict";
import test from "node:test";
import { renderReport } from "../src/report.js";

test("renders a rejected completion claim", () => {
  const output = renderReport({
    accepted: false,
    checks: [
      { id: "command", ok: true, summary: "Tests passed" },
      { id: "commit-match", ok: false, summary: "Tested commit differs from current HEAD" },
      { id: "http", ok: false, summary: "Production URL returned 404" },
      { id: "unverified-scope", ok: false, summary: "Unverified scope was not declared" }
    ]
  });
  assert.match(output, /^GUILDLESS: REJECTED/);
  assert.match(output, /✓ Tests passed/);
  assert.match(output, /✗ Tested commit differs/);
  assert.match(output, /AI completion claim was rejected\.$/);
});
