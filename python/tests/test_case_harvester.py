from __future__ import annotations

import unittest

from guildless_v0.core.case_harvester import evaluate_case_evidence
from guildless_v0.tests.test_money_intelligence import case


class TestCaseHarvester(unittest.TestCase):
    def test_evidence_gate_accepts_specific_case(self) -> None:
        gate = evaluate_case_evidence(case("specific"))
        self.assertTrue(gate.accepted)

    def test_evidence_gate_downgrades_hidden_advantage(self) -> None:
        item = case("hidden")
        item.hidden_advantages = ["large undisclosed audience"]
        gate = evaluate_case_evidence(item)
        self.assertFalse(gate.accepted)
        self.assertIn("hidden advantages", " ".join(gate.reasons))


if __name__ == "__main__":
    unittest.main()
