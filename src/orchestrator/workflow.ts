import path from "node:path";
import { runAgent } from "./agent.js";
import { DEFAULT_TOOL_DIR } from "./config.js";
import { EventLog } from "./events.js";
import { saveOrchestraEvidence } from "./evidence.js";
import { aggregateFindings, buildReviewMatrix, type ReviewSpec } from "./review.js";
import type {
  AgentMetric,
  AgentRole,
  BreakerOutput,
  BuilderOutput,
  ConsensusFinding,
  FixOutput,
  OrchestraConfig,
  OrchestrationResult,
  PlannerOutput,
  ReviewOutput,
  StageName,
  StageStatus,
  Task
} from "./types.js";
import { runVerification } from "./verify.js";
import { newRunId } from "../evidence.js";

function initialStatus(): Record<StageName, StageStatus> {
  return {
    planner: "pending",
    build: "pending",
    review: "pending",
    fix: "pending",
    break: "pending",
    verify: "pending"
  };
}

function distribute<T>(items: T[], groups: number): T[][] {
  const result: T[][] = Array.from({ length: groups }, () => []);
  items.forEach((item, index) => result[index % groups].push(item));
  return result;
}

function chunk<T>(items: T[], size: number): T[][] {
  if (size < 1) return [];
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
}

interface AgentContext {
  runId: string;
  workdir: string;
  scratchDir: string;
  toolDir: string;
  config: OrchestraConfig;
  metrics: AgentMetric[];
  events?: EventLog;
}

function runAgentSafe<T>(context: AgentContext, role: AgentRole, id: string, input: unknown, parse: (raw: Record<string, unknown>) => T): Promise<T> {
  context.events?.emit({ runId: context.runId, type: "agent_start", role, id });
  return runAgent({
    role,
    id,
    command: context.config.agentCommands[role],
    workdir: context.workdir,
    scratchDir: context.scratchDir,
    toolDir: context.toolDir,
    timeoutMs: context.config.agentTimeoutMs,
    runId: context.runId,
    input: { runId: context.runId, role, workspace: context.workdir, ...(input as Record<string, unknown>) }
  }).then((raw) => {
    let metric: AgentMetric | undefined;
    if (raw.meta && typeof raw.meta === "object") {
      const meta = raw.meta as Record<string, unknown>;
      metric = {
        role,
        id,
        model: typeof meta.model === "string" ? meta.model : undefined,
        inputTokens: Number.isFinite(meta.inputTokens) ? (meta.inputTokens as number) : undefined,
        outputTokens: Number.isFinite(meta.outputTokens) ? (meta.outputTokens as number) : undefined,
        elapsedMs: Number.isFinite(meta.elapsedMs) ? (meta.elapsedMs as number) : undefined,
        cost: Number.isFinite(meta.cost) ? (meta.cost as number) : undefined
      };
      context.metrics.push(metric);
    }
    context.events?.emit({
      runId: context.runId,
      type: "agent_end",
      role,
      id,
      ok: true,
      inputTokens: metric?.inputTokens,
      outputTokens: metric?.outputTokens,
      cost: metric?.cost
    });
    return parse(raw);
  }).catch((error) => {
    context.events?.emit({ runId: context.runId, type: "agent_end", role, id, ok: false, error: String(error) });
    throw error;
  });
}

function parsePlanner(raw: Record<string, unknown>): PlannerOutput {
  if (raw.status === "error") return { status: "error", tasks: [], error: raw.error ? String(raw.error) : undefined };
  if (!Array.isArray(raw.tasks) || raw.tasks.length === 0) throw new Error("planner returned no tasks");
  const tasks = raw.tasks.map((item, index) => {
    if (!item || typeof item !== "object") throw new Error(`planner tasks[${index}] must be an object`);
    const task = item as Record<string, unknown>;
    if (typeof task.id !== "string" || task.id.trim() === "") throw new Error(`planner tasks[${index}].id must be a string`);
    return { id: task.id, title: typeof task.title === "string" ? task.title : task.id, file: typeof task.file === "string" ? task.file : undefined };
  });
  return { status: "ok", tasks };
}

