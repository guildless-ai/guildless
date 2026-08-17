# Guildless (English)

![Guildless](assets/guildless-icon.png)

Guildless is a local-first AI company operating system that closes the loop from business outcome to research, decision, execution, evidence, and verified cash.

The user gives one outcome, for example:

> Grow this company. Increase monthly revenue by ¥1,000,000 within 30 days.

Guildless reconstructs the permitted company state, including assets, proven capabilities, customers, distribution, and capital constraints. It researches markets, success cases, failures, competitors, customers, and routes to market. It compares strategies, selects a money bet, executes only within its approval boundary, and records real cash with evidence.

## Product loop

```text
Outcome
  ↓ Company understanding (facts + evidence)
Capability gap
  ↓ Local → GitHub → public-apis → npm/PyPI → Hugging Face → MCP → Browser/Web
Strategy options → Money Bet
  ↓ Approval-gated execution
Verified money / outcome
  ↓ Learning for the next bet
```

The executive view shows what Guildless is researching, what it learned, the current decision, the next action, required human intervention, and verified cash. Model names, agent names, tool calls, and internal task graphs stay in developer diagnostics.

## Included

- `guildless verify`: deterministic checks for commits, commands, HTTP endpoints, and declared verification scope
- `python/guildless_v0/core/`: evidence-backed Money Intelligence, Money Playbook Compiler, Capability Graphs, and Money Bets
- `capability-acquisition/`: discovery, verification, adapter proposals, and registration across Local, GitHub, public APIs, packages, models, MCP, and browser paths
- `docs/`: Executive Operating View and runtime boundaries

`public-apis/public-apis` is a discovery catalog, not an execution whitelist. Official documentation, liveness, authentication, pricing, commercial terms, rate limits, and a test request are required before registration.

Playbooks compile into five-category Capability Graphs, compare automatically with the ready registry, and send gaps to the Autonomous Discovery Engine without asking the user to select a tool. Discovery count is not success; the final metric is evidenced `cash_confirmed`. See [`docs/money-playbook-compiler.md`](docs/money-playbook-compiler.md).

## Development

```sh
npm install
npm run check
npm test
npm run build
npm run lint
python python/run_tests.py
node capability-acquisition/test_acquisition.js
```

## Safety boundaries

- No external outreach, contracts, payments, publication, or deletion before approval
- No direct access to Founder Memory raw data or Historical Benchmark raw data
- Facts and inferences are separate; facts retain evidence
- Discovery and adoption are separate; unverified OSS and APIs are not executed
- Leads, replies, meetings, and contracts are not cash; only evidenced cash is verified revenue

## License

MIT License. Added third-party code keeps its license, notices, and source commit.
