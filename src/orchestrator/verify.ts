import { execFile } from "node:child_process";
import { spawn } from "node:child_process";
import { promisify } from "node:util";
import type { VerificationConfig, VerifyResult } from "./types.js";

const execFileAsync = promisify(execFile);

function runCommand(command: string, cwd: string): Promise<{ code: number | null; output: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, { cwd, shell: true, env: process.env });
    let output = "";
    child.stdout.on("data", (chunk: string) => { output += chunk; });
    child.stderr.on("data", (chunk: string) => { output += chunk; });
    child.on("error", (error) => resolve({ code: null, output: String(error) }));
    child.on("close", (code) => resolve({ code, output: output.trim() }));
  });
}

async function checkHttp(target: { url: string; status: number; timeoutMs?: number }): Promise<{ ok: boolean; detail: string }> {
  const started = Date.now();
  try {
    const response = await fetch(target.url, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(target.timeoutMs ?? 10_000)
    });
    const durationMs = Date.now() - started;
    const ok = response.status === target.status;
    return { ok, detail: `GET ${target.url} → ${response.status} (expected ${target.status}, ${durationMs}ms)` };
  } catch (error) {
    return { ok: false, detail: `GET ${target.url} → error: ${String(error)}` };
  }
}

export async function runVerification(cwd: string, config: VerificationConfig): Promise<VerifyResult[]> {
  const results: VerifyResult[] = [];

  for (let i = 0; i < config.commands.length; i++) {
    const label = config.commands[i];
    const { code, output } = await runCommand(label, cwd);
    results.push({
      id: `command-${i + 1}`,
      kind: "command",
      label,
      ok: code === 0,
      detail: `exit ${code ?? "unknown"}${output ? `\n${output}` : ""}`
    });
  }

  if (config.gitDiffCheck) {
    try {
      await execFileAsync("git", ["diff", "--check"], { cwd, encoding: "utf8" });
      results.push({ id: "git-diff-check", kind: "git-diff-check", label: "git diff --check", ok: true });
    } catch (error) {
      results.push({ id: "git-diff-check", kind: "git-diff-check", label: "git diff --check", ok: false, detail: String(error) });
    }
  }

  for (const target of config.http) {
    const { ok, detail } = await checkHttp(target);
    results.push({ id: `http-${target.url}`, kind: "http", label: `GET ${target.url}`, ok, detail });
  }

  return results;
}
