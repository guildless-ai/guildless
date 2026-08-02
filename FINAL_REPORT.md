# FINAL_REPORT.md

## Deliverable

`guildless verify` — a TypeScript CLI completion gate.

A working implementation already existed in the repository. This task
completed it to the requested specification: verified the existing gates,
added the missing lint tooling, fixed the contract-error reporting, extended
test coverage, and verified the CLI end-to-end. **No git commit was made.**

## Feature checklist

| Feature              | Status | Notes |
|----------------------|--------|-------|
| `guildless verify`   | DONE   | bin `dist/cli.js`; `--config`, `--json`, `--verbose`, `--quiet`, `--help` flags |
| Git clean check      | DONE   | `git status --porcelain`; untracked+tracked changes reject; `.guildless` excluded; shows change count |
| `guildless.yml` load | DONE   | typed YAML contract with validation; default discovery |
| Build/test execution | DONE   | `commands` from contract run via shell, must exit 0 |
| URL check            | DONE   | expected HTTP status, timeout, manual redirects; duration in details |
| Output modes         | DONE   | normal (concise ≤20 lines) / `--verbose` / `--json` / `--quiet` |
| Evidence storage     | DONE   | full evidence saved to `.guildless/runs/<run-id>/evidence.json` every run |
| Exit codes           | DONE   | 0 accepted / 1 rejected / 2 usage error |

## Mandatory documents

- `PLAN.md`
- `REVIEW.md`
- `FINAL_REPORT.md` (this file)

## Gate results (final)

| Gate  | Command        | Result                 |
|-------|----------------|------------------------|
| build | `npm run build`| PASS (tsc, exit 0)      |
| test  | `npm test`     | PASS 24/24 (exit 0)     |
| lint  | `npm run lint` | PASS (exit 0)           |
| check | `npm run check`| PASS (exit 0)           |

Node v22.17.1, npm 10.9.2, Windows 10 (PowerShell 5.1).

## End-to-end verification performed

1. **ACCEPTED scenario** — temp git repo with committed `guildless.yml`
   (2 passing commands, loopback HTTP stub returning 204, declared scope):
   - Text report: `GUILDLESS: ACCEPTED`, all 5 checks `✓`, exit 0.
   - JSON report: `accepted: true` with per-check `id/ok/summary/detail`, exit 0.
2. **REJECTED scenario** — dirty tree + unresolvable commit + failing command +
   dead URL:
   - All four gates failed individually (`✗`), `unverified-scope` passed,
     exit 1.
3. **Usage** — wrong subcommand exit 2; `--help` exit 0.
4. **Default config discovery** — ran without `--config`; found `guildless.yml`.
5. **Invalid contract** — rejected with `"id": "contract"` in JSON, exit 1.

## Changes made in this task

- `eslint.config.mjs` (new) — flat config; `@eslint/js` + `typescript-eslint`.
- `package.json` — added `lint` script; devDeps `eslint`, `@eslint/js`,
  `typescript-eslint`.
- `src/checks/types.ts` — added `"contract"` to the check-id union.
- `src/cli.ts` — contract errors now use the `contract` id.
- `test/contract.test.ts` (new) — 4 tests for contract validation.
- `PLAN.md`, `REVIEW.md`, `FINAL_REPORT.md` (new).

## 未検証範囲 (Unverified scope)

The following were **not** verified and remain open:

- **Global/`npx` install path** — the binary was executed via
  `node dist/cli.js`, not through an installed `npx guildless` / global link;
  npm packaging (`files`, `bin`) was not exercised.
- **GitHub Actions CI** — `.github/ci.example.yml` was not executed on a real
  runner; only equivalent local commands were run.
- **Non-Windows platforms** — all gates ran on Windows (PowerShell 5.1,
  cmd shell for `commands`). macOS/Linux shell behavior (quoting, path
  handling) untested.
