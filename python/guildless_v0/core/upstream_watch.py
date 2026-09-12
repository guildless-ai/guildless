"""Audit-only upstream manifest support.

The watcher records exact upstream paths and hashes.  It never copies files or
overwrites Guildless SOPs; a human-reviewed adaptation is required after a
semantic diff.
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Mapping


def sha256_file(path: str | Path) -> str:
    digest = hashlib.sha256()
    with Path(path).open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def build_manifest(source_repo: str, source_commit: str, paths: Iterable[str | Path], *, local_version: str,
                   local_adaptation: str) -> dict[str, Any]:
    entries = []
    for path in paths:
        item = Path(path)
        entries.append({"source_path": str(item).replace("\\", "/"), "source_hash": sha256_file(item)})
    return {
        "schema_version": 1,
        "source_repo": source_repo,
        "source_commit": source_commit,
        "imported_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "local_version": local_version,
        "local_adaptation": local_adaptation,
        "entries": entries,
        "policy": "audit_and_adapt; never overwrite local SOP automatically",
    }


def detect_changes(manifest: Mapping[str, Any], paths: Iterable[str | Path]) -> list[dict[str, str]]:
    old = {str(item.get("source_path")): item.get("source_hash") for item in manifest.get("entries", [])}
    changes: list[dict[str, str]] = []
    for path in paths:
        item = Path(path)
        current = sha256_file(item)
        key = str(item).replace("\\", "/")
        if old.get(key) != current:
            changes.append({"source_path": key, "old_hash": str(old.get(key) or ""), "new_hash": current})
    return changes


def save_manifest(path: str | Path, manifest: Mapping[str, Any]) -> None:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(dict(manifest), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
