import { git } from "./git.js";
import type { CheckResult } from "./types.js";

export async function checkGitClean(cwd: string): Promise<CheckResult> {
  try {
    const changes = await git(["status", "--porcelain"], cwd);
    return changes
      ? { id: "git-clean", ok: false, summary: "Git working tree has uncommitted changes", detail: changes }
      : { id: "git-clean", ok: true, summary: "Git working tree is clean" };
  } catch (error) {
    return { id: "git-clean", ok: false, summary: "Git working tree could not be inspected", detail: String(error) };
  }
}
