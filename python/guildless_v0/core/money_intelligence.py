"""Evidence-first money intelligence primitives.

This module is deliberately independent from the existing lead simulator.  It
stores *how* a case or bet was learned, while the transactional ledger remains
the source of truth for confirmed cash.  Missing values stay ``None``; this
module never infers a financial fact from a headline or a model response.
"""

from __future__ import annotations

import hashlib
import json
import math
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def _clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, float(value)))


def _norm_text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _norm_list(value: Any) -> list[Any]:
    if value is None:
        return []
    if isinstance(value, (list, tuple, set)):
        return list(value)
    return [value]


@dataclass
class MoneyCase:
    """A provenance-carrying human monetisation case.

    Unknown facts are represented as ``None``.  A case cannot become a strong
    strategy input unless it has source evidence and a non-zero evidence score.
    """

    case_id: str
    source_urls: list[str] = field(default_factory=list)
    source_type: str = "unknown"
    founder: str | None = None
    business: str | None = None
    date_observed: str | None = None
    cash_start: int | None = None
    team_size: int | None = None
    existing_skill: list[str] = field(default_factory=list)
    existing_product: list[str] = field(default_factory=list)
    existing_customers: int | None = None
    existing_audience: int | None = None
    existing_distribution: list[str] = field(default_factory=list)
    existing_relationships: list[str] = field(default_factory=list)
    geography: str | None = None
    what_was_sold: str | None = None
    buyer: str | None = None
    price: int | None = None
    pricing_model: str | None = None
    customer_acquisition_channel: list[str] = field(default_factory=list)
    first_customer_source: str | None = None
    paid_ads: bool | None = None
    outreach_volume: int | None = None
    conversion_data: dict[str, Any] = field(default_factory=dict)
    ordered_steps: list[str] = field(default_factory=list)
    what_was_built_before_sale: str | None = None
    what_was_manual: list[str] = field(default_factory=list)
    tools_used: list[str] = field(default_factory=list)
    first_revenue: int | None = None
    time_to_first_revenue_days: int | None = None
    revenue_milestones: list[dict[str, Any]] = field(default_factory=list)
    hidden_advantages: list[str] = field(default_factory=list)
    evidence_score: float = 0.0
    confidence: float = 0.0
    last_verified: str | None = None
    playbook_id: str | None = None
    evidence: list[dict[str, str]] = field(default_factory=list)

    def __post_init__(self) -> None:
        self.case_id = _norm_text(self.case_id) or _id("case")
        self.source_urls = [str(x).strip() for x in _norm_list(self.source_urls) if str(x).strip()]
        self.source_type = _norm_text(self.source_type) or "unknown"
        self.existing_skill = [str(x) for x in _norm_list(self.existing_skill)]
        self.existing_product = [str(x) for x in _norm_list(self.existing_product)]
        self.existing_distribution = [str(x) for x in _norm_list(self.existing_distribution)]
        self.existing_relationships = [str(x) for x in _norm_list(self.existing_relationships)]
        self.customer_acquisition_channel = [str(x) for x in _norm_list(self.customer_acquisition_channel)]
        self.ordered_steps = [str(x) for x in _norm_list(self.ordered_steps)]
        self.what_was_manual = [str(x) for x in _norm_list(self.what_was_manual)]
        self.tools_used = [str(x) for x in _norm_list(self.tools_used)]
        self.hidden_advantages = [str(x) for x in _norm_list(self.hidden_advantages)]
        self.evidence_score = _clamp(self.evidence_score)
        self.confidence = _clamp(self.confidence)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, value: Mapping[str, Any]) -> "MoneyCase":
        return cls(**dict(value))


