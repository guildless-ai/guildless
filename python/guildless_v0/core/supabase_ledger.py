"""Read-only Supabase ledger source for Guildless.

Guildless counts only verified cash.  This module reads three read-only views
that live next to an existing operating database (the ``incagent-os``
Supabase project) and turns them into:

* ``cash_confirmed`` events for a :class:`MoneyBet` (with machine evidence:
  Stripe charge id + freee deal id), and
* a funnel / health snapshot that shows where the existing sales and gig
  pipeline actually stops.

The module never writes to Supabase and never triggers outreach.  Network
access is injected (``fetch``) so the core stays deterministic and testable.
Only the standard library is used.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable, Iterable, Mapping, Sequence

from guildless_v0.core.money_intelligence import MoneyBet, record_money_bet_event

CASH_VIEW = "guildless_cash_events"
FUNNEL_VIEW = "guildless_gig_funnel"
HEALTH_VIEW = "guildless_pipeline_health"

Fetch = Callable[[str, Mapping[str, str]], Any]


@dataclass(frozen=True)
class SupabaseLedgerSource:
    """Location of the read-only views.

    ``service_key`` must be a Supabase service-role key: the views are not
    readable by ``anon``/``authenticated``.  The key is never logged.
    """

    base_url: str
    service_key: str
    cash_view: str = CASH_VIEW
    funnel_view: str = FUNNEL_VIEW
    health_view: str = HEALTH_VIEW

    def rest_url(self, view: str, params: Mapping[str, str] | None = None) -> str:
        base = self.base_url.rstrip("/")
        query = urllib.parse.urlencode(dict(params or {}))
        return f"{base}/rest/v1/{view}" + (f"?{query}" if query else "")

    def headers(self) -> dict[str, str]:
        return {
            "apikey": self.service_key,
            "Authorization": f"Bearer {self.service_key}",
            "Accept": "application/json",
        }


def _default_fetch(url: str, headers: Mapping[str, str]) -> Any:
    request = urllib.request.Request(url, headers=dict(headers), method="GET")
    with urllib.request.urlopen(request, timeout=30) as response:  # noqa: S310 - https only, caller supplied
        return json.loads(response.read().decode("utf-8"))


def fetch_view(source: SupabaseLedgerSource, view: str, *, fetch: Fetch | None = None,
               params: Mapping[str, str] | None = None) -> list[dict[str, Any]]:
    """Return rows of a view as a list of dicts.  Raises on transport errors."""

    if not source.base_url.startswith("https://"):
        raise ValueError("Supabase base_url must use https")
    if not source.service_key:
        raise ValueError("service_key is required")
    fetcher = fetch or _default_fetch
    try:
        rows = fetcher(source.rest_url(view, params), source.headers())
    except urllib.error.HTTPError as exc:  # pragma: no cover - transport detail
        raise RuntimeError(f"{view}: HTTP {exc.code}") from None
    if not isinstance(rows, list):
        raise RuntimeError(f"{view}: expected a JSON array")
    return [dict(row) for row in rows]


def evidence_key(row: Mapping[str, Any]) -> str:
    """Stable evidence string for a cash row (sorted JSON of the evidence)."""

    evidence = row.get("evidence")
    if isinstance(evidence, str):
        try:
            evidence = json.loads(evidence)
        except json.JSONDecodeError:
            return evidence
    if not isinstance(evidence, Mapping) or not evidence:
        return ""
    return json.dumps(dict(evidence), ensure_ascii=False, sort_keys=True, separators=(",", ":"))


@dataclass
class CashImportResult:
    imported: int = 0
    imported_yen: int = 0
    skipped: list[dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {"imported": self.imported, "imported_yen": self.imported_yen, "skipped": list(self.skipped)}


def _already_recorded(bet: MoneyBet) -> set[str]:
    return {str(event.get("evidence")) for event in bet.events if event.get("event") == "cash_confirmed"}


def import_cash_events(bet: MoneyBet, rows: Iterable[Mapping[str, Any]]) -> CashImportResult:
    """Record ``cash_confirmed`` on ``bet`` for every evidenced JPY row.

    Rows without evidence, non-JPY rows, non-positive amounts, and rows whose
    evidence is already on the bet are skipped and reported.  Nothing is
    converted or estimated; the bet only moves on verified yen.
    """

    result = CashImportResult()
    seen = _already_recorded(bet)
    for row in rows:
        key = evidence_key(row)
        if not key:
            result.skipped.append({"reason": "missing_evidence", "row": dict(row)})
            continue
        if str(row.get("event", "cash_confirmed")) != "cash_confirmed":
            result.skipped.append({"reason": "not_cash_event", "evidence": key})
            continue
        currency = str(row.get("currency") or "jpy").lower()
        if currency != "jpy":
            result.skipped.append({"reason": f"unsupported_currency:{currency}", "evidence": key})
            continue
        try:
            amount = int(row.get("amount") or 0)
        except (TypeError, ValueError):
            result.skipped.append({"reason": "invalid_amount", "evidence": key})
            continue
        if amount <= 0:
            result.skipped.append({"reason": "non_positive_amount", "evidence": key})
            continue
        if key in seen:
            result.skipped.append({"reason": "duplicate", "evidence": key})
            continue
        record_money_bet_event(bet, "cash_confirmed", amount_yen=amount, evidence=key,
                               source=str(row.get("source") or ""), recorded_at=str(row.get("at") or ""),
                               reason="cash row synced from Stripe to freee")
        seen.add(key)
        result.imported += 1
        result.imported_yen += amount
    return result


def funnel_summary(rows: Iterable[Mapping[str, Any]]) -> dict[str, Any]:
    """Aggregate per-platform funnel rows into totals and the stage where flow stops."""

    stages = ("crawled", "proposal_drafted", "applied", "awarded", "delivered")
    totals = {stage: 0 for stage in stages}
    totals["approved_unsent"] = 0
    totals["apply_blocked"] = 0
    platforms: list[dict[str, Any]] = []
    for row in rows:
        item = {"platform": str(row.get("platform") or "unknown")}
        for key in (*stages, "approved_unsent", "apply_blocked"):
            value = int(row.get(key) or 0)
            item[key] = value
            totals[key] += value
        for key in ("last_crawled_at", "last_applied_job_created_at", "last_awarded_at"):
            item[key] = row.get(key)
        platforms.append(item)
    platforms.sort(key=lambda item: item["platform"])
    stop_stage = None
    for previous, current in zip(stages, stages[1:]):
        if totals[previous] > 0 and totals[current] == 0:
            stop_stage = current
            break
    return {"totals": totals, "platforms": platforms, "flow_stops_at": stop_stage}


def _parse_ts(value: Any) -> datetime | None:
    if not value:
        return None
    text = str(value).replace(" ", "T")
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def health_summary(row: Mapping[str, Any] | None, *, now: datetime | None = None) -> dict[str, Any]:
    """Turn the single health row into day-counts since each last activity."""

    if not row:
        return {"available": False}
    current = now or datetime.now(timezone.utc)
    out: dict[str, Any] = {"available": True, "cash_jpy_total": int(row.get("cash_jpy_total") or 0)}
    for key in ("last_cash_at", "last_crowdsource_apply_at", "last_freelancer_bid_at", "last_award_at", "last_lead_event_at"):
        stamp = _parse_ts(row.get(key))
        out[key] = row.get(key)
        out[key.replace("_at", "_days_ago")] = None if stamp is None else max(0, (current - stamp).days)
    for key in ("approved_unsent", "proposals_waiting", "freelancer_proposals_waiting", "outreach_pending_approval", "open_alerts"):
        out[key] = int(row.get(key) or 0)
    return out


def load_ledger_snapshot(source: SupabaseLedgerSource, *, fetch: Fetch | None = None,
                         now: datetime | None = None) -> dict[str, Any]:
    """Read all three views once and return a JSON-serialisable snapshot."""

    cash_rows = fetch_view(source, source.cash_view, fetch=fetch, params={"select": "*", "order": "at.asc"})
    funnel_rows = fetch_view(source, source.funnel_view, fetch=fetch, params={"select": "*"})
    health_rows = fetch_view(source, source.health_view, fetch=fetch, params={"select": "*"})
    return {
        "fetched_at": (now or datetime.now(timezone.utc)).isoformat(timespec="seconds"),
        "source": source.base_url.rstrip("/"),
        "cash_events": cash_rows,
        "funnel": funnel_summary(funnel_rows),
        "health": health_summary(health_rows[0] if health_rows else None, now=now),
    }


def main(argv: Sequence[str] | None = None, *, fetch: Fetch | None = None, stdout: Any = None) -> int:
    parser = argparse.ArgumentParser(prog="guildless-supabase-ledger",
                                     description="Print the read-only Guildless ledger snapshot from Supabase.")
    parser.add_argument("--url", default=os.environ.get("GUILDLESS_SUPABASE_URL"), help="https://<ref>.supabase.co")
    parser.add_argument("--key-env", default="GUILDLESS_SUPABASE_SERVICE_KEY",
                        help="environment variable holding the service-role key (never passed on the command line)")
    args = parser.parse_args(list(argv) if argv is not None else None)
    out = stdout or sys.stdout
    key = os.environ.get(args.key_env, "")
    if not args.url or not key:
        print(json.dumps({"ok": False, "error": f"--url and ${args.key_env} are required"}), file=out)
        return 2
    try:
        snapshot = load_ledger_snapshot(SupabaseLedgerSource(args.url, key), fetch=fetch)
    except (RuntimeError, ValueError, OSError) as exc:
        print(json.dumps({"ok": False, "error": str(exc)}), file=out)
        return 1
    print(json.dumps({"ok": True, **snapshot}, ensure_ascii=False, indent=2, default=str), file=out)
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
