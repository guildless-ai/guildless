from __future__ import annotations

import unittest

from guildless_v0.core.money_intelligence import CompanyState, MoneyBet, Playbook, money_outcome
from guildless_v0.core.playbook_compiler import (
    AutonomousDiscoveryEngine,
    DiscoveryCandidate,
    JsonCapabilityRegistry,
    compile_playbook,
    compute_capability_gap,
    evaluate_candidate,
    procure_capability_gaps,
    record_playbook_metric,
)


def playbook() -> Playbook:
    return Playbook(
        playbook_id="PROVEN_YOUTUBE",
        name="Proven YouTube",
        required_starting_conditions={"cash": 0},
        capital_requirement_yen=0,
        required_skill=["script_video"],
        required_distribution=["youtube"],
        expected_time_to_cash_days=30,
        execution_steps=["research_topic", "publish_youtube", "analyze_youtube"],
        money_mechanism="product_sale",
        validation_signal=["qualified lead"],
        kill_conditions=["no buyer signal"],
        scale_conditions=["confirmed cash"],
        supporting_cases=["case-youtube-1"],
        confidence=0.9,
        provenance=["https://example.test/case-youtube-1"],
        capability_specs={
            "strategy": [{"capability_id": "research_topic", "evidence_source": ["case-youtube-1"], "success_metric": "topic selected"}],
            "distribution": [{"capability_id": "publish_youtube", "evidence_source": ["case-youtube-1"], "success_metric": "published"}],
            "production": [{"capability_id": "generate_voice", "evidence_source": ["case-youtube-1"], "success_metric": "voice rendered", "fallback": ["manual voice"]}],
            "monetization": [{"capability_id": "product_sale", "evidence_source": ["case-youtube-1"], "success_metric": "cash_confirmed"}],
            "operational": [{"capability_id": "measure_outcome", "evidence_source": ["case-youtube-1"], "success_metric": "cash and cost recorded"}],
        },
    )


class FixtureProvider:
    name = "fixture-provider"

    def __init__(self, candidate: DiscoveryCandidate | None):
        self.candidate = candidate

    def discover(self, gap):
        if self.candidate is None:
            return []
        return [self.candidate]


def candidate(capability_id: str, *, good: bool = True) -> DiscoveryCandidate:
    return DiscoveryCandidate(
        capability_id=capability_id,
        provider="fixture",
        source="github",
        name="fixture-adapter",
        license="MIT" if good else None,
        commercial_use=True if good else None,
        maintenance_score=0.9,
        platform_compatibility=0.95,
        cost_yen_per_run=0,
        quality_score=0.85,
        runtime="python3.11",
        security_score=0.9,
        integration_difficulty=0.2,
        docs_url="https://example.test/docs",
        evidence=("https://example.test/license", "https://example.test/test"),
        verified=good,
        test_passed=good,
        benchmark_score=0.8,
        interface_version=None,
    )


class TestPlaybookCompiler(unittest.TestCase):
    def test_compile_has_all_five_capability_categories_and_money_gate(self):
        graph = compile_playbook(playbook())
        self.assertEqual({node.category for node in graph.nodes}, {"strategy", "distribution", "production", "monetization", "operational"})
        self.assertEqual(graph.nodes[0].evidence_source, ["case-youtube-1"])
        self.assertEqual(graph.money_outcome["success_metric"], "cash_confirmed")
        self.assertEqual(len(graph.edges), len(graph.nodes) - 1)

    def test_gap_is_computed_against_ready_registry(self):
        graph = compile_playbook(playbook())
        registry = JsonCapabilityRegistry([{"id": "research_topic", "status": "ready"}])
        gaps = compute_capability_gap(graph, registry)
        ids = {gap.node_id for gap in gaps}
        self.assertNotIn("research_topic", ids)
        self.assertIn("generate_voice", ids)

    def test_candidate_gate_rejects_unknown_license(self):
        evaluation = evaluate_candidate(candidate("generate_voice", good=False))
        self.assertFalse(evaluation.eligible)
        self.assertIn("license_unknown", evaluation.reasons)
        self.assertIn("verification_incomplete", evaluation.reasons)

    def test_autonomous_procurement_registers_only_verified_candidate(self):
        graph = compile_playbook(playbook(), {"production": [{"capability_id": "generate_voice", "evidence_source": ["case-youtube-1"], "success_metric": "voice rendered"}]})
        registry = JsonCapabilityRegistry()
        discovery = AutonomousDiscoveryEngine([FixtureProvider(candidate("generate_voice"))])
        result = procure_capability_gaps(graph, registry, discovery)
        self.assertTrue(result.ready)
        self.assertTrue(registry.has_ready("generate_voice"))
        self.assertTrue(result.registered[0]["adapter"]["generated"])
        self.assertEqual(result.to_dict()["external_effects"], "none")

    def test_unresolved_gap_keeps_playbook_fallback(self):
        graph = compile_playbook(playbook(), {"production": [{"capability_id": "edit_video", "fallback": ["manual edit"], "evidence_source": ["case-youtube-1"], "success_metric": "edited"}]})
        result = procure_capability_gaps(graph, JsonCapabilityRegistry(), AutonomousDiscoveryEngine([FixtureProvider(None)]))
        self.assertFalse(result.ready)
        self.assertEqual(result.unresolved[0]["fallback"], ["manual edit"])

    def test_progress_metrics_never_count_as_money(self):
        bet = MoneyBet("bet-1", CompanyState(cash=0).to_dict(), "PROVEN_YOUTUBE", [], None, None, None)
        record_playbook_metric(bet, "videos_uploaded", 3)
        self.assertEqual(money_outcome(bet)["outcome_metrics"]["videos_uploaded"], 3)
        self.assertFalse(money_outcome(bet)["is_money_success"])


if __name__ == "__main__":
    unittest.main()
