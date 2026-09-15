import assert from "node:assert/strict";
import { test } from "node:test";
import {
  findStalls, moneyCommand, moneyLeads, moneyStatus, planOutreach,
  renderStatus, sendOutreach, summariseCash, summariseLeads, summariseOutreach,
  type FetchLike, type Lead,
} from "../src/orchestrator/money.js";

const ENV = {
  GUILDLESS_SUPABASE_URL: "https://example.supabase.co",
  GUILDLESS_SUPABASE_SERVICE_KEY: "service-key",
  GUILDLESS_MONITOR_SECRET: "secret",
};

function fakeFetch(routes: Record<string, unknown>, calls: Array<{ url: string; init?: RequestInit }> = []): FetchLike {
  return async (url, init) => {
    calls.push({ url, init });
    const key = Object.keys(routes).find((k) => url.includes(k));
    if (!key) return new Response("not found", { status: 404 });
    return new Response(JSON.stringify(routes[key]), { status: 200, headers: { "Content-Type": "application/json" } });
  };
}

test("cash summary counts only JPY and finds the latest event", () => {
  const out = summariseCash([
    { amount: 29800, currency: "JPY", occurred_at: "2026-05-01T00:00:00Z" },
    { amount: "74800", currency: "jpy", occurred_at: "2026-05-28T00:00:00Z" },
    { amount: 999, currency: "USD", occurred_at: "2026-09-01T00:00:00Z" },
  ]);
  assert.equal(out.cashConfirmedJpy, 104600);
  assert.equal(out.cashEvents, 2);
  assert.equal(out.lastCashAt, "2026-05-28T00:00:00Z");
});

test("lead summary counts each contact route and the unreachable ones", () => {
  const out = summariseLeads([
    { business_id: "a", company: "A", email: "a@example.com" },
    { business_id: "b", company: "B", contact_phone: "0312345678" },
    { business_id: "c", company: "C", form_url: "https://example.com/contact" },
    { business_id: "d", company: "D", email: "  ", contact_phone: null, form_url: null },
  ]);
  assert.deepEqual(out, { total: 4, withEmail: 1, withPhone: 1, withForm: 1, noRoute: 1 });
});

test("outreach summary groups by status and channel", () => {
  const out = summariseOutreach([
    { status: "sent", channel: "email" },
    { status: "sent", channel: "call" },
    { status: "queued", channel: "call" },
    { status: "failed", channel: "email" },
  ]);
  assert.equal(out.sent, 2);
  assert.equal(out.queued, 1);
  assert.equal(out.failed, 1);
  assert.deepEqual(out.byChannel, { email: 2, call: 2 });
});

test("outreach sent with no cash is reported as a stall", () => {
  const stalls = findStalls({
    cashConfirmedJpy: 0, cashEvents: 0, lastCashAt: null,
    leads: { total: 10, withEmail: 3, withPhone: 5, withForm: 0, noRoute: 2 },
    outreach: { sent: 25, queued: 0, failed: 0, byChannel: { email: 25 } },
  });
  assert.ok(stalls.some((s) => s.includes("no confirmed cash")));
  assert.ok(stalls.some((s) => s.includes("25 outreach sent with no cash")));
});

test("status reads the three sources and renders them", async () => {
  const status = await moneyStatus(
    { supabaseUrl: "https://example.supabase.co", serviceKey: "k" },
    { fetch: fakeFetch({
      guildless_cash_events: [{ amount: 29800, currency: "JPY", occurred_at: "2026-05-28T00:00:00Z" }],
      reception_leads: [{ business_id: "a", company: "A", email: "a@example.com" }],
      guildless_outreach_log: [{ status: "sent", channel: "email" }],
    }) },
  );
  assert.equal(status.cashConfirmedJpy, 29800);
  assert.equal(status.leads.total, 1);
  assert.equal(status.outreach.sent, 1);
  assert.match(renderStatus(status), /confirmed cash {3}29,800 JPY/);
});

