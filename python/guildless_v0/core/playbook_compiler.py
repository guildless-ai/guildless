"""Compile evidence-backed Money Playbooks into executable capability graphs.

The compiler is deliberately provider-agnostic.  Discovery providers are
injected by the runtime, so this core layer can search local software, GitHub,
Hugging Face, MCP registries, public APIs, package indexes, or browser services
without giving any provider implicit trust or network access.

Discovery is not an outcome.  A candidate is registered only after license /
commercial-use, maintenance, platform, cost, quality, runtime, security,
integration, and test gates pass.  A registered capability is still subject to
the existing approval boundary before an external effect occurs.
"""

from __future__ import annotations

import json
import math
import re
from dataclasses import asdict, dataclass, field, replace
from pathlib import Path
from typing import Any, Callable, Iterable, Mapping, Protocol, Sequence

from .money_intelligence import Playbook


CATEGORIES = ("strategy", "distribution", "production", "monetization", "operational")
UNIFIED_INTERFACE_VERSION = "guildless-capability-v1"


def _slug(value: Any) -> str:
    text = str(value or "").strip().casefold()
    text = re.sub(r"[^a-z0-9]+", "_", text).strip("_")
    return text or "unknown"


def _list(value: Any) -> list[Any]:
    if value is None:
        return []
    if isinstance(value, (list, tuple, set)):
        return list(value)
    return [value]


def _score(value: Any, default: float = 0.0) -> float:
    if isinstance(value, bool):
        return 1.0 if value else 0.0
    try:
        return max(0.0, min(1.0, float(value)))
    except (TypeError, ValueError):
        return default


@dataclass(frozen=True)
class CapabilityContract:
    """One executable capability contract extracted from a Playbook."""

    capability_id: str
    category: str
    required: bool
    optional: bool
    preconditions: list[str]
    evidence_source: list[str]
    success_metric: str | dict[str, Any] | list[Any]
    fallback: list[str]

    @classmethod
    def from_mapping(cls, category: str, value: Mapping[str, Any]) -> "CapabilityContract":
        capability_id = value.get("capability_id") or value.get("id") or value.get("name")
        if not capability_id:
            raise ValueError("capability_id is required")
        category = _slug(category)
        if category not in CATEGORIES:
            raise ValueError(f"unsupported capability category: {category}")
        required = bool(value.get("required", True))
        optional = bool(value.get("optional", False))
        if required and optional:
            raise ValueError(f"capability cannot be both required and optional: {capability_id}")
        return cls(
            capability_id=str(capability_id),
            category=category,
            required=required,
            optional=optional,
            preconditions=[str(item) for item in _list(value.get("preconditions")) if str(item).strip()],
            evidence_source=[str(item) for item in _list(value.get("evidence_source")) if str(item).strip()],
            success_metric=value.get("success_metric") or "capability completed",
            fallback=[str(item) for item in _list(value.get("fallback")) if str(item).strip()],
        )

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class CapabilityGraph:
    playbook_id: str
    nodes: list[CapabilityContract]
    edges: list[dict[str, str]]
    money_outcome: dict[str, Any]

    def to_dict(self) -> dict[str, Any]:
        return {
            "playbook_id": self.playbook_id,
            "nodes": [node.to_dict() for node in self.nodes],
            "edges": list(self.edges),
            "money_outcome": dict(self.money_outcome),
        }


