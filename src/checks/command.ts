import { spawn } from "node:child_process";
import type { CheckResult } from "./types.js";

function run(command: string, cwd: string): Promise<{ code: number | null; output: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, { cwd, shell: true, env: process.env });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { output += chunk; });
    child.on("error", (error) => resolve({ code: null, output: String(error) }));
    child.on("close", (code) => resolve({ code, output: output.trim() }));
  });
}

export async function checkCommands(cwd: string, commands: string[]): Promise<CheckResult> {
  for (const command of commands) {
    const result = await run(command, cwd);
    if (result.code !== 0) {
      return {
        id: "command",
        ok: false,
        summary: `Command failed: ${command}`,
        detail: `exit ${result.code ?? "unknown"}${result.output ? `\n${result.output}` : ""}`,
        recommendation: "Fix the failing command locally, then re-run"
      };
    }
  }
  return {
    id: "command",
    ok: true,
    summary: commands.length === 1 ? "Command passed" : `${commands.length} commands passed`
  };
}
