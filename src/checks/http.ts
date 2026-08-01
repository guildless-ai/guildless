import type { HttpTarget } from "../contract.js";
import type { CheckResult } from "./types.js";

export async function checkHttp(targets: HttpTarget[]): Promise<CheckResult> {
  for (const target of targets) {
    try {
      const response = await fetch(target.url, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(target.timeoutMs ?? 10_000)
      });
      if (response.status !== target.status) {
        return {
          id: "http",
          ok: false,
          summary: `Production URL returned ${response.status}`,
          detail: `${target.url} expected ${target.status}`
        };
      }
    } catch (error) {
      return { id: "http", ok: false, summary: "Production URL request failed", detail: `${target.url}: ${String(error)}` };
    }
  }
  return { id: "http", ok: true, summary: targets.length === 1 ? "Production URL returned expected status" : `${targets.length} URLs returned expected status` };
}
