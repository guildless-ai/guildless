"""Evidence-gated artifact requirements and the Guildless Asset Ledger.

Artifacts are business deliverables, not arbitrary filesystem paths.  This
module deliberately keeps publication separate from registration: an artifact
can be quality-approved and recorded without silently publishing or causing an
external side effect.
"""

from __future__ import annotations

import json
import os
import tempfile
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping, Sequence

from .playbook_compiler import CapabilityGraph


ALLOWED_ARTIFACT_TYPES = (
    "Web", "LP", "SaaS", "OSS", "API", "CLI", "Document", "PDF",
    "Presentation", "Image", "Video", "Audio", "Dataset", "Campaign Creative",
)

_VISUAL_TYPES = {"Web", "LP", "SaaS", "Presentation", "Image", "Video", "Campaign Creative"}

QUALITY_GATES: dict[str, dict[str, Any]] = {
    "Web": {"definition_of_done": "deployed URL responds and visual review passes", "evidence": ["runtime_evidence", "visual_evaluation", "independent_reviewer"]},
    "LP": {"definition_of_done": "production URL responds, content and visual review pass", "evidence": ["runtime_evidence", "visual_evaluation", "independent_reviewer"]},
    "SaaS": {"definition_of_done": "production runtime and automated smoke tests pass", "evidence": ["automated_tests", "runtime_evidence", "independent_reviewer"]},
    "OSS": {"definition_of_done": "tests pass and repository/release metadata is reviewable", "evidence": ["automated_tests", "independent_reviewer"]},
    "API": {"definition_of_done": "contract tests pass against a running endpoint", "evidence": ["automated_tests", "runtime_evidence", "independent_reviewer"]},
    "CLI": {"definition_of_done": "CLI help and representative command run successfully", "evidence": ["automated_tests", "runtime_evidence", "independent_reviewer"]},
    "Document": {"definition_of_done": "file opens and independent content review passes", "evidence": ["independent_reviewer"]},
    "PDF": {"definition_of_done": "PDF renders and visual/content review passes", "evidence": ["visual_evaluation", "independent_reviewer"]},
    "Presentation": {"definition_of_done": "deck renders and visual/content review passes", "evidence": ["visual_evaluation", "independent_reviewer"]},
    "Image": {"definition_of_done": "asset renders at required dimensions and visual review passes", "evidence": ["visual_evaluation", "independent_reviewer"]},
    "Video": {"definition_of_done": "video decodes, plays, and visual/audio review passes", "evidence": ["automated_tests", "visual_evaluation", "independent_reviewer"]},
    "Audio": {"definition_of_done": "audio decodes and quality review passes", "evidence": ["automated_tests", "independent_reviewer"]},
    "Dataset": {"definition_of_done": "schema/quality checks pass and provenance is recorded", "evidence": ["automated_tests", "independent_reviewer"]},
    "Campaign Creative": {"definition_of_done": "creative renders and channel review passes", "evidence": ["visual_evaluation", "independent_reviewer"]},
}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _id(prefix: str = "artifact") -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def publishing_policy_for(artifact_type: str, business: str | None = None) -> str:
    """Return a conservative route; this does not publish anything."""

    if artifact_type == "OSS":
        return "public_github_release"
    if artifact_type in {"Web", "LP", "SaaS"}:
        return "production_deployment"
    if artifact_type in {"Video", "Audio"}:
        return "storage_or_platform"
    if artifact_type in {"Document", "PDF", "Presentation"}:
        return "file_delivery"
    if artifact_type in {"Image", "Campaign Creative"}:
        return "asset_storage"
    if artifact_type == "Dataset":
        return "private_or_public_dataset_registry"
    if artifact_type in {"API", "CLI"}:
        return "relevant_package_registry_or_private_repo"
    return "private_repo"


@dataclass
class ArtifactRequirement:
    artifact_id: str
    purpose: str
    business: str
    bet: str
    type: str
    source: dict[str, Any]
    version: str
    preview: dict[str, Any]
    deployment: dict[str, Any]
    publishing_policy: str
    quality_evidence: dict[str, Any]
    delivery_status: str = "planned"
    money_outcome: dict[str, Any] = field(default_factory=lambda: {"confirmed_cash_yen": 0, "evidence_required": True})
    definition_of_done: str = ""

    def __post_init__(self) -> None:
        if self.type not in ALLOWED_ARTIFACT_TYPES:
            raise ValueError(f"unsupported artifact type: {self.type}")
        self.definition_of_done = self.definition_of_done or QUALITY_GATES[self.type]["definition_of_done"]

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _infer_type(capability_id: str) -> str:
    value = capability_id.casefold()
    if any(token in value for token in ("video", "render")):
        return "Video"
    if any(token in value for token in ("audio", "voice")):
        return "Audio"
    if any(token in value for token in ("pdf", "report")):
        return "PDF"
    if any(token in value for token in ("image", "thumbnail", "creative")):
        return "Image"
    if "dataset" in value or "data" in value:
        return "Dataset"
    if "api" in value:
        return "API"
    if "cli" in value:
        return "CLI"
    if "web" in value or "site" in value:
        return "Web"
    return "Document"