def load_money_cases(path: str | Path) -> tuple[list[MoneyCase], list[dict[str, Any]]]:
    """Load a seed pack and return ``(accepted, rejected)`` with reasons.

    The importer is intentionally strict: malformed or unsupported cases are
    reported instead of silently being turned into strategy evidence.
    """

    raw = json.loads(Path(path).read_text(encoding="utf-8"))
    records = raw.get("cases", []) if isinstance(raw, Mapping) else raw
    accepted: list[MoneyCase] = []
    rejected: list[dict[str, Any]] = []
    for index, record in enumerate(records if isinstance(records, list) else []):
        try:
            item = MoneyCase.from_dict(record)
            errors = validate_money_case(item)
            if errors:
                rejected.append({"index": index, "case_id": item.case_id, "errors": errors})
            else:
                accepted.append(item)
        except (TypeError, ValueError, json.JSONDecodeError) as exc:
            rejected.append({"index": index, "errors": [str(exc)]})
    return accepted, rejected


def validate_money_case(case: MoneyCase | Mapping[str, Any]) -> list[str]:
    """Return blocking validation errors; no LLM/fuzzy correction is applied."""

    item = case if isinstance(case, MoneyCase) else MoneyCase.from_dict(case)
    errors: list[str] = []
    if not item.case_id:
        errors.append("case_id is required")
    if not item.source_urls:
        errors.append("at least one source_urls entry is required")
    if not item.source_type or item.source_type == "unknown":
        errors.append("source_type is required")
    if not 0 <= item.evidence_score <= 1:
        errors.append("evidence_score must be in [0, 1]")
    if not 0 <= item.confidence <= 1:
        errors.append("confidence must be in [0, 1]")
    if item.cash_start is not None and item.cash_start < 0:
        errors.append("cash_start cannot be negative")
    if item.existing_audience is not None and item.existing_audience < 0:
        errors.append("existing_audience cannot be negative")
    if item.first_revenue is not None and item.first_revenue < 0:
        errors.append("first_revenue cannot be negative")
    if item.evidence_score > 0 and not item.evidence:
        errors.append("evidence entries are required when evidence_score is non-zero")
    return errors


