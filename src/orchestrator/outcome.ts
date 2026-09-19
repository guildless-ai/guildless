// Outcome evidence: the receipt that connects a decision to what actually happened.
//
// An observed order is sales progress, not business success. Success is only claimed
// when a third party's payment is reconciled against a payment record, the delivery was
// accepted, the costs are known to be complete, the net is at least one yen, and no
// routine owner labour was needed to produce it. Anything short of that is inconclusive,
// which is a state to act on, not a failure to hide.
//
// References are identifiers only. Secrets, raw database rows and third-party post
// bodies are never copied in here: a reference is enough to reconcile against the
// system that holds the real record.

export type OutcomeVerdict = "business_success" | "order_observed" | "inconclusive";

export interface OutcomeEvidence {
  decision_id: string;
  run_id: string;
  buyer_reference?: string | null;
  offer_reference?: string | null;
  delivery_reference?: string | null;
  acceptance_reference?: string | null;
  payment_reference?: string | null;
  payment_verified?: boolean;
  revenue_yen?: number;
  cost_yen?: number;
  costs_complete?: boolean;
  owner_minutes?: number;
  observed_at?: string;
}

export interface OutcomeAssessment {
  verdict: OutcomeVerdict;
  net_yen: number;
  missing: string[];
  reasons: string[];
}

const SECRET_HINT = /key|token|secret|password|cookie|authorization|bearer/i;

/** A reference must identify a record, not carry one. */
export function referenceIsSafe(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 200) return false;
  if (SECRET_HINT.test(trimmed)) return false;
  if (/\s{2,}|\n/.test(trimmed)) return false;
  return true;
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * Decide what an outcome may be called.
 *
 * `order_observed` says a buyer placed an order and nothing more. It never becomes
 * `business_success` on its own, however large the reported revenue, because a number
 * a caller supplied is not a payment that has been reconciled.
 */
export function assessOutcome(evidence: OutcomeEvidence): OutcomeAssessment {
  const revenue = num(evidence.revenue_yen);
  const cost = num(evidence.cost_yen);
  const net = revenue - cost;
  const missing: string[] = [];
  const reasons: string[] = [];

  if (!referenceIsSafe(evidence.payment_reference)) missing.push("payment_reference");
  if (evidence.payment_verified !== true) missing.push("payment_verified");
  if (!referenceIsSafe(evidence.delivery_reference)) missing.push("delivery_reference");
  if (!referenceIsSafe(evidence.acceptance_reference)) missing.push("acceptance_reference");
  if (evidence.costs_complete !== true) missing.push("costs_complete");

  if (net < 1) reasons.push(`net is ${net} yen, which is below the one yen the goal requires`);
  if (num(evidence.owner_minutes) > 0) reasons.push(`${num(evidence.owner_minutes)} minutes of routine owner work were needed`);

  const ordered = referenceIsSafe(evidence.buyer_reference) || referenceIsSafe(evidence.offer_reference);

  if (!missing.length && !reasons.length) {
    return { verdict: "business_success", net_yen: net, missing, reasons: ["payment reconciled, delivery accepted, costs complete, net positive, no owner labour"] };
  }
  if (ordered) {
    return {
      verdict: "order_observed",
      net_yen: net,
      missing,
      reasons: reasons.length ? reasons : ["an order was observed; the evidence chain is not complete"],
    };
  }
  return {
    verdict: "inconclusive",
    net_yen: net,
    missing,
    reasons: reasons.length ? reasons : ["no buyer or offer reference, so there is nothing to reconcile"],
  };
}

export interface LedgerTotals {
  business_success: number;
  order_observed: number;
  inconclusive: number;
  net_yen: number;
  duplicate_payment_references: string[];
}

/**
 * Fold a run of outcomes into totals. A payment reference that appears twice is counted
 * once: the same money arriving in the ledger twice would read as growth that never
 * happened.
 */
export function summariseOutcomes(entries: OutcomeEvidence[]): LedgerTotals {
  const totals: LedgerTotals = { business_success: 0, order_observed: 0, inconclusive: 0, net_yen: 0, duplicate_payment_references: [] };
  const counted = new Set<string>();
  for (const entry of entries) {
    const assessment = assessOutcome(entry);
    totals[assessment.verdict] += 1;
    const ref = typeof entry.payment_reference === "string" ? entry.payment_reference.trim() : "";
    if (assessment.verdict !== "business_success") continue;
    if (ref && counted.has(ref)) {
      totals.duplicate_payment_references.push(ref);
      continue;
    }
    if (ref) counted.add(ref);
    totals.net_yen += assessment.net_yen;
  }
  return totals;
}

export function renderOutcome(assessment: OutcomeAssessment): string {
  const lines = [`verdict   ${assessment.verdict}`, `net       ${assessment.net_yen} JPY`];
  for (const reason of assessment.reasons) lines.push(`  why     ${reason}`);
  for (const item of assessment.missing) lines.push(`  missing ${item}`);
  return lines.join("\n");
}