def compile_artifact_requirements(
    playbook: Any,
    graph: CapabilityGraph,
    explicit: Sequence[Mapping[str, Any]] | None = None,
) -> list[ArtifactRequirement]:
    """Compile deliverables before capability acquisition.

    Explicit requirements win.  If none are supplied, graph nodes become
    *planned* requirements with a provenance pointer; no completion or revenue
    is inferred from a capability name.
    """

    raw_items = list(explicit or getattr(playbook, "artifact_specs", None) or [])
    if not raw_items:
        raw_items = [
            {
                "artifact_id": f"artifact:{node.capability_id}",
                "purpose": f"Deliver the output required by {node.capability_id}",
                "business": getattr(playbook, "name", "unknown business"),
                "bet": getattr(playbook, "playbook_id", "unknown bet"),
                "type": _infer_type(node.capability_id),
                "source": {"kind": "capability_graph", "capability_id": node.capability_id, "evidence_source": node.evidence_source},
                "success_metric": node.success_metric,
            }
            for node in graph.nodes
        ]
    requirements: list[ArtifactRequirement] = []
    for index, raw in enumerate(raw_items):
        item = dict(raw)
        artifact_type = str(item.get("type") or _infer_type(str(item.get("artifact_id") or item.get("name") or f"artifact-{index}")))
        requirements.append(ArtifactRequirement(
            artifact_id=str(item.get("artifact_id") or item.get("id") or _id("requirement")),
            purpose=str(item.get("purpose") or item.get("description") or "Planned business deliverable"),
            business=str(item.get("business") or getattr(playbook, "name", "unknown business")),
            bet=str(item.get("bet") or getattr(playbook, "playbook_id", "unknown bet")),
            type=artifact_type,
            source=dict(item.get("source") or {"kind": "playbook", "playbook_id": getattr(playbook, "playbook_id", None)}),
            version=str(item.get("version") or "0.1.0"),
            preview=dict(item.get("preview") or {"available": False}),
            deployment=dict(item.get("deployment") or {"status": "not_deployed"}),
            publishing_policy=str(item.get("publishing_policy") or publishing_policy_for(artifact_type, str(item.get("business") or ""))),
            quality_evidence=dict(item.get("quality_evidence") or {"status": "not_evaluated", "required": QUALITY_GATES[artifact_type]["evidence"]}),
            delivery_status=str(item.get("delivery_status") or "planned"),
            money_outcome=dict(item.get("money_outcome") or {"confirmed_cash_yen": 0, "evidence_required": True}),
            definition_of_done=str(item.get("definition_of_done") or QUALITY_GATES[artifact_type]["definition_of_done"]),
        ))
    return requirements


@dataclass(frozen=True)
class ArtifactQualityResult:
    passed: bool
    reasons: tuple[str, ...]
    evidence: dict[str, Any]


def evaluate_quality_gate(artifact_type: str, quality_evidence: Mapping[str, Any] | None) -> ArtifactQualityResult:
    if artifact_type not in ALLOWED_ARTIFACT_TYPES:
        return ArtifactQualityResult(False, ("unsupported_artifact_type",), {})
    evidence = dict(quality_evidence or {})
    reasons: list[str] = []
    reviewer = evidence.get("independent_reviewer")
    tests = evidence.get("automated_tests")
    runtime = evidence.get("runtime_evidence")
    visual = evidence.get("visual_evaluation")
    reviewer_pass = bool(reviewer and (reviewer is True or reviewer.get("pass") if isinstance(reviewer, Mapping) else reviewer))
    test_pass = bool(tests and (tests is True or tests.get("pass") if isinstance(tests, Mapping) else tests))
    runtime_pass = bool(runtime and (runtime is True or runtime.get("pass") if isinstance(runtime, Mapping) else runtime))
    visual_pass = bool(visual and (visual is True or visual.get("pass") if isinstance(visual, Mapping) else visual))
    if not reviewer_pass and not (test_pass and runtime_pass):
        reasons.append("independent_review_or_tests_plus_runtime_required")
    if artifact_type in _VISUAL_TYPES and not visual_pass:
        reasons.append("visual_evaluation_required")
    return ArtifactQualityResult(not reasons, tuple(reasons), evidence)


