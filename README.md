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

```text
GUILDLESS: REJECTED

✓ Tests passed
✗ Tested commit differs from current HEAD
✗ Production URL returned 404
✗ Unverified scope was not declared

AI completion claim was rejected.
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
