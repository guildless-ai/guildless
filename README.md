# GUILDLESS

AI agents say “done.” GUILDLESS asks for proof.

A model-independent completion gate for coding agents. It checks commits, commands, URLs, tests and declared verification scope before accepting completion.

GUILDLESS does not ask another model whether the work is complete. It measures the repository and the deployed system, then returns a deterministic exit code that Claude Code, Codex, DeepSeek, OpenCode, CI, or a shell script can use.

## Quick start

```sh
npx guildless verify --config guildless.yml
```

Create `guildless.yml`:

```yaml
testedCommit: "4d2c5b8..." # exact commit SHA that was tested

commands:
  - "npm test"

urls:
  - url: "https://example.com/health"
    status: 200

unverifiedScope:
  - "Visual regression was not checked on Safari"
```

The command exits with `0` only when all five gates pass. A rejected claim exits with `1`; invalid CLI usage exits with `2`.

The default (concise) output hides per-check details and shows PASS/FAIL, a
summary, the next recommended action, and where full evidence was saved:

```text
GUILDLESS: REJECTED

✗ git-clean: 2 uncommitted changes
✗ commit-match: Tested commit differs from current HEAD
✗ http: URL returned 404 (expected 200)

Next:
  • Commit or stash the uncommitted changes, then re-run
  • Commit the tested work, or update testedCommit in guildless.yml to match HEAD
  Re-run: guildless verify

Evidence: .guildless/runs/20260802-123456-ab12/evidence.json
```

## CLI options

| Option       | Effect                                                                 |
|--------------|------------------------------------------------------------------------|
| (default)    | Concise output: PASS/FAIL, summary, next action, evidence path          |
| `--verbose`  | Shows each check's detail: changed file list, command output, HTTP details |
| `--json`     | Prints the complete report as JSON to stdout (nothing else) and exit 0/1/2 |
| `--quiet`    | No output on success (exit 0); one-line failure reason on error (exit 1) |
| `--config`   | Path to `guildless.yml` (default: auto-detected in the current directory) |
| `--help`     | Show usage                                                              |

Every run saves full evidence to `.guildless/runs/<run-id>/evidence.json`
(contract, checks, details). The `.guildless` directory is ignored by the
git-clean gate so saved evidence never fails a later run.

## Cross-review orchestration

`guildless orchestrate` is the multi-agent scheduling layer. It turns the
serial "one agent does the work, one agent checks it" flow into a parallel
matrix where no agent reviews its own output:

```sh
npx guildless orchestrate --config guildless.orchestra.yml
```

Workflow: a Planner breaks the objective into tasks → N Builders implement in
parallel → each Builder's output is reviewed by the *other* reviewers (bug/requirements,
security/permissions, test coverage), findings are aggregated into a consensus →
Fixers resolve findings (bounded by `max_fix_rounds`) → a Breaker adds counterexample
tests → the machine Verifier runs the configured commands (`npm run build`, `npm test`,
`npm run lint`, `git diff --check`, HTTP checks) and returns the final verdict.
Agent wall-climbing output is never shown — only stage status.

Agents are subprocesses speaking a JSON protocol (`--input`/`--output` files).
The package ships demo agents; point `agent_commands` at real LLM CLIs to use
actual models:

```yaml
agents:
  planner: 1
  builders: 3
  reviewers: 3
  breakers: 1
  fixers: 2

review_policy:
  self_review: false          # nobody reviews their own work
  cross_review: true
  minimum_reviews_per_task: 2

verification:
  commands: [npm run build, npm test, npm run lint]
  max_fix_rounds: 2
```

## GitHub work (Issue → PR)

`guildless work` takes a GitHub issue, works on it in an isolated git worktree,
runs the cross-review orchestration there, and — only when the machine verifier
accepts — commits, pushes a branch, and opens a PR:

```sh
gh auth login                              # one-time
npx guildless work --repo owner/repo --issue 12 --config guildless.work.yml --push
```

Isolation is fail-closed: it refuses to run when committed secret files (`.env`,
`*.pem`, SSH keys, `.npmrc`, ...) are detected, never touches your main checkout
or `main`, discards rejected work, and caps command runtime via
`verification.command_timeout_ms`. Use `--dry-run` to orchestrate locally without
pushing.

Every run is appended to `.guildless/ledger.jsonl`; `guildless stats` aggregates
the KPI ledger (runs, accepted, PRs created, human corrections, tokens, cost).

```text
GUILDLESS STATS

Runs:              1
Accepted:          1
Rejected:          0
PRs created:       0
Human corrections: 0
```

## Batch validation (real GitHub issues)

The proof pipeline finds real issues and runs them with zero human intervention:

```sh
npx guildless hunt --language both --limit 30   # find candidates (good first issue,
                                                # help wanted, bug, enhancement, TS/Python,
                                                # stars-sorted, difficulty classified)
npx guildless batch --hunt .guildless/hunt-*.json --limit 5 --dry-run   # clone + orchestrate
npx guildless stats --markdown                  # README-ready KPI table
```