test("leads --missing-route keeps only leads with no way to reach them", async () => {
  const rows: Lead[] = [
    { business_id: "a", company: "A", email: "a@example.com", score: 90 },
    { business_id: "b", company: "B", score: 80 },
  ];
  const out = await moneyLeads(
    { supabaseUrl: "https://example.supabase.co", serviceKey: "k" },
    { fetch: fakeFetch({ reception_leads: rows }) },
    { missingRoute: true },
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].business_id, "b");
});

test("planning drops leads without an email and de-duplicates addresses", () => {
  const plan = planOutreach([
    { business_id: "a", company: "A", email: "x@example.com" },
    { business_id: "b", company: "B", email: "X@Example.com" },
    { business_id: "c", company: "C" },
  ], "camp", "subject", "public business contact");
  assert.equal(plan.recipients.length, 1);
  assert.equal(plan.recipients[0].ref, "a");
});

test("a dry run sends nothing", async () => {
  const calls: Array<{ url: string }> = [];
  const result = await sendOutreach(
    { supabaseUrl: "https://example.supabase.co", serviceKey: "k", monitorSecret: "s" },
    { fetch: fakeFetch({}, calls) },
    { campaign: "c", subject: "s", recipients: [{ email: "a@example.com", company: "A", ref: "a", legal_basis: "l" }] },
    "body",
    true,
  );
  assert.equal(result.accepted, 0);
  assert.equal(result.skipped, 1);
  assert.equal(calls.length, 0);
});

test("sending posts to the send function and reports what it accepted", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const result = await sendOutreach(
    { supabaseUrl: "https://example.supabase.co", serviceKey: "k", monitorSecret: "s" },
    { fetch: fakeFetch({ "functions/v1/guildless-outreach": { ok: true, sent: 1 } }, calls) },
    { campaign: "c", subject: "s", recipients: [{ email: "a@example.com", company: "A", ref: "a", legal_basis: "l" }] },
    "body",
    false,
  );
  assert.equal(result.accepted, 1);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].url.includes("guildless-outreach"));
});

test("sending without the secret refuses rather than half-sending", async () => {
  await assert.rejects(
    () => sendOutreach(
      { supabaseUrl: "https://example.supabase.co", serviceKey: "k" },
      { fetch: fakeFetch({}) },
      { campaign: "c", subject: "s", recipients: [{ email: "a@example.com", company: "A", ref: "a", legal_basis: "l" }] },
      "body",
      false,
    ),
    /GUILDLESS_MONITOR_SECRET/,
  );
});

test("the command refuses to run without credentials", async () => {
  const code = await moneyCommand(["status"], ".", { fetch: fakeFetch({}) }, {});
  assert.equal(code, 2);
});

test("status exits non-zero while the pipeline is stalled", async () => {
  const code = await moneyCommand(["status", "--json"], ".", { fetch: fakeFetch({
    guildless_cash_events: [],
    reception_leads: [],
    guildless_outreach_log: [],
  }) }, ENV);
  assert.equal(code, 1);
});

test("decide hands the payload to the python core and reports its answer verbatim", async () => {
  const seen: string[][] = [];
  const out = await (await import("../src/orchestrator/money.js")).decideStrategy(
    "/repo", ".guildless/money-payload.json", 3,
    async (args) => { seen.push(args); return { stdout: "decision  warm  (proven, score 0.3)\n", code: 0 }; },
  );
  assert.equal(out.code, 0);
  assert.match(out.stdout, /decision {2}warm/);
  assert.deepEqual(seen[0].slice(0, 2), ["-m", "guildless_v0.decide"]);
  assert.ok(seen[0].includes("--top"));
});

test("decide runs without database credentials because it only reads a payload", async () => {
  const code = await moneyCommand(["decide"], ".", {
    fetch: fakeFetch({}),
    runPython: async () => ({ stdout: "decision  warm  (proven, score 0.3)", code: 0 }),
  }, {});
  assert.equal(code, 0);
});

test("decide propagates the exit code when nothing can be decided", async () => {
  const code = await moneyCommand(["decide"], ".", {
    fetch: fakeFetch({}),
    runPython: async () => ({ stdout: "no decision: no case survived validation", code: 1 }),
  }, {});
  assert.equal(code, 1);
});
