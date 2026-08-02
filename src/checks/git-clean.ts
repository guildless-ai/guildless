import { git } from "./git.js";
import type { CheckResult } from "./types.js";

function visibleChanges(status: string): string[] {
  return status
    .split("\n")
    .filter((line) => line.trim() !== "")
    .filter((line) => {
      const path = line.slice(3);
      return path !== ".guildless" && !path.startsWith(".guildless/");
    });
}

export async function checkGitClean(cwd: string): Promise<CheckResult> {
  try {
    const changes = visibleChanges(await git(["status", "--porcelain"], cwd));
    if (changes.length === 0) {
      return { id: "git-clean", ok: true, summary: "Git working tree is clean" };
    }
    return {
      id: "git-clean",
      ok: false,
      summary: `${changes.length} uncommitted change${changes.length === 1 ? "" : "s"}`,
      detail: changes.join("\n"),
      recommendation: "Commit or stash the uncommitted changes, then re-run"
    };
  } catch (error) {
    return {
      id: "git-clean",
      ok: false,
      summary: "Git working tree could not be inspected",
      detail: String(error),
      recommendation: "Run inside a git repository with a working git installation"
    };
  }
}