function parseBuilder(raw: Record<string, unknown>, id: string): BuilderOutput {
  if (raw.status === "error") return { id, status: "error", tasks: [], artifacts: [], error: raw.error ? String(raw.error) : undefined };
  const artifacts = Array.isArray(raw.artifacts) ? raw.artifacts.map((item) => String(item)) : [];
  return { id, status: "ok", tasks: [], artifacts, summary: raw.summary ? String(raw.summary) : undefined };
}

function parseReview(raw: Record<string, unknown>, spec: ReviewSpec): ReviewOutput {
  const base = { id: spec.id, reviewer: spec.reviewerId, builder: spec.builderId, focus: spec.focus };
  if (raw.status === "error") return { ...base, status: "error", findings: [], error: raw.error ? String(raw.error) : undefined };
  const findings = Array.isArray(raw.findings) ? raw.findings.map((item, index) => {
    const f = (item ?? {}) as Record<string, unknown>;
    if (typeof f.message !== "string" || f.message.trim() === "") throw new Error(`reviewer findings[${index}].message must be a string`);
    const severity: "high" | "medium" | "low" =
      f.severity === "high" || f.severity === "medium" || f.severity === "low" ? f.severity : "medium";
    return {
      id: typeof f.id === "string" ? f.id : `finding-${index}`,
      reviewer: spec.reviewerId,
      focus: spec.focus,
      target: typeof f.target === "string" ? f.target : spec.builderId,
      severity,
      message: f.message,
      file: typeof f.file === "string" ? f.file : undefined,
      line: Number.isInteger(f.line) ? (f.line as number) : undefined
    };
  }) : [];
  return { ...base, status: "ok", findings };
}

function parseFix(raw: Record<string, unknown>, id: string): FixOutput {
  if (raw.status === "error") return { id, status: "error", files: [], error: raw.error ? String(raw.error) : undefined };
  const files = Array.isArray(raw.files) ? raw.files.map((item) => String(item)) : [];
  return { id, status: "ok", files, summary: raw.summary ? String(raw.summary) : undefined };
}

function parseBreaker(raw: Record<string, unknown>, id: string): BreakerOutput {
  if (raw.status === "error") return { id, status: "error", testFiles: [], error: raw.error ? String(raw.error) : undefined };
  const testFiles = Array.isArray(raw.testFiles) ? raw.testFiles.map((item) => String(item)) : [];
  return { id, status: "ok", testFiles, summary: raw.summary ? String(raw.summary) : undefined };
}

async function reviewStage(context: AgentContext, builders: BuilderOutput[]): Promise<{ reviews: ReviewOutput[]; consensus: ConsensusFinding[] }> {
  const specs = buildReviewMatrix(builders, context.config.agents.reviewers, context.config.reviewPolicy);
  const reviews = await Promise.all(specs.map(async (spec) => {
    try {
      return await runAgentSafe(context, "reviewer", spec.id, {
        reviewer: spec.reviewerId,
        builder: spec.builderId,
        focus: spec.focus,
        artifacts: spec.artifacts,
        workdir: context.workdir
      }, (raw) => parseReview(raw, spec));
    } catch (error) {
      return { id: spec.id, reviewer: spec.reviewerId, builder: spec.builderId, focus: spec.focus, status: "error" as const, findings: [], error: String(error) };
    }
  }));
  const consensus = aggregateFindings(reviews.filter((review) => review.status === "ok"));
  return { reviews, consensus };
}

async function fixStage(context: AgentContext, findings: Array<ConsensusFinding & { kind?: string }>, tag: string): Promise<FixOutput[]> {
  if (context.config.agents.fixers < 1) return [];
  const chunks = chunk(findings, context.config.agents.fixers);
  return Promise.all(chunks.map(async (group, index) => {
    const id = `fixer-${tag}-${index + 1}`;
    try {
      return await runAgentSafe(context, "fixer", id, { id, workdir: context.workdir, findings: group }, (raw) => parseFix(raw, id));
    } catch (error) {
      return { id, status: "error" as const, files: [], error: String(error) };
    }
  }));
}

