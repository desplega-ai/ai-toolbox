#!/usr/bin/env python3
"""Stop hook: at severe+ context pressure (no yolo flag), block stop so
Claude must confirm with Taras via AskUserQuestion before ending.

Loop-safe: if stop_hook_active is true, exits 0 to avoid re-blocking.
Throttled: only fires once per level via the shared state file.
"""

from __future__ import annotations

import json
import sys

from context_state import (
    classify,
    load_state,
    read_last_usage,
    save_state,
    state_path,
    stop_block_reason,
    window_size,
)


def main() -> None:
    try:
        data = json.load(sys.stdin)
    except json.JSONDecodeError:
        sys.exit(0)

    if data.get("stop_hook_active"):
        sys.exit(0)

    session_id = data.get("session_id")
    transcript_path = data.get("transcript_path")
    if not session_id or not transcript_path:
        sys.exit(0)

    used, model = read_last_usage(transcript_path)
    if used <= 0:
        sys.exit(0)

    total = window_size(model)
    level = classify(used, total)
    if level not in ("severe", "yolo"):
        sys.exit(0)

    state = load_state(session_id)
    if state.get("yolo"):
        sys.exit(0)
    if state.get("stop_blocked_at") == level:
        sys.exit(0)

    state["stop_blocked_at"] = level
    save_state(session_id, state)

    print(
        json.dumps(
            {
                "decision": "block",
                "reason": stop_block_reason(level, used, total, state_path(session_id)),
            }
        )
    )
    sys.exit(0)


if __name__ == "__main__":
    main()
