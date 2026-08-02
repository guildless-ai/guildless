# PLAN.md

## Objective

Deliver a TypeScript CLI named `guildless verify` that acts as a deterministic
completion gate: it accepts an AI/coding agent's "done" claim only when the
repository and deployed system actually match the claim.

## Required features

| # | Requirement                 | Acceptance criterion                                              |
|---|-----------------------------|-------------------------------------------------------------------|
| 1 | `guildless verify` command  | Binary named `guildless`, subcommand `verify`, documented usage    |
| 2 | Git clean check             | Exit non-zero when the working tree has tracked/untracked changes  |
| 3 | `guildless.yml` loading     | YAML contract parsed with validation; malformed config rejects     |
| 4 | Build/test execution        | Configured commands (e.g. `npm run build`, `npm test`) run and must pass |
| 5 | URL check                   | Each configured URL must return its expected HTTP status           |
| 6 | JSON report                 | `--json` emits a machine-readable report; exit codes 0/1/2         |

## Mandatory deliverables

- `PLAN.md` (this file)
- `REVIEW.md`
- `FINAL_REPORT.md`
- Run `build`, `test`, `lint` before finishing
- State the unverified scope explicitly
- Do **not** create a git commit

## Current state assessment (baseline)

The repository already contains an implementation scaffold:

- `src/cli.ts` — argument parsing, gate orchestration, exit codes
- `src/contract.ts` — `guildless.yml` loading + validation (YAML via `yaml` pkg)
- `src/checks/git-clean.ts` — `git status --porcelain`
- `src/checks/commit-match.ts` — `testedCommit` vs `HEAD` resolution
- `src/checks/command.ts` — shell command runner (build/test gate)
- `src/checks/http.ts` — HTTP status check with timeout
- `src/checks/unverified-scope.ts` — explicit scope declaration gate
- `src/report.ts` — text + JSON report rendering
- `test/*.test.ts` — 5 passing tests (node:test)

Baseline verification already run:

- `npm run check` (tsc --noEmit): PASS
- `npm test`: PASS (5/5)
- `npm run build`: PASS

## Gap analysis

| Gap | Impact | Action |
|-----|--------|--------|
| No `lint` script / linter configured | Requirement "run lint" cannot be satisfied | Add ESLint (flat config) + `lint` script |
| No end-to-end proof of the CLI running | Requirement 1-6 not demonstrated | Run the built binary against a temp git repo (ACCEPTED) and against this repo with untracked files (REJECTED) |
| PLAN/REVIEW/FINAL_REPORT missing | Mandatory deliverables | Write them |

## Execution plan

1. **Builder**: add ESLint with `typescript-eslint` flat config; add `lint` script.
2. **Verifier**: run `lint`, `build`, `test`; run end-to-end scenarios.
3. **Reviewer**: review code against the feature table; write `REVIEW.md`.
4. **Fixer**: resolve any failures surfaced by lint or verification.
5. Re-run all gates, write `FINAL_REPORT.md` incl. unverified scope.

## Constraints

- No git commit.
- No new runtime dependencies unless required (lint tooling is dev-only).
- Keep the existing fail-closed semantics and public interface.