- **Real internet URL** — HTTP checks used loopback stubs; external/redirected
  endpoints, TLS/CA edge cases, and real timeout behavior untested.
- **Large output** — command output is unbounded in memory; a command emitting
  extreme output was not stress-tested.
- **Hostile/arbitrary command contracts** — `shell: true` execution of
  user-supplied commands was not security-reviewed beyond the tool's own
  documented purpose.
- **git submodules / partial clones / unusual git configs** — `git status`
  and `rev-parse` edge cases not covered.
- **Long-lived behavior** — no soak/parallel-run testing.
- **Truthfulness of `unverifiedScope`** — the gate confirms a declaration
  exists; it cannot prove the declaration is accurate.

## Conclusion

`guildless verify` is implemented and verified: build, test, and lint all pass,
the CLI behaves correctly across accepted/rejected/usage scenarios, and the
three mandatory documents are present. No commit was created as instructed.

## Addendum: cross-review scheduler (`guildless orchestrate`)

Implemented the requested next feature: a cross-review scheduler that replaces
the serial Planner→Builder→Reviewer flow with parallel builders plus a mutual
review matrix, machine arbitration, and per-run evidence.

### Design (matches the requested shape)

- **Roles**: Planner → N Builders (parallel) → cross-review matrix →
  consensus → Fixers (parallel, bounded rounds) → Breaker → machine Verifier.
- **No self-review**: reviewer `i` never reviews builder `i`; each Builder's
  output is reviewed by the other reviewers. 3×3 matrix = 6 reviews.
- **Review perspectives**: bugs/requirements, security/permissions, test
  coverage/error paths — aggregated into a deduplicated consensus (severity,
  report count, focuses).
- **Machine arbitration**: final verdict comes only from the mechanical
  verifier (commands, `git diff --check`, HTTP), never from agent opinion.
- **Bounded retry**: `max_fix_rounds` (default 2) caps both review fixes and
  verification-failure fixes.
- **UI**: status board only (`Planner ✓ / Builders 3/3 / Reviews 6 / Fix round
  1/2 / Breaker ✓ / Verifier PASS`); agent wall-climbing output is hidden.
- **Evidence**: full run state saved to `.guildless/runs/<run-id>/evidence.json`.

### Agents

Agents are subprocesses using a JSON file protocol (`--input`/`--output`).
Built-in demo agents ship in `dist/orchestrator/agents/*`; `agent_commands`
can point at real LLM CLIs (e.g. `claude -p`). Deterministic fixture agents
under `test/fixtures/agents/*.cjs` drive the tests.

### Gate results (after the feature)

| Gate  | Result                     |
|-------|----------------------------|
| build | PASS (tsc, exit 0)          |
| test  | PASS 24/24 (exit 0)         |
| lint  | PASS (exit 0)               |
| check | PASS (exit 0)               |

### Verified end-to-end

- Default demo agents: `orchestrate` in a temp repo → 3 builders in parallel,
  6 cross-reviews, breaker counterexample test, verify PASS, **ACCEPTED**, exit 0.
- Fix loop: fixture agents flag `src/task-a.ts` → Fixer writes marker → re-review
  clean → **Fix round 1/2**, ACCEPTED. (Initial race on shared scratch files was
  found by repeated runs and fixed by unique per-review run ids.)
- Verification-fix loop: verifier gate fixed by a Fixer within 1 round → ACCEPTED.
- Bounded rejection: un-fixable verifier → REJECTED, exit 1.
- Matrix invariants: no self-review, each builder reviewed `minimum_reviews_per_task`
  times, duplicate findings collapsed into one consensus entry.
- Planner/agent failure → fail-closed REJECTED with recorded error.
- `--json` / `--quiet` / status board render correctly; missing config exits 2.

### 未検証範囲 (Unverified scope, additional)

- **Real LLM agents** — the scheduler was exercised with built-in/fixture
  agents; actual `claude`/`codex`/`gemini` CLIs were not invoked. Prompt
  quality and agent failure modes under real models are untested.
