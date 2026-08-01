import type { CheckResult } from "./types.js";

export function checkUnverifiedScope(scope: string[]): CheckResult {
  const declared = scope.length > 0 && scope.every((item) => item.trim().length > 0);
  return declared
    ? { id: "unverified-scope", ok: true, summary: "Unverified scope was declared", detail: scope.join("; ") }
    : { id: "unverified-scope", ok: false, summary: "Unverified scope was not declared" };
}
