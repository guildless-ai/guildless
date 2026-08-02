import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import type { CheckResult } from "./types.js";

export interface DesignConfig {
  documents: string[];
  decisionsFile?: string;
}

interface DecisionEntry {
  decision?: unknown;
  reason?: unknown;
}

function isOpenApiSpec(doc: string): boolean {
  return /(?:^|\/)api-spec\.(?:yaml|yml|json)$/.test(doc);
}

async function checkDocument(cwd: string, doc: string, problems: string[]): Promise<void> {
  const absolute = path.resolve(cwd, doc);
  let info;
  try {
    info = await stat(absolute);
  } catch {
    problems.push(`${doc} is missing`);
    return;
  }
  if (!info.isFile()) {
    problems.push(`${doc} is not a file`);
    return;
  }
  if (info.size === 0) {
    problems.push(`${doc} is empty`);
    return;
  }
  if (isOpenApiSpec(doc)) {
    try {
      const parsed = YAML.parse(await readFile(absolute, "utf8"));
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        problems.push(`${doc} must be a YAML/JSON object`);
      } else if (!(parsed as Record<string, unknown>).openapi && !(parsed as Record<string, unknown>).swagger) {
        problems.push(`${doc} is not an OpenAPI document (missing openapi/swagger key)`);
      }
    } catch {
      problems.push(`${doc} is not valid YAML/JSON`);
    }
  }
}

async function checkDecisions(cwd: string, file: string, problems: string[]): Promise<string> {
  const absolute = path.resolve(cwd, file);
  let raw: string;
  try {
    raw = await readFile(absolute, "utf8");
  } catch {
    problems.push(`${file} is missing`);
    return "";
  }
  let parsed: unknown;
  try {
    parsed = YAML.parse(raw);
  } catch {
    problems.push(`${file} is not valid YAML/JSON`);
    return "";
  }
  const entries: DecisionEntry[] = Array.isArray(parsed) ? parsed : [parsed];
  const invalid = entries.filter(
    (entry) =>
      !entry || typeof entry !== "object" ||
      typeof entry.decision !== "string" || entry.decision.trim() === "" ||
      typeof entry.reason !== "string" || entry.reason.trim() === ""
  );
  if (invalid.length > 0) {
    problems.push(`${file}: ${invalid.length} decision entry(ies) missing "decision" or "reason"`);
    return "";
  }
  return `${entries.length} design decision(s) recorded`;
}

export async function checkDesign(cwd: string, design: DesignConfig): Promise<CheckResult> {
  const problems: string[] = [];
  for (const doc of design.documents) {
    await checkDocument(cwd, doc, problems);
  }
  let decisionDetail = "";
  if (design.decisionsFile) {
    decisionDetail = await checkDecisions(cwd, design.decisionsFile, problems);
  }
  if (problems.length > 0) {
    return {
      id: "design",
      ok: false,
      summary: `${problems.length} design deliverable(s) invalid`,
      detail: problems.join("\n"),
      recommendation: "Create the required design documents and design-decision records, then re-run"
    };
  }
  return {
    id: "design",
    ok: true,
    summary: "Design deliverables are complete",
    detail: `${design.documents.length} document(s)${decisionDetail ? `; ${decisionDetail}` : ""}`
  };
}
