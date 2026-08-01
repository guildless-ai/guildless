import assert from "node:assert/strict";
import test from "node:test";
import { main } from "../src/cli.js";

test("returns usage error when verify is omitted", async () => {
  assert.equal(await main([], process.cwd()), 2);
});

test("returns success for help", async () => {
  assert.equal(await main(["--help"], process.cwd()), 0);
});
