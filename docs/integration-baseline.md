# Integration baseline

This working tree started from the official `guildless-ai/guildless` HEAD:

```text
8f3c23bedd9f441750ae2e66ec7c9fa5cb0a8cf8
```

The upstream verification CLI is preserved. The additions in this tree are source-level integrations for the current Guildless product direction:

- `python/guildless_v0/core/` — evidence-backed Money Intelligence
- `capability-acquisition/` — candidate discovery, verification, adapter proposal, and registry gate
- `docs/` — Executive Operating View and runtime boundaries
- `assets/guildless-icon.png` — the canonical high-resolution desktop icon used by the installed runtime
- `assets/google-signin.png` — an unmodified Google-provided Sign-In icon used only in the account-link action; see `THIRD_PARTY_NOTICES.md`

Changes are pushed on feature branches and merged into `main` through reviewed pull requests.
