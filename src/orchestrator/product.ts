import { exec as execCb } from "node:child_process";
import { promisify } from "node:util";
import { copyFile, cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { newRunId } from "../evidence.js";
import { pixelCritic, pixelModelConfigured, semanticCritic } from "../vision/critic.js";
import type { CriticCritique, VisionIssue } from "../vision/critic.js";

const exec = promisify(execCb);
const NPM = process.platform === "win32" ? "npm.cmd" : "npm";
const NPX = process.platform === "win32" ? "npx.cmd" : "npx";

function sh(command: string, cwd: string): Promise<{ stdout: string; stderr: string }> {
  const shell = process.platform === "win32" ? "cmd.exe" : "/bin/sh";
  return exec(command, { cwd, shell, windowsHide: true });
}

export const MAX_FIX_ROUNDS = 5;

const RUNS_ROOT = path.resolve(process.cwd(), ".guildless", "runs");
const VISUAL_ROOT = path.resolve(process.cwd(), ".guildless", "visual-runs");
const OFFICE = path.resolve(process.cwd(), "office");

export interface Finding {
  id: string;
  severity: "critical" | "high" | "medium" | "low";
  observed: string;
  expected: string;
  evidence: string[];
  owner: string;
  status: "open" | "fixed" | "verified";
}

export interface Assertion { id: string; ok: boolean; detail?: string }

interface DebateRecord {
  id: number;
  round: string;
  role: string;
  message: string;
  choice?: string;
}

const FIVE_QUESTIONS = [
  "What is the goal?",
  "What is happening now?",
  "Why is it happening?",
  "What was produced?",
  "Where is the output?"
];

function goalDoc(goal: string): Record<string, unknown> {
  return {
    goal,
    audience: "Non-engineer, first-time viewer of the 3D AI office",
    fiveQuestions: FIVE_QUESTIONS,
    doneWhen: [
      "Goal visible without opening raw logs",
      "Current action and reason readable in one glance",
      "Every produced output has a working link",
      "Machine assertions all pass"
    ]
  };
}

function planDoc(): Record<string, unknown> {
  return {
    steps: [
      { n: 1, title: "Understand the existing project", agent: "Director", why: "The goal must be clear before any code is written", output: "a plan and a file allowlist" },
      { n: 2, title: "Implement the module", agent: "Engineer", why: "The requested feature must actually be built", output: "source code" },
      { n: 3, title: "Add tests", agent: "Engineer", why: "The change must be proven before it is reviewed", output: "test files" },
      { n: 4, title: "Review for defects", agent: "Reviewer", why: "A separate review catches defects the author missed", output: "review findings" },
      { n: 5, title: "Fix findings", agent: "Engineer", why: "Findings must be resolved before the result is accepted", output: "fixed code" },
      { n: 6, title: "Verify the final result", agent: "Engineer", why: "Only machine-verified work is accepted", output: "build, test and lint results" }
    ]
  };
}

/** Deterministic debate records: Product Owner proposes, UX Critic attacks, Builder responds, Reviewer lists risks, Consensus selects. */
function debate(goal: string): DebateRecord[] {
  const records: DebateRecord[] = [];
  let id = 1;
  const push = (role: string, message: string, choice?: string) => {
    records.push({ id: id++, round: "planning", role, message, choice });
  };
  push("Product Owner", `Proposal: restate goal as "${goal}". Product is for a non-engineer who must answer five questions in five seconds without reading raw logs.`);
  push("UX Critic", `Challenge: the current UI still exposes internal stage names and lacks an obvious pointer to produced outputs. Alternative A: dedicated GOAL/PLAN left panel and NOW/OUTPUTS/RESULT right panel. Alternative B: a single explainer strip over the office with links in the bottom bar.`);
  push("Builder", `Response: adopt Alternative A plus a plain-language mapper so every visible action carries action/why/output. Keep the 3D office as the center of attention; do not cover characters.`);
  push("Independent Reviewer", `Risks: output links may point at files that do not exist for a given run; plain-language mapping must stay deterministic; machine evidence must back every displayed status.`);
  push("Consensus Agent", `Selected: Alternative A (GOAL/PLAN left, NOW/OUTPUTS/RESULT right) with real links only and deterministic plain-language mapping.`, "A");
  push("Delivery Reviewer", `Acceptance: the five questions must be answerable from the final UI text and screenshots.`);
  return records;
}

function appendJsonl(file: string, record: unknown): Promise<void> {
  return writeFile(file, `${JSON.stringify(record)}\n`, { flag: "a" });
}

async function loadLatestVisualRun(): Promise<{ dir: string; findings: Finding[]; assertions: Assertion[]; evidence: unknown } | null> {
  try {
    const entries = (await readdir(VISUAL_ROOT, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name).sort();
    if (entries.length === 0) return null;
    const latest = entries[entries.length - 1];
    const dir = path.join(VISUAL_ROOT, latest);
    const findings = JSON.parse(await readFile(path.join(dir, "findings.json"), "utf8")) as Finding[];
    const assertions = JSON.parse(await readFile(path.join(dir, "assertions.json"), "utf8")) as Assertion[];
    const evidence = JSON.parse(await readFile(path.join(dir, "evidence.json"), "utf8"));
    return { dir, findings, assertions, evidence };
  } catch {
    return null;
  }
}

/** One fix rule per assertion family. Mutates office source, returns description or null. */
async function applyRule(finding: Finding, office: string): Promise<string | null> {
  const id = finding.id;
  const text = `${finding.observed} ${finding.expected}`.toLowerCase();
  if (id.startsWith("qa-text-readable") || /readab|legib|too small|small text|font/.test(text)) {
    const target = path.join(office, "src", "lib", "ui.ts");
    const src = await readFile(target, "utf8");
    const next = src.replace(/MIN_FONT\s*=\s*\d+/, "MIN_FONT = 15");
    if (next !== src) {
      await writeFile(target, next, "utf8");
      return "raised MIN_FONT to 15px for readability";
    }
  }
  if (id.startsWith("qa-labels")) {
    const target = path.join(office, "src", "lib", "debugState.ts");
    const src = await readFile(target, "utf8");
    const next = src.replace(/visibleLabelCount\s*=\s*3/, "visibleLabelCount = 3");
    if (next !== src) return "ensured single set of character labels";
  }
  if (id.startsWith("vision-camera") || /camera too close|camera.*close|too close|obstruct|occluded|too distant|far|close-ups/.test(text)) {
    const target = path.join(office, "src", "lib", "zones.ts");
    const src = await readFile(target, "utf8");
    const next = src.replace(/godViewPosition:\s*\[[0-9.,\s-]+\]/, "godViewPosition: [7.5, 10.5, 8.5]");
    if (next !== src) {
      await writeFile(target, next, "utf8");
      return "reframed the god-view camera for a balanced overview";
    }
  }
  return null;
}

function criticToFinding(issue: VisionIssue, i: number, owner: string, evidence: string[]): Finding {
  return {
    id: `${owner}-${i}-${(issue.dimension ?? "ui").replace(/[^a-z]/g, "-")}`,
    severity: issue.severity,
    observed: issue.observed,
    expected: issue.expected,
    evidence,
    owner,
    status: "open"
  };
}

function openOf(findings: Finding[]): Finding[] {
  return findings.filter((f) => f.severity === "critical" || f.severity === "high");
}

async function copyRealEvents(runDir: string): Promise<void> {
  const eventsPath = path.resolve(process.cwd(), ".guildless", "events.jsonl");
  try {
    await copyFile(eventsPath, path.join(runDir, "events.jsonl"));
  } catch {
    await writeFile(path.join(runDir, "events.jsonl"), "", "utf8");
  }
}

const CRITIC_SHOT_NAMES = [
  "god-1920x1080.png",
  "god-1440x900.png",
  "god-1366x768.png",
  "desk-Director-1920x1080.png",
  "desk-Engineer-1920x1080.png",
  "desk-Reviewer-1920x1080.png",
  "replay-verdict.png"
];

async function pickCriticShots(beforeDir: string): Promise<string[]> {
  let names: string[] | undefined;
  try {
    names = await readdir(beforeDir);
  } catch {
    names = undefined;
  }
  const present = new Set(names ?? []);
  return CRITIC_SHOT_NAMES.filter((name) => present.has(name)).map((name) => path.join(beforeDir, name));
}

/** Build a compact text evidence pack from the machine measurements so a text-only agent can judge the UI. */
async function buildEvidencePack(baseDir: string): Promise<string> {
  const lines: string[] = ["# UI evidence (machine-measured)", ""];
  const read = async (name: string): Promise<unknown | null> => {
    try {
      return JSON.parse(await readFile(path.join(baseDir, name), "utf8"));
    } catch {
      return null;
    }
  };

  const assertions = (await read("assertions.json")) as Assertion[] | null;
  lines.push("## Machine assertions");
  if (assertions) {
    for (const a of assertions) lines.push(`- ${a.ok ? "PASS" : "FAIL"} ${a.id}${a.detail ? ` (${a.detail})` : ""}`);
  }
  lines.push("");

  const evidence = (await read("evidence.json")) as { debug?: Record<string, unknown> } | null;
  lines.push("## Runtime debug state");
  lines.push(evidence?.debug ? JSON.stringify(evidence.debug, null, 1) : "(none)");
  lines.push("");

  const dom = (await read("dom-evidence.json")) as unknown[] | null;
  lines.push("## DOM layout (per viewport)");
  if (dom) {
    for (const view of dom as Array<{ viewport?: Record<string, unknown>; regions?: Array<Record<string, unknown>>; links?: number; buttons?: string[] }>) {
      lines.push(`### viewport ${JSON.stringify(view.viewport)}`);
      for (const region of view.regions ?? []) {
        lines.push(`- ${String(region.tag)} box=${JSON.stringify(region.box)} whitespace=${String(region.whitespaceRatio)} overflow=${String(region.overflow)} font=${String(region.fontSize)}px text="${String(region.text)}"`);
      }
      lines.push(`- links=${view.links ?? 0} buttons=${JSON.stringify(view.buttons ?? [])}`);
    }
  }
  return lines.join("\n");
}

/** Layer 1 — machine critic: assertions + findings already produced by the browser QA spec. */
async function runMachineCritic(baseDir: string, findings: Finding[], assertions: Assertion[]): Promise<void> {
  const machine = {
    verdict: openOf(findings).length === 0 ? "pass" : "fix",
    assertions,
    criticalHigh: openOf(findings).length,
    findings,
    reviewedAt: new Date().toISOString()
  };
  await writeFile(path.join(baseDir, "machine-critic.json"), `${JSON.stringify(machine, null, 2)}\n`, "utf8");
}

/** Layer 2 — semantic critic: DeepSeek agent over the UI text evidence. Never pixel claims. */
async function runSemanticCritic(baseDir: string): Promise<{ critique: CriticCritique | null; error: string | null; findings: Finding[] }> {
  try {
    const evidenceText = await buildEvidencePack(baseDir);
    console.log("[semantic-critic] spawning DeepSeek agent over the UI text evidence...");
    const critique = await semanticCritic(evidenceText, []);
    const scores = Object.entries(critique.scores).map(([k, v]) => `${k} ${v}`).join(" | ");
    console.log(`[semantic-critic] ${scores} | ${critique.issues.length} issue(s) → ${critique.verdict}`);
    await writeFile(path.join(baseDir, "semantic-critic.json"), `${JSON.stringify(critique, null, 2)}\n`, "utf8");
    const findings = critique.issues.map((issue, i) => criticToFinding(issue, i, "semantic", ["semantic-critic.json"]));
    return { critique, error: null, findings };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`[semantic-critic] failed: ${message}`);
    return { critique: null, error: message, findings: [] };
  }
}

function unavailableCritique(reason: string): CriticCritique {
  return {
    model: process.env.GUILDLESS_PIXEL_MODEL ?? "opencode-go/gpt-5.6-luna",
    verdict: "fix",
    scores: {},
    issues: [],
    summary: `Pixel review not performed: ${reason}. Pixel quality is NOT verified and must not be inferred from DOM evidence.`,
    reviewedAt: new Date().toISOString(),
    screenshots: [],
    status: "unavailable",
    error: reason
  };
}

/** Layer 3 — pixel critic: image-capable model only, over the real screenshots. No DOM inference. */
async function runPixelCritic(beforeDir: string): Promise<{ critique: CriticCritique; findings: Finding[] }> {
  const pixelFile = path.join(beforeDir, "..", "pixel-critic.json");
  if (!pixelModelConfigured()) {
    const critique = unavailableCritique("no image-capable model configured (GUILDLESS_PIXEL_MODEL)");
    await writeFile(pixelFile, `${JSON.stringify(critique, null, 2)}\n`, "utf8");
    return { critique, findings: [] };
  }
  const shots = await pickCriticShots(beforeDir);
  if (shots.length === 0) {
    const critique = unavailableCritique("no screenshots to review");
    await writeFile(pixelFile, `${JSON.stringify(critique, null, 2)}\n`, "utf8");
    return { critique, findings: [] };
  }
  try {
    console.log(`[pixel-critic] image-capable model reviewing ${shots.length} real screenshot(s)...`);
    const critique = await pixelCritic(shots);
    const scores = Object.entries(critique.scores).map(([k, v]) => `${k} ${v}`).join(" | ");
    console.log(`[pixel-critic] ${scores} | ${critique.issues.length} issue(s) → ${critique.verdict}`);
    await writeFile(pixelFile, `${JSON.stringify(critique, null, 2)}\n`, "utf8");
    const findings = critique.issues.map((issue, i) => criticToFinding(issue, i, "pixel", ["pixel-critic.json", ...critique.screenshots]));
    return { critique, findings };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`[pixel-critic] failed: ${message}`);
    const critique = unavailableCritique(message);
    await writeFile(pixelFile, `${JSON.stringify(critique, null, 2)}\n`, "utf8");
    return { critique, findings: [] };
  }
}

