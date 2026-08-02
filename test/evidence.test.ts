import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { newRunId, saveEvidence } from "../src/evidence.js";

test("saveEvidence writes run-scoped JSON evidence", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "guildless-evidence-"));
  try {
    const payload = {
      runId: "20260802-123456-ab12",
      timestamp: "2026-08-02T12:34:56.000Z",
      cwd,
      accepted: false,
      checks: [{ id: "http", ok: false, summary: "URL returned 500" }],
      contract: null
    };
    const relative = await saveEvidence(cwd, payload);
    assert.equal(relative, ".guildless/runs/20260802-123456-ab12/evidence.json");
    const data = JSON.parse(await readFile(path.join(cwd, relative), "utf8"));
    assert.equal(data.accepted, false);
    assert.equal(data.checks[0].id, "http");
    assert.equal(data.contract, null);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("newRunId uses a parseable, unique timestamp format", () => {
  const a = newRunId();
  const b = newRunId();
  assert.match(a, /^\d{8}-\d{6}-[0-9a-f]{4}$/);
  assert.notEqual(a, b);
});