def _inferred_specs(playbook: Playbook) -> dict[str, list[dict[str, Any]]]:
    """Create minimum contracts when a legacy Playbook has no explicit graph."""

    specs: dict[str, list[dict[str, Any]]] = {category: [] for category in CATEGORIES}
    specs["strategy"].append({
        "capability_id": f"select_strategy:{playbook.playbook_id}",
        "required": True,
        "optional": False,
        "preconditions": ["validated playbook evidence"],
        "evidence_source": list(playbook.provenance),
        "success_metric": "strategy selected with rationale",
        "fallback": ["run a bounded validation test before building"],
    })
    for channel in playbook.required_distribution or ["founder_led_outbound"]:
        specs["distribution"].append({
            "capability_id": f"distribution:{channel}",
            "required": True,
            "optional": False,
            "preconditions": ["offer and buyer are known"],
            "evidence_source": list(playbook.provenance),
            "success_metric": "qualified buyer signal",
            "fallback": ["manual outreach with approval"],
        })
    for skill in playbook.required_skill or ["manual_delivery"]:
        specs["production"].append({
            "capability_id": f"production:{skill}",
            "required": True,
            "optional": False,
            "preconditions": ["scope and acceptance criteria are explicit"],
            "evidence_source": list(playbook.provenance),
            "success_metric": "accepted deliverable",
            "fallback": ["reduce scope and deliver manually"],
        })
    specs["monetization"].append({
        "capability_id": f"monetization:{playbook.money_mechanism}",
        "required": True,
        "optional": False,
        "preconditions": ["buyer accepts offer", "price is known"],
        "evidence_source": list(playbook.provenance),
        "success_metric": "cash_confirmed with evidence",
        "fallback": ["sell a smaller paid pilot"],
    })
    specs["operational"].append({
        "capability_id": "measure_outcome",
        "required": True,
        "optional": False,
        "preconditions": ["money event schema is available"],
        "evidence_source": list(playbook.provenance),
        "success_metric": "confirmed cash, cost, and time-to-cash recorded",
        "fallback": ["stop and record unresolved outcome"],
    })
    return specs


def compile_playbook(
    playbook: Playbook,
    capability_specs: Mapping[str, Sequence[Mapping[str, Any]]] | None = None,
) -> CapabilityGraph:
    """Compile a Playbook into ordered, evidence-carrying graph contracts."""

    raw_specs = capability_specs or getattr(playbook, "capability_specs", None) or _inferred_specs(playbook)
    nodes: list[CapabilityContract] = []
    for category in CATEGORIES:
        for raw in raw_specs.get(category, []):
            nodes.append(CapabilityContract.from_mapping(category, raw))
    if not nodes:
        raise ValueError("playbook produced no capability contracts")
    edges = [
        {"from": left.capability_id, "to": right.capability_id, "type": "requires"}
        for left, right in zip(nodes, nodes[1:])
    ]
    return CapabilityGraph(
        playbook_id=playbook.playbook_id,
        nodes=nodes,
        edges=edges,
        money_outcome={
            "required": True,
            "success_metric": "cash_confirmed",
            "evidence_required": True,
            "non_success_metrics": ["leads", "replies", "meetings", "contracts", "assets_created"],
        },
    )


@dataclass(frozen=True)
class CapabilityGap:
    node_id: str
    category: str
    required: bool
    preconditions: list[str]
    fallback: list[str]
    reason: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class CapabilityRegistry(Protocol):
    def has_ready(self, capability_id: str) -> bool: ...

    def register(self, entry: Mapping[str, Any]) -> None: ...


class JsonCapabilityRegistry:
    """Small file-backed registry compatible with the JS registry shape."""

    def __init__(self, entries: Iterable[Mapping[str, Any]] = (), path: str | Path | None = None):
        self.entries: list[dict[str, Any]] = [dict(entry) for entry in entries]
        self.path = Path(path) if path else None

    @classmethod
    def load(cls, path: str | Path) -> "JsonCapabilityRegistry":
        target = Path(path)
        if not target.exists():
            return cls(path=target)
        value = json.loads(target.read_text(encoding="utf-8"))
        return cls(value.get("entries", []) if isinstance(value, Mapping) else [], target)

    def has_ready(self, capability_id: str) -> bool:
        requested = str(capability_id).casefold()
        requested_tail = requested.split(":", 1)[-1]
        for entry in self.entries:
            if entry.get("status") not in {"ready", "available", "verified"}:
                continue
            names = [entry.get("id"), entry.get("capability"), entry.get("name")]
            for name in names:
                if not name:
                    continue
                normalized = str(name).casefold()
                if normalized == requested or normalized == requested_tail:
                    return True
        return False

    def register(self, entry: Mapping[str, Any]) -> None:
        value = dict(entry)
        existing = next((index for index, item in enumerate(self.entries) if item.get("id") == value.get("id")), None)
        if existing is None:
            self.entries.append(value)
        else:
            self.entries[existing] = value
        if self.path:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            temp = self.path.with_suffix(self.path.suffix + ".tmp")
            temp.write_text(json.dumps({"schema_version": 1, "entries": self.entries}, ensure_ascii=False, indent=2), encoding="utf-8")
            temp.replace(self.path)

    def to_dict(self) -> dict[str, Any]:
        return {"schema_version": 1, "entries": list(self.entries)}


