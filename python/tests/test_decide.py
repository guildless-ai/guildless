import io
import json
import tempfile
import unittest
from pathlib import Path

from guildless_v0.core.money_intelligence import CompanyState
from guildless_v0.decide import decide, group_playbooks, main, partition_cases, render


def case(case_id, playbook_id, *, price=29800, days=7, channel=None, evidence_score=0.8):
    return {
        "case_id": case_id,
        "source_urls": ["https://example.com/" + case_id],
        "source_type": "own-run",
        "what_was_sold": "AI phone reception",
        "buyer": "small business owner",
        "price": price,
        "pricing_model": "subscription",
        "customer_acquisition_channel": channel or ["outbound-call"],
        "existing_skill": ["telephony", "saas"],
        "existing_distribution": ["outbound-call"],
        "first_revenue": price,
        "time_to_first_revenue_days": days,
        "evidence_score": evidence_score,
        "confidence": 0.7,
        "evidence": [{"kind": "charge", "ref": "ch_" + case_id}],
        "playbook_id": playbook_id,
    }


class TestDecide(unittest.TestCase):
    def test_a_case_without_a_source_is_dropped_with_its_reason(self):
        kept, dropped = partition_cases([
            case("good", "pb"),
            {"case_id": "bad", "source_type": "own-run", "evidence_score": 0.5},
        ])
        self.assertTrue([c.case_id for c in kept] == ["good"])
        self.assertTrue(dropped[0]["case_id"] == "bad")
        self.assertTrue(any("source_urls" in e for e in dropped[0]["errors"]))


    def test_evidence_score_without_evidence_is_rejected(self):
        _, dropped = partition_cases([{
            "case_id": "x", "source_urls": ["https://e.com"], "source_type": "own-run",
            "evidence_score": 0.9, "evidence": [],
        }])
        self.assertTrue(any("evidence entries are required" in e for e in dropped[0]["errors"]))


    def test_cases_group_into_one_playbook_per_playbook_id(self):
        books = group_playbooks(partition_cases([
            case("a", "warm"), case("b", "warm"), case("c", "cold"),
        ])[0])
        self.assertTrue(sorted(b.playbook_id for b in books) == ["cold", "warm"])
        warm = next(b for b in books if b.playbook_id == "warm")
        self.assertTrue(sorted(warm.supporting_cases) == ["a", "b"])


    def test_a_case_with_no_playbook_id_still_produces_a_playbook(self):
        books = group_playbooks(partition_cases([case("solo", None)])[0])
        self.assertTrue(books[0].playbook_id == "case:solo")


    def test_the_channel_the_company_already_has_wins(self):
        company = CompanyState(cash=0, proven_capabilities=["telephony", "saas"],
                               distribution=["existing-customers"], relationships=["prior buyer"])
        result = decide(company, [
            case("warm1", "warm", channel=["existing-customers"], days=3),
            case("warm2", "warm", channel=["existing-customers"], days=3),
            case("cold1", "cold", channel=["cold-email"], days=60),
        ])
        self.assertTrue(result["decision"]["playbook_id"] == "warm")
        self.assertTrue(result["ranked"][0]["factors"]["buyer_access"] > result["ranked"][-1]["factors"]["buyer_access"])


    def test_no_usable_case_means_no_decision(self):
        result = decide(CompanyState(), [{"case_id": "bad", "source_type": "unknown"}])
        self.assertTrue(result["decision"] is None)
        self.assertTrue(result["cases_used"] == 0)
        self.assertTrue("no decision" in render(result))


    def test_render_names_the_dropped_cases_so_they_are_not_silently_ignored(self):
        result = decide(CompanyState(), [case("ok", "pb"), {"case_id": "bad", "source_type": "unknown"}])
        text = render(result)
        self.assertTrue("drop    bad" in text)
        self.assertTrue("decision" in text)


    def test_main_returns_nonzero_when_nothing_can_be_decided(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "payload.json"
            path.write_text(json.dumps({"company": {}, "cases": []}), encoding="utf-8")
            out = io.StringIO()
            self.assertTrue(main(["--payload", str(path)], out) == 1)
            self.assertTrue("no decision" in out.getvalue())


    def test_main_emits_json_and_succeeds_with_a_valid_case(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "payload.json"
            path.write_text(json.dumps({
                "company": {"cash": 0, "proven_capabilities": ["telephony"], "distribution": ["outbound-call"]},
                "cases": [case("a", "pb")],
            }), encoding="utf-8")
            out = io.StringIO()
            self.assertTrue(main(["--payload", str(path), "--json"], out) == 0)
            parsed = json.loads(out.getvalue())
            self.assertTrue(parsed["decision"]["playbook_id"] == "pb")