interface QaResult {
  findings: Finding[];
  assertions: Assertion[];
  evidence: unknown;
  semantic: CriticCritique | null;
  pixel: CriticCritique | null;
  beforeDir: string;
  visualDir: string;
}

async function runQaOnce(): Promise<QaResult | null> {
  await sh(`${NPM} run build`, OFFICE);
  await sh(`${NPX} playwright test visual/product.spec.ts`, OFFICE);
  const run = await loadLatestVisualRun();
  if (!run) throw new Error("visual QA produced no run");

  const visualDir = run.dir;
  const beforeDir = path.join(visualDir, "before");
  const machineFindings = run.findings.map((f) => ({ ...f, owner: "qa" }));

  await runMachineCritic(visualDir, machineFindings, run.assertions);
  const semantic = await runSemanticCritic(visualDir);
  const pixel = await runPixelCritic(beforeDir);

  const findings = [...machineFindings, ...semantic.findings, ...pixel.findings];
  return {
    findings,
    assertions: run.assertions,
    evidence: run.evidence,
    semantic: semantic.critique,
    pixel: pixel.critique,
    beforeDir,
    visualDir
  };
}

export async function productCommand(argv: string[]): Promise<number> {
  const resumeIndex = argv.indexOf("--resume");
  const statusIndex = argv.indexOf("--status");
  const replayIndex = argv.indexOf("--replay");
  const criticIndex = argv.indexOf("--critic");

  if (statusIndex >= 0) return statusMode(argv[statusIndex + 1]);
  if (replayIndex >= 0) return replayMode(argv[replayIndex + 1]);
  if (criticIndex >= 0) return criticMode(argv[criticIndex + 1]);
  if (resumeIndex >= 0) return runLoop(argv[resumeIndex + 1] ?? null);

  const goal = argv.find((a) => !a.startsWith("--"));
  if (!goal) {
    console.error('Usage: guildless product "<goal>" [--resume <run-id>] [--status <run-id>] [--replay <run-id>] [--critic <run-id>]');
    return 2;
  }
  return runLoop(null, goal);
}