- **Playwright / DB assertions** — named as external measurements but not yet
  implemented; only commands, `git diff --check`, and HTTP checks are wired.
- **Concurrency stress** — parallel builders/reviewers were race-fixed, but no
  soak test under high agent counts or slow agents was run.
- **Non-Windows agent spawning** — `shell: true` behavior on macOS/Linux
  untested.
- **Security of arbitrary `agent_commands` / `verification.commands`** — these
  execute with shell semantics by design; not hardened for untrusted input.

## Addendum: real-DeepSeek validation (Task C)

Connected the orchestrator to a real DeepSeek model and ran a human-free
bug-fix task. Branch: `real-llm-agents` (baseline `5752250` on `main` was
committed and pushed as instructed).

### Adapter

`adapters/deepseek-agent.js` — spawns `opencode run --model opencode/deepseek-v4-flash-free
--format json`, receives a single JSON object (file or stdin) and returns the
orchestrator JSON schema plus `meta` (model, input/output tokens, elapsed, cost).
Added a stdin/stdout agent protocol to the orchestrator (`runAgent` pipe mode)
and per-agent metric collection shown on the status board.

### Task C (existing-code fix)

Small JS repo with two injected bugs (`add()` uses `-`, `join()` drops the
separator); tests initially failed 2/4.

| Stage | Result |
|-------|--------|
| Planner | ✓ 2 tasks (src/mathlib.js, src/strings.js) |
| Builders | 2/2 — actually fixed `add` and `join`, added regression tests |
| Reviews | 12 cross-reviews, 5 consensus findings (real: null-separator coercion, brittle IEEE-754 assertion, untested error paths) |
| Fix round | 2/2 |
| Breaker | ✓ appended 13 regression tests (6+7), all 52 tests pass |
| Verifier | PASS — `npm test` 52/52, `git diff --check` ok |
| **Verdict** | **ACCEPTED (exit 0)** |

Metrics: 26 agents, 101,532 in / 26,047 out tokens, elapsed 6m45s, cost $0 (free tier).

### Real-LLM failures that were found and fixed

1. **Non-JSON agent output** — the fixer replied in prose; the adapter now strips
   markdown fences, tries JSON extraction, and retries once with a strict prompt.
2. **Verdict never ACCEPTED** — reviewers kept generating new low/medium findings,
   so consensus never drained and the machine-verifier pass was ignored. Changed
   the rule to **machine-first**: ACCEPTED iff the mechanical verifier passes and
   no unresolved **high**-severity finding remains (`computeVerdict`). This
   matches the "external measurement arbitrates" principle.

### 未検証範囲 (additional)

- Tasks A (CSV CLI) and B (FastAPI) were not yet run; only Task C was executed.
- Free-tier model only; paid DeepSeek (deepseek-v4-pro etc.) untested.
- No isolation (worktree/Docker, secret mounting, network cut, resource limits)
  yet — arbitrary command execution remains the top security risk.
- README demo GIF / GitHub PR dataset collection not started.

## Addendum: design-deliverables gate

The market analysis (SES/生成AI案件: 要件定義→設計→実装→リリース→運用, plus
design documents as deliverables and explainable design decisions) is now
enforced as a machine check:

- `guildless.yml` `design:` section: listed documents must exist and be non-empty;
  `api-spec.*` must be a valid OpenAPI document; `decisions_file` entries must
  carry `decision` and `reason` (decision/alternatives/reason/risks/verification
  pattern).
- Orchestrator: `verification.design_documents` / `design_decisions_file` add the
  same gate to the mechanical verifier.
- Default document set: requirements.md, architecture.md, api-spec.yaml,
  database-schema.md, test-plan.md, deployment.md, rollback.md,
  operations-runbook.md, verification_scope.md.

### Gate results (after design gate)

