from __future__ import annotations

import io
import json
import os
import unittest
from datetime import datetime, timezone
from unittest import mock

from guildless_v0.core.money_intelligence import CompanyState, create_money_bet, derive_playbook, money_outcome
from guildless_v0.core.supabase_ledger import (SupabaseLedgerSource, evidence_key, fetch_view, funnel_summary,
                                               health_summary, import_cash_events, load_ledger_snapshot, main)
from tests.test_money_intelligence import case

CASH_ROWS = [
    {"event": "cash_confirmed", "amount": 74800, "currency": "jpy", "at": "2026-06-16 10:43:20+00",
     "source": "incagent-os.freee_synced_charges",
     "evidence": {"stripe_charge_id": "ch_a", "freee_deal_id": 1, "slack_team_id": "T1"}},
    {"event": "cash_confirmed", "amount": 49800, "currency": "jpy", "at": "2026-06-16 10:49:20+00",
     "source": "incagent-os.freee_synced_charges",
     "evidence": {"stripe_charge_id": "ch_b", "freee_deal_id": 2, "slack_team_id": "T1"}},
]

FUNNEL_ROWS = [
    {"platform": "lancers", "crawled": 3955, "proposal_drafted": 400, "approved_unsent": 10, "apply_blocked": 1,
     "applied": 12, "awarded": 0, "delivered": 0, "last_crawled_at": "2026-09-12T00:00:46+00:00",
     "last_applied_job_created_at": "2026-07-05T06:01:22+00:00", "last_awarded_at": None},
    {"platform": "freelancer", "crawled": 5212, "proposal_drafted": 1128, "approved_unsent": 0, "apply_blocked": 0,
     "applied": 53, "awarded": 0, "delivered": 0, "last_crawled_at": "2026-09-12T00:00:21+00:00",
     "last_applied_job_created_at": "2026-07-03T05:27:36+00:00", "last_awarded_at": None},
]

HEALTH_ROW = {
    "observed_at": "2026-09-12T03:30:00+00:00", "last_cash_at": "2026-06-16 10:49:20+00", "cash_jpy_total": 199400,
    "last_crowdsource_apply_at": "2026-07-05 06:01:22+00", "last_freelancer_bid_at": "2026-07-03 05:27:36+00",
    "last_award_at": None, "last_lead_event_at": "2026-06-18 10:30:14+00", "approved_unsent": 36,
    "proposals_waiting": 772, "freelancer_proposals_waiting": 816, "outreach_pending_approval": 2, "open_alerts": 7,
}


def fake_fetch(url: str, headers):
    assert headers["apikey"] == "service-key"
    assert headers["Authorization"] == "Bearer service-key"
    if "/rest/v1/guildless_cash_events" in url:
        return CASH_ROWS
    if "/rest/v1/guildless_gig_funnel" in url:
        return FUNNEL_ROWS
    if "/rest/v1/guildless_pipeline_health" in url:
        return [HEALTH_ROW]
    raise AssertionError(url)


def _bet():
    playbook = derive_playbook([case("ledger-case")], "PRODUCTIZE_EXISTING_SKILL")
    return create_money_bet(CompanyState(cash=0), playbook, offer="service", buyer="buyer", channel="outbound",
                            why_selected=["test"])


