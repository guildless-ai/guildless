import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export const ARTIFACT_TYPES = ["Web", "LP", "SaaS", "OSS", "API", "CLI", "Document", "PDF", "Presentation", "Image", "Video", "Audio", "Dataset", "Campaign Creative"] as const;
export type ArtifactType = typeof ARTIFACT_TYPES[number];
export type EvidenceValue = boolean | { pass: boolean; [key: string]: unknown };
export type QualityEvidence = Record<string, unknown> & {
  independent_reviewer?: EvidenceValue;
  automated_tests?: EvidenceValue;
  runtime_evidence?: EvidenceValue;
  visual_evaluation?: EvidenceValue;
};

export type PublishingPolicy = "public_github_release" | "production_deployment" | "storage_or_platform" | "file_delivery" | "asset_storage" | "private_or_public_dataset_registry" | "relevant_package_registry_or_private_repo" | "private_repo";

export interface ArtifactRequirement {
  artifact_id: string;
  purpose: string;
  business: string;
  bet: string;
  type: ArtifactType;
  source: Record<string, unknown>;
  version: string;
  preview: Record<string, unknown>;
  deployment: Record<string, unknown>;
  publishing_policy: PublishingPolicy;
  quality_evidence: QualityEvidence;
  delivery_status: "planned" | "ready" | "delivered" | "blocked";
  money_outcome: Record<string, unknown>;
  definition_of_done: string;
}

export interface ArtifactRecord extends ArtifactRequirement {
  created_at: string;
  versions: Array<{ version?: string; source?: Record<string, unknown>; updated_at?: string }>;
  quality_gate: { definition_of_done: string; evidence: string[] };
}

export interface ArtifactGraphNode { capability_id?: string; id?: string; evidence_source?: string[]; }
export interface ArtifactGraph { nodes: ArtifactGraphNode[]; }

const VISUAL_TYPES = new Set<ArtifactType>(["Web", "LP", "SaaS", "Presentation", "Image", "Video", "Campaign Creative"]);
export const QUALITY_GATES: Record<ArtifactType, { definition_of_done: string; evidence: string[] }> = Object.fromEntries(ARTIFACT_TYPES.map((type) => [type, {
  definition_of_done: type === "OSS" ? "tests pass and repository/release metadata is reviewable" : `${type} is delivered in its intended runtime and independently reviewed`,
  evidence: VISUAL_TYPES.has(type) ? ["independent_reviewer", "visual_evaluation", "runtime_evidence"] : ["independent_reviewer", "automated_tests", "runtime_evidence"],
}])) as Record<ArtifactType, { definition_of_done: string; evidence: string[] }>;

export function publishingPolicyFor(type: ArtifactType): PublishingPolicy {
  if (type === "OSS") return "public_github_release";
  if (["Web", "LP", "SaaS"].includes(type)) return "production_deployment";
  if (["Video", "Audio"].includes(type)) return "storage_or_platform";
  if (["Document", "PDF", "Presentation"].includes(type)) return "file_delivery";
  if (["Image", "Campaign Creative"].includes(type)) return "asset_storage";
  if (type === "Dataset") return "private_or_public_dataset_registry";
  if (["API", "CLI"].includes(type)) return "relevant_package_registry_or_private_repo";
  return "private_repo";
}

function truthy(value: unknown): boolean {
  if (value === true) return true;
  if (!value) return false;
  if (typeof value === "object" && value !== null && "pass" in value) return (value as { pass?: unknown }).pass === true;
  return Boolean(value);
}

export function evaluateQualityGate(type: ArtifactType, evidence: QualityEvidence): { passed: boolean; reasons: string[] } {
  const independent = truthy(evidence.independent_reviewer);
  const tests = truthy(evidence.automated_tests);
  const runtime = truthy(evidence.runtime_evidence);
  const reasons: string[] = [];
  if (!independent && !(tests && runtime)) reasons.push("independent_review_or_tests_plus_runtime_required");
  if (VISUAL_TYPES.has(type) && !truthy(evidence.visual_evaluation)) reasons.push("visual_evaluation_required");
  return { passed: reasons.length === 0, reasons };
}

function inferType(value: string): ArtifactType {
  const lower = value.toLowerCase();
  if (lower.includes("video") || lower.includes("render")) return "Video";
  if (lower.includes("audio") || lower.includes("voice")) return "Audio";
  if (lower.includes("pdf") || lower.includes("report")) return "PDF";
  if (lower.includes("image") || lower.includes("creative")) return "Image";
  if (lower.includes("dataset") || lower.includes("data")) return "Dataset";
  if (lower.includes("api")) return "API";
  if (lower.includes("cli")) return "CLI";
  if (lower.includes("web") || lower.includes("site")) return "Web";
  return "Document";
}

