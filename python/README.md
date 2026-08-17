# Python research layer

This directory contains the evidence-backed Money Intelligence primitives used by the current Guildless prototype. It is intentionally separate from the TypeScript verification CLI so the published CLI remains small and deterministic.

Run the focused tests from this directory's parent:

```sh
python python/run_tests.py
```

The modules do not access Founder Memory, Historical Benchmark, banking, payment, or secret stores directly.
