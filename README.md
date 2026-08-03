# GUILDLESS

AI agents say “done.” GUILDLESS asks for proof.

A model-independent completion gate for coding agents. It checks commits, commands, URLs, tests and declared verification scope before accepting completion.

GUILDLESS does not ask another model whether the work is complete. It measures the repository and the deployed system, then returns a deterministic exit code that Claude Code, Codex, DeepSeek, OpenCode, CI, or a shell script can use.

## Demo

https://github.com/user-attachments/assets/3831da66-164d-4b65-9b74-c292d33574a7

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

```text
GUILDLESS ORCHESTRATION

Objective: Implement the cross-review scheduler

Planner       ✓
Builders      3/3
Reviews       6
Fix round     0/2
Breaker       ✓
Verifier      PASS

Verdict: ACCEPTED
Evidence: .guildless/runs/20260802-123456-ab12/evidence.json
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

## The five gates

1. The Git working tree has no tracked or untracked changes.
2. `testedCommit` resolves to the same commit as the submitted `HEAD`.
3. Every configured command exits successfully.
4. Every configured URL returns its expected HTTP status.
5. The unverified scope is explicitly declared. Use a truthful entry such as `"None known"` only when appropriate.

Checks are deliberately fail-closed: a missing field, invalid commit, command error, timeout, network failure, or unexpected HTTP status rejects completion.

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