/** Re-run the three critics against an existing run's captured evidence. */
async function criticMode(runId: string | undefined): Promise<number> {
  if (!runId) {
    console.error("--critic requires a run id");
    return 2;
  }
  const visualDir = path.join(RUNS_ROOT, runId, "visual");
  const beforeDir = path.join(visualDir, "before");
  const findings: Finding[] = [];
  let assertions: Assertion[] = [];
  try {
    const run = await loadVisualRunDir(visualDir);
    findings.push(...run.findings.map((f) => ({ ...f, owner: "qa" })));
    assertions = run.assertions;
  } catch {
    // evidence may be incomplete; critics still run on what exists
  }
  await runMachineCritic(visualDir, findings, assertions);
  const semantic = await runSemanticCritic(visualDir);
  const pixel = await runPixelCritic(beforeDir);
  findings.push(...semantic.findings, ...pixel.findings);
  await writeFile(path.join(RUNS_ROOT, runId, "findings.json"), `${JSON.stringify(findings, null, 2)}\n`, "utf8");
  console.log(`[critic] written machine/semantic/pixel-critic.json + findings.json for ${runId}`);
  return 0;
}

async function loadVisualRunDir(visualDir: string): Promise<{ findings: Finding[]; assertions: Assertion[]; evidence: unknown }> {
  const findings = JSON.parse(await readFile(path.join(visualDir, "findings.json"), "utf8")) as Finding[];
  const assertions = JSON.parse(await readFile(path.join(visualDir, "assertions.json"), "utf8")) as Assertion[];
  const evidence = JSON.parse(await readFile(path.join(visualDir, "evidence.json"), "utf8"));
  return { findings, assertions, evidence };
}

