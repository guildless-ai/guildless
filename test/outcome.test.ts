import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assessOutcome, referenceIsSafe, renderOutcome, summariseOutcomes,
  type OutcomeEvidence,
} from "../src/orchestrator/outcome.js";

// A complete receipt: every reference present, payment reconciled, costs closed,
// one yen of net, and no owner labour behind it.
function complete(overrides: Partial<OutcomeEvidence> = {}): OutcomeEvidence {
  return {
    decision_id: "d1",
    run_id: "r1",
    buyer_reference: "cus_abc123",
    offer_reference: "prod_abc123",
    delivery_reference: "delivery_0001",
    acceptance_reference: "accept_0001",
    payment_reference: "ch_0001",
    payment_verified: true,
    revenue_yen: 101,
    cost_yen: 100,
    costs_complete: true,
    owner_minutes: 0,
    observed_at: "2026-09-19T00:00:00Z",
    ...overrides,
  };
}

test("an order with no revenue and no cost is not a success", () => {
  const out = assessOutcome({
    decision_id: "d", run_id: "r", buyer_reference: "cus_1", offer_reference: "prod_1",
    revenue_yen: 0, cost_yen: 0,
  });
  assert.equal(out.verdict, "order_observed");
  assert.notEqual(out.verdict, "business_success");
});

test("revenue matched by equal cost is not a success", () => {
  const out = assessOutcome(complete({ revenue_yen: 100, cost_yen: 100 }));
  assert.equal(out.verdict, "order_observed");
  assert.match(out.reasons.join(" "), /net is 0 yen/);
});

test("an unreconciled payment is not a success", () => {
  const out = assessOutcome(complete({ payment_verified: false }));
  assert.equal(out.verdict, "order_observed");
  assert.ok(out.missing.includes("payment_verified"));
});

test("costs that are not known to be complete block a success", () => {
  const out = assessOutcome(complete({ costs_complete: false }));
  assert.equal(out.verdict, "order_observed");
  assert.ok(out.missing.includes("costs_complete"));
});

test("delivery that was never accepted blocks a success", () => {
  const out = assessOutcome(complete({ acceptance_reference: null }));
  assert.equal(out.verdict, "order_observed");
  assert.ok(out.missing.includes("acceptance_reference"));
});

test("a reconciled payment, accepted delivery, closed costs and one yen of net is a success", () => {
  const out = assessOutcome(complete());
  assert.equal(out.verdict, "business_success");
  assert.equal(out.net_yen, 1);
  assert.deepEqual(out.missing, []);
});

test("the same payment reference is not counted twice", () => {
  const totals = summariseOutcomes([complete(), complete()]);
  assert.equal(totals.business_success, 2);
  assert.equal(totals.net_yen, 1);
  assert.deepEqual(totals.duplicate_payment_references, ["ch_0001"]);
});

test("routine owner work disqualifies a success however good the numbers are", () => {
  const out = assessOutcome(complete({ revenue_yen: 500000, cost_yen: 1, owner_minutes: 30 }));
  assert.equal(out.verdict, "order_observed");
  assert.match(out.reasons.join(" "), /30 minutes of routine owner work/);
});

test("with no buyer and no offer there is nothing to reconcile, so it is inconclusive", () => {
  const out = assessOutcome({ decision_id: "d", run_id: "r", revenue_yen: 999999 });
  assert.equal(out.verdict, "inconclusive");
});

test("a reference that looks like a credential is refused", () => {
  assert.equal(referenceIsSafe("ch_0001"), true);
  assert.equal(referenceIsSafe("Bearer sk_live_abc"), false);
  assert.equal(referenceIsSafe("session_cookie=abc"), false);
  assert.equal(referenceIsSafe(""), false);
  assert.equal(referenceIsSafe("x".repeat(201)), false);
});

test("a caller cannot reach success by asserting payment_verified alone", () => {
  const out = assessOutcome({
    decision_id: "d", run_id: "r", buyer_reference: "cus_1", offer_reference: "prod_1",
    payment_verified: true, revenue_yen: 100000, cost_yen: 0, costs_complete: true, owner_minutes: 0,
  });
  assert.equal(out.verdict, "order_observed");
  assert.ok(out.missing.includes("payment_reference"));
  assert.ok(out.missing.includes("delivery_reference"));
});

test("the rendering names what is missing so it can be chased", () => {
  const text = renderOutcome(assessOutcome(complete({ costs_complete: false })));
  assert.match(text, /verdict {3}order_observed/);
  assert.match(text, /missing costs_complete/);
});
