# REVIEW.md

## Scope of review

Reviewed the `guildless verify` TypeScript CLI against the six requirements and
the project's own fail-closed contract (README "The five gates").

Files reviewed:

- `src/cli.ts`, `src/contract.ts`, `src/report.ts`
- `src/checks/{git-clean,commit-match,command,http,unverified-scope,git,types}.ts`
- `test/{checks,cli,report,contract}.test.ts`
- `package.json`, `tsconfig.json`, `eslint.config.mjs`
- `examples/basic/guildless.yml`, `guildless.example.yml`

## Requirement traceability

| Requirement                | Implementation                                             | Verdict |
|----------------------------|------------------------------------------------------------|---------|
| `guildless verify` command | `src/cli.ts` parses `verify`, `--config`, `--json`, `--help`; bin `dist/cli.js` | PASS |
| Git clean check            | `src/checks/git-clean.ts` via `git status --porcelain`     | PASS |
| `guildless.yml` loading    | `src/contract.ts` validates + returns typed contract        | PASS |
| Build/test execution       | `src/checks/command.ts` runs `commands` from the contract (e.g. `npm run build`, `npm test`) | PASS |
| URL check                 | `src/checks/http.ts` asserts expected status, timeout, manual redirects | PASS |
| JSON report               | `--json` emits `VerificationReport`; exit codes 0/1/2       | PASS |

## Findings

### Fixed during this review (Fixer role)

1. **`CheckResult.id` misuse on contract error** — `src/cli.ts` reported a
   malformed contract using the `unverified-scope` check id. Added a dedicated
   `"contract"` id to the union in `src/checks/types.ts` and used it in the
   error branch. Now the JSON report correctly shows `"id": "contract"`.

2. **No lint gate existed** — added `eslint.config.mjs` (flat config,
   `@eslint/js` recommended + `typescript-eslint` recommended) and a `lint`
   script. `npm run lint` passes clean.

3. **Contract validation was untested** — added `test/contract.test.ts`
   (valid load + 3 negative cases). Test count: 5 → 9, all pass.

### Confirmed correct (no change needed)

- Fail-closed semantics: empty `commands`/`urls`, empty `unverifiedScope`,
  invalid URL scheme, invalid status code all reject.
- `commit-match` resolves refs like `HEAD` and short SHAs via `rev-parse`.
- HTTP check uses `redirect: "manual"` and `AbortSignal.timeout`, so redirects
  and hangs reject rather than silently passing.
- Default config discovery (`guildless.yml` / `guildless.yaml`) verified
  end-to-end without `--config`.
- Exit-code contract verified: accepted=0, rejected=1, usage error=2.

### Residual risks (accepted, not blocking)

- `commands` run through `shell: true` — powerful but shell-quoting dependent;
  documented behavior for a completion gate, but a hostile contract can run
  arbitrary commands (already implicit in the tool's purpose).
- Command output is unbounded in memory; a pathological command could grow
  output indefinitely.
- `git-clean` reports but does not enumerate per-file diffs beyond the
  porcelain output; sufficient for a pass/fail gate.
- The `unverified-scope` gate only checks that something was declared; it
  cannot verify truthfulness of the declaration by design.

## Overall verdict

The implementation meets all six requirements, passes lint/build/9 tests, and
the exit-code and report behavior were verified end-to-end. No blocking issues
remain.
