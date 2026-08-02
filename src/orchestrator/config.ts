import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import type { HttpTarget } from "../contract.js";
import type { AgentRole, OrchestraConfig } from "./types.js";

const DEFAULT_TOOL_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "agents");

const DEFAULT_AGENT_COMMANDS: Record<AgentRole, string> = {
  planner: `node {tool}/planner.js --input {input} --output {output}`,
  builder: `node {tool}/builder.js --input {input} --output {output}`,
  reviewer: `node {tool}/reviewer.js --input {input} --output {output}`,
  fixer: `node {tool}/fixer.js --input {input} --output {output}`,
  breaker: `node {tool}/breaker.js --input {input} --output {output}`
};

function count(value: unknown, key: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new Error(`${key} must be a non-negative integer`);
  }
  return value as number;
}

function nonEmptyString(value: unknown, key: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${key} must be a non-empty string`);
  }
  return value.trim();
}

function stringArray(value: unknown, key: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim() === "")) {
    throw new Error(`${key} must be a non-empty string array`);
  }
  return value;
}

function loadCommands(raw: Record<string, unknown>): string[] {
  if (!Array.isArray(raw.commands) || raw.commands.length === 0) {
    throw new Error("verification.commands must contain at least one command");
  }
  return stringArray(raw.commands, "verification.commands");
}

function loadHttp(raw: unknown): HttpTarget[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw new Error("verification.http must be an array");
  return raw.map((item, index) => {
    if (!item || typeof item !== "object") throw new Error(`verification.http[${index}] must be an object`);
    const target = item as Record<string, unknown>;
    if (typeof target.url !== "string" || !/^https?:\/\//.test(target.url)) {
      throw new Error(`verification.http[${index}].url must use http or https`);
    }
    if (!Number.isInteger(target.status) || (target.status as number) < 100 || (target.status as number) > 599) {
      throw new Error(`verification.http[${index}].status must be an HTTP status code`);
    }
    if (target.timeoutMs !== undefined && (!Number.isInteger(target.timeoutMs) || (target.timeoutMs as number) <= 0)) {
      throw new Error(`verification.http[${index}].timeoutMs must be a positive integer`);
    }
    return target as unknown as HttpTarget;
  });
}

export async function loadOrchestraConfig(file: string): Promise<OrchestraConfig> {
  const absolute = path.resolve(file);
  const raw = YAML.parse(await readFile(absolute, "utf8")) as Record<string, unknown> | null;
  if (!raw || typeof raw !== "object") throw new Error("config must be a YAML object");

  const agents = raw.agents as Record<string, unknown> | undefined;
  if (!agents || typeof agents !== "object") throw new Error("agents must be an object");
  const agentsConfig = {
    planner: count(agents.planner, "agents.planner"),
    builders: count(agents.builders, "agents.builders"),
    reviewers: count(agents.reviewers, "agents.reviewers"),
    breakers: count(agents.breakers, "agents.breakers"),
    fixers: count(agents.fixers, "agents.fixers")
  };
  if (agentsConfig.planner < 1) throw new Error("agents.planner must be at least 1");
  if (agentsConfig.builders < 1) throw new Error("agents.builders must be at least 1");
  if (agentsConfig.reviewers < 1) throw new Error("agents.reviewers must be at least 1");

  const policy = raw.review_policy as Record<string, unknown> | undefined;
  if (!policy || typeof policy !== "object") throw new Error("review_policy must be an object");
  const reviewPolicy = {
    selfReview: policy.self_review !== true && policy.self_review !== false ? false : policy.self_review,
    crossReview: policy.cross_review !== false,
    minimumReviewsPerTask: policy.minimum_reviews_per_task === undefined
      ? 1
      : count(policy.minimum_reviews_per_task, "review_policy.minimum_reviews_per_task")
  };

  const verification = raw.verification as Record<string, unknown> | undefined;
  if (!verification || typeof verification !== "object") throw new Error("verification must be an object");
  const verificationConfig = {
    commands: loadCommands(verification),
    gitDiffCheck: verification.git_diff_check === undefined ? true : verification.git_diff_check === true,
    http: loadHttp(verification.http),
    maxFixRounds: verification.max_fix_rounds === undefined ? 2 : count(verification.max_fix_rounds, "verification.max_fix_rounds")
  };

  const agentCommandsRaw = raw.agent_commands as Record<string, unknown> | undefined;
  const agentCommands: Record<AgentRole, string> = { ...DEFAULT_AGENT_COMMANDS };
  if (agentCommandsRaw !== undefined) {
    if (!agentCommandsRaw || typeof agentCommandsRaw !== "object") throw new Error("agent_commands must be an object");
    for (const role of Object.keys(DEFAULT_AGENT_COMMANDS) as AgentRole[]) {
      if (agentCommandsRaw[role] !== undefined) agentCommands[role] = nonEmptyString(agentCommandsRaw[role], `agent_commands.${role}`);
    }
  }

  return {
    objective: nonEmptyString(raw.objective ?? "Verify completion of the assigned task", "objective"),
    agents: agentsConfig,
    reviewPolicy,
    verification: verificationConfig,
    agentCommands,
    agentTimeoutMs: raw.agent_timeout_ms === undefined ? 120_000 : count(raw.agent_timeout_ms, "agent_timeout_ms")
  };
}

export { DEFAULT_TOOL_DIR };
