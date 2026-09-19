import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Three-layer independent visual QA:
 *   machine  — DOM/runtime measurements (assertions from the browser QA spec)
 *   semantic — DeepSeek agent over the UI text evidence (never claims pixel quality)
 *   pixel    — image-capable model only, over the real screenshots (never DOM inference)
 */

export interface VisionIssue {
  severity: "critical" | "high" | "medium" | "low";
  dimension?: string;
  observed: string;
  expected: string;
  location?: string;
}

export interface CriticCritique {
  model: string;
  verdict: "pass" | "fix";
  scores: Record<string, number>;
  issues: VisionIssue[];
  summary: string;
  reviewedAt: string;
  screenshots: string[];
  status?: "reviewed" | "unavailable";
  error?: string;
}

export const SEMANTIC_DIMENSIONS = [
  "goal",
  "now",
  "why",
  "output",
  "result",
  "coherence",
  "plainLanguage",
  "destination"
] as const;

export const PIXEL_DIMENSIONS = [
  "hero",
  "priority",
  "camera",
  "scale",
  "legibility",
  "overlap",
  "whitespace",
  "composition",
  "polish",
  "working"
] as const;

function clampScore(value: number | undefined): number {
  if (typeof value !== "number" || Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

/** Parse a model reply into a structured critique. Pure and unit-testable. */
export function parseCritique(
  raw: string,
  model: string,
  screenshots: string[],
  dims: readonly string[]
): CriticCritique | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const data = JSON.parse(raw.slice(start, end + 1)) as {
      scores?: Record<string, number>;
      issues?: VisionIssue[];
      summary?: string;
      verdict?: string;
    };
    const scores: Record<string, number> = {};
    for (const dim of dims) scores[dim] = clampScore(data.scores?.[dim]);
    const issues = Array.isArray(data.issues) ? data.issues.slice(0, 40) : [];
    const min = dims.length ? Math.min(...dims.map((d) => scores[d])) : 0;
    return {
      model,
      verdict: data.verdict === "pass" || data.verdict === "fix" ? data.verdict : min < 60 ? "fix" : "pass",
      scores,
      issues,
      summary: data.summary ?? "",
      reviewedAt: new Date().toISOString(),
      screenshots
    };
  } catch {
    return null;
  }
}

/** True when the opencode CLI is installed. */
export function agentAvailable(): boolean {
  const envCmd = process.env.GUILDLESS_VISION_AGENT;
  if (envCmd) return true;
  const appData = process.env.APPDATA ?? "";
  const exe = path.join(appData, "npm", "node_modules", "opencode-ai", "bin", "opencode.exe");
  return existsSync(exe);
}

function resolveAgentCommand(): string {
  const envCmd = process.env.GUILDLESS_VISION_AGENT;
  if (envCmd) return envCmd;
  const appData = process.env.APPDATA ?? "";
  const exe = path.join(appData, "npm", "node_modules", "opencode-ai", "bin", "opencode.exe");
  return existsSync(exe) ? exe : "opencode";
}

const SEMANTIC_PROMPT = [
  "You are a ruthless product-language critic reviewing a 3D 'AI company' dashboard for a non-engineer CEO.",
  "A first-time CEO must understand in five seconds: the goal, what the AI company is doing now, why, what output was produced, and where to open the output.",
  "You receive the UI's text evidence (DOM text, machine assertions, runtime state). You cannot see pixels — never claim visual quality.",
  "Score each dimension 0-100 from the text evidence alone:",
  "- goal: is the goal stated clearly in plain language?",
  "- now: does the UI say what the AI is doing right now, unambiguously?",
  "- why: does the UI explain why this work is happening?",
  "- output: does the UI say what output will be produced?",
  "- result: is the final result (accepted/rejected/pending) visible?",
  "- coherence: are the status messages consistent, or contradictory?",
  "- plainLanguage: is jargon (stage names, file paths, run ids) translated for non-engineers?",
  "- destination: is it clear where to open the produced output?",
  "List EVERY issue: contradictions, missing answers to the five questions, jargon, dead placeholders.",
  "Return ONLY valid JSON:",
  '{"scores": {"goal": 0, "now": 0, "why": 0, "output": 0, "result": 0, "coherence": 0, "plainLanguage": 0, "destination": 0}, "issues": [{"severity": "critical|high|medium|low", "dimension": "goal|now|why|output|result|coherence|plainLanguage|destination", "observed": "what the text says", "expected": "what it should say", "location": "where on screen"}], "summary": "one paragraph", "verdict": "pass|fix"}',
  "Severity: critical = a CEO cannot answer one of the five questions; high = seriously confusing; medium = noticeable; low = nitpick.",
  "忖度なし. Do not invent text that is not in the evidence."
].join("\n");