| Gate  | Result                     |
|-------|----------------------------|
| build | PASS (tsc, exit 0)          |
| test  | PASS 35/35 (exit 0)         |
| lint  | PASS (exit 0)               |
| check | PASS (exit 0)               |

E2E verified: with all 9 documents + decisions file present the `design` check
passes; removing `rollback.md` makes it fail with `"rollback.md is missing"`
(exit 1), including in `--json`.

### 未検証範囲 (additional)

- The OpenAPI check validates structure/`openapi` key only, not schema
  completeness or path/operation semantics.
- Operations depth (logs, metrics, SLI/SLO, backups, incident records) is only
  required as document existence, not content quality.
- GitHub PR dataset (1,000 cases, 5 categories, 9 extracted design items) is a
  planned data-collection pipeline, not yet implemented.

## Addendum: GitHub work flow + isolation + KPI ledger

Implements the roadmap's #1 (GitHub Issue→PR) and #2 (isolation, partial) plus
the #5 ledger foundation.

### `guildless work`

`guildless work --repo <owner/repo> --issue <n> [--push] [--dry-run] [--config <path>]`

1. **Secret preflight** (fail-closed): scans committed files for `.env*`, `*.pem`,
   `*.key`, SSH keys, `.ssh/`, `.aws/`, `.npmrc` and refuses to run if any exist.
2. **Issue fetch**: `gh issue view ... --json title,body`.
3. **Worktree isolation**: `git worktree add -b guildless/<issue>-<runId>` under
   `.guildless/worktrees/<runId>` (untracked secrets never enter the worktree;
   your main checkout is untouched).
4. **Orchestration** runs entirely in the worktree (real-LLM adapter by default).
5. On **ACCEPTED** with `--push`: commits (excluding `.guildless`), pushes the
   branch, opens a PR via `gh pr create`. Rejected/dry-run work is never pushed
   and never touches `main` — the worktree is force-removed.
6. **Ledger**: every run is appended to `.guildless/ledger.jsonl`
   (runId, verdict, PR url, elapsed, tokens, cost, humanCorrection).

### `guildless stats`

Aggregates the ledger: runs / accepted / rejected / PRs created / human
corrections / tokens / cost / elapsed (text and `--json`).

### Isolation measures implemented vs not

Implemented: git worktree isolation; committed-secret refusal; verify-command
timeout (`verification.command_timeout_ms`, default 600s); failed runs never
reflect on `main`; `.guildless` never committed to PRs.

Not implemented (unverified): Docker containerization, network cutoff,
CPU/memory limits, HOME/shell-env scrubbing, out-of-workspace write prevention.

### Gate results (after work flow)

| Gate  | Result                     |
|-------|----------------------------|
| build | PASS (tsc, exit 0)          |
| test  | PASS 38/38 (exit 0)         |
| lint  | PASS (exit 0)               |
| check | PASS (exit 0)               |

E2E verified (dry-run, offline): secret repo refuses; a temp repo reaches
ACCEPTED in an isolated worktree, writes the ledger, cleans up the worktree, and
`guildless stats` reports the run. Real `--push`/PR creation requires a live
GitHub issue and was not executed in this session.

### 未検証範囲 (additional)

- Real GitHub Issue→PR end-to-end (push + `gh pr create`) not executed.
- `gh` merge tracking / merge-rate KPI not implemented yet.
- Docker/network/resource sandboxing not implemented — still the top security risk
  for untrusted execution.

## Addendum: real-issue proof pipeline (`hunt` / `batch` / KPI)

Implements the validation harness only (no new orchestration features): search →
difficulty classify → batch dry-run → result JSON → KPI report.

### `guildless hunt`

`gh search issues` across labels (good first issue / help wanted / bug /
enhancement) and languages (TypeScript, Python), fetches per-repo stars, sorts
smallest first, and classifies `easy`/`medium`/`hard` by title keywords, labels,
and star count. Saves `.guildless/hunt-<ts>.json`.

### `guildless batch`