`hunt` searches GitHub, fetches star counts, and classifies each issue as
`easy` / `medium` / `hard` (heuristic). `batch` clones each easy repo, adapts the
verification commands to the repo (npm/pytest scripts detected from
`package.json` / Python project files), runs the full cross-review orchestration
in an isolated worktree, and — only when ACCEPTED — can `--push` a branch and
open a PR. Each result is saved before any PR as:

```json
{
  "repository": "Hollujay/simutrace",
  "issue": "10",
  "accepted": true,
  "human_interventions": 0,
  "elapsed_seconds": 228.578,
  "tokens": 53554,
  "cost_usd": 0,
  "tests_passed": true,
  "build_passed": true,
  "lint_passed": true
}
```

`guildless stats --markdown` prints the KPI table: Runs / Accepted / Rejected /
Human interventions / Merged PR / Average runtime / Average cost / Average tokens.

## Real-time dashboard

`guildless watch` renders a live terminal dashboard (Ink/React) while
`guildless orchestrate`, `work`, or `batch` is running. The orchestrator streams
progress to `.guildless/events.jsonl` (agent cards, stage status, progress bars,
verify results); the dashboard tails that file and repaints in real time.

```sh
npx guildless orchestrate &        # or: work / batch, in another terminal
npx guildless watch                # live dashboard: agents, bars, colors, KPI, verdict
npx guildless watch --json         # machine-readable state snapshots
npx guildless watch --once         # print one snapshot and exit (CI-friendly)
```

```text
GUILDLESS WATCH  20260802-031133-e02f
Objective: watch demo

planner ✓   build ✓   review ✓   fix -   break -   verify ✓

Agents:
  ✓ planner        0 tokens
  ✓ builder-1      0 tokens
  ✓ reviewer-1-builder-2 0 tokens

planner: 1/1   builders: 2/2   reviews: 2/2

Verify:
  ✓ npm test

Human interventions: 0
Runtime: 3m 12s
Tokens: 53,554
Cost: $0.0000
Verdict: ACCEPTED
```

## The five gates

1. The Git working tree has no tracked or untracked changes.
2. `testedCommit` resolves to the same commit as the submitted `HEAD`.
3. Every configured command exits successfully.
4. Every configured URL returns its expected HTTP status.
5. The unverified scope is explicitly declared. Use a truthful entry such as `"None known"` only when appropriate.

Checks are deliberately fail-closed: a missing field, invalid commit, command error, timeout, network failure, or unexpected HTTP status rejects completion.

## Design-deliverables gate

To match how the market actually buys engineering work (requirements → design →
implementation → release → operations), an optional `design` section turns the
design documents themselves into machine-checked acceptance criteria:

```yaml
design:
  documents:
    - requirements.md
    - architecture.md
    - api-spec.yaml
    - database-schema.md
    - test-plan.md
    - deployment.md
    - rollback.md
    - operations-runbook.md
    - verification_scope.md
  decisions_file: design-decisions.json
```

The gate verifies that every listed document exists and is non-empty, that
`api-spec.*` is a valid OpenAPI document, and that the decisions file records
each design decision with a `decision` and a `reason` (following the
decision / alternatives / reason / risks / verification pattern). The same gate
is available to the orchestrator as `verification.design_documents`.

## Agent and CI integration

Tell any coding agent to run this after it claims completion:

```text
Run `npx guildless verify`. Do not report completion unless it exits 0.
```

For machine-readable output:

```sh
npx guildless verify --json
```

In GitHub Actions:

```yaml
- name: Verify completion evidence
  run: npx guildless verify --config guildless.yml
```

The repository includes `.github/ci.example.yml`; copy it to `.github/workflows/ci.yml` to enable the project CI workflow.

Pin a released version in production workflows for reproducibility.

## Why not model voting?

DeepSeek can be an inexpensive implementer and a separate-context critic, while Codex or Claude handles difficult review. But one hundred agents can share one false assumption. GUILDLESS makes shell commands, Git, HTTP, tests, and other external measurements the final authority.

## Scope

This first release is intentionally small: one repository, one local contract, and five basic gates. It is not the larger GUILDLESS agent-orchestration product.

Potential future paid infrastructure—only if the CLI is genuinely used—includes isolated multi-project execution, organization policies, retained audit evidence, integrations, permissions and budgets, rollback, private networking, and an operations dashboard.

## Seven-day validation

After publishing, the project should expand only if real usage appears:

- 10 people install it.
- 3 run it in their own repositories.
- It catches at least 1 false completion or verification gap.
- At least 1 person opens an issue or improvement request.

If those signals are all zero, improve distribution or revisit demand instead of making the product larger.

## Development

```sh
npm install
npm run check
npm test
npm run build
```

## License

MIT