@dataclass
class Playbook:
    playbook_id: str
    name: str
    required_starting_conditions: dict[str, Any]
    capital_requirement_yen: int | None
    required_skill: list[str]
    required_distribution: list[str]
    expected_time_to_cash_days: int | None
    execution_steps: list[str]
    money_mechanism: str
    validation_signal: list[str]
    kill_conditions: list[str]
    scale_conditions: list[str]
    supporting_cases: list[str]
    confidence: float
    provenance: list[str] = field(default_factory=list)
    source_kind: str = "derived"
    # Optional explicit capability contracts.  The compiler turns these into
    # executable graph nodes; an empty mapping is populated conservatively by
    # ``derive_playbook`` from the evidence-backed fields above.
    capability_specs: dict[str, list[dict[str, Any]]] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def derive_playbook(cases: Sequence[MoneyCase], playbook_id: str, name: str | None = None) -> Playbook:
    """Derive a conservative playbook from explicit case annotations.

    This is aggregation, not creative synthesis: only values occurring in the
    evidence-backed cases are copied into the playbook.
    """

    selected = [c for c in cases if c.playbook_id == playbook_id and not validate_money_case(c)]
    if not selected:
        raise ValueError(f"no valid cases for playbook {playbook_id!r}")

    def unique(values: Iterable[str]) -> list[str]:
        return sorted({v for v in values if v})

    capital_values = [c.cash_start for c in selected if c.cash_start is not None]
    time_values = [c.time_to_first_revenue_days for c in selected if c.time_to_first_revenue_days is not None]
    confidence = sum(c.confidence * c.evidence_score for c in selected) / max(
        1e-9, sum(c.evidence_score for c in selected)
    )
    shared_steps = unique(step for c in selected for step in c.ordered_steps)
    channels = unique(channel for c in selected for channel in c.customer_acquisition_channel)
    skills = unique(skill for c in selected for skill in c.existing_skill)
    mechanisms = unique(c.pricing_model or "" for c in selected)
    mechanism = mechanisms[0] if len(mechanisms) == 1 else "evidence-backed offer and direct payment"
    capability_specs = {
        "strategy": [{
            "capability_id": f"select_strategy:{playbook_id}",
            "required": True,
            "optional": False,
            "preconditions": ["validated playbook evidence"],
            "evidence_source": [f"case:{c.case_id}" for c in selected],
            "success_metric": "strategy selected with an explicit rationale",
            "fallback": ["keep the current strategy and run a bounded validation test"],
        }],
        "distribution": [{
            "capability_id": f"distribution:{channel}",
            "required": True,
            "optional": False,
            "preconditions": ["offer and buyer are known"],
            "evidence_source": unique(url for c in selected for url in c.source_urls),
            "success_metric": "qualified buyer signal or confirmed cash",
            "fallback": ["manual founder-led outreach with approval"],
        } for channel in channels],
        "production": [{
            "capability_id": f"production:{skill}",
            "required": True,
            "optional": False,
            "preconditions": ["scope and acceptance criteria are explicit"],
            "evidence_source": [f"case:{c.case_id}" for c in selected],
            "success_metric": "accepted deliverable produced within the playbook constraint",
            "fallback": ["reduce scope and deliver the manual path"],
        } for skill in skills],
        "monetization": [{
            "capability_id": f"monetization:{mechanism}",
            "required": True,
            "optional": False,
            "preconditions": ["buyer accepts the offer", "price is known"],
            "evidence_source": [f"case:{c.case_id}" for c in selected],
            "success_metric": "cash_confirmed with evidence",
            "fallback": ["ask for a smaller paid pilot before scaling"],
        }],
        "operational": [{
            "capability_id": "measure_outcome",
            "required": True,
            "optional": False,
            "preconditions": ["money event schema is available"],
            "evidence_source": [f"case:{c.case_id}" for c in selected],
            "success_metric": "confirmed cash, cost, and time-to-cash recorded",
            "fallback": ["stop and record an unresolved outcome"],
        }],
    }
    return Playbook(
        playbook_id=playbook_id,
        name=name or playbook_id,
        required_starting_conditions={"case_count": len(selected)},
        capital_requirement_yen=min(capital_values) if capital_values else None,
        required_skill=skills,
        required_distribution=channels,
        expected_time_to_cash_days=min(time_values) if time_values else None,
        execution_steps=shared_steps,
        money_mechanism=mechanism,
        validation_signal=["buyer accepts offer", "confirmed cash received"],
        kill_conditions=["no buyer signal after bounded test"],
        scale_conditions=["confirmed cash exceeds test cost"],
        supporting_cases=[c.case_id for c in selected],
        confidence=round(_clamp(confidence), 4),
        provenance=unique(url for c in selected for url in c.source_urls),
        capability_specs=capability_specs,
    )


@dataclass
class CompanyState:
    cash: int | None = None
    capabilities: list[str] = field(default_factory=list)
    proven_capabilities: list[str] = field(default_factory=list)
    assets: list[str] = field(default_factory=list)
    existing_products: list[str] = field(default_factory=list)
    customer_history: list[str] = field(default_factory=list)
    sales_history: list[str] = field(default_factory=list)
    audience: int | None = None
    distribution: list[str] = field(default_factory=list)
    relationships: list[str] = field(default_factory=list)
    domains: list[str] = field(default_factory=list)
    repos: list[str] = field(default_factory=list)
    production_urls: list[str] = field(default_factory=list)
    hardware: list[str] = field(default_factory=list)
    accounts: list[str] = field(default_factory=list)
    constraints: list[str] = field(default_factory=list)
    preferences: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class StrategyScore:
    playbook_id: str
    score: float
    tier: str
    factors: dict[str, float]
    rationale: list[str]
    blocked: bool = False

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _set_similarity(left: Iterable[str], right: Iterable[str]) -> float:
    a, b = set(x.casefold() for x in left), set(x.casefold() for x in right)
    if not a and not b:
        return 1.0
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def _numeric_similarity(actual: int | None, expected: int | None) -> float:
    if actual is None or expected is None:
        return 0.0
    if actual == expected:
        return 1.0
    scale = max(abs(actual), abs(expected), 1)
    return _clamp(1.0 - abs(actual - expected) / scale)


