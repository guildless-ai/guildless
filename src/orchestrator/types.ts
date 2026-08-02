import type { HttpTarget } from "../contract.js";

export type AgentRole = "planner" | "builder" | "reviewer" | "fixer" | "breaker";

export type StageName = "planner" | "build" | "review" | "fix" | "break" | "verify";

export type StageStatus = "pending" | "running" | "ok" | "fail" | "skipped";

export interface AgentsConfig {
  planner: number;
  builders: number;
  reviewers: number;
  breakers: number;
  fixers: number;
}

export interface ReviewPolicy {
  selfReview: boolean;
  crossReview: boolean;
  minimumReviewsPerTask: number;
}

export interface VerificationConfig {
  commands: string[];
  gitDiffCheck: boolean;
  http: HttpTarget[];
  maxFixRounds: number;
}

export interface OrchestraConfig {
  objective: string;
  agents: AgentsConfig;
  reviewPolicy: ReviewPolicy;
  verification: VerificationConfig;
  agentCommands: Record<AgentRole, string>;
  agentTimeoutMs: number;
}

export interface Task {
  id: string;
  title: string;
  file?: string;
}

export interface PlannerOutput {
  status: "ok" | "error";
  tasks: Task[];
  error?: string;
}

export interface BuilderOutput {
  id: string;
  status: "ok" | "error";
  tasks: Task[];
  artifacts: string[];
  summary?: string;
  error?: string;
}

export interface ReviewFinding {
  id: string;
  reviewer: string;
  focus: string;
  target: string;
  severity: "high" | "medium" | "low";
  message: string;
  file?: string;
  line?: number;
}

export interface ReviewOutput {
  id: string;
  reviewer: string;
  builder: string;
  focus: string;
  status: "ok" | "error";
  findings: ReviewFinding[];
  error?: string;
}

export interface ConsensusFinding {
  target: string;
  severity: "high" | "medium" | "low";
  message: string;
  file?: string;
  line?: number;
  reports: number;
  focuses: string[];
}

export interface FixOutput {
  id: string;
  status: "ok" | "error";
  files: string[];
  summary?: string;
  error?: string;
}

export interface BreakerOutput {
  id: string;
  status: "ok" | "error";
  testFiles: string[];
  summary?: string;
  error?: string;
}

export interface VerifyResult {
  id: string;
  kind: "command" | "git-diff-check" | "http";
  label: string;
  ok: boolean;
  detail?: string;
}

export interface OrchestrationResult {
  runId: string;
  objective: string;
  config: OrchestraConfig;
  status: Record<StageName, StageStatus>;
  planner: PlannerOutput | null;
  builders: BuilderOutput[];
  reviews: ReviewOutput[];
  consensus: ConsensusFinding[];
  fixes: FixOutput[];
  fixRound: number;
  breaker: BreakerOutput | null;
  verify: VerifyResult[];
  verdict: "ACCEPTED" | "REJECTED";
  errors: string[];
  evidencePath: string | null;
  startedAt: string;
  finishedAt: string;
}
