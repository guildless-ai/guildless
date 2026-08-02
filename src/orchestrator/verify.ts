import { execFile } from "node:child_process";
import { spawn } from "node:child_process";
import { promisify } from "node:util";
import { checkDesign } from "../checks/design.js";
import type { VerificationConfig, VerifyResult } from "./types.js";

const execFileAsync = promisify(execFile);

function runCommand(command: string, cwd: string, timeoutMs: number): Promise<{ code: number | null; output: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, { cwd, shell: true, env: process.env });
    let output = "";
    child.stdout.on("data", (chunk: string) => { output += chunk; });
    child.stderr.on("data", (chunk: string) => { output += chunk; });
    const timer = setTimeout(() => { child.kill(); }, timeoutMs);
    child.on("error", (error) => { clearTimeout(timer); resolve({ code: null, output: String(error) }); });
    child.on("close", (code) => { clearTimeout(timer); resolve({ code, output: output.trim() }); });
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

export async function runVerification(
  cwd: string,
  config: VerificationConfig,
  hooks: { onResult?: (label: string, ok: boolean) => void } = {}
): Promise<VerifyResult[]> {
  const results: VerifyResult[] = [];
  const timeoutMs = config.commandTimeoutMs ?? 600_000;

  for (let i = 0; i < config.commands.length; i++) {
    const label = config.commands[i];
    const { code, output } = await runCommand(label, cwd, timeoutMs);
    const ok = code === 0;
    hooks.onResult?.(label, ok);
    results.push({
      id: `command-${i + 1}`,
      kind: "command",
      label,
      ok,
      detail: `exit ${code ?? "unknown"}${output ? `\n${output}` : ""}`
    });
  }

  if (config.gitDiffCheck) {
    try {
      await execFileAsync("git", ["diff", "--check"], { cwd, encoding: "utf8" });
      hooks.onResult?.("git diff --check", true);
      results.push({ id: "git-diff-check", kind: "git-diff-check", label: "git diff --check", ok: true });
    } catch (error) {
      hooks.onResult?.("git diff --check", false);
      results.push({ id: "git-diff-check", kind: "git-diff-check", label: "git diff --check", ok: false, detail: String(error) });
    }
  }

  for (const target of config.http) {
    const { ok, detail } = await checkHttp(target);
    hooks.onResult?.(`GET ${target.url}`, ok);
    results.push({ id: `http-${target.url}`, kind: "http", label: `GET ${target.url}`, ok, detail });
  }

  if (config.designDocuments && config.designDocuments.length > 0) {
    const design = await checkDesign(cwd, { documents: config.designDocuments, decisionsFile: config.designDecisionsFile });
    hooks.onResult?.("design deliverables", design.ok);
    results.push({ id: "design", kind: "design", label: "design deliverables", ok: design.ok, detail: design.detail });
  }

  return results;
}
