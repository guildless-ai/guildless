# Persona Integration (visual avatar layer)

Visualize real GUILDLESS agent activity as animated 3D characters using
[xikhar/persona](https://github.com/xikhar/persona) as the character runtime.
The UI is driven **only** by real `.guildless/events.jsonl` events — no fake
progress, no scripted timelines, no mock-only animations.

## Architecture

```text
GUILDLESS runtime
   │  writes real events
   ▼
.guildless/events.jsonl
   │  tail + map (integrations/persona/guildless-persona-bridge)
   ▼
Persona MCP / local API  (http://127.0.0.1:47831/mcp)
   │  play action
   ▼
VRM character animation (separate desktop process)
```

GUILDLESS core is untouched. The integration lives under `integrations/persona/`
and is compiled to `dist/persona/` by `tsconfig.persona.json`.

## Setup

```sh
# 1. clone Persona separately (it stays its own process)
git clone https://github.com/xikhar/persona
cd persona && npm install

# 2. build GUILDLESS (core + persona integration)
cd <guildless repo>
npm install
npm run build

# 3. launch Persona in a desktop session, then import a local .vrm
npm start -- --background
```

## Importing a VRM

Persona ships with an empty character catalog. In Persona **Settings**, import a
local `.vrm` model (and optionally `.vrma` animation clips for the actions).
The first imported model becomes the default; Persona then opens its avatar
window. The integration does **not** copy or redistribute any VRM/VRMA asset —
only placeholder metadata is used here. See the asset-licensing warning below.

## Starting Persona

Persona is a separate desktop application. Register its MCP server once:

```sh
codex mcp add persona --url http://127.0.0.1:47831/mcp
```

The GUILDLESS bridge targets the same MCP endpoint by default
(`PERSONA_URL` to override, `PERSONA_MCP_TOOL` to rename the animation tool,
`PERSONA_HTTP_URL` to use a plain HTTP `/action` endpoint instead).

## Starting the GUILDLESS bridge

```sh
# in a terminal running a GUILDLESS run (run / deliver / maintain):
guildless run "<goal>"

# in another terminal:
guildless persona start                  # tails .guildless/events.jsonl
guildless persona status                 # Persona connectivity + event file + bridge state
guildless persona stop
```

`start` tails the events file, skips malformed lines, deduplicates by event
identity, maps events to character actions, and sends them to Persona. Every
mapping decision is logged to `.guildless/persona-events.jsonl`. A restart
resumes safely because processed event keys are persisted. If Persona is
unreachable, actions are logged as `sent:false` and the bridge keeps running.

## Replaying a real run

Replay preserves event order, compresses waiting time by `--speed`, never
invents events, and finishes on the real verdict. Real metrics are read from
the run's `final-evidence.json` when present.

```sh
guildless persona replay <run-id> --speed 10 [--file <events.jsonl>] [--repo owner/repo --issue N]
guildless persona replay 20260802-032906-1623 --speed 10 --file .guildless/replays/real-events.jsonl
```

## Event mapping

| GUILDLESS event | Action |
|---|---|
| `run_start` | `wave` |
| `stage planner` | `thinking` |
| `agent_start` role `builder` | `typing` |
| `agent_start` role `reviewer` | `inspect` |
| `agent_start` role `breaker` | `attack` |
| `agent_start` role `fixer` | `repair` |
| `stage verify` | `checking` |
| reviewer finding severity `high` | `alert` (from run evidence) |
| `agent_end` ok | `nod` |
| `agent_end` failure | `disappointed` |
| `verdict ACCEPTED` | `celebrate` |
| `verdict REJECTED` | `reject` |
| `summary` / run end | `idle` |

Six logical roles are supported (planner, builder, reviewer, breaker, fixer,
verifier), each with a distinct display name, accent color, on-screen position,
and task label. The initial version reuses one VRM model and switches roles;
the data model is multi-agent compatible for multiple windows later.

## Overlay

A minimal transparent overlay beside the character shows real state only:
current role, current task, repository/issue, findings, tests passed, human
interventions, and final verdict. It never displays prompts, secrets, source
code, or customer data.

## Recording a 15-second demo

```sh
# 1. replay the real run at a speed that fits ~15s
guildless persona replay <run-id> --speed 50 --file <events.jsonl> --repo Hollujay/simutrace --issue 10
# 2. capture the Persona window + overlay with OBS or a screen recorder
```

For a finished run the overlay ends on the real verdict and the real metrics
from evidence. Do **not** claim PR-created or merged if the run was only a
dry-run.

## Asset licensing warning

VRM/VRMA files are third-party assets with their own licenses. This
integration does not copy, bundle, or redistribute any character media. You are
responsible for the license of any `.vrm`/`.vrma` you import, and for the asset
license fields before distributing anything. Persona's own repository excludes
its `public/assets/` media from the MIT license.

## Privacy model

- Persona receives **only** visual state events (target role, action, label).
- GUILDLESS repository contents, prompts, and secrets are never sent to Persona.
- The overlay shows only sanitized task labels and counters.
- `.guildless/persona-events.jsonl` logs mapping decisions only, never event
  payloads or secrets.

## Current limitations

- Persona MCP connectivity is **not verified** in headless CI; the bridge
  degrades gracefully (logs `sent:false`).
- One VRM model is reused; multiple simultaneous character windows are not
  implemented yet.
- The transparent always-on-top desktop overlay is delivered as HTML + text
  renderers; platform-specific windowing is left to the user.
- Findings count is read from run evidence when provided; event-stream-only
  replays report `0` findings.
