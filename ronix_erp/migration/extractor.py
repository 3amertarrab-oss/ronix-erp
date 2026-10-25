from __future__ import annotations

import json
from pathlib import Path
from typing import Any


MARKER = "window.INITIAL_DB="


def extract_initial_snapshot(html: str) -> dict[str, Any]:
    marker_index = html.find(MARKER)
    if marker_index < 0:
        raise ValueError("window.INITIAL_DB marker was not found")
    json_start = marker_index + len(MARKER)
    snapshot, _ = json.JSONDecoder().raw_decode(html, json_start)
    if not isinstance(snapshot, dict):
        raise ValueError("window.INITIAL_DB must contain a JSON object")
    return snapshot


def extract_initial_snapshot_file(path: str | Path) -> dict[str, Any]:
    return extract_initial_snapshot(Path(path).read_text(encoding="utf-8"))

