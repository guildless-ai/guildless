export interface CheckResult {
  id: "git-clean" | "commit-match" | "command" | "http" | "unverified-scope";
  ok: boolean;
  summary: string;
  detail?: string;
}