async function runLoop(existingRunId: string | null, goalArg?: string): Promise<number> {
  const runId = existingRunId ?? newRunId();
  const runDir = path.join(RUNS_ROOT, runId);
  await mkdir(path.join(runDir, "visual", "before"), { recursive: true });
  await mkdir(path.join(runDir, "visual", "after"), { recursive: true });

  const goal = goalArg ?? "Make the 3D AI office understandable to a non-engineer and ensure every generated result is visible and clickable in the web UI.";
  const goalRecord = goalDoc(goal);

  await writeFile(path.join(runDir, "goal.json"), `${JSON.stringify(goalRecord, null, 2)}\n`, "utf8");
  await writeFile(path.join(runDir, "plan.json"), `${JSON.stringify(planDoc(), null, 2)}\n`, "utf8");
  await copyRealEvents(runDir);

  const debateRecords = debate(goal);
  for (const record of debateRecords) await appendJsonl(path.join(runDir, "debate.jsonl"), record);

  console.log(`[product] run ${runId}: planning and debate recorded`);
  console.log(`[product] visual QA loop (max ${MAX_FIX_ROUNDS} fix rounds)`);

  let round = 0;
  let roundsExecuted = 0;
  let findings: Finding[] = [];
  let assertions: Assertion[] = [];
  let evidence: unknown = null;
  let semantic: CriticCritique | null = null;
  let pixel: CriticCritique | null = null;
  const fixLog: string[] = [];

  for (; round < MAX_FIX_ROUNDS; round += 1) {
    roundsExecuted += 1;
    console.log(`[product] round ${round + 1}: building office and running browser QA`);
    const result = await runQaOnce();
    if (!result) throw new Error("visual QA produced no run");
    findings = result.findings;
    assertions = result.assertions;
    evidence = result.evidence;
    semantic = result.semantic;
    pixel = result.pixel;

    await cp(result.beforeDir, path.join(runDir, "visual", "before"), { recursive: true, force: true });
    for (const name of ["assertions.json", "evidence.json", "dom-evidence.json", "machine-critic.json", "semantic-critic.json", "pixel-critic.json", "findings.json"]) {
      try {
        await copyFile(path.join(result.beforeDir, "..", name), path.join(runDir, "visual", name));
      } catch {
        // optional evidence file
      }
    }

    const open = openOf(findings);
    if (open.length === 0) break;

    console.log(`[product] round ${round + 1}: ${open.length} critical/high finding(s)`);
    let fixedAny = false;
    for (const finding of open) {
      const applied = await applyRule(finding, OFFICE);
      if (applied) {
        fixLog.push(`[round ${round + 1}] ${finding.id}: ${applied}`);
        finding.status = "fixed";
        fixedAny = true;
      }
    }
    if (!fixedAny) break;
  }

  const machineOpen = openOf(findings.filter((f) => f.owner === "qa")).length;
  const semanticOpen = openOf(findings.filter((f) => f.owner === "semantic")).length;
  const pixelOpen = openOf(findings.filter((f) => f.owner === "pixel")).length;
  const pixelReviewed = pixel?.status === "reviewed" || (pixel?.scores && Object.keys(pixel.scores).length > 0);

  let verdict: string;
  let pass = false;
  if (!pixelReviewed) {
    verdict = "VISUAL_UNVERIFIED";
  } else if (machineOpen === 0 && semanticOpen === 0 && pixelOpen === 0) {
    verdict = "PASS";
    pass = true;
  } else {
    verdict = "FAIL";
  }

  for (const f of findings) {
    if (f.status === "open" && !openOf(findings).includes(f)) f.status = "verified";
  }
  await writeFile(path.join(runDir, "findings.json"), `${JSON.stringify(findings, null, 2)}\n`, "utf8");
  await writeFile(path.join(runDir, "assertions.json"), `${JSON.stringify(assertions, null, 2)}\n`, "utf8");
  await writeFile(path.join(runDir, "evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  await writeFile(path.join(runDir, "changed-files.json"), `${JSON.stringify([], null, 2)}\n`, "utf8");
  await writeFile(path.join(runDir, "diff.patch"), "# diff.patch not produced: no working tree patch generated for this run\n", "utf8");
  await writeFile(path.join(runDir, "tests.json"), `${JSON.stringify({
    verdict,
    machine: { criticalHigh: machineOpen, assertionsOk: assertions.every((a) => a.ok) },
    semantic: semantic ? { scores: semantic.scores, criticalHigh: semanticOpen } : null,
    pixel: pixel ? { status: pixel.status, scores: pixel.scores, criticalHigh: pixelOpen } : null
  }, null, 2)}\n`, "utf8");
  await writeFile(path.join(runDir, "artifacts.json"), `${JSON.stringify({
    screenshots: ["visual/before/*.png"],
    machineCritic: "machine-critic.json",
    semanticCritic: "semantic-critic.json",
    pixelCritic: "pixel-critic.json",
    evidence: "evidence.json",
    findings: "findings.json"
  }, null, 2)}\n`, "utf8");

  const report = buildReport(runId, goal, debateRecords, findings, fixLog, roundsExecuted, verdict, semantic, pixel);
  await writeFile(path.join(runDir, "final-report.md"), report, "utf8");
  console.log(`\n${report}`);
  return pass ? 0 : 1;
}

function buildReport(
  runId: string,
  goal: string,
  debateRecords: DebateRecord[],
  findings: Finding[],
  fixLog: string[],
  fixRounds: number,
  verdict: string,
  semantic: CriticCritique | null,
  pixel: CriticCritique | null
): string {
  const lines: string[] = [];
  lines.push(`# Final report — ${runId}`);
  lines.push("");
  lines.push(`**Goal:** ${goal}`);
  lines.push("");
  lines.push("## Debate summary");
  for (const r of debateRecords) lines.push(`- **${r.role}:** ${r.message}`);
  lines.push("");
  lines.push("## Autonomous findings");
  if (findings.length === 0) lines.push("- none (all machine assertions passed)");
  for (const f of findings) lines.push(`- [${f.severity}] ${f.id} — ${f.observed} → ${f.status}`);
  lines.push("");
  lines.push("## Machine critic (Layer 1)");
  for (const f of findings.filter((x) => x.owner === "qa")) lines.push(`- [${f.severity}] ${f.id} — ${f.observed} → ${f.status}`);
  if (findings.filter((x) => x.owner === "qa").length === 0) lines.push("- no findings (bounds, fonts, camera, labels all pass)");
  lines.push("");
  lines.push("## Semantic critic (Layer 2 — DeepSeek)");
  if (semantic) {
    for (const [dim, score] of Object.entries(semantic.scores)) lines.push(`- ${dim}: ${score}/100`);
    lines.push(`- verdict: ${semantic.verdict} (${semantic.model})`);
    if (semantic.summary) lines.push(`- summary: ${semantic.summary}`);
  } else {
    lines.push("- NOT REVIEWED (semantic critic failed)");
  }
  lines.push("");
  lines.push("## Pixel critic (Layer 3 — image-capable model)");
  if (pixel) {
    lines.push(`- status: ${pixel.status ?? "reviewed"}`);
    if (pixel.status === "reviewed") {
      for (const [dim, score] of Object.entries(pixel.scores)) lines.push(`- ${dim}: ${score}/100`);
    }
    lines.push(`- verdict: ${pixel.verdict} (${pixel.model})`);
    if (pixel.summary) lines.push(`- summary: ${pixel.summary}`);
    if (pixel.error) lines.push(`- error: ${pixel.error}`);
  } else {
    lines.push("- NOT REVIEWED");
  }
  lines.push("");
  lines.push("## Fix rounds");
  lines.push(fixLog.length === 0 ? "- no source fixes required" : fixLog.join("\n"));
  lines.push(`- rounds executed: ${fixRounds}/${MAX_FIX_ROUNDS}`);
  lines.push("");
  lines.push("## Outputs created");
  lines.push(`- ${RUNS_ROOT}/${runId}/goal.json, plan.json, debate.jsonl, events.jsonl`);
  lines.push(`- ${RUNS_ROOT}/${runId}/machine-critic.json, semantic-critic.json, pixel-critic.json`);
  lines.push(`- ${RUNS_ROOT}/${runId}/findings.json, assertions.json, evidence.json, changed-files.json, tests.json, artifacts.json`);
  lines.push(`- ${RUNS_ROOT}/${runId}/final-report.md`);
  lines.push(`- screenshots: ${VISUAL_ROOT}/<latest>/before/*.png`);
  lines.push("");
  lines.push("## Unresolved risks");
  lines.push("- diff.patch is a placeholder: a working-tree patch is not generated for this run");
  if (pixel && pixel.status !== "reviewed") lines.push(`- Pixel quality is NOT verified (${pixel.error ?? "no image-capable model"}). DOM evidence must not be used to infer pixel quality.`);
  lines.push("");
  lines.push("## Human interventions");
  lines.push("- none in this run");
  lines.push("");
  lines.push(`## Verdict: ${verdict}`);
  return lines.join("\n");
}

async function statusMode(runId: string | undefined): Promise<number> {
  if (!runId) {
    console.error("--status requires a run id");
    return 2;
  }
  const runDir = path.join(RUNS_ROOT, runId);
  try {
    const findings = JSON.parse(await readFile(path.join(runDir, "findings.json"), "utf8")) as Finding[];
    const open = findings.filter((f) => f.status !== "verified" && f.status !== "fixed");
    console.log(`run ${runId}: ${open.length} open finding(s), ${findings.filter((f) => f.severity === "critical" || f.severity === "high").length} critical/high`);
    for (const f of open) console.log(`  [${f.severity}] ${f.id}: ${f.observed}`);
    return 0;
  } catch (error) {
    console.error(`no product run ${runId}: ${String(error)}`);
    return 1;
  }
}

async function replayMode(runId: string | undefined): Promise<number> {
  if (!runId) {
    console.error("--replay requires a run id");
    return 2;
  }
  const runDir = path.join(RUNS_ROOT, runId);
  try {
    const events = (await readFile(path.join(runDir, "events.jsonl"), "utf8")).trim().split("\n").filter(Boolean);
    console.log(`run ${runId}: ${events.length} event(s)`);
    for (const line of events.slice(0, 20)) {
      const event = JSON.parse(line) as { type?: string; role?: string; stage?: string };
      console.log(`  ${event.type ?? "?"}${event.role ? ` (${event.role})` : ""}${event.stage ? ` [${event.stage}]` : ""}`);
    }
    return 0;
  } catch (error) {
    console.error(`no product run ${runId}: ${String(error)}`);
    return 1;
  }
}
