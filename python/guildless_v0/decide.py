"""Rank money strategies from recorded cases and the company's real state.

The point of this module is that the decision is not an opinion typed into a
chat window.  Cases carry provenance, invalid cases are dropped with a reason,
playbooks are aggregated from the surviving cases, and the ranking function
weighs buyer access, reproducibility and speed to cash.  The output says which
strategy wins, what it is standing on, and what was thrown away.

Usage:
    python -m guildless_v0.decide --payload payload.json [--top 5]

Payload:
    {"company": {...CompanyState fields...},
     "cases":   [ {...MoneyCase fields...}, ... ]}
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence, TextIO

from .core.money_intelligence import (
    CompanyState,
    MoneyCase,
    Playbook,
    StrategyScore,
    derive_playbook,
    rank_strategies,
    validate_money_case,
)


def partition_cases(raw: Iterable[Mapping[str, Any]]) -> tuple[list[MoneyCase], list[dict[str, Any]]]:
    """Split incoming cases into usable ones and rejects that carry their reason."""

    kept: list[MoneyCase] = []
    dropped: list[dict[str, Any]] = []
    for item in raw:
        try:
            case = MoneyCase.from_dict(item)
        except TypeError as exc:
            dropped.append({"case_id": item.get("case_id"), "errors": [f"unreadable case: {exc}"]})
            continue
        errors = validate_money_case(case)
        if errors:
            dropped.append({"case_id": case.case_id, "errors": errors})
        else:
            kept.append(case)
    return kept, dropped


def group_playbooks(cases: Sequence[MoneyCase]) -> list[Playbook]:
    """One playbook per playbook_id; a case with no playbook_id stands alone.

    ``derive_playbook`` only aggregates cases whose ``playbook_id`` matches the
    id it is given, so an unlabelled case is labelled with its own synthetic id
    rather than being silently dropped.
    """

    groups: dict[str, list[MoneyCase]] = defaultdict(list)
    for case in cases:
        key = case.playbook_id or f"case:{case.case_id}"
        if not case.playbook_id:
            case.playbook_id = key
        groups[key].append(case)
    return [derive_playbook(group, playbook_id) for playbook_id, group in sorted(groups.items())]


def decide(company: CompanyState, raw_cases: Iterable[Mapping[str, Any]], top: int = 5) -> dict[str, Any]:
    cases, dropped = partition_cases(raw_cases)
    playbooks = group_playbooks(cases)
    ranked = rank_strategies(company, playbooks)
    by_id = {book.playbook_id: book for book in playbooks}
    winner: StrategyScore | None = ranked[0] if ranked else None
    decision: dict[str, Any] | None = None
    if winner is not None:
        book = by_id[winner.playbook_id]
        decision = {
            "playbook_id": winner.playbook_id,
            "name": book.name,
            "tier": winner.tier,
            "score": winner.score,
            "money_mechanism": book.money_mechanism,
            "expected_time_to_cash_days": book.expected_time_to_cash_days,
            "execution_steps": book.execution_steps,
            "validation_signal": book.validation_signal,
            "kill_conditions": book.kill_conditions,
            "supporting_cases": book.supporting_cases,
            "rationale": winner.rationale,
        }
    return {
        "cases_used": len(cases),
        "cases_dropped": dropped,
        "playbooks": len(playbooks),
        "ranked": [score.to_dict() for score in ranked[: max(1, top)]],
        "decision": decision,
    }


def render(result: Mapping[str, Any]) -> str:
    lines: list[str] = []
    decision = result.get("decision")
    if not decision:
        lines.append("no decision: no case survived validation")
    else:
        lines.append(f"decision  {decision['playbook_id']}  ({decision['tier']}, score {decision['score']})")
        lines.append(f"mechanism {decision['money_mechanism'] or 'unknown'}")
        if decision.get("expected_time_to_cash_days") is not None:
            lines.append(f"to cash   {decision['expected_time_to_cash_days']} days")
        for step in decision.get("execution_steps") or []:
            lines.append(f"  step    {step}")
        for signal in decision.get("validation_signal") or []:
            lines.append(f"  signal  {signal}")
        for kill in decision.get("kill_conditions") or []:
            lines.append(f"  kill    {kill}")
    lines.append(f"cases     {result['cases_used']} used, {len(result['cases_dropped'])} dropped")
    for drop in result["cases_dropped"]:
        lines.append(f"  drop    {drop['case_id']}: {'; '.join(drop['errors'])}")
    for score in result["ranked"]:
        lines.append(f"rank      {score['score']:.4f}  {score['tier']:<6} {score['playbook_id']}  {'; '.join(score['rationale'])}")
    return "\n".join(lines)


def main(argv: Sequence[str] | None = None, stdout: TextIO | None = None) -> int:
    parser = argparse.ArgumentParser(prog="guildless-decide")
    parser.add_argument("--payload", required=True)
    parser.add_argument("--top", type=int, default=5)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args(list(argv) if argv is not None else None)
    out = stdout or sys.stdout

    payload = json.loads(Path(args.payload).read_text(encoding="utf-8"))
    company = CompanyState(**payload.get("company", {}))
    result = decide(company, payload.get("cases", []), top=args.top)
    out.write(json.dumps(result, ensure_ascii=False, indent=2) if args.json else render(result))
    out.write("\n")
    return 0 if result["decision"] else 1


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
