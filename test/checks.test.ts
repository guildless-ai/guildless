import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { checkCommands } from "../src/checks/command.js";
import { checkCommitMatch } from "../src/checks/commit-match.js";
import { checkGitClean } from "../src/checks/git-clean.js";
import { checkHttp } from "../src/checks/http.js";
import { checkUnverifiedScope } from "../src/checks/unverified-scope.js";

const exec = promisify(execFile);

test("checks git cleanliness and exact commit identity", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "guildless-"));
  try {
    await exec("git", ["init"], { cwd });
    await exec("git", ["config", "user.email", "test@example.com"], { cwd });
    await exec("git", ["config", "user.name", "Test"], { cwd });
    await writeFile(path.join(cwd, "file.txt"), "one");
    await exec("git", ["add", "file.txt"], { cwd });
    await exec("git", ["commit", "-m", "first"], { cwd });
    const { stdout } = await exec("git", ["rev-parse", "HEAD"], { cwd });

    assert.equal((await checkGitClean(cwd)).ok, true);
    assert.equal((await checkCommitMatch(cwd, stdout.trim())).ok, true);
    await writeFile(path.join(cwd, "file.txt"), "two");
    assert.equal((await checkGitClean(cwd)).ok, false);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("checks commands, HTTP status, and declared scope", async () => {
  assert.equal((await checkCommands(process.cwd(), [`"${process.execPath}" -e "process.exit(0)"`])).ok, true);
  assert.equal((await checkCommands(process.cwd(), [`"${process.execPath}" -e "process.exit(3)"`])).ok, false);

  const server = createServer((_request, response) => { response.writeHead(204); response.end(); });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing test server address");
    const url = `http://127.0.0.1:${address.port}`;
    assert.equal((await checkHttp([{ url, status: 204 }])).ok, true);
    assert.equal((await checkHttp([{ url, status: 200 }])).ok, false);
  } finally {
    server.close();
  }
  assert.equal(checkUnverifiedScope(["Browser behavior"]).ok, true);
  assert.equal(checkUnverifiedScope([]).ok, false);
});
