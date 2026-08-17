from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from guildless_v0.core.money_intelligence import (
    CompanyState,
    JsonlMemoryBackend,
    MoneyCase,
    create_money_bet,
    derive_playbook,
    money_outcome,
    load_money_cases,
    rank_strategies,
    record_money_bet_event,
    should_block_build_before_signal,
    validate_money_case,
)


def case(case_id: str, *, audience: int | None = None, playbook_id: str = "PRODUCTIZE_EXISTING_SKILL") -> MoneyCase:
    return MoneyCase(
        case_id=case_id,
        source_urls=[f"https://example.test/{case_id}"],
        source_type="test_fixture",
        founder="fixture founder",
        business="productized service",
        cash_start=0,
        existing_skill=["web development"],
        existing_audience=audience,
        existing_distribution=["direct_outbound"],
        what_was_sold="fixed-scope web service",
        buyer="small business",
        price=300000,
        pricing_model="fixed_price",
        customer_acquisition_channel=["direct_outbound"],
        first_customer_source="cold outreach",
        paid_ads=False,
        ordered_steps=["define offer", "pre-sell", "deliver manually"],
        what_was_built_before_sale="minimum sales artifact",
        first_revenue=300000,
        time_to_first_revenue_days=14,
        evidence_score=0.9,
        confidence=0.8,
        playbook_id=playbook_id,
        evidence=[{"url": f"https://example.test/{case_id}", "span": "explicit fixture evidence"}],
    )


class TestMoneyIntelligence(unittest.TestCase):
    def test_case_requires_provenance_and_keeps_unknowns(self) -> None:
        item = case("case-a")
        self.assertEqual(validate_money_case(item), [])
        self.assertIsNone(item.team_size)
        self.assertTrue(validate_money_case({"case_id": "missing"}))

    def test_playbook_and_zero_cash_strategy_rank(self) -> None:
        playbook = derive_playbook([case("a"), case("b")], "PRODUCTIZE_EXISTING_SKILL")
        paid_ads = derive_playbook([case("c", playbook_id="PAID_ADS")], "PAID_ADS")
        paid_ads.capital_requirement_yen = 300000
        paid_ads.required_distribution = ["paid_ads"]
        company = CompanyState(cash=0, proven_capabilities=["web development"], assets=["existing repo"], distribution=[])
        ranked = rank_strategies(company, [paid_ads, playbook])
        self.assertEqual(ranked[0].playbook_id, "PRODUCTIZE_EXISTING_SKILL")

    def test_audience_changes_strategy_factors(self) -> None:
        book = derive_playbook([case("a")], "PRODUCTIZE_EXISTING_SKILL")
        no_audience = rank_strategies(CompanyState(cash=0, proven_capabilities=["web development"]), [book])[0]
        audience = rank_strategies(CompanyState(cash=0, proven_capabilities=["web development"], audience=200_000), [book])[0]
        self.assertNotEqual(no_audience.factors, audience.factors)

    def test_build_before_signal_blocks_novel_saas(self) -> None:
        blocked, missing = should_block_build_before_signal(
            strategy_kind="novel_saas", buyer=None, pain=None, offer=None, price=None,
            distribution=[], validation_method=None,
        )
        self.assertTrue(blocked)
        self.assertIn("buyer", missing)
        allowed, _ = should_block_build_before_signal(
            strategy_kind="novel_saas", buyer="buyer", pain="pain", offer="offer", price=1000,
            distribution=["outbound"], validation_method="preorder",
        )
        self.assertFalse(allowed)

    def test_contract_does_not_count_as_cash(self) -> None:
        book = derive_playbook([case("a")], "PRODUCTIZE_EXISTING_SKILL")
        bet = create_money_bet(CompanyState(cash=0), book, offer="service", buyer="buyer", channel="outbound", why_selected=["case"])
        record_money_bet_event(bet, "contract", count=1)
        self.assertEqual(money_outcome(bet)["confirmed_cash_in"], 0)
        self.assertFalse(money_outcome(bet)["is_money_success"])
        record_money_bet_event(bet, "cash_confirmed", amount_yen=300000, evidence="bank receipt", time_to_cash_days=10)
        self.assertEqual(money_outcome(bet)["confirmed_cash_in"], 300000)

    def test_memory_backend_reproducible_and_searchable(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            backend = JsonlMemoryBackend(Path(tmp) / "memory.jsonl")
            row_id = backend.append("money_case", {"case_id": "a", "cash_start": None}, source_ids=["source-a"])
            rows = backend.search("money_case", "case_id")
            self.assertEqual(rows[0]["id"], row_id)
            self.assertEqual(rows[0]["value"]["cash_start"], None)

    def test_seed_importer_rejects_unproven_record(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "cases.json"
            path.write_text('{"cases":[{"case_id":"bad"}]}', encoding="utf-8")
            accepted, rejected = load_money_cases(path)
            self.assertEqual(accepted, [])
            self.assertEqual(rejected[0]["case_id"], "bad")


if __name__ == "__main__":
    unittest.main()
