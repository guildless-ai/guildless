# Money Playbook Compiler

The compiler changes the role of a Human Money Case from a reference document into an executable, evidence-carrying graph.

```text
Human Money Case
  → Proven Playbook
  → Capability Graph
  → Capability Gap
  → Autonomous Discovery
  → Verify / Adapter / Test
  → Capability Registry
  → Execution
  → Distribution
  → Monetization
  → Confirmed Cash
  → Learn
```

## Graph contract

Every node belongs to one of five categories:

- `strategy`
- `distribution`
- `production`
- `monetization`
- `operational`

Every node carries `required`, `optional`, `preconditions`, `evidence_source`, `success_metric`, and `fallback`. The compiler preserves the source case IDs or URLs; a node without evidence is not silently upgraded to a fact.

## Gap and procurement

`compute_capability_gap` compares graph nodes with ready entries in the existing registry. Missing nodes are passed to `AutonomousDiscoveryEngine` without asking the user to choose a tool. Providers are composed in the runtime and can cover:

```text
local repositories
installed software
GitHub
Hugging Face
MCP Registry
public APIs
npm / PyPI
browser-accessible services
```

`DiscoveryCandidate` evaluates license, commercial use, maintenance, platform compatibility, cost, quality, runtime, security, integration difficulty, evidence, and tests. Unknown license/commercial use or failed sandbox/adapter tests are rejected. A candidate is registered only when all gates pass.

If the candidate does not implement `guildless-capability-v1`, `generate_adapter_proposal` produces the adapter, test, and workflow paths for the Codex adapter-generation step. The proposal is not an execution permission and does not write secrets.

## Money outcome

Progress metrics such as `videos_uploaded`, `views`, `leads`, or `meetings` can be recorded with `record_playbook_metric`, but they never make a bet successful. Only the existing `cash_confirmed` event with evidence changes `MoneyBet.confirmed_cash_in` and `money_outcome(...)["is_money_success"]`.

## Boundary

This module is the deterministic compiler and procurement gate. Network discovery, cloning, sandbox execution, benchmarks, and provider-specific adapters are runtime providers injected into it. External effects remain behind the existing human approval boundary.
