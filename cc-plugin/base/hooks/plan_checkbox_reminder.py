#!/usr/bin/env python3
"""PostToolUse hook that reminds Claude to update plan checkboxes."""

from __future__ import annotations

import json
import sys

from plan_utils import count_unchecked_items, find_active_plan, is_plan_file, should_throttle


def _build_reminder(plan_path: str, unchecked_count: int, unchecked_lines: list[str]) -> str:
    preview = unchecked_lines[:5]
    details = "\n".join(preview)
    if unchecked_count > len(preview):
        details = f"{details}\n... ({unchecked_count - len(preview)} more)"

    return (
        "Plan checkbox reminder:\n"
        f"Active plan: {plan_path}\n"
        f"Unchecked checklist items remaining: {unchecked_count}\n"
        "If you completed work, update the plan checkboxes.\n"
        f"{details}"
    ).strip()


def main() -> None:
    try:
        data = json.load(sys.stdin)
    except json.JSONDecodeError:
        sys.exit(0)

    session_id = data.get("session_id")
    cwd = data.get("cwd")
    tool_input = data.get("tool_input") or {}
    file_path = tool_input.get("file_path", "")

    if not session_id or not cwd:
        sys.exit(0)

    if is_plan_file(file_path):
        sys.exit(0)

    if should_throttle(session_id):
        sys.exit(0)

    plan_path = find_active_plan(session_id, cwd)
    if not plan_path:
        sys.exit(0)

    unchecked_count, unchecked_lines = count_unchecked_items(plan_path, automated_only=False)
    if unchecked_count <= 0:
        sys.exit(0)

    print(
        json.dumps(
            {
                "hookSpecificOutput": {
                    "additionalContext": _build_reminder(
                        plan_path, unchecked_count, unchecked_lines
                    )
                }
            }
        )
    )
    sys.exit(0)


if __name__ == "__main__":
    main()
