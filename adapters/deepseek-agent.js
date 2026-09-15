#!/usr/bin/env node
// GUILDLESS DeepSeek agent adapter.
//
// Protocol:
//   input  : a single JSON object via --input <file>, or via stdin when no
//            --input is given. Expected fields: { runId?, role, workspace?, ... }
//   output : a single JSON object written to --output <file>, or to stdout.
//            Always `{ status: "ok"|"error", ... }` with a role-specific payload.
//
// Backend: the `opencode run` CLI (non-interactive) pointed at a DeepSeek model.
//   LLM_MODEL   (default opencode/deepseek-v4-flash-free)
//   LLM_TIMEOUT_MS (default 600000)
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

function resolveOpencode() {
  if (process.env.OPENCODE_BIN && existsSync(process.env.OPENCODE_BIN)) return process.env.OPENCODE_BIN;
  const candidates = [
    path.join(process.env.APPDATA ?? "", "npm", "node_modules", "opencode-ai", "bin", "opencode.exe"),
    path.join(os.homedir(), ".local", "share", "npm", "lib", "node_modules", "opencode-ai", "bin", "opencode")
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return "opencode";
}

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : null;
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { data += chunk; });
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

function runOpencode(prompt, { workspace, model, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const child = spawn(resolveOpencode(), ["run", "--model", model, "--format", "json", "--dir", workspace, prompt], {
      cwd: workspace,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    const timer = setTimeout(() => { child.kill(); }, timeoutMs);
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`opencode run exited ${code}: ${stderr.slice(0, 2000)}`));
        return;
      }
      resolve(parseEvents(stdout));
    });
  });
}

function parseEvents(stdout) {
  let text = "";
  let inputTokens = 0;
  let outputTokens = 0;
  for (const line of stdout.split("\n")) {
    if (!line.trim()) continue;
    let event;
    try { event = JSON.parse(line); } catch { continue; }
    if (event.type === "text" && event.part && typeof event.part.text === "string") {
      text += event.part.text;
    }
    if (event.type === "step_finish" && event.part && event.part.tokens) {
      inputTokens += event.part.tokens.input ?? 0;
      outputTokens += event.part.tokens.output ?? 0;
    }
  }
  return { text, tokens: { input: inputTokens, output: outputTokens } };
}

function stripFences(text) {
  return text.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "").trim();
}

