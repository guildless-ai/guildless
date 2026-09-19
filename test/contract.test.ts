import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { loadContract } from "../src/contract.js";

async function withConfig(yaml: string, fn: (file: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), "guildless-contract-"));
  try {
    const file = path.join(dir, "guildless.yml");
    await writeFile(file, yaml);
    await fn(file);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("loads a valid contract", async () => {
  await withConfig(`testedCommit: HEAD
commands:
  - "npm test"
urls:
  - url: "https://example.com/health"
    status: 200
unverifiedScope:
  - "None known"
`, async (file) => {
    const contract = await loadContract(file);
    assert.equal(contract.testedCommit, "HEAD");
    assert.deepEqual(contract.commands, ["npm test"]);
    assert.equal(contract.urls[0].status, 200);
    assert.deepEqual(contract.unverifiedScope, ["None known"]);
  });
});

test("rejects a contract with no commands", async () => {
  await withConfig(`testedCommit: HEAD
commands: []
urls:
  - url: "https://example.com/health"
    status: 200
unverifiedScope:
  - "None known"
`, async (file) => {
    await assert.rejects(() => loadContract(file), /commands/);
  });
});

test("rejects a contract with an invalid URL scheme", async () => {
  await withConfig(`testedCommit: HEAD
commands:
  - "npm test"
urls:
  - url: "ftp://example.com/health"
    status: 200
unverifiedScope:
  - "None known"
`, async (file) => {
    await assert.rejects(() => loadContract(file), /http or https/);
  });
});

test("rejects a contract with an invalid status code", async () => {
  await withConfig(`testedCommit: HEAD
commands:
  - "npm test"
urls:
  - url: "https://example.com/health"
    status: 99
unverifiedScope:
  - "None known"
`, async (file) => {
    await assert.rejects(() => loadContract(file), /HTTP status/);
  });
});

test("loads an optional design deliverables section", async () => {
  await withConfig(`testedCommit: HEAD
commands:
  - "npm test"
urls:
  - url: "https://example.com/health"
    status: 200
unverifiedScope:
  - "None known"
design:
  documents:
    - requirements.md
    - api-spec.yaml
  decisions_file: design-decisions.json
`, async (file) => {
    const contract = await loadContract(file);
    assert.equal(contract.design?.documents.length, 2);
    assert.equal(contract.design?.decisionsFile, "design-decisions.json");
  });
});

test("rejects a contract with an empty design documents list", async () => {
  await withConfig(`testedCommit: HEAD
commands:
  - "npm test"
urls:
  - url: "https://example.com/health"
    status: 200
unverifiedScope:
  - "None known"
design:
  documents: []
`, async (file) => {
    await assert.rejects(() => loadContract(file), /design\.documents/);
  });
});
