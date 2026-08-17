# Capability Acquisition

This is a candidate discovery and verification layer, not an auto-installer.

`public-apis-source.md` is a pinned source snapshot from `public-apis/public-apis`. The local catalog is only a discovery index. A provider must pass official-documentation, liveness, authentication, commercial-use, pricing/free-tier, rate-limit, and test-request checks before registry registration.

```sh
node test_acquisition.js
```

No secret values are written by these scripts.