function extractJson(text) {
  const cleaned = stripFences(text);
  try {
    return JSON.parse(cleaned);
  } catch { /* fall through */ }
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

const SCHEMAS = {
  planner: `{ "status": "ok", "tasks": [ { "id": "t1", "title": "...", "file": "src/..." } ] }`,
  builder: `{ "status": "ok", "artifacts": ["relative/path/created.ts", "..."], "summary": "..." }`,
  reviewer: `{ "status": "ok", "findings": [ { "target": "file or task id", "severity": "high|medium|low", "message": "...", "file": "src/...", "line": 12 } ] }`,
  fixer: `{ "status": "ok", "files": ["src/...", "..."], "summary": "..." }`,
  breaker: `{ "status": "ok", "testFiles": ["test/..."], "summary": "..." }`
};

function buildPrompt(role, input) {
  const header =
    `You are the "${role}" agent inside the GUILDLESS cross-review orchestrator.\n` +
    `Workspace (current directory): ${input.workspace}\n` +
    `Constraints: only create or modify files inside the workspace. Never modify anything outside it. Never run git commit or git push. Never print secrets. Be concrete and truthful; do not fabricate file contents. Read the actual files in the workspace before answering.\n\n`;

  const body = {
    planner: `Break the objective into concrete tasks a builder agent can implement. Each task must name a concrete target file path (relative to workspace). Objective: ${input.objective ?? ""}`,
    builder: `Implement the following tasks by writing real files inside the workspace. Verify the files exist on disk before answering.\nTasks: ${JSON.stringify(input.tasks ?? [], null, 2)}`,
    reviewer: `Independently review the work of another builder. Read each artifact file listed below and report real defects (bugs, security issues, missing error handling). An empty findings array is correct when nothing is wrong.\nArtifacts: ${JSON.stringify(input.artifacts ?? [], null, 2)}\nReview focus: ${input.focus ?? "general"}`,
    fixer: `Apply fixes for the following review findings. Modify the referenced files on disk, then confirm the changes exist.\nFindings: ${JSON.stringify(input.findings ?? [], null, 2)}`,
    breaker: `Add counterexample (regression) tests under the test/ directory that assert the current behavior and would fail if the implementation regressed. Write real test files on disk using the repository's test framework (node:test is safe).\nArtifacts: ${JSON.stringify(input.artifacts ?? [], null, 2)}`
  }[role] ?? `Handle the request: ${JSON.stringify(input)}`;

  const schema = SCHEMAS[role] ?? `{ "status": "ok" }`;

  return (
    header +
    body +
    `\n\nReply with ONLY a single valid JSON object, no markdown fences, no prose. ` +
    `Use exactly this shape:\n${schema}\n` +
    `If you cannot complete the task, reply with ${`{ "status": "error", "error": "short reason" }`}.`
  );
}

function validate(result, role) {
  if (result.status === "error") return;
  const shape = SCHEMAS[role] ?? `{ "status": "ok" }`;
  if (!shape) return;
  if (role === "planner" && !Array.isArray(result.tasks)) throw new Error("planner result missing tasks[]");
  if (role === "builder" && !Array.isArray(result.artifacts)) throw new Error("builder result missing artifacts[]");
  if (role === "reviewer" && !Array.isArray(result.findings)) throw new Error("reviewer result missing findings[]");
  if (role === "fixer" && !Array.isArray(result.files)) throw new Error("fixer result missing files[]");
  if (role === "breaker" && !Array.isArray(result.testFiles)) throw new Error("breaker result missing testFiles[]");
}

async function main() {
  const inputFile = arg("input");
  const outputFile = arg("output");
  const raw = inputFile ? readFileSync(inputFile, "utf8") : await readStdin();
  const input = JSON.parse(raw);
  const role = input.role ?? arg("role") ?? "agent";
  const workspace = input.workspace ?? process.cwd();
  const model = process.env.LLM_MODEL ?? "opencode/deepseek-v4-flash-free";
  const timeoutMs = Number(process.env.LLM_TIMEOUT_MS ?? 600000);

  const started = Date.now();
  let result;
  try {
    const prompt = buildPrompt(role, input);
    let attempt = await runOpencode(prompt, { workspace, model, timeoutMs });
    let parsed = extractJson(attempt.text);
    if (!parsed) {
      const retryPrompt =
        `${prompt}\n\nYour previous reply was not valid JSON. Reply AGAIN with ONLY the single JSON object ` +
        `in the exact schema shown above. No prose, no markdown fences, no explanation.`;
      const retry = await runOpencode(retryPrompt, { workspace, model, timeoutMs });
      attempt.tokens.input += retry.tokens.input;
      attempt.tokens.output += retry.tokens.output;
      attempt.text = retry.text;
      parsed = extractJson(retry.text);
    }
    if (!parsed) throw new Error(`model output was not JSON: ${attempt.text.slice(0, 300)}`);
    validate(parsed, role);
    result = parsed;
    result.meta = {
      model,
      inputTokens: attempt.tokens.input,
      outputTokens: attempt.tokens.output,
      elapsedMs: Date.now() - started,
      cost: 0
    };
  } catch (error) {
    result = { status: "error", error: String(error), meta: { model, inputTokens: 0, outputTokens: 0, elapsedMs: Date.now() - started, cost: 0 } };
  }

  const out = `${JSON.stringify(result, null, 2)}\n`;
  if (outputFile) writeFileSync(outputFile, out, "utf8");
  else process.stdout.write(out);
}

main().catch((error) => {
  process.stdout.write(`${JSON.stringify({ status: "error", error: String(error) }, null, 2)}\n`);
  process.exit(1);
});
