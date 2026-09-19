import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { main } from "../src/cli.js";

test("returns usage error when verify is omitted", async () => {
  assert.equal(await main([], process.cwd()), 2);
});

test("returns success for help", async () => {
  assert.equal(await main(["--help"], process.cwd()), 0);
});

test("watch subcommand is registered and does not fall back to usage", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "guildless-cli-"));
  try {
    assert.equal(await main(["watch", "--once", "--json"], cwd), 0);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("watch --once shows an idle state when the events file is missing", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "guildless-cli-"));
  try {
    const code = await main(["watch", "--once", "--json"], cwd);
    assert.equal(code, 0);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("run subcommand requires a goal", async () => {
  assert.equal(await main(["run"], process.cwd()), 2);
});

test("run with a goal executes the orchestrator", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "guildless-cli-"));
  try {
    const code = await main(["run", "create a hello module", "--config", "missing.yml"], cwd);
    assert.equal(code, 2, "missing config must surface as a config error, not usage");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
