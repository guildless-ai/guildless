from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from guildless_v0.core.upstream_watch import build_manifest, detect_changes


class TestUpstreamWatch(unittest.TestCase):
    def test_change_is_reported_without_overwriting_local_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / "SKILL.md"
            source.write_text("original", encoding="utf-8")
            manifest = build_manifest("https://example.test/repo", "abc", [source], local_version="1", local_adaptation="adapted")
            source.write_text("changed", encoding="utf-8")
            changes = detect_changes(manifest, [source])
            self.assertEqual(len(changes), 1)
            self.assertEqual(manifest["source_commit"], "abc")


if __name__ == "__main__":
    unittest.main()