const PIXEL_PROMPT = [
  "You are a ruthless art director reviewing a 3D 'AI company' dashboard from its real screenshots.",
  "Judge ONLY the pixels of the attached screenshots. Never judge from text descriptions; never infer from DOM.",
  "The viewer is a non-engineer CEO who must understand in five seconds that an AI company is working, on what, and where the output lands.",
  "Score each dimension 0-100:",
  "- hero: can you identify the main subject in three seconds?",
  "- priority: is the visual priority of characters, map, and side panels correct?",
  "- camera: is the camera angle composition good (not too close, not too far, no obstruction)?",
  "- scale: is the character size balanced against the scene?",
  "- legibility: is the text readable (size, contrast)?",
  "- overlap: are elements overlapping or clipping?",
  "- whitespace: is whitespace wasted or unbalanced?",
  "- composition: are placements unnatural or misaligned?",
  "- polish: does it look like a finished product or a demo/mock?",
  "- working: does a first-time viewer understand the AI company is working?",
  "List EVERY visual issue you can see in the pixels, with its location.",
  "Return ONLY valid JSON:",
  '{"scores": {"hero": 0, "priority": 0, "camera": 0, "scale": 0, "legibility": 0, "overlap": 0, "whitespace": 0, "composition": 0, "polish": 0, "working": 0}, "issues": [{"severity": "critical|high|medium|low", "dimension": "hero|priority|camera|scale|legibility|overlap|whitespace|composition|polish|working", "observed": "what you see in the pixels", "expected": "what it should be", "location": "where on screen"}], "summary": "one paragraph", "verdict": "pass|fix"}',
  "Severity: critical = blocks comprehension or is broken visually; high = seriously harms the impression; medium = noticeable; low = nitpick.",
  "忖度なし. If the pixels show a defect, report it. If the pixels are clean, say so."
].join("\n");

/** Run the agent CLI with stdin closed (so prompts EOF) and a hard kill timeout. */
function runAgentCli(command: string, args: string[], timeoutMs: number): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk; });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk; });
    const timer = setTimeout(() => { child.kill("SIGKILL"); }, timeoutMs);
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        const error = new Error(`agent CLI exited with code ${code}`) as Error & { stdout: string; stderr: string };
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
      }
    });
  });
}

interface AgentRunOptions {
  model: string;
  promptFile: string;
  message: string;
  evidenceFile?: string;
  imageFiles?: string[];
}

async function runAgent(opts: AgentRunOptions): Promise<string> {
  const command = resolveAgentCommand();
  const args = ["run", "--pure", "-m", opts.model, opts.message, "-f", opts.promptFile];
  if (opts.evidenceFile) args.push("-f", opts.evidenceFile);
  for (const image of opts.imageFiles ?? []) args.push("-f", image);

  let stdout: string;
  try {
    const result = await runAgentCli(command, args, 600_000);
    stdout = result.stdout;
  } catch (error) {
    const e = error as { stderr?: string; stdout?: string; message?: string };
    throw new Error(
      `agent critic failed: ${e.message ?? String(error)}` +
      `${e.stdout ? `\nstdout: ${e.stdout.slice(0, 600)}` : ""}` +
      `${e.stderr ? `\nstderr: ${e.stderr.slice(0, 600)}` : ""}`,
      { cause: error }
    );
  }
  return stdout;
}

/** Layer 2 — DeepSeek semantic critic. Text evidence only; never pixel claims. */
export async function semanticCritic(evidenceText: string, screenshots: string[]): Promise<CriticCritique> {
  const model = process.env.GUILDLESS_VISION_MODEL ?? "opencode-go/deepseek-v4-flash";
  const promptFile = path.join(os.tmpdir(), `guildless-semantic-prompt-${process.pid}.txt`);
  const evidenceFile = path.join(os.tmpdir(), `guildless-semantic-evidence-${process.pid}.txt`);
  await writeFile(promptFile, SEMANTIC_PROMPT, "utf8");
  await writeFile(evidenceFile, evidenceText, "utf8");

  const stdout = await runAgent({
    model,
    promptFile,
    evidenceFile,
    message: "Review the attached instructions and ui-evidence.txt as a ruthless product-language critic. Output only the JSON object."
  });
  for (const f of [promptFile, evidenceFile]) {
    await import("node:fs/promises").then((m) => m.unlink(f).catch(() => {}));
  }
  const critique = parseCritique(stdout, `semantic:${model}`, screenshots, SEMANTIC_DIMENSIONS);
  if (!critique) throw new Error(`semantic critic returned unparseable output: ${stdout.slice(0, 300)}`);
  return critique;
}

/** Layer 3 — pixel critic. Image-capable model only. No DOM inference. */
export async function pixelCritic(imageFiles: string[]): Promise<CriticCritique> {
  const model = process.env.GUILDLESS_PIXEL_MODEL ?? "opencode-go/gpt-5.6-luna";
  const promptFile = path.join(os.tmpdir(), `guildless-pixel-prompt-${process.pid}.txt`);
  await writeFile(promptFile, PIXEL_PROMPT, "utf8");

  const stdout = await runAgent({
    model,
    promptFile,
    message: "Review the attached instructions and screenshots as a ruthless art director, judging the pixels only. Output only the JSON object.",
    imageFiles
  });
  await import("node:fs/promises").then((m) => m.unlink(promptFile).catch(() => {}));
  const critique = parseCritique(stdout, `pixel:${model}`, imageFiles.map((p) => path.basename(p)), PIXEL_DIMENSIONS);
  if (!critique) throw new Error(`pixel critic returned unparseable output: ${stdout.slice(0, 300)}`);
  critique.status = "reviewed";
  return critique;
}

/** Status of a pixel-capable model. */
export function pixelModelConfigured(): boolean {
  if (process.env.GUILDLESS_PIXEL_DISABLED === "1") return false;
  return agentAvailable();
}

/** Anthropic API path kept for future use; unused by the product loop while the agent path works. */
export function visionAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}