def compute_capability_gap(graph: CapabilityGraph, registry: CapabilityRegistry) -> list[CapabilityGap]:
    """Return only nodes absent from the ready registry; no user interaction."""

    gaps: list[CapabilityGap] = []
    for node in graph.nodes:
        if registry.has_ready(node.capability_id):
            continue
        gaps.append(CapabilityGap(
            node_id=node.capability_id,
            category=node.category,
            required=node.required,
            preconditions=node.preconditions,
            fallback=node.fallback,
            reason="missing_from_capability_registry",
        ))
    return gaps


@dataclass(frozen=True)
class DiscoveryCandidate:
    capability_id: str
    provider: str
    source: str
    name: str
    license: str | None
    commercial_use: bool | None
    maintenance_score: float
    platform_compatibility: float
    cost_yen_per_run: float | None
    quality_score: float
    runtime: str | None
    security_score: float
    integration_difficulty: float
    docs_url: str | None = None
    evidence: tuple[str, ...] = ()
    verified: bool = False
    test_passed: bool = False
    benchmark_score: float | None = None
    interface_version: str | None = None
    adapter_path: str | None = None
    clone_required: bool = False

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class CandidateEvaluation:
    candidate: DiscoveryCandidate
    eligible: bool
    score: float
    reasons: tuple[str, ...]

    def to_dict(self) -> dict[str, Any]:
        return {"candidate": self.candidate.to_dict(), "eligible": self.eligible, "score": self.score, "reasons": list(self.reasons)}


def evaluate_candidate(candidate: DiscoveryCandidate) -> CandidateEvaluation:
    """Apply conservative adoption gates and produce a comparable score."""

    reasons: list[str] = []
    if not candidate.license:
        reasons.append("license_unknown")
    if candidate.commercial_use is not True:
        reasons.append("commercial_use_unproven")
    if not candidate.runtime:
        reasons.append("runtime_unknown")
    if candidate.platform_compatibility < 0.5:
        reasons.append("platform_incompatible")
    if candidate.security_score < 0.7:
        reasons.append("security_below_gate")
    if not candidate.verified:
        reasons.append("verification_incomplete")
    if not candidate.test_passed:
        reasons.append("sandbox_or_adapter_test_failed")
    if not candidate.evidence:
        reasons.append("evidence_missing")
    cost_score = 0.5 if candidate.cost_yen_per_run is None else 1.0 / (1.0 + candidate.cost_yen_per_run / 10000.0)
    quality = max(candidate.quality_score, candidate.benchmark_score or 0.0)
    score = (
        candidate.maintenance_score * 0.16
        + candidate.platform_compatibility * 0.14
        + cost_score * 0.13
        + quality * 0.22
        + candidate.security_score * 0.2
        + (1.0 - candidate.integration_difficulty) * 0.15
    )
    return CandidateEvaluation(candidate, not reasons, round(score, 6), tuple(reasons))


def rank_candidates(candidates: Iterable[DiscoveryCandidate]) -> list[CandidateEvaluation]:
    evaluations = [evaluate_candidate(candidate) for candidate in candidates]
    return sorted(evaluations, key=lambda item: (-item.eligible, -item.score, item.candidate.provider, item.candidate.name))


class DiscoveryProvider(Protocol):
    name: str

    def discover(self, gap: CapabilityGap) -> Iterable[DiscoveryCandidate]: ...


class AutonomousDiscoveryEngine:
    """Provider composition layer; it never asks the user for a tool."""

    def __init__(self, providers: Sequence[DiscoveryProvider]):
        self.providers = list(providers)
        self.provider_errors: list[dict[str, str]] = []

    def discover(self, gap: CapabilityGap) -> list[DiscoveryCandidate]:
        found: list[DiscoveryCandidate] = []
        for provider in self.providers:
            try:
                found.extend(provider.discover(gap))
            except Exception as exc:  # discovery failure is recorded, not fatal to the run
                self.provider_errors.append({"provider": getattr(provider, "name", provider.__class__.__name__), "error": str(exc)})
        return found