export function computeVerdict(verifyOk: boolean, consensus: ConsensusFinding[]): "ACCEPTED" | "REJECTED" {
  if (!verifyOk) return "REJECTED";
  return consensus.some((finding) => finding.severity === "high") ? "REJECTED" : "ACCEPTED";
}

export async function orchestrate(cwd: string, config: OrchestraConfig, events?: EventLog): Promise<OrchestrationResult> {
  const runId = newRunId();
  const scratchDir = path.join(cwd, ".guildless", "runs", runId, "agents");
  const metrics: AgentMetric[] = [];
  const context: AgentContext = { runId, workdir: cwd, scratchDir, toolDir: DEFAULT_TOOL_DIR, config, metrics, events };

  const result: OrchestrationResult = {
    runId,
    objective: config.objective,
    config,
    status: initialStatus(),
    planner: null,
    builders: [],
    reviews: [],
    consensus: [],
    fixes: [],
    fixRound: 0,
    breaker: null,
    verify: [],
    verdict: "REJECTED",
    errors: [],
    agentMetrics: metrics,
    evidencePath: null,
    startedAt: new Date().toISOString(),
    finishedAt: ""
  };

  events?.emit({ runId, type: "run_start", objective: config.objective });

  const fail = (stage: StageName, message: string): OrchestrationResult => {
    result.status[stage] = "fail";
    result.errors.push(message);
    events?.emit({ runId, type: "stage", stage, status: "fail" });
    return finalize(cwd, result, events);
  };

  result.status.planner = "running";
  events?.emit({ runId, type: "stage", stage: "planner", status: "running" });
  try {
    result.planner = await runAgentSafe(context, "planner", "planner", { objective: config.objective, workdir: cwd }, parsePlanner);
    result.status.planner = "ok";
    events?.emit({ runId, type: "stage", stage: "planner", status: "ok" });
    events?.emit({ runId, type: "progress", what: "planner", done: 1, total: 1 });
  } catch (error) {
    return fail("planner", `planner failed: ${String(error)}`);
  }

  const taskGroups = distribute<Task>(result.planner.tasks, config.agents.builders);
  result.status.build = "running";
  events?.emit({ runId, type: "stage", stage: "build", status: "running" });
  const builders = await Promise.all(taskGroups.map(async (tasks, index) => {
    const id = `builder-${index + 1}`;
    try {
      const out = await runAgentSafe(context, "builder", id, { id, tasks, workdir: cwd }, (raw) => parseBuilder(raw, id));
      events?.emit({ runId, type: "progress", what: "builders", done: index + 1, total: taskGroups.length });
      return out;
    } catch (error) {
      return { id, status: "error" as const, tasks, artifacts: [], error: String(error) };
    }
  }));
  result.builders = builders;
  if (builders.some((builder) => builder.status === "error")) {
    return fail("build", builders.filter((b) => b.status === "error").map((b) => `${b.id}: ${b.error}`).join("; "));
  }
  result.status.build = "ok";
  events?.emit({ runId, type: "stage", stage: "build", status: "ok" });

  result.status.review = "running";
  events?.emit({ runId, type: "stage", stage: "review", status: "running" });
  let stage = await reviewStage(context, builders);
  result.reviews = stage.reviews;
  result.consensus = stage.consensus;
  events?.emit({ runId, type: "progress", what: "reviews", done: stage.reviews.length, total: stage.reviews.length });
  events?.emit({ runId, type: "stage", stage: "review", status: "ok" });
  if (stage.reviews.some((review) => review.status === "error")) {
    return fail("review", stage.reviews.filter((r) => r.status === "error").map((r) => r.error).join("; "));
  }

  while (stage.consensus.length > 0 && result.fixRound < config.verification.maxFixRounds) {
    result.status.fix = "running";
    events?.emit({ runId, type: "stage", stage: "fix", status: "running" });
    events?.emit({ runId, type: "progress", what: "fix round", done: result.fixRound + 1, total: config.verification.maxFixRounds });
    const fixes = await fixStage(context, stage.consensus, `review-${result.fixRound + 1}`);
    result.fixes.push(...fixes);
    if (fixes.some((fix) => fix.status === "error")) {
      return fail("fix", fixes.filter((f) => f.status === "error").map((f) => f.error).join("; "));
    }
    result.fixRound += 1;
    stage = await reviewStage(context, result.builders);
    result.reviews.push(...stage.reviews);
    result.consensus = stage.consensus;
  }
  result.status.review = "ok";
  result.status.fix = result.fixRound > 0 ? "ok" : "skipped";
  events?.emit({ runId, type: "stage", stage: "fix", status: result.status.fix });

  if (config.agents.breakers > 0) {
    result.status.break = "running";
    events?.emit({ runId, type: "stage", stage: "break", status: "running" });
    try {
      result.breaker = await runAgentSafe(context, "breaker", "breaker", {
        artifacts: builders.flatMap((builder) => builder.artifacts),
        workdir: cwd
      }, (raw) => parseBreaker(raw, "breaker"));
      result.status.break = "ok";
      events?.emit({ runId, type: "stage", stage: "break", status: "ok" });
    } catch (error) {
      return fail("break", `breaker failed: ${String(error)}`);
    }
  } else {
    result.status.break = "skipped";
    events?.emit({ runId, type: "stage", stage: "break", status: "skipped" });
  }

  result.status.verify = "running";
  events?.emit({ runId, type: "stage", stage: "verify", status: "running" });
  result.verify = await runVerification(cwd, config.verification, {
    onResult: (label, ok) => events?.emit({ runId, type: "verify", label, ok })
  });
  let verifyAttempts = 0;
  while (!result.verify.every((item) => item.ok) && result.fixRound < config.verification.maxFixRounds && verifyAttempts < config.verification.maxFixRounds) {
    if (config.agents.fixers < 1) break;
    const findings = result.verify.filter((item) => !item.ok).map((item) => ({
      target: "verification",
      severity: "high" as const,
      message: item.label,
      kind: "verify",
      reports: 1,
      focuses: ["mechanical verification"]
    }));
    const fixes = await fixStage(context, findings, `verify-${verifyAttempts + 1}`);
    result.fixes.push(...fixes);
    if (fixes.some((fix) => fix.status === "error")) break;
    result.fixRound += 1;
    verifyAttempts += 1;
    result.verify = await runVerification(cwd, config.verification, {
      onResult: (label, ok) => events?.emit({ runId, type: "verify", label, ok })
    });
  }
  result.status.verify = result.verify.every((item) => item.ok) ? "ok" : "fail";
  events?.emit({ runId, type: "stage", stage: "verify", status: result.status.verify });

  const verifyOk = result.verify.every((item) => item.ok);
  result.verdict = computeVerdict(verifyOk, result.consensus);
  events?.emit({ runId, type: "verdict", verdict: result.verdict });
  return finalize(cwd, result, events);
}

function finalize(cwd: string, result: OrchestrationResult, events?: EventLog): OrchestrationResult {
  result.finishedAt = new Date().toISOString();
  const tokens = result.agentMetrics.reduce((sum, m) => sum + (m.inputTokens ?? 0) + (m.outputTokens ?? 0), 0);
  const cost = result.agentMetrics.reduce((sum, m) => sum + (m.cost ?? 0), 0);
  events?.emit({
    runId: result.runId,
    type: "summary",
    accepted: result.verdict === "ACCEPTED",
    elapsedMs: Date.parse(result.finishedAt) - Date.parse(result.startedAt),
    tokens,
    cost,
    humanInterventions: 0
  });
  try {
    result.evidencePath = saveOrchestraEvidence(cwd, result);
  } catch (error) {
    result.errors.push(`evidence save failed: ${String(error)}`);
  }
  return result;
}
