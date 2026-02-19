#!/usr/bin/env python3
"""Shared utilities for plan checkbox hooks."""

from __future__ import annotations

import json
import re
import time
from datetime import datetime, timezone
from pathlib import Path

MARKER_DIR = Path.home() / ".claude" / "active-plans"
UNCHECKED_RE = re.compile(r"^\s*-\s\[\s\]\s*(.*)$")
CHECKED_RE = re.compile(r"^\s*-\s\[[xX]\]\s*(.*)$")
PHASE_RE = re.compile(r"^##\s+Phase\s+(\d+)\s*:\s*(.+)$")
STATUS_RE = re.compile(r"^\s*status\s*:\s*['\"]?([^'\"]+)['\"]?\s*$")


def _safe_session_id(session_id: str) -> str:
    safe = re.sub(r"[^A-Za-z0-9_.-]", "_", session_id or "unknown")
    return safe or "unknown"


def marker_path(session_id: str) -> Path:
    return MARKER_DIR / f"{_safe_session_id(session_id)}.json"


def marker_exists(session_id: str) -> bool:
    return marker_path(session_id).exists()


def _read_marker_plan_path(session_id: str) -> str | None:
    marker = marker_path(session_id)
    if not marker.exists():
        return None

    try:
        data = json.loads(marker.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None

    plan_path = data.get("plan_path")
    if not plan_path:
        return None

    candidate = Path(plan_path).expanduser()
    try:
        resolved = candidate.resolve()
    except OSError:
        return None

    if not resolved.is_file():
        return None
    return str(resolved)


def _has_in_progress_status(path: Path) -> bool:
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return False

    if not text.startswith("---"):
        return False

    lines = text.splitlines()
    closing_index = None
    for idx, line in enumerate(lines[1:], start=1):
        if line.strip() == "---":
            closing_index = idx
            break

    if closing_index is None:
        return False

    for line in lines[1:closing_index]:
        match = STATUS_RE.match(line)
        if not match:
            continue
        status = match.group(1).strip().strip('"').strip("'")
        return status == "in-progress"

    return False


def _scan_for_in_progress_plan(cwd: str) -> str | None:
    thoughts_root = Path(cwd).resolve() / "thoughts"
    if not thoughts_root.is_dir():
        return None

    candidates: list[Path] = []
    for path in thoughts_root.rglob("*.md"):
        if _has_in_progress_status(path):
            candidates.append(path.resolve())

    if not candidates:
        return None

    candidates.sort(key=lambda p: ("/plans/" not in p.as_posix(), str(p)))
    return str(candidates[0])


def find_active_plan(session_id: str, cwd: str) -> str | None:
    marker_plan_path = _read_marker_plan_path(session_id)
    if marker_plan_path:
        return marker_plan_path

    scanned_plan_path = _scan_for_in_progress_plan(cwd)
    if not scanned_plan_path:
        return None

    create_marker(session_id, scanned_plan_path)
    return scanned_plan_path


def _read_plan_lines(plan_path: str) -> list[str]:
    try:
        return Path(plan_path).read_text(encoding="utf-8").splitlines()
    except OSError:
        return []


def count_unchecked_items(plan_path: str, automated_only: bool = False) -> tuple[int, list[str]]:
    unchecked_lines: list[str] = []
    in_automated_section = False

    for raw_line in _read_plan_lines(plan_path):
        stripped = raw_line.strip()

        if automated_only:
            if stripped.startswith("#### Automated Verification:"):
                in_automated_section = True
                continue
            if in_automated_section and (
                stripped.startswith("#### ")
                or stripped.startswith("### ")
                or stripped.startswith("## ")
                or stripped == "---"
            ):
                in_automated_section = False

        if not UNCHECKED_RE.match(raw_line):
            continue
        if automated_only and not in_automated_section:
            continue

        unchecked_lines.append(stripped)

    return len(unchecked_lines), unchecked_lines


def _collect_phase_data(
    plan_path: str, automated_only: bool = False
) -> dict[str, tuple[list[str], bool]]:
    phase_order: list[str] = []
    unchecked_by_phase: dict[str, list[str]] = {}
    has_checked_by_phase: dict[str, bool] = {}

    current_phase: str | None = None
    in_automated_section = False

    for raw_line in _read_plan_lines(plan_path):
        stripped = raw_line.strip()
        phase_match = PHASE_RE.match(stripped)

        if phase_match:
            current_phase = f"Phase {phase_match.group(1)}: {phase_match.group(2).strip()}"
            if current_phase not in unchecked_by_phase:
                phase_order.append(current_phase)
                unchecked_by_phase[current_phase] = []
                has_checked_by_phase[current_phase] = False
            in_automated_section = False
            continue

        if current_phase is None:
            continue

        if stripped.startswith("#### Automated Verification:"):
            in_automated_section = True
            continue
        if in_automated_section and (
            stripped.startswith("#### ")
            or stripped.startswith("### ")
            or stripped.startswith("## ")
            or stripped == "---"
        ):
            in_automated_section = False

        if CHECKED_RE.match(raw_line):
            has_checked_by_phase[current_phase] = True

        if not UNCHECKED_RE.match(raw_line):
            continue
        if automated_only and not in_automated_section:
            continue

        unchecked_by_phase[current_phase].append(stripped)

    return {
        phase_name: (unchecked_by_phase[phase_name], has_checked_by_phase[phase_name])
        for phase_name in phase_order
    }


def count_unchecked_by_phase(
    plan_path: str, automated_only: bool = False
) -> dict[str, tuple[int, bool]]:
    return {
        phase_name: (len(unchecked_lines), has_checked)
        for phase_name, (unchecked_lines, has_checked) in _collect_phase_data(
            plan_path, automated_only=automated_only
        ).items()
    }


def unchecked_items_by_phase(
    plan_path: str, automated_only: bool = False
) -> dict[str, list[str]]:
    return {
        phase_name: unchecked_lines[:]
        for phase_name, (unchecked_lines, _has_checked) in _collect_phase_data(
            plan_path, automated_only=automated_only
        ).items()
    }


def create_marker(session_id: str, plan_path: str) -> None:
    marker = marker_path(session_id)
    payload = {
        "plan_path": str(Path(plan_path).resolve()),
        "created_at": datetime.now(timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z"),
    }

    try:
        marker.parent.mkdir(parents=True, exist_ok=True)
        marker.write_text(json.dumps(payload), encoding="utf-8")
    except OSError:
        return


def is_plan_file(file_path: str) -> bool:
    if not file_path:
        return False

    path = Path(file_path)
    return "thoughts" in {part.lower() for part in path.parts}


def should_throttle(session_id: str, interval_seconds: int = 120) -> bool:
    if not session_id:
        return False

    throttle_file = Path("/tmp") / f".plan-reminder-{_safe_session_id(session_id)}"
    now = time.time()
    last_value: float | None = None

    try:
        last_value = float(throttle_file.read_text(encoding="utf-8").strip())
    except (OSError, ValueError):
        last_value = None

    if last_value is not None and (now - last_value) < interval_seconds:
        return True

    try:
        throttle_file.write_text(str(now), encoding="utf-8")
    except OSError:
        return False

    return False


__all__ = [
    "count_unchecked_by_phase",
    "count_unchecked_items",
    "create_marker",
    "find_active_plan",
    "is_plan_file",
    "marker_exists",
    "marker_path",
    "should_throttle",
    "unchecked_items_by_phase",
]
