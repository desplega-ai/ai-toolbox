#!/usr/bin/env python3
"""UserPromptSubmit hook: nudge Claude about context-window pressure.

Emits at most one additionalContext message per upward threshold crossing.
Thresholds:
  - 1M window: >200k warn, >350k severe, >500k yolo tier
  - <=200k window: <40% silent, 40-60% warn, >60% severe
If the per-session yolo flag is set, severe+ levels degrade to a silent
single-line usage line (no active pause).
"""

from __future__ import annotations

import json
import sys

from context_state import (
    classify,
    level_rank,
    load_state,
    read_last_usage,
    save_state,
    severe_msg,
    soft_warn_for_yolo_session,
    state_path,
    warn_msg,
    window_size,
    yolo_tier_msg,
)


def main() -> None:
    try:
        data = json.load(sys.stdin)
    except json.JSONDecodeError:
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

    state = load_state(session_id)
    prev_level = state.get("level", "ok")
    yolo = bool(state.get("yolo"))

    if level == "ok":
        sys.exit(0)

    if level_rank(level) <= level_rank(prev_level):
        sys.exit(0)

    state["level"] = level
    save_state(session_id, state)

    flag_path = state_path(session_id)

    if yolo:
        message = soft_warn_for_yolo_session(used, total)
    elif level == "warn":
        message = warn_msg(used, total)
    elif level == "severe":
        message = severe_msg(used, total, flag_path)
    else:
        message = yolo_tier_msg(used, total, flag_path)

    print(
        json.dumps(
            {
                "hookSpecificOutput": {
                    "hookEventName": "UserPromptSubmit",
                    "additionalContext": message,
                }
            }
        )
    )
    sys.exit(0)


if __name__ == "__main__":
    main()