For each `easy` issue (up to `--limit`): shallow-clones the repo, generates a
per-repo work config (detects npm vs Python and reads actual `package.json`
scripts so `npm install` + `npm test`/`build`/`lint` or pytest match the repo),
runs `guildless work` in an isolated worktree with the real DeepSeek adapter,
records the result JSON (user schema) under `.guildless/results/`, writes the
ledger, and deletes the clone. `--dry-run` (default) never pushes; `--push`
commits + pushes + opens a PR when ACCEPTED.

### Real result (proof of concept)

`Hollujay/simutrace#10` ("test: add unit tests for diff.ts edge cases" —
TypeScript, vitest, CI, 1 star):

| Field | Value |
|-------|-------|
| verdict | **ACCEPTED** (exit 0) |
| elapsed | 228.6 s |
| tokens | 53,554 |
| cost | $0 (free tier) |
| human interventions | 0 |
| tests / build / lint | true / true / true |

### KPI report (`guildless stats --markdown`)

| KPI | Value |
|-----|-------|
| Runs | 1 |
| Accepted | 1 |
| Rejected | 0 |
| Human interventions | 0 |
| Merged PR | 0 |
| Average runtime | 229s |
| Average cost | $0.0000 |
| Average tokens | 53,554 |

### Gate results (after pipeline)

| Gate  | Result                     |
|-------|----------------------------|
| build | PASS (tsc, exit 0)          |
| test  | PASS 41/41 (exit 0)         |
| lint  | PASS (exit 0)               |
| check | PASS (exit 0)               |

### 未検証範囲 (additional)

- Only 1 of 100 target runs executed; merge-rate KPI needs live `--push`.
- Difficulty classification is heuristic, not LLM-judged.
- Python-repo batch path and repos needing heavy installs not exercised.
- Hunt's "tests + CI present" criterion is not explicitly filtered (repo has CI
  in the worked example; search does not verify CI/tests for every candidate).
- Real `--push`/PR and merged tracking not executed.

## Addendum: real-time dashboard (`guildless watch`)

Ink (React) terminal dashboard that tails `.guildless/events.jsonl` live while
`guildless orchestrate` / `work` / `batch` runs.

### Event stream

The orchestrator now emits lifecycle events to `.guildless/events.jsonl`
(`run_start`, `stage`, `agent_start`/`agent_end` with tokens, `progress`,
`verify`, `verdict`, `summary`) from every stage, agent, and verifier step.
Event logging is fail-open (never blocks the pipeline) and routed to the launch
directory for `work`/`batch` so a single `guildless watch` sees the run.

### Dashboard

- Agent cards with status (✓ done / ✗ failed / … running) and token counts.
- Stage row and progress bars (builders, reviews, fix rounds) with status colors
  (green/red/cyan/gray).
- Live runtime, token usage, cost, human-intervention count, and final verdict
  (colored, auto-exit on finish).
- Modes: interactive Ink (`watch`), JSON snapshots (`--json`, live), single
  snapshot (`--once`), and an ANSI fallback for non-TTY terminals.

### Verified

- Unit: event aggregation, live elapsed tracking, text snapshot — pass.
- Ink component rendered via `renderToString` — pass.
- E2E: `orchestrate` streams events; `watch --once` and `--once --json` render
  correctly; concurrent `watch --json` + `orchestrate` shows the run transition
  from `finished=false` to `Verdict: ACCEPTED` and exits 0 on completion.

### Gate results (after dashboard)

| Gate  | Result                     |
|-------|----------------------------|
| build | PASS (tsc, exit 0)          |
| test  | PASS 46/46 (exit 0)         |
| lint  | PASS (exit 0)               |
| check | PASS (exit 0)               |

### 未検証範囲 (additional)

- Interactive Ink rendering on a real TTY (colors/layout) not exercised in this
  headless environment; verified via `renderToString` and the text fallback.
- Very high event volume / long-running batches not stress-tested.
