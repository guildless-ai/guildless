"""Evidence gate for externally discovered money cases.

Discovery is intentionally supplied by a provider (browser, web search, or a
human review). This module decides whether the supplied evidence is strong
enough to influence a Playbook; it does not invent facts or scrape around
access controls.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping

from guildless_v0.core.money_intelligence import MoneyCase, validate_money_case


@dataclass(frozen=True)
class EvidenceGate:
    accepted: bool
    score: float
    reasons: list[str]

    def to_dict(self) -> dict[str, Any]:
        return {"accepted": self.accepted, "score": self.score, "reasons": self.reasons}


def evaluate_case_evidence(case: MoneyCase | Mapping[str, Any], *, minimum_score: float = 0.6) -> EvidenceGate:
    item = case if isinstance(case, MoneyCase) else MoneyCase.from_dict(case)
    reasons = validate_money_case(item)
    if reasons:
        return EvidenceGate(False, 0.0, reasons)
    score = item.evidence_score
    if item.first_revenue is None:
        reasons.append("first_revenue is unknown")
    if item.time_to_first_revenue_days is None:
        reasons.append("time_to_first_revenue_days is unknown")
    if not item.customer_acquisition_channel:
        reasons.append("customer acquisition path is unknown")
    if item.hidden_advantages:
        reasons.append("hidden advantages must be disclosed before strong strategy use")
        score *= 0.75
    accepted = score >= minimum_score and not any("unknown" in reason for reason in reasons) and not item.hidden_advantages
    if not accepted and not reasons:
        reasons.append(f"evidence score {score:.2f} is below {minimum_score:.2f}")
    return EvidenceGate(accepted, round(score, 4), reasons)


def harvest_case(case: MoneyCase | Mapping[str, Any]) -> dict[str, Any]:
    item = case if isinstance(case, MoneyCase) else MoneyCase.from_dict(case)
    gate = evaluate_case_evidence(item)
    return {"case": item.to_dict(), "evidence_gate": gate.to_dict(), "usable_for_strategy": gate.accepted}
