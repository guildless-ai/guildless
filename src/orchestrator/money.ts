// guildless money — the revenue loop as a command instead of hand-run queries.
//
// Reads the company's real state from the operating database (Supabase) and acts on it:
//   status    what cash is confirmed, what the funnel holds, where the pipeline is stalled
//   leads     which leads are missing a contact route, so sourcing has a target
//   outreach  send one campaign to the leads that have an email, through the existing
//             send function, which records every recipient and never sends twice
//
// Every network call goes through an injected fetch so the whole command is testable
// without touching the network. Leads, replies and meetings are not revenue: only
// cash_confirmed rows count, and status reports them separately from everything else.

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface MoneyEnv {
  supabaseUrl: string;
  serviceKey: string;
  monitorSecret?: string;
}

export interface MoneyDeps {
  fetch: FetchLike;
  now?: () => Date;
}

export interface CashEvent {
  evidence_id?: string;
  amount?: number | string;
  currency?: string;
  occurred_at?: string;
  source?: string;
}

export interface Lead {
  business_id: string;
  company: string;
  job_title?: string;
  location?: string;
  score?: number;
  email?: string | null;
  contact_phone?: string | null;
  form_url?: string | null;
  sales_stage?: string | null;
  reason?: string | null;
}

export interface MoneyStatus {
  cashConfirmedJpy: number;
  cashEvents: number;
  lastCashAt: string | null;
  leads: { total: number; withEmail: number; withPhone: number; withForm: number; noRoute: number };
  outreach: { sent: number; queued: number; failed: number; byChannel: Record<string, number> };
  stalled: string[];
}

export interface OutreachPlan {
  campaign: string;
  subject: string;
  recipients: Array<{ email: string; company: string; ref: string; legal_basis: string }>;
}

export interface OutreachResult extends OutreachPlan {
  dryRun: boolean;
  accepted: number;
  skipped: number;
  detail?: unknown;
}

function envOf(source: Record<string, string | undefined>): MoneyEnv {
  return {
    supabaseUrl: (source.GUILDLESS_SUPABASE_URL ?? "").replace(/\/$/, ""),
    serviceKey: source.GUILDLESS_SUPABASE_SERVICE_KEY ?? "",
    monitorSecret: source.GUILDLESS_MONITOR_SECRET,
  };
}

