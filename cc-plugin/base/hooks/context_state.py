"""Shared helpers for the context-window warning + stop-confirm hooks."""

from __future__ import annotations

import getpass
import json
import os
import pathlib
import re
from typing import Any

STATE_DIR = (
    pathlib.Path.home()
    / ".claude"
    / "plugins"
    / "desplega"
    / "context-warn-state"
)

LEVELS = ("ok", "warn", "severe", "yolo")


def _user_name() -> str:
    """Best-effort display name for the human running this session.

    The plugin is installed by many people, so the warning messages must not
    be hard-coded to one name. Resolution order:
      1. DESPLEGA_USER_NAME env override (explicit wins).
      2. The OS account's real name (passwd gecos), first token.
      3. The login / home-dir name, capitalized.
      4. The neutral fallback "the user".
    """
    override = os.environ.get("DESPLEGA_USER_NAME", "").strip()
    if override:
        return override
    try:
        import pwd

        gecos = pwd.getpwuid(os.getuid()).pw_gecos.split(",")[0].strip()
        if gecos:
            return gecos.split()[0]
    except Exception:
        pass
    try:
        login = (getpass.getuser() or "").strip()
    except Exception:
        login = ""
    if not login:
        login = os.path.basename(os.path.expanduser("~")).strip()
    if login and login.isascii() and login.replace("-", "").replace("_", "").isalnum():
        return login[:1].upper() + login[1:]
    return "the user"


USER = _user_name()


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


def read_usage(transcript_path: str) -> tuple[int, int, str]:
    """Return (last_used, peak_used, model_id) across assistant usage records.

    ``last_used`` is the newest assistant message's token total and drives the
    current pressure classification. ``peak_used`` is the maximum ever seen in
    this transcript; since you cannot accumulate >200k tokens in a 200k window,
    a peak above 200k proves a 1M window even when the model/env signals miss
    the (display-stripped) ``[1m]`` variant.
    """
    try:
        with open(transcript_path, encoding="utf-8") as f:
            lines = f.readlines()
    except (FileNotFoundError, OSError):
        return 0, 0, ""

    last_used = 0
    peak_used = 0
    model = ""
    for line in lines:
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
        last_used = used
        if used > peak_used:
            peak_used = used
        model = str(msg.get("model") or model)
    return last_used, peak_used, model


_ENV_MODEL_KEYS = (
    "ANTHROPIC_MODEL",
    "ANTHROPIC_SMALL_FAST_MODEL",
    "_ANTHROPIC_DEFAULT_HAIKU_MODEL",
    "_ANTHROPIC_DEFAULT_SONNET_MODEL",
    "_ANTHROPIC_DEFAULT_OPUS_MODEL",
)


def _env_signals_1m() -> bool:
    """True if any Claude Code env var advertises a [1m] model variant.

    The transcript's `message.model` field drops the `[1m]` suffix (it's a
    display-only marker), so we also consult env vars that CC propagates to
    hook subprocesses when 1M variants are active.
    """
    for key in _ENV_MODEL_KEYS:
        val = os.environ.get(key, "")
        if "[1m]" in val.lower():
            return True
    return False


# Families that run with a 1M-token context window. Claude Code strips the
# "[1m]" variant suffix from everything it writes to disk (transcript + session
# store), and only SessionStart hooks receive a model field — so the
# UserPromptSubmit/Stop hooks here cannot read the live variant. We therefore
# default these modern families to their 1M window; positive signals ([1m] in
# the model string or env, observed usage) only ever upgrade, never downgrade.
_MODEL_RE = re.compile(r"claude-(opus|sonnet|haiku)-(\d+)-(\d+)")


def _family_supports_1m(model: str) -> bool:
    m = _MODEL_RE.search((model or "").lower())
    if not m:
        return False
    family, major, minor = m.group(1), int(m.group(2)), int(m.group(3))
    if family == "haiku":
        return False  # Haiku has no 1M variant
    if major != 4:
        return major > 4  # 5.x+ assumed 1M; <4 was 200k-only
    if family == "sonnet":
        return True  # all Sonnet 4.x support the 1M context beta
    return minor >= 6  # Opus 4.6+ support the 1M context beta


def window_size(model: str, peak_used: int = 0) -> int:
    # Proven by observation: >200k tokens cannot fit a 200k window.
    if peak_used > 200_000:
        return 1_000_000
    if "[1m]" in (model or "").lower():
        return 1_000_000
    if _env_signals_1m():
        return 1_000_000
    if _family_supports_1m(model):
        return 1_000_000
    return 200_000


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
        f"new session) / (yolo this session). If {USER} picks 'yolo', write "
        f'{{"level":"severe","yolo":true}} to {flag_path}. Don\'t recommend '
        f"/compact; accept if {USER} insists.\n{TAIL}"
    )


def yolo_tier_msg(used: int, total: int, flag_path: pathlib.Path) -> str:
    u, t, pct = render_usage(used, total)
    return (
        f"{u}/{t} ({pct}%) — I see you like gambling. STOP. Use AskUserQuestion "
        f"before anything else; handing off to a new session is strongly advised. "
        f'If {USER} picks yolo, write {{"level":"yolo","yolo":true}} to {flag_path}.\n{TAIL}'
    )


def soft_warn_for_yolo_session(used: int, total: int) -> str:
    """Used when yolo flag is set — keep showing usage but no pause."""
    u, t, pct = render_usage(used, total)
    return f"Context: {u}/{t} ({pct}%). (yolo session — no pause.) {TAIL}"


def stop_block_reason(level: str, used: int, total: int, flag_path: pathlib.Path) -> str:
    u, t, pct = render_usage(used, total)
    return (
        f"Context is at {level} ({u}/{t}, {pct}%). Before ending, use "
        f"AskUserQuestion to ask {USER}: (a) hand off to a new session "
        f"(persist state to thoughts/ first), (b) continue, or (c) yolo this "
        f'session (write {{"level":"{level}","yolo":true}} to {flag_path}). '
        f"Don't recommend /compact."
    )