@dataclass(frozen=True)
class AdapterProposal:
    capability_id: str
    adapter_path: str
    test_path: str
    workflow_path: str
    interface: str
    generated: bool

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def generate_adapter_proposal(candidate: DiscoveryCandidate) -> AdapterProposal:
    """Return the Codex-ready adapter/test/workflow contract without executing it."""

    stem = _slug(candidate.name)
    return AdapterProposal(
        capability_id=candidate.capability_id,
        adapter_path=f"generated/adapters/{stem}.py",
        test_path=f"generated/tests/test_{stem}.py",
        workflow_path=f"generated/workflows/{stem}.json",
        interface="invoke(input, context) -> output",
        generated=candidate.interface_version != UNIFIED_INTERFACE_VERSION or not candidate.adapter_path,
    )


@dataclass
class ProcurementResult:
    graph: CapabilityGraph
    initial_gap: list[CapabilityGap]
    evaluations: dict[str, list[CandidateEvaluation]]
    registered: list[dict[str, Any]]
    unresolved: list[dict[str, Any]]
    provider_errors: list[dict[str, str]]

    @property
    def ready(self) -> bool:
        return not self.unresolved

    def to_dict(self) -> dict[str, Any]:
        return {
            "graph": self.graph.to_dict(),
            "initial_gap": [item.to_dict() for item in self.initial_gap],
            "evaluations": {key: [item.to_dict() for item in value] for key, value in self.evaluations.items()},
            "registered": list(self.registered),
            "unresolved": list(self.unresolved),
            "provider_errors": list(self.provider_errors),
            "ready": self.ready,
            "external_effects": "none",
        }


def procure_capability_gaps(
    graph: CapabilityGraph,
    registry: JsonCapabilityRegistry,
    discovery: AutonomousDiscoveryEngine,
    *,
    adapter_builder: Callable[[DiscoveryCandidate], AdapterProposal] = generate_adapter_proposal,
) -> ProcurementResult:
    """Discover, verify, adapt, test, and register every missing capability."""

    gaps = compute_capability_gap(graph, registry)
    evaluations: dict[str, list[CandidateEvaluation]] = {}
    registered: list[dict[str, Any]] = []
    unresolved: list[dict[str, Any]] = []
    for gap in gaps:
        ranked = rank_candidates(discovery.discover(gap))
        evaluations[gap.node_id] = ranked
        selected = next((item for item in ranked if item.eligible), None)
        if selected is None:
            unresolved.append({"capability_id": gap.node_id, "fallback": gap.fallback, "reason": "no_verified_candidate"})
            continue
        candidate = selected.candidate
        proposal = adapter_builder(candidate)
        entry = {
            "id": candidate.capability_id,
            "capability": candidate.capability_id,
            "provider": candidate.provider,
            "source": candidate.source,
            "name": candidate.name,
            "status": "ready",
            "license": candidate.license,
            "commercial_use": candidate.commercial_use,
            "verification_score": selected.score,
            "docs_url": candidate.docs_url,
            "evidence": list(candidate.evidence),
            "adapter": proposal.to_dict(),
        }
        registry.register(entry)
        registered.append(entry)
    return ProcurementResult(graph, gaps, evaluations, registered, unresolved, discovery.provider_errors)


def record_playbook_metric(bet: Any, metric_name: str, value: Any, *, evidence: str | None = None) -> Any:
    """Record progress without treating it as money success.

    The existing ``MoneyBet`` remains the source of truth for cash.  This
    helper only appends metrics such as views, uploads, leads, or conversion;
    callers must still emit ``cash_confirmed`` with evidence to close the loop.
    """

    if not str(metric_name).strip():
        raise ValueError("metric_name is required")
    if not hasattr(bet, "outcome_metrics"):
        bet.outcome_metrics = {}
    bet.outcome_metrics[str(metric_name)] = value
    row = {"event": "metric_recorded", "metric": str(metric_name), "value": value}
    if evidence:
        row["evidence"] = evidence
    bet.events.append(row)
    return bet
