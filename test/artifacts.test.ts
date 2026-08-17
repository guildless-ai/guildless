import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { AssetLedger, compileArtifactRequirements, evaluateQualityGate, publishingPolicyFor } from "../src/artifacts.js";

const base = { business: "Sales", bet: "bet-1", graph: { nodes: [{ capability_id: "publish_web", evidence_source: ["case-1"] }] } };
const requirements = compileArtifactRequirements(base);
assert.equal(requirements[0].delivery_status, "planned");
assert.equal(requirements[0].source.kind, "capability_graph");
assert.equal(publishingPolicyFor("Web"), "production_deployment");
assert.equal(evaluateQualityGate("LP", { automated_tests: { pass: true }, runtime_evidence: { pass: true } }).passed, false);
const ledger = new AssetLedger(join(mkdtempSync(join(tmpdir(), "guildless-artifact-ts-")), "ledger.json"));
const record = ledger.register({ ...requirements[0], artifact_id: "web-1", type: "API", quality_evidence: { automated_tests: { pass: true }, runtime_evidence: { pass: true } }, delivery_status: "ready" });
assert.equal(record.artifact_id, "web-1");
assert.throws(() => ledger.recordMoney("web-1", 100, {}), /evidence/);
assert.equal(ledger.recordMoney("web-1", 100, { source: "bank-1" }).money_outcome.confirmed_cash_yen, 100);
