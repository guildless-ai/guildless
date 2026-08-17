import json
import tempfile
import unittest
from pathlib import Path

from guildless_v0.core.artifacts import (
    ALLOWED_ARTIFACT_TYPES,
    AssetLedger,
    compile_artifact_requirements,
    evaluate_quality_gate,
    publishing_policy_for,
)
from guildless_v0.core.playbook_compiler import compile_playbook
from guildless_v0.core.money_intelligence import Playbook


def make_playbook() -> Playbook:
    return Playbook(
        playbook_id="PB_ARTIFACT",
        name="Sales proof",
        required_starting_conditions={},
        capital_requirement_yen=0,
        required_skill=["sales"],
        required_distribution=["outbound"],
        expected_time_to_cash_days=14,
        execution_steps=["research", "deliver"],
        money_mechanism="invoice",
        validation_signal=["paid"],
        kill_conditions=[],
        scale_conditions=[],
        supporting_cases=["evidence-1"],
        confidence=0.8,
        provenance=["evidence-1"],
    )


class TestArtifacts(unittest.TestCase):
    def test_allowed_types_are_fixed(self):
        self.assertIn("Campaign Creative", ALLOWED_ARTIFACT_TYPES)
        self.assertNotIn("Secret", ALLOWED_ARTIFACT_TYPES)

    def test_publication_route_is_not_always_github(self):
        self.assertEqual(publishing_policy_for("OSS"), "public_github_release")
        self.assertEqual(publishing_policy_for("Web"), "production_deployment")
        self.assertEqual(publishing_policy_for("PDF"), "file_delivery")

    def test_compile_from_graph_is_planned_and_provenance_carrying(self):
        graph = compile_playbook(make_playbook())
        rows = compile_artifact_requirements(make_playbook(), graph)
        self.assertTrue(rows)
        self.assertTrue(all(row.delivery_status == "planned" for row in rows))
        self.assertTrue(all(row.source.get("kind") == "capability_graph" for row in rows))

    def test_explicit_requirements_win(self):
        graph = compile_playbook(make_playbook())
        rows = compile_artifact_requirements(make_playbook(), graph, [{"artifact_id": "lp-1", "purpose": "sell", "business": "sales", "bet": "bet-1", "type": "LP", "source": {"url": "case"}}])
        self.assertEqual([row.artifact_id for row in rows], ["lp-1"])
        self.assertEqual(rows[0].publishing_policy, "production_deployment")

    def test_self_reported_done_fails(self):
        result = evaluate_quality_gate("OSS", {"self_reported_done": True})
        self.assertFalse(result.passed)

    def test_visual_type_requires_visual_evaluation(self):
        result = evaluate_quality_gate("LP", {"automated_tests": {"pass": True}, "runtime_evidence": {"pass": True}})
        self.assertFalse(result.passed)
        self.assertIn("visual_evaluation_required", result.reasons)

    def test_ledger_register_requires_independent_evidence(self):
        with tempfile.TemporaryDirectory() as tmp:
            ledger = AssetLedger(Path(tmp) / "ledger.json")
            artifact = {"artifact_id": "oss-1", "purpose": "deliver", "business": "sales", "bet": "bet-1", "type": "OSS", "source": {"repo": "x"}, "version": "1.0.0", "preview": {"url": "https://example.test"}, "deployment": {"status": "released"}, "publishing_policy": "public_github_release", "quality_evidence": {"self_reported_done": True}, "delivery_status": "ready", "money_outcome": {"confirmed_cash_yen": 0}}
            with self.assertRaises(ValueError):
                ledger.register(artifact)

    def test_ledger_registers_and_preserves_versions(self):
        with tempfile.TemporaryDirectory() as tmp:
            ledger = AssetLedger(Path(tmp) / "ledger.json")
            base = {"artifact_id": "api-1", "purpose": "deliver", "business": "sales", "bet": "bet-1", "type": "API", "source": {"repo": "x"}, "version": "1.0.0", "preview": {"url": "https://example.test"}, "deployment": {"url": "https://example.test"}, "publishing_policy": "private_repo", "quality_evidence": {"automated_tests": {"pass": True}, "runtime_evidence": {"pass": True}, "independent_reviewer": {"pass": True}}, "delivery_status": "ready", "money_outcome": {"confirmed_cash_yen": 0}}
            ledger.register(base)
            newer = dict(base, version="1.1.0", source={"repo": "y"})
            ledger.register(newer)
            self.assertEqual(ledger.get("api-1")["version"], "1.1.0")
            self.assertEqual(len(ledger.versions("api-1")), 1)

    def test_money_requires_evidence_and_is_separate(self):
        with tempfile.TemporaryDirectory() as tmp:
            ledger = AssetLedger(Path(tmp) / "ledger.json")
            artifact = {"artifact_id": "doc-1", "purpose": "deliver", "business": "sales", "bet": "bet-1", "type": "Document", "source": {"file": "x"}, "version": "1.0.0", "preview": {"path": "x"}, "deployment": {"status": "delivered"}, "publishing_policy": "file_delivery", "quality_evidence": {"independent_reviewer": {"pass": True}}, "delivery_status": "ready", "money_outcome": {"confirmed_cash_yen": 0}}
            ledger.register(artifact)
            with self.assertRaises(ValueError):
                ledger.record_money("doc-1", 100, {})
            updated = ledger.record_money("doc-1", 100, {"source": "bank-statement-1"})
            self.assertEqual(updated["money_outcome"]["confirmed_cash_yen"], 100)


if __name__ == "__main__":
    unittest.main()
