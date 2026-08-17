# Guildless product architecture

## Executive Operating View

The user gives one outcome. Guildless reconstructs the company from permitted sources, records facts with evidence, and decides what to sell or execute. The primary surface is a one-direction narrative:

```text
NOW → LEARNED → DECISION → NEXT
```

The UI should expose business consequences rather than implementation details:

- current cash and verified revenue
- current outcome and progress
- what Guildless is researching or executing
- discoveries and compared options
- current decision and its reason
- next action and human-required boundary

An implementation panel may exist for diagnostics, but provider names, model names, tool calls, and internal task graphs are not business status.

## Company state

Company state is split into evidence-backed facts and inferences. Facts include assets, proven capabilities, distribution, money constraints, customers, and prior outcomes. Each fact keeps its source. Inferences keep a reasoning summary, sources, and confidence. Unknown values stay unknown.

## Money Intelligence

`MoneyCase` stores a source-backed case. `derive_playbook` extracts reusable conditions rather than copying a founder story. `rank_strategies` compares a playbook to the current company state. A `MoneyBet` records hypothesis, cost, expected revenue, execution events, and outcome. Only a documented `cash_confirmed` event changes verified cash.

## Capability Acquisition

The resolver searches existing local capabilities before external sources. GitHub, public APIs, package registries, Hugging Face, MCP, and browser automation are candidate providers, not trusted execution paths. Verification is mandatory before registration. An adapter proposal is separate from adapter execution, and tests must pass before a candidate becomes reusable.

## Existing CLI boundary

The TypeScript CLI remains the deterministic completion gate. It is useful for checking code and deployed evidence after a Guildless operation. The business runtime must not treat a model response as proof of revenue or completion.

## Explicitly out of scope for the base repository

- automatic external outreach without approval
- automatic contract, payment, deletion, or publication
- direct Founder Memory or Historical Benchmark raw database access
- automatic upstream overwrite
