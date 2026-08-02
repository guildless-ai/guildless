export interface CheckResult {
  id: "git-clean" | "commit-match" | "command" | "http" | "unverified-scope" | "contract";
  ok: boolean;
  summary: string;
  detail?: string;
  recommendation?: string;
}
