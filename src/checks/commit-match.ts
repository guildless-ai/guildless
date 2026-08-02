import { git } from "./git.js";
import type { CheckResult } from "./types.js";

export async function checkCommitMatch(cwd: string, testedCommit: string): Promise<CheckResult> {
  try {
    const [tested, head] = await Promise.all([
      git(["rev-parse", `${testedCommit}^{commit}`], cwd),
      git(["rev-parse", "HEAD^{commit}"], cwd)
    ]);
    return tested === head
      ? { id: "commit-match", ok: true, summary: "Tested commit matches current HEAD", detail: head }
      : {
          id: "commit-match",
          ok: false,
          summary: "Tested commit differs from current HEAD",
          detail: `tested ${tested}; HEAD ${head}`,
          recommendation: "Commit the tested work, or update testedCommit in guildless.yml to match HEAD"
        };
  } catch (error) {
    return {
      id: "commit-match",
      ok: false,
      summary: "Tested commit could not be resolved",
      detail: String(error),
      recommendation: "Set testedCommit in guildless.yml to a valid commit or ref"
    };
  }
}
