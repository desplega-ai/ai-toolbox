#!/usr/bin/env python3
"""Stop hook that enforces automated verification checkbox updates."""

from __future__ import annotations

import json
import re
import sys

from plan_utils import (
    count_unchecked_by_phase,
    find_active_plan,
    marker_exists,
    unchecked_items_by_phase,
)

PHASE_NUMBER_RE = re.compile(r"^Phase\s+(\d+)\b")


def _is_started_phase(
    phase_name: str, has_any_checked: bool, has_marker: bool, has_active_plan: bool
) -> bool:
    if has_any_checked:
        return True

    match = PHASE_NUMBER_RE.match(phase_name)
    if not match:
        return False

    # Marker files are best-effort (sandboxed runs may not allow ~/.claude writes),
    # so keep the Phase 1 cold-start behavior even when marker persistence fails.
    return int(match.group(1)) == 1 and (has_marker or has_active_plan)


def main() -> None:
    try:
        data = json.load(sys.stdin)
    except json.JSONDecodeError:
        sys.exit(0)

    if data.get("stop_hook_active"):
        sys.exit(0)

    session_id = data.get("session_id")
    cwd = data.get("cwd")
    if not session_id or not cwd:
        sys.exit(0)

    plan_path = find_active_plan(session_id, cwd)
    if not plan_path:
        sys.exit(0)

    phase_counts = count_unchecked_by_phase(plan_path, automated_only=True)
    if not phase_counts:
        sys.exit(0)

    phase_items = unchecked_items_by_phase(plan_path, automated_only=True)
    has_marker = marker_exists(session_id)

    blocking_lines: list[str] = []
    for phase_name, (unchecked_count, has_any_checked) in phase_counts.items():
        if unchecked_count <= 0:
            continue
        if not _is_started_phase(
            phase_name, has_any_checked, has_marker, has_active_plan=bool(plan_path)
        ):
            continue

        unchecked_for_phase = phase_items.get(phase_name, [])
        if not unchecked_for_phase:
            blocking_lines.append(
                f"{phase_name}: {unchecked_count} unchecked automated verification item(s)"
            )
            continue

        for item in unchecked_for_phase:
            blocking_lines.append(f"{phase_name}: {item}")

    if not blocking_lines:
        sys.exit(0)

    reason = (
        "Cannot stop yet. The active plan has unchecked automated verification items in started phases.\n"
        f"Plan: {plan_path}\n"
        "Unchecked items:\n"
        + "\n".join(f"- {line}" for line in blocking_lines)
        + "\nUpdate automated verification checkboxes before stopping."
    )

    print(json.dumps({"decision": "block", "reason": reason}))
    sys.exit(0)


if __name__ == "__main__":
    main()