class TestSupabaseLedger(unittest.TestCase):
    def test_source_rejects_plain_http_and_missing_key(self) -> None:
        with self.assertRaises(ValueError):
            fetch_view(SupabaseLedgerSource("http://x.supabase.co", "k"), "v", fetch=fake_fetch)
        with self.assertRaises(ValueError):
            fetch_view(SupabaseLedgerSource("https://x.supabase.co", ""), "v", fetch=fake_fetch)

    def test_rest_url_and_headers(self) -> None:
        source = SupabaseLedgerSource("https://x.supabase.co/", "service-key")
        self.assertEqual(source.rest_url("guildless_cash_events", {"select": "*"}),
                         "https://x.supabase.co/rest/v1/guildless_cash_events?select=%2A")
        self.assertNotIn("service-key", json.dumps({k: v for k, v in source.headers().items() if k == "Accept"}))

    def test_evidence_key_is_sorted_and_stable(self) -> None:
        key = evidence_key(CASH_ROWS[0])
        self.assertEqual(key, '{"freee_deal_id":1,"slack_team_id":"T1","stripe_charge_id":"ch_a"}')
        self.assertEqual(evidence_key({"evidence": json.dumps({"b": 1, "a": 2})}), '{"a":2,"b":1}')
        self.assertEqual(evidence_key({"evidence": {}}), "")

    def test_import_cash_events_is_idempotent_and_only_counts_evidenced_jpy(self) -> None:
        bet = _bet()
        first = import_cash_events(bet, CASH_ROWS)
        self.assertEqual((first.imported, first.imported_yen), (2, 124600))
        self.assertEqual(money_outcome(bet)["confirmed_cash_in"], 124600)
        self.assertTrue(money_outcome(bet)["is_money_success"])
        second = import_cash_events(bet, CASH_ROWS + [
            {"amount": 10, "currency": "usd", "evidence": {"stripe_charge_id": "ch_usd"}},
            {"amount": 10, "currency": "jpy", "evidence": {}},
            {"amount": 0, "currency": "jpy", "evidence": {"stripe_charge_id": "zero"}},
            {"amount": "x", "currency": "jpy", "evidence": {"stripe_charge_id": "bad"}},
            {"event": "refund", "amount": 5, "currency": "jpy", "evidence": {"stripe_charge_id": "re"}},
        ])
        self.assertEqual(second.imported, 0)
        self.assertEqual(sorted(item["reason"] for item in second.skipped),
                         ["duplicate", "duplicate", "invalid_amount", "missing_evidence", "non_positive_amount",
                          "not_cash_event", "unsupported_currency:usd"])
        self.assertEqual(money_outcome(bet)["confirmed_cash_in"], 124600)
        cash_events = [e for e in bet.events if e["event"] == "cash_confirmed"]
        self.assertEqual(len(cash_events), 2)
        self.assertTrue(all(e["evidence"] for e in cash_events))

    def test_funnel_summary_reports_where_flow_stops(self) -> None:
        summary = funnel_summary(FUNNEL_ROWS)
        self.assertEqual(summary["totals"]["crawled"], 9167)
        self.assertEqual(summary["totals"]["applied"], 65)
        self.assertEqual(summary["totals"]["awarded"], 0)
        self.assertEqual(summary["flow_stops_at"], "awarded")
        self.assertEqual([p["platform"] for p in summary["platforms"]], ["freelancer", "lancers"])
        self.assertIsNone(funnel_summary([])["flow_stops_at"])

    def test_health_summary_days_ago(self) -> None:
        now = datetime(2026, 9, 12, 3, 30, tzinfo=timezone.utc)
        health = health_summary(HEALTH_ROW, now=now)
        self.assertTrue(health["available"])
        self.assertEqual(health["cash_jpy_total"], 199400)
        self.assertEqual(health["last_cash_days_ago"], 87)
        self.assertEqual(health["last_crowdsource_apply_days_ago"], 68)
        self.assertIsNone(health["last_award_days_ago"])
        self.assertEqual(health["approved_unsent"], 36)
        self.assertEqual(health_summary(None), {"available": False})

    def test_snapshot_and_cli(self) -> None:
        source = SupabaseLedgerSource("https://x.supabase.co", "service-key")
        now = datetime(2026, 9, 12, 3, 30, tzinfo=timezone.utc)
        snapshot = load_ledger_snapshot(source, fetch=fake_fetch, now=now)
        self.assertEqual(len(snapshot["cash_events"]), 2)
        self.assertEqual(snapshot["funnel"]["flow_stops_at"], "awarded")
        self.assertEqual(snapshot["health"]["cash_jpy_total"], 199400)
        self.assertNotIn("service-key", json.dumps(snapshot))

        out = io.StringIO()
        with mock.patch.dict(os.environ, {"GUILDLESS_SUPABASE_SERVICE_KEY": "service-key"}):
            code = main(["--url", "https://x.supabase.co"], fetch=fake_fetch, stdout=out)
        self.assertEqual(code, 0)
        payload = json.loads(out.getvalue())
        self.assertTrue(payload["ok"])
        self.assertEqual(payload["health"]["approved_unsent"], 36)

        out = io.StringIO()
        with mock.patch.dict(os.environ, {"GUILDLESS_SUPABASE_SERVICE_KEY": ""}):
            self.assertEqual(main(["--url", "https://x.supabase.co"], fetch=fake_fetch, stdout=out), 2)


if __name__ == "__main__":
    unittest.main()