class AssetLedger:
    """Atomic JSON ledger for requirements, artifacts, versions, and money."""

    def __init__(self, path: str | Path):
        self.path = Path(path)

    def _read(self) -> dict[str, Any]:
        if not self.path.exists():
            return {"schema_version": 1, "updated_at": _now(), "requirements": [], "artifacts": []}
        value = json.loads(self.path.read_text(encoding="utf-8"))
        if not isinstance(value, dict):
            raise ValueError("asset ledger must be a JSON object")
        value.setdefault("schema_version", 1)
        value.setdefault("requirements", [])
        value.setdefault("artifacts", [])
        return value

    def _write(self, value: Mapping[str, Any]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        payload = dict(value)
        payload["updated_at"] = _now()
        fd, temp = tempfile.mkstemp(prefix="asset-ledger-", suffix=".tmp", dir=str(self.path.parent))
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                json.dump(payload, handle, ensure_ascii=False, indent=2)
                handle.write("\n")
            os.replace(temp, self.path)
        finally:
            if os.path.exists(temp):
                os.unlink(temp)

    def save_requirements(self, requirements: Sequence[ArtifactRequirement | Mapping[str, Any]]) -> list[dict[str, Any]]:
        value = self._read()
        rows = [item.to_dict() if isinstance(item, ArtifactRequirement) else dict(item) for item in requirements]
        value["requirements"] = rows
        self._write(value)
        return rows

    def list_requirements(self) -> list[dict[str, Any]]:
        return list(self._read().get("requirements", []))

    def register(self, artifact: Mapping[str, Any]) -> dict[str, Any]:
        item = dict(artifact)
        artifact_type = str(item.get("type") or "")
        if artifact_type not in ALLOWED_ARTIFACT_TYPES:
            raise ValueError(f"unsupported artifact type: {artifact_type}")
        for field_name in ("purpose", "business", "bet", "source", "version", "preview", "deployment", "publishing_policy", "quality_evidence", "delivery_status", "money_outcome"):
            if field_name not in item:
                raise ValueError(f"artifact field required: {field_name}")
        quality = evaluate_quality_gate(artifact_type, item.get("quality_evidence"))
        if not quality.passed:
            raise ValueError("quality gate failed: " + ",".join(quality.reasons))
        item.setdefault("artifact_id", _id())
        item.setdefault("created_at", _now())
        item["quality_gate"] = QUALITY_GATES[artifact_type]
        item["delivery_status"] = item.get("delivery_status") or "ready"
        value = self._read()
        existing = next((row for row in value["artifacts"] if row.get("artifact_id") == item["artifact_id"]), None)
        if existing:
            versions = list(existing.get("versions", []))
            versions.append({"version": existing.get("version"), "source": existing.get("source"), "updated_at": existing.get("updated_at", existing.get("created_at"))})
            item["versions"] = versions
            value["artifacts"] = [item if row.get("artifact_id") == item["artifact_id"] else row for row in value["artifacts"]]
        else:
            item["versions"] = list(item.get("versions", []))
            value["artifacts"].append(item)
        self._write(value)
        return item

    def list(self) -> list[dict[str, Any]]:
        return list(self._read().get("artifacts", []))

    def get(self, artifact_id: str) -> dict[str, Any] | None:
        return next((row for row in self.list() if row.get("artifact_id") == artifact_id), None)

    def versions(self, artifact_id: str) -> list[dict[str, Any]]:
        item = self.get(artifact_id)
        return list(item.get("versions", [])) if item else []

    def preview(self, artifact_id: str) -> dict[str, Any] | None:
        item = self.get(artifact_id)
        return dict(item.get("preview", {})) if item else None

    def record_money(self, artifact_id: str, amount_yen: int, evidence: Mapping[str, Any]) -> dict[str, Any]:
        if amount_yen < 0:
            raise ValueError("amount_yen cannot be negative")
        if not evidence or not evidence.get("source"):
            raise ValueError("money evidence source is required")
        value = self._read()
        for item in value["artifacts"]:
            if item.get("artifact_id") == artifact_id:
                outcome = dict(item.get("money_outcome") or {})
                outcome.update({"confirmed_cash_yen": amount_yen, "evidence": dict(evidence), "recorded_at": _now()})
                item["money_outcome"] = outcome
                self._write(value)
                return item
        raise KeyError(artifact_id)

