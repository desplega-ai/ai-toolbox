"""Shared helpers for the context-window warning + stop-confirm hooks."""

from __future__ import annotations

import json
import pathlib
from typing import Any

STATE_DIR = (
    pathlib.Path.home()
    / ".claude"
    / "plugins"
    / "desplega"
    / "context-warn-state"
)

LEVELS = ("ok", "warn", "severe", "yolo")


def state_path(session_id: str) -> pathlib.Path:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    return STATE_DIR / f"{session_id}.json"


def load_state(session_id: str) -> dict[str, Any]:
    try:
        return json.loads(state_path(session_id).read_text())
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def save_state(session_id: str, state: dict[str, Any]) -> None:
    state_path(session_id).write_text(json.dumps(state))


def read_last_usage(transcript_path: str) -> tuple[int, str]:
    """Return (used_tokens, model_id) from the newest assistant message with usage."""
    try:
        with open(transcript_path, encoding="utf-8") as f:
            lines = f.readlines()
    except (FileNotFoundError, OSError):
        return 0, ""

    for line in reversed(lines):
        try:
            rec = json.loads(line)
        except json.JSONDecodeError:
            continue
        msg = rec.get("message") or {}
        if msg.get("role") != "assistant":
            continue
        usage = msg.get("usage")
        if not usage:
            continue
        used = (
            int(usage.get("input_tokens") or 0)
            + int(usage.get("cache_creation_input_tokens") or 0)
            + int(usage.get("cache_read_input_tokens") or 0)
        )
        return used, str(msg.get("model") or "")
    return 0, ""


def window_size(model: str) -> int:
    return 1_000_000 if "[1m]" in (model or "").lower() else 200_000


def classify(used: int, total: int) -> str:
    if total >= 900_000:
        if used > 500_000:
            return "yolo"
        if used > 350_000:
            return "severe"
        if used > 200_000:
            return "warn"
        return "ok"
    if total <= 0:
        return "ok"
    pct = used / total
    if pct > 0.60:
        return "severe"
    if pct >= 0.40:
        return "warn"
    return "ok"


def level_rank(level: str) -> int:
    try:
        return LEVELS.index(level)
    except ValueError:
        return 0


def format_tokens(n: int) -> str:
    if n >= 1_000_000:
        return f"{n / 1_000_000:.2f}M"
    if n >= 1_000:
        return f"{n // 1_000}k"
    return str(n)


def render_usage(used: int, total: int) -> tuple[str, str, int]:
    pct = round(100 * used / total) if total else 0
    return format_tokens(used), format_tokens(total), pct


TAIL = "Recs: sub-agents · thoughts/ · avoid /compact · watch tokens+%."


def warn_msg(used: int, total: int) -> str:
    u, t, pct = render_usage(used, total)
    return (
        f"Context heads-up: {u}/{t} ({pct}%). Start offloading — sub-agents for "
        f"research, persist progress to thoughts/ files. Avoid /compact so those "
        f"files keep value.\n{TAIL}"
    )


def severe_msg(used: int, total: int, flag_path: pathlib.Path) -> str:
    u, t, pct = render_usage(used, total)
    return (
        f"Context tight: {u}/{t} ({pct}%). STOP next non-readonly action. Use "
        f"AskUserQuestion: (continue) / (hand off — persist to thoughts/ then "
        f"new session) / (yolo this session). If Taras picks 'yolo', write "
        f'{{"level":"severe","yolo":true}} to {flag_path}. Don\'t recommend '
        f"/compact; accept if Taras insists.\n{TAIL}"
    )


def yolo_tier_msg(used: int, total: int, flag_path: pathlib.Path) -> str:
    u, t, pct = render_usage(used, total)
    return (
        f"{u}/{t} ({pct}%) — I see you like gambling. STOP. Use AskUserQuestion "
        f"before anything else; handing off to a new session is strongly advised. "
        f'If Taras picks yolo, write {{"level":"yolo","yolo":true}} to {flag_path}.\n{TAIL}'
    )


def soft_warn_for_yolo_session(used: int, total: int) -> str:
    """Used when yolo flag is set — keep showing usage but no pause."""
    u, t, pct = render_usage(used, total)
    return f"Context: {u}/{t} ({pct}%). (yolo session — no pause.) {TAIL}"


def stop_block_reason(level: str, used: int, total: int, flag_path: pathlib.Path) -> str:
    u, t, pct = render_usage(used, total)
    return (
        f"Context is at {level} ({u}/{t}, {pct}%). Before ending, use "
        f"AskUserQuestion to ask Taras: (a) hand off to a new session "
        f"(persist state to thoughts/ first), (b) continue, or (c) yolo this "
        f'session (write {{"level":"{level}","yolo":true}} to {flag_path}). '
        f"Don't recommend /compact."
    )
