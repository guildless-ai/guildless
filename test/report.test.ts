import assert from "node:assert/strict";
import test from "node:test";
import { renderNormal, renderQuiet, renderVerbose } from "../src/report.js";
import type { VerificationReport } from "../src/report.js";

const rejected: VerificationReport = {
  accepted: false,
  runId: "20260802-123456-ab12",
  evidencePath: ".guildless/runs/20260802-123456-ab12/evidence.json",
  evidenceError: null,
  checks: [
    { id: "command", ok: true, summary: "Command passed" },
    { id: "commit-match", ok: false, summary: "Tested commit differs from current HEAD", recommendation: "Commit the tested work" },
    { id: "http", ok: false, summary: "URL returned 404 (expected 200)", detail: "GET https://example.com → 404 (expected 200, 12ms)" }
  ]
};

test("renders a rejected claim concisely without details", () => {
  const output = renderNormal(rejected);
  assert.match(output, /^GUILDLESS: REJECTED/);
  assert.match(output, /✓ command: Command passed/);
  assert.match(output, /✗ commit-match: Tested commit differs/);
  assert.match(output, /Next:\n\s{2}• Commit the tested work/);
  assert.match(output, /Evidence: \.guildless\/runs\/20260802-123456-ab12\/evidence\.json/);
  assert.ok(!output.includes("example.com"), "detail must be hidden in normal mode");
});

test("renders a verbose report including details", () => {
  const output = renderVerbose(rejected);
  assert.match(output, /Run: 20260802-123456-ab12/);
  assert.match(output, /GET https:\/\/example\.com → 404 \(expected 200, 12ms\)/);
});

test("quiet mode prints nothing on acceptance and one line on rejection", () => {
  const accepted: VerificationReport = { accepted: true, runId: "r1", evidencePath: null, evidenceError: null, checks: [] };
  assert.equal(renderQuiet(accepted), "");
  assert.equal(renderQuiet(rejected), "GUILDLESS: REJECTED: Tested commit differs from current HEAD");
});

test("normal report for acceptance shows no next actions", () => {
  const accepted: VerificationReport = {
    accepted: true,
    runId: "r1",
    evidencePath: null,
    evidenceError: null,
    checks: [{ id: "git-clean", ok: true, summary: "Git working tree is clean" }]
  };
  const output = renderNormal(accepted);
  assert.match(output, /^GUILDLESS: ACCEPTED/);
  assert.match(output, /Next: no action required\./);
  assert.match(output, /Evidence: not saved/);
});
