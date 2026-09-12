# Guildless Artifact System

Guildless compiles the deliverable contract before it acquires tools or runs a
Playbook. A capability is only a means; the Asset Ledger is the record of the
human-acceptable result.

## Artifact Requirements

`compile_artifact_requirements(playbook, graph)` produces planned requirements
with provenance. An explicit requirement may supply the business purpose and
artifact type; otherwise the compiler keeps the source as the capability graph
node and leaves delivery in `planned`. It never treats a capability name as a
completed artifact or revenue.

Every requirement and registered artifact carries `purpose`, `business`,
`bet`, `type`, `source`, `version`, `preview`, `deployment`,
`publishing_policy`, `quality_evidence`, `delivery_status`, and `money_outcome`.

Supported types are Web, LP, SaaS, OSS, API, CLI, Document, PDF,
Presentation, Image, Video, Audio, Dataset, and Campaign Creative.

## Quality gates

The producer cannot mark its own work complete. Registration requires either an
independent review, or both automated-test and runtime evidence. Visual types
also require visual evaluation. The type-specific definition of done is stored
with the ledger entry so a later reviewer can reproduce the decision.

The core ledger only records quality evidence and delivery metadata. It does not
publish, send, deploy, or move money. Those effects remain behind the existing
approval boundary.

## Publication policy

The policy is selected by artifact purpose/type: OSS uses a public GitHub release;
web products use production deployment; media uses storage/platform delivery;
documents use file delivery; images use asset storage; APIs and CLIs use a
relevant package registry or private repository. GitHub is not a universal
default.

## Asset Ledger

`AssetLedger` is an atomic JSON file store for requirements and completed
artifacts. Each artifact keeps version history, preview metadata, source,
deployment evidence, quality evidence, related bet, and money outcome. Confirmed
cash must include an evidence source; leads, uploads, and contracts are never
converted into revenue by this layer.

The desktop host exposes the ledger through a local-only API and the Guildless UI
provides the human view. The UI is itself subject to the same quality gate when
shipped as an artifact.
