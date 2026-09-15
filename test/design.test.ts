import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { checkDesign, type DesignConfig } from "../src/checks/design.js";

const DOCS = [
  "requirements.md",
  "architecture.md",
  "api-spec.yaml",
  "database-schema.md",
  "test-plan.md",
  "deployment.md",
  "rollback.md",
  "operations-runbook.md",
  "verification_scope.md"
];

const OPENAPI = `openapi: 3.0.3
info:
  title: Todo API
  version: 1.0.0
paths:
  /todos:
    get:
      responses:
        "200":
          description: ok
`;

async function withDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), "guildless-design-"));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("accepts complete design deliverables", async () => {
  await withDir(async (dir) => {
    for (const doc of DOCS) {
      if (doc.endsWith(".yaml")) await writeFile(path.join(dir, doc), OPENAPI);
      else await writeFile(path.join(dir, doc), "# " + doc);
    }
    await writeFile(path.join(dir, "design-decisions.json"), JSON.stringify([
      { decision: "JWT auth via DI", alternatives: ["middleware"], reason: "testable permission rules", risks: ["revocation"], verification: ["expired-token test"] }
    ]));
    const result = await checkDesign(dir, { documents: DOCS, decisionsFile: "design-decisions.json" });
    assert.equal(result.ok, true);
    assert.match(result.summary, /complete/);
    assert.match(result.detail ?? "", /1 design decision/);
  });
});

test("fails when a design document is missing", async () => {
  await withDir(async (dir) => {
    await writeFile(path.join(dir, "requirements.md"), "# req");
    const result = await checkDesign(dir, { documents: DOCS });
    assert.equal(result.ok, false);
    assert.match(result.summary, /invalid/);
    assert.match(result.detail ?? "", /architecture\.md is missing/);
  });
});

test("fails when api-spec.yaml is not OpenAPI", async () => {
  await withDir(async (dir) => {
    await writeFile(path.join(dir, "api-spec.yaml"), "title: A random document\nversion: 1.0\n");
    const result = await checkDesign(dir, { documents: ["api-spec.yaml"] });
    assert.equal(result.ok, false);
    assert.match(result.detail ?? "", /not an OpenAPI document/);
  });
});

test("fails when decisions are missing decision or reason", async () => {
  await withDir(async (dir) => {
    await writeFile(path.join(dir, "requirements.md"), "# req");
    await writeFile(path.join(dir, "decisions.json"), JSON.stringify([{ decision: "only a decision" }]));
    const result = await checkDesign(dir, { documents: ["requirements.md"], decisionsFile: "decisions.json" });
    assert.equal(result.ok, false);
    assert.match(result.detail ?? "", /missing "decision" or "reason"/);
  });
});

test("fails on empty document", async () => {
  await withDir(async (dir) => {
    await writeFile(path.join(dir, "requirements.md"), "");
    const result = await checkDesign(dir, { documents: ["requirements.md"] });
    assert.equal(result.ok, false);
    assert.match(result.detail ?? "", /empty/);
  });
});

test("fails when design documents are nested under a subdirectory", async () => {
  await withDir(async (dir) => {
    await mkdir(path.join(dir, "docs"), { recursive: true });
    const config: DesignConfig = { documents: ["docs/requirements.md"] };
    await writeFile(path.join(dir, "docs", "requirements.md"), "# req");
    assert.equal((await checkDesign(dir, config)).ok, true);
  });
});