def should_block_build_before_signal(*, strategy_kind: str, buyer: str | None, pain: str | None,
                                     offer: str | None, price: int | None,
                                     distribution: Sequence[str] | None,
                                     validation_method: str | None,
                                     existing_signal: bool = False) -> tuple[bool, list[str]]:
    """Block large builds with no buyer/pain/offer/price/distribution signal."""

    if existing_signal:
        return False, []
    if strategy_kind.casefold() not in {"saas", "novel_saas", "new_product", "large_build"}:
        return False, []
    missing: list[str] = []
    for label, value in (("buyer", buyer), ("pain", pain), ("offer", offer), ("price", price),
                         ("distribution", distribution), ("validation_method", validation_method)):
        if value is None or value == "" or value == []:
            missing.append(label)
    return bool(missing), missing


def rank_strategies(company: CompanyState, playbooks: Sequence[Playbook]) -> list[StrategyScore]:
    """Rank playbooks using evidence and company fit, not novelty.

    The weights make buyer access, reproducibility, and speed-to-cash dominate;
    capital and build time are penalties.  A playbook with no supporting case is
    marked ``novel`` and cannot outrank evidence-backed playbooks.
    """

    ranked: list[StrategyScore] = []
    for book in playbooks:
        proven = bool(book.supporting_cases) and book.confidence > 0
        skill = _set_similarity(company.proven_capabilities or company.capabilities, book.required_skill)
        distribution = _set_similarity(company.distribution, book.required_distribution)
        asset = _set_similarity(company.assets + company.existing_products, book.required_skill)
        audience = 1.0 if company.audience is not None and company.audience > 0 else 0.0
        capital = _numeric_similarity(company.cash, book.capital_requirement_yen)
        buyer_access = 0.7 * distribution + 0.3 * (1.0 if company.relationships else 0.0)
        speed = 1.0 / max(1.0, float(book.expected_time_to_cash_days or 90))
        reproducibility = book.confidence if proven else 0.1
        capital_penalty = 1.0 / max(1.0, float(book.capital_requirement_yen or 0) / max(company.cash or 1, 1))
        score = (reproducibility * 0.26 + skill * 0.17 + buyer_access * 0.19 +
                 asset * 0.11 + capital * 0.08 + _clamp(speed * 14) * 0.14 + audience * 0.05) * capital_penalty
        # No audience is not a penalty when the playbook is explicitly outbound;
        # an existing audience should instead create a measurable advantage.
        if audience and any("audience" in x.casefold() for x in book.required_distribution):
            score += 0.08
        tier = "proven" if proven else "novel"
        rationale = []
        if proven:
            rationale.append(f"{len(book.supporting_cases)}件の根拠付きCase")
        else:
            rationale.append("根拠付きCaseなし")
        if buyer_access >= 0.5:
            rationale.append("購入者への到達経路が既存")
        if company.cash == 0 and (book.capital_requirement_yen or 0) > 0:
            rationale.append("開始資本0円に対して必要資本が大きい")
        ranked.append(StrategyScore(book.playbook_id, round(score, 6), tier, {
            "reproducibility": round(reproducibility, 4),
            "skill_similarity": round(skill, 4),
            "buyer_access": round(buyer_access, 4),
            "audience_fit": round(audience, 4),
            "asset_similarity": round(asset, 4),
            "capital_similarity": round(capital, 4),
            "speed_to_cash": round(_clamp(speed * 14), 4),
        }, rationale))
    ranked.sort(key=lambda item: (-item.score, item.tier != "proven", item.playbook_id))
    return ranked


