import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AgentRole } from "./types.js";

export interface AgentRequest {
  role: AgentRole;
  id: string;
  command: string;
  workdir: string;
  scratchDir: string;
  toolDir: string;
  timeoutMs: number;
  input: unknown;
}

function run(command: string, cwd: string, timeoutMs: number): Promise<{ code: number | null; output: string }> {
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

export async function runAgent(request: AgentRequest): Promise<Record<string, unknown>> {
  const inFile = path.join(request.scratchDir, `${request.id}.in.json`);
  const outFile = path.join(request.scratchDir, `${request.id}.out.json`);
  await mkdir(request.scratchDir, { recursive: true });
  await writeFile(inFile, `${JSON.stringify(request.input, null, 2)}\n`, "utf8");

  const command = request.command
    .replaceAll("{input}", inFile)
    .replaceAll("{output}", outFile)
    .replaceAll("{workdir}", request.workdir)
    .replaceAll("{tool}", request.toolDir)
    .replaceAll("{id}", request.id);

  const { code, output } = await run(command, request.workdir, request.timeoutMs);
  if (code !== 0) {
    throw new Error(`agent ${request.role}/${request.id} exited with code ${code ?? "unknown"}${output ? `\n${output}` : ""}`);
  }
  let raw: string;
  try {
    raw = await readFile(outFile, "utf8");
  } catch {
    throw new Error(`agent ${request.role}/${request.id} produced no output file`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`agent ${request.role}/${request.id} produced invalid JSON output`);
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error(`agent ${request.role}/${request.id} produced a non-object output`);
  }
  return parsed as Record<string, unknown>;
}
