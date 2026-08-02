import type { HttpTarget } from "../contract.js";
import type { CheckResult } from "./types.js";

export async function checkHttp(targets: HttpTarget[]): Promise<CheckResult> {
  const details: string[] = [];
  for (const target of targets) {
    const started = Date.now();
    try {
      const response = await fetch(target.url, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(target.timeoutMs ?? 10_000)
      });
      const durationMs = Date.now() - started;
      details.push(`GET ${target.url} → ${response.status} (expected ${target.status}, ${durationMs}ms)`);
      if (response.status !== target.status) {
        return {
          id: "http",
          ok: false,
          summary: `URL returned ${response.status} (expected ${target.status})`,
          detail: details.join("\n"),
          recommendation: "Confirm the URL is reachable and returns the expected status, then re-run"
        };
      }
    } catch (error) {
      const durationMs = Date.now() - started;
      details.push(`GET ${target.url} → error (${durationMs}ms): ${String(error)}`);
      return {
        id: "http",
        ok: false,
        summary: "URL request failed",
        detail: details.join("\n"),
        recommendation: "Confirm the URL is reachable, then re-run"
      };
    }
  }
  return {
    id: "http",
    ok: true,
    summary: targets.length === 1 ? "URL returned expected status" : `${targets.length} URLs returned expected status`,
    detail: details.join("\n")
  };
}
