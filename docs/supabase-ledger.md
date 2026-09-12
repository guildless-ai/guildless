# Supabase ledger (read-only)

Guildless does not own a second money database. The company already runs an
operating database on Supabase (project `incagent-os`) that holds crawled gig
postings, generated proposals, outreach drafts, Stripe charges synced to freee,
and monitoring alerts. This module reads that database through three
read-only views and never writes to it.

```text
incagent-os (Supabase)                     Guildless
  freee_synced_charges ─┐
  crowdsource_jobs      ├─ views ─ REST ─▶ supabase_ledger.py ─▶ MoneyBet.cash_confirmed
  freelancer_jobs       │                                    ─▶ funnel / health snapshot
  lead_events, outreach ┘
```

## Views

All three views are created with `security_invoker = true`, `SELECT` is
revoked from `anon` and `authenticated`, and granted to `service_role` only.
No base table is altered.

| View | One row per | Purpose |
|------|-------------|---------|
| `guildless_cash_events` | synced Stripe charge | `cash_confirmed` candidates with evidence `{stripe_charge_id, freee_deal_id, slack_team_id}` |
| `guildless_gig_funnel` | platform (`crowdworks`, `lancers`, `coconala`, `freelancer`) | `crawled → proposal_drafted → applied → awarded → delivered` counts plus `approved_unsent` / `apply_blocked` and last-activity timestamps |
| `guildless_pipeline_health` | single row | last cash, last apply/bid, last award, last lead event, queue sizes, open alerts |

The migration is stored in the Supabase project as
`guildless_readonly_ledger_views`.

## Mapping to Money Intelligence

`import_cash_events(bet, rows)` calls the existing
`record_money_bet_event(bet, "cash_confirmed", amount_yen=..., evidence=...)`
for each row and nothing else. Rules:

- evidence is the sorted JSON of the view's `evidence` object; a row without
  evidence is skipped and reported
- only `jpy` rows are imported; other currencies are skipped, never converted
- non-positive or non-numeric amounts are skipped
- a row whose evidence is already on the bet is skipped (idempotent re-runs)

`funnel_summary(rows)` returns totals per stage and `flow_stops_at`, the first
stage with zero volume after a stage with volume. `health_summary(row)` turns
timestamps into `*_days_ago`.

## Usage

```sh
export GUILDLESS_SUPABASE_SERVICE_KEY=...   # service-role key, never on the command line
python -m guildless_v0.core.supabase_ledger --url https://<ref>.supabase.co
```

Prints one JSON document: `cash_events`, `funnel`, `health`. Exit code 0 on
success, 1 on transport error, 2 on missing configuration. Run from the
`python/` directory or with `PYTHONPATH=python`.

## Boundary

- Read-only: no insert, update, delete, or Edge Function invocation.
- No outreach, bidding, or delivery is triggered from this module.
- Progress numbers in the funnel are never revenue; only rows imported through
  `import_cash_events` move `confirmed_cash_in`.
- The service-role key is read from an environment variable and is not written
  to evidence, logs, or the snapshot.