async function rest<T>(env: MoneyEnv, deps: MoneyDeps, query: string): Promise<T[]> {
  const res = await deps.fetch(`${env.supabaseUrl}/rest/v1/${query}`, {
    headers: { apikey: env.serviceKey, Authorization: `Bearer ${env.serviceKey}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`supabase ${query.split("?")[0]} ${res.status}`);
  return (await res.json()) as T[];
}

function toAmount(value: unknown): number {
  const n = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(n) ? n : 0;
}

export function summariseCash(rows: CashEvent[]): Pick<MoneyStatus, "cashConfirmedJpy" | "cashEvents" | "lastCashAt"> {
  const jpy = rows.filter((row) => (row.currency ?? "JPY").toUpperCase() === "JPY");
  let total = 0;
  let last: string | null = null;
  for (const row of jpy) {
    total += toAmount(row.amount);
    const at = row.occurred_at ?? null;
    if (at && (!last || at > last)) last = at;
  }
  return { cashConfirmedJpy: total, cashEvents: jpy.length, lastCashAt: last };
}

export function summariseLeads(rows: Lead[]): MoneyStatus["leads"] {
  const has = (v: unknown) => typeof v === "string" && v.trim() !== "";
  let withEmail = 0, withPhone = 0, withForm = 0, noRoute = 0;
  for (const row of rows) {
    const e = has(row.email), p = has(row.contact_phone), f = has(row.form_url);
    if (e) withEmail++;
    if (p) withPhone++;
    if (f) withForm++;
    if (!e && !p && !f) noRoute++;
  }
  return { total: rows.length, withEmail, withPhone, withForm, noRoute };
}

export function summariseOutreach(rows: Array<{ status?: string; channel?: string }>): MoneyStatus["outreach"] {
  const byChannel: Record<string, number> = {};
  let sent = 0, queued = 0, failed = 0;
  for (const row of rows) {
    const channel = row.channel ?? "unknown";
    byChannel[channel] = (byChannel[channel] ?? 0) + 1;
    if (row.status === "sent") sent++;
    else if (row.status === "queued") queued++;
    else if (row.status === "failed") failed++;
  }
  return { sent, queued, failed, byChannel };
}

// A stalled pipeline is the thing worth saying out loud: money only appears if some
// stage can still move, so name the stages that cannot.
export function findStalls(status: Omit<MoneyStatus, "stalled">): string[] {
  const stalls: string[] = [];
  if (status.cashEvents === 0) stalls.push("no confirmed cash recorded");
  if (status.leads.total === 0) stalls.push("no leads: sourcing has produced nothing");
  else if (status.leads.withEmail === 0) stalls.push("no lead has an email: the mail channel has nothing to send to");
  if (status.leads.total > 0 && status.leads.noRoute === status.leads.total) stalls.push("no lead has any contact route at all");
  if (status.outreach.sent > 0 && status.cashEvents === 0) stalls.push(`${status.outreach.sent} outreach sent with no cash: the offer or the audience is wrong`);
  return stalls;
}

export async function moneyStatus(env: MoneyEnv, deps: MoneyDeps): Promise<MoneyStatus> {
  const [cash, leads, outreach] = await Promise.all([
    rest<CashEvent>(env, deps, "guildless_cash_events?select=evidence_id,amount,currency,occurred_at,source"),
    rest<Lead>(env, deps, "reception_leads?select=business_id,company,email,contact_phone,form_url,sales_stage,score"),
    rest<{ status?: string; channel?: string }>(env, deps, "guildless_outreach_log?select=status,channel"),
  ]);
  const base = { ...summariseCash(cash), leads: summariseLeads(leads), outreach: summariseOutreach(outreach) };
  return { ...base, stalled: findStalls(base) };
}

export async function moneyLeads(env: MoneyEnv, deps: MoneyDeps, opts: { limit?: number; missingRoute?: boolean } = {}): Promise<Lead[]> {
  const limit = Math.min(Math.max(opts.limit ?? 25, 1), 200);
  const rows = await rest<Lead>(env, deps, `reception_leads?select=business_id,company,job_title,location,score,email,contact_phone,form_url,sales_stage,reason&order=score.desc&limit=${limit * 4}`);
  const has = (v: unknown) => typeof v === "string" && v.trim() !== "";
  const filtered = opts.missingRoute
    ? rows.filter((row) => !has(row.email) && !has(row.contact_phone) && !has(row.form_url))
    : rows;
  return filtered.slice(0, limit);
}

export function planOutreach(leads: Lead[], campaign: string, subject: string, legalBasis: string): OutreachPlan {
  const seen = new Set<string>();
  const recipients: OutreachPlan["recipients"] = [];
  for (const lead of leads) {
    const email = (lead.email ?? "").trim();
    if (!email || seen.has(email.toLowerCase())) continue;
    seen.add(email.toLowerCase());
    recipients.push({ email, company: lead.company, ref: lead.business_id, legal_basis: legalBasis });
  }
  return { campaign, subject, recipients };
}

export async function sendOutreach(
  env: MoneyEnv,
  deps: MoneyDeps,
  plan: OutreachPlan,
  body: string,
  dryRun: boolean,
): Promise<OutreachResult> {
  if (!plan.recipients.length) return { ...plan, dryRun, accepted: 0, skipped: 0, detail: "no recipient has an email" };
  if (dryRun) return { ...plan, dryRun: true, accepted: 0, skipped: plan.recipients.length, detail: "dry run: nothing sent" };
  if (!env.monitorSecret) throw new Error("GUILDLESS_MONITOR_SECRET is required to send");
  const res = await deps.fetch(`${env.supabaseUrl}/functions/v1/guildless-outreach?key=${encodeURIComponent(env.monitorSecret)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.serviceKey}` },
    body: JSON.stringify({ campaign: plan.campaign, subject: plan.subject, text: body, recipients: plan.recipients }),
  });
  const detail = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`outreach ${res.status}`);
  const accepted = Number((detail as { sent?: number })?.sent ?? plan.recipients.length);
  return { ...plan, dryRun: false, accepted, skipped: plan.recipients.length - accepted, detail };
}

function flag(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

export function renderStatus(status: MoneyStatus): string {
  const lines = [
    `confirmed cash   ${status.cashConfirmedJpy.toLocaleString("en-US")} JPY across ${status.cashEvents} event(s)`,
    `last cash        ${status.lastCashAt ?? "never"}`,
    `leads            ${status.leads.total} total / ${status.leads.withEmail} email / ${status.leads.withPhone} phone / ${status.leads.withForm} form / ${status.leads.noRoute} unreachable`,
    `outreach         ${status.outreach.sent} sent / ${status.outreach.queued} queued / ${status.outreach.failed} failed`,
  ];
  if (status.stalled.length) {
    lines.push("stalled:");
    for (const stall of status.stalled) lines.push(`  - ${stall}`);
  } else {
    lines.push("stalled: nothing");
  }
  return lines.join("\n");
}

export async function moneyCommand(
  argv: string[],
  cwd = process.cwd(),
  deps: MoneyDeps = { fetch: globalThis.fetch as FetchLike },
  source: Record<string, string | undefined> = process.env,
): Promise<number> {
  void cwd;
  const env = envOf(source);
  const json = argv.includes("--json");
  if (!env.supabaseUrl || !env.serviceKey) {
    console.error("set GUILDLESS_SUPABASE_URL and GUILDLESS_SUPABASE_SERVICE_KEY");
    return 2;
  }
  const sub = argv[0] ?? "status";
  try {
    if (sub === "status") {
      const status = await moneyStatus(env, deps);
      console.log(json ? JSON.stringify(status, null, 2) : renderStatus(status));
      return status.stalled.length ? 1 : 0;
    }
    if (sub === "leads") {
      const rows = await moneyLeads(env, deps, {
        limit: Number.parseInt(flag(argv, "--limit") ?? "25", 10),
        missingRoute: argv.includes("--missing-route"),
      });
      if (json) console.log(JSON.stringify(rows, null, 2));
      else for (const row of rows) console.log(`${String(row.score ?? 0).padStart(3)}  ${row.company}  ${row.email ?? row.contact_phone ?? row.form_url ?? "no route"}`);
      return rows.length ? 0 : 1;
    }
    if (sub === "outreach") {
      const campaign = flag(argv, "--campaign");
      const subject = flag(argv, "--subject");
      const body = flag(argv, "--body");
      if (!campaign || !subject || !body) {
        console.error("usage: guildless money outreach --campaign <name> --subject <s> --body <text> [--send]");
        return 2;
      }
      const leads = await moneyLeads(env, deps, { limit: 200 });
      const plan = planOutreach(leads, campaign, subject, flag(argv, "--legal-basis") ?? "public business contact");
      const result = await sendOutreach(env, deps, plan, body, !argv.includes("--send"));
      console.log(json ? JSON.stringify(result, null, 2) : `${result.dryRun ? "dry run" : "sent"}: ${result.accepted} accepted, ${result.skipped} skipped, ${result.recipients.length} addressable`);
      return result.recipients.length ? 0 : 1;
    }
    console.error("usage: guildless money status|leads|outreach");
    return 2;
  } catch (error) {
    console.error(`money: ${(error as Error).message}`);
    return 1;
  }
}