@dataclass
class MoneyBet:
    bet_id: str
    starting_company_state: dict[str, Any]
    selected_playbook: str
    why_selected: list[str]
    offer: str | None
    buyer: str | None
    channel: str | None
    capital_spent: int = 0
    actions: list[str] = field(default_factory=list)
    contacts: int = 0
    responses: int = 0
    meetings: int = 0
    proposals: int = 0
    contracts: int = 0
    confirmed_cash_in: int = 0
    time_to_cash_days: int | None = None
    failure_reason: str | None = None
    success_reason: str | None = None
    status: str = "hypothesis"
    outcome_metrics: dict[str, Any] = field(default_factory=dict)
    events: list[dict[str, Any]] = field(default_factory=list)
    created_at: str = field(default_factory=_now)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def create_money_bet(company: CompanyState, playbook: Playbook, *, offer: str | None,
                     buyer: str | None, channel: str | None, why_selected: Sequence[str]) -> MoneyBet:
    bet = MoneyBet(_id("bet"), company.to_dict(), playbook.playbook_id, list(why_selected), offer, buyer, channel)
    bet.events.append({"at": bet.created_at, "event": "hypothesis_created", "playbook_id": playbook.playbook_id})
    return bet


def record_money_bet_event(bet: MoneyBet, event: str, *, amount_yen: int = 0,
                           evidence: str | None = None, **details: Any) -> MoneyBet:
    if amount_yen < 0:
        raise ValueError("amount_yen cannot be negative")
    event_row = {"at": _now(), "event": event, **details}
    if evidence:
        event_row["evidence"] = evidence
    bet.events.append(event_row)
    if event == "contacted":
        bet.contacts += int(details.get("count", 1))
    elif event == "response":
        bet.responses += int(details.get("count", 1))
    elif event == "meeting":
        bet.meetings += int(details.get("count", 1))
    elif event == "proposal":
        bet.proposals += int(details.get("count", 1))
    elif event == "contract":
        bet.contracts += int(details.get("count", 1))
    elif event == "cash_confirmed":
        # Only an explicit cash_confirmed event with evidence changes outcome.
        if not evidence:
            raise ValueError("cash_confirmed requires evidence")
        bet.confirmed_cash_in += amount_yen
        bet.status = "completed"
        bet.success_reason = details.get("reason") or "confirmed cash received"
        if "time_to_cash_days" in details:
            bet.time_to_cash_days = int(details["time_to_cash_days"])
    elif event == "signal_weak":
        bet.status = "killed"
        bet.failure_reason = details.get("reason") or "market signal was weak"
    elif event == "execution_started":
        bet.status = "executing"
    elif event == "capital_spent":
        bet.capital_spent += amount_yen
    return bet


def money_outcome(bet: MoneyBet) -> dict[str, Any]:
    """Return outcome values; leads/contracts never count as cash."""

    return {
        "confirmed_cash_in": bet.confirmed_cash_in,
        "capital_spent": bet.capital_spent,
        "net_confirmed_cash": bet.confirmed_cash_in - bet.capital_spent,
        "contacts": bet.contacts,
        "contracts": bet.contracts,
        "status": bet.status,
        "outcome_metrics": dict(bet.outcome_metrics),
        "is_money_success": bet.confirmed_cash_in > 0,
    }


class JsonlMemoryBackend:
    """Small append/search backend used until a benchmark-approved backend exists.

    Semantic memory is kept separate from money transactions.  Every row is
    immutable and includes a deterministic payload hash for reproducibility.
    """

    def __init__(self, path: str | Path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)

    def append(self, namespace: str, value: Mapping[str, Any], *, source_ids: Sequence[str] = ()) -> str:
        payload = {"namespace": namespace, "value": dict(value), "source_ids": list(source_ids), "appended_at": _now()}
        encoded = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        row_id = hashlib.sha256(encoded.encode("utf-8")).hexdigest()
        with self.path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps({"id": row_id, **payload}, ensure_ascii=False, sort_keys=True) + "\n")
        return row_id

    def search(self, namespace: str | None = None, query: str | None = None) -> list[dict[str, Any]]:
        if not self.path.exists():
            return []
        needle = (query or "").casefold()
        rows: list[dict[str, Any]] = []
        for line in self.path.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            row = json.loads(line)
            if namespace and row.get("namespace") != namespace:
                continue
            if needle and needle not in json.dumps(row.get("value", {}), ensure_ascii=False).casefold():
                continue
            rows.append(row)
        return rows