export function compileArtifactRequirements(input: { business?: string; bet?: string; playbook?: { name?: string; playbook_id?: string }; graph: ArtifactGraph; explicit?: Array<Partial<ArtifactRequirement>> }): ArtifactRequirement[] {
  const raw: Array<Partial<ArtifactRequirement>> = input.explicit?.length ? input.explicit : input.graph.nodes.map((node) => ({
    artifact_id: `artifact:${node.capability_id ?? node.id ?? "unknown"}`,
    purpose: `Deliver the output required by ${node.capability_id ?? node.id ?? "unknown capability"}`,
    source: { kind: "capability_graph", capability_id: node.capability_id ?? node.id, evidence_source: node.evidence_source ?? [] },
    type: inferType(node.capability_id ?? node.id ?? ""),
  }));
  return raw.map((item, index) => {
    const type = item.type ?? inferType(item.artifact_id ?? `artifact-${index}`);
    const business = item.business ?? input.business ?? input.playbook?.name ?? "unknown business";
    return {
      artifact_id: item.artifact_id ?? `requirement:${index + 1}`,
      purpose: item.purpose ?? "Planned business deliverable",
      business,
      bet: item.bet ?? input.bet ?? input.playbook?.playbook_id ?? "unknown bet",
      type,
      source: item.source ?? { kind: "playbook", playbook_id: input.playbook?.playbook_id ?? null },
      version: item.version ?? "0.1.0",
      preview: item.preview ?? { available: false },
      deployment: item.deployment ?? { status: "not_deployed" },
      publishing_policy: item.publishing_policy ?? publishingPolicyFor(type),
      quality_evidence: item.quality_evidence ?? { status: "not_evaluated", required: QUALITY_GATES[type].evidence },
      delivery_status: item.delivery_status ?? "planned",
      money_outcome: item.money_outcome ?? { confirmed_cash_yen: 0, evidence_required: true },
      definition_of_done: item.definition_of_done ?? QUALITY_GATES[type].definition_of_done,
    };
  });
}

export class AssetLedger {
  public constructor(private readonly filePath: string) {}
  private read(): { schema_version: number; requirements: ArtifactRequirement[]; artifacts: ArtifactRecord[] } {
    if (!existsSync(this.filePath)) return { schema_version: 1, requirements: [], artifacts: [] };
    const value = JSON.parse(readFileSync(this.filePath, "utf8")) as Partial<{ schema_version: number; requirements: ArtifactRequirement[]; artifacts: ArtifactRecord[] }>;
    return { schema_version: value.schema_version ?? 1, requirements: value.requirements ?? [], artifacts: value.artifacts ?? [] };
  }
  private write(value: { schema_version: number; requirements: ArtifactRequirement[]; artifacts: ArtifactRecord[] }): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    const temp = `${this.filePath}.${process.pid}.tmp`;
    writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    renameSync(temp, this.filePath);
  }
  public saveRequirements(requirements: ArtifactRequirement[]): void { const value = this.read(); value.requirements = requirements; this.write(value); }
  public listRequirements(): ArtifactRequirement[] { return this.read().requirements; }
  public list(): ArtifactRecord[] { return this.read().artifacts; }
  public get(id: string): ArtifactRecord | undefined { return this.list().find((item) => item.artifact_id === id); }
  public register(input: ArtifactRequirement & { created_at?: string }): ArtifactRecord {
    const quality = evaluateQualityGate(input.type, input.quality_evidence);
    if (!quality.passed) throw new Error(`quality gate failed: ${quality.reasons.join(",")}`);
    const item: ArtifactRecord = { ...input, created_at: input.created_at ?? new Date().toISOString(), versions: [], quality_gate: QUALITY_GATES[input.type] };
    const value = this.read();
    const existing = value.artifacts.find((row) => row.artifact_id === item.artifact_id);
    if (existing) item.versions = [...existing.versions, { version: existing.version, source: existing.source, updated_at: existing.created_at }];
    value.artifacts = existing ? value.artifacts.map((row) => row.artifact_id === item.artifact_id ? item : row) : [...value.artifacts, item];
    this.write(value);
    return item;
  }
  public recordMoney(id: string, amountYen: number, evidence: { source?: string; [key: string]: unknown }): ArtifactRecord {
    if (!Number.isInteger(amountYen) || amountYen < 0 || !evidence.source) throw new Error("confirmed cash requires non-negative amount and evidence source");
    const value = this.read(); const item = value.artifacts.find((row) => row.artifact_id === id); if (!item) throw new Error(`artifact not found: ${id}`);
    item.money_outcome = { ...item.money_outcome, confirmed_cash_yen: amountYen, evidence, recorded_at: new Date().toISOString() }; this.write(value); return item;
  }
}
