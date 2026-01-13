"""Setup script to add ai-tracker hooks to Claude Code settings."""

import json
from pathlib import Path

from .config import get_claude_settings_path


def _is_uvx_install() -> bool:
    """Check if running from uvx cache."""
    return ".cache/uv" in str(Path(__file__).resolve())


def _get_hook_commands() -> tuple[str, str]:
    """Get the appropriate hook commands based on install method.

    Returns: (post_tool_command, pre_tool_command)
    """
    if _is_uvx_install():
        return (
            "uvx cc-ai-tracker hook-post-tool",
            "uvx cc-ai-tracker hook-pre-tool",
        )
    else:
        return (
            "ai-tracker hook-post-tool",
            "ai-tracker hook-pre-tool",
        )


def install_claude_hooks() -> None:
    """Install Claude Code hooks for ai-tracker."""
    settings_path = get_claude_settings_path()
    post_tool_cmd, pre_tool_cmd = _get_hook_commands()

    # Load existing settings or create new
    if settings_path.exists():
        with open(settings_path) as f:
            settings = json.load(f)
    else:
        settings_path.parent.mkdir(parents=True, exist_ok=True)
        settings = {}

    if "hooks" not in settings:
        settings["hooks"] = {}

    # Add PostToolUse hook for Edit and Write
    if "PostToolUse" not in settings["hooks"]:
        settings["hooks"]["PostToolUse"] = []

    # Remove any existing ai-tracker hooks first
    settings["hooks"]["PostToolUse"] = [
        h for h in settings["hooks"]["PostToolUse"]
        if not any("ai-tracker" in str(hook.get("command", "")) or "log_claude_edit.py" in str(hook.get("command", "")) for hook in h.get("hooks", []))
    ]

    # Add new hook
    settings["hooks"]["PostToolUse"].append(
        {
            "matcher": "Edit|Write",
            "hooks": [{"type": "command", "command": post_tool_cmd}],
        }
    )
    print(f"Added PostToolUse hook: {post_tool_cmd}")

    # Add PreToolUse hook for Write (to capture original content)
    if "PreToolUse" not in settings["hooks"]:
        settings["hooks"]["PreToolUse"] = []

    # Remove any existing ai-tracker hooks first
    settings["hooks"]["PreToolUse"] = [
        h for h in settings["hooks"]["PreToolUse"]
        if not any("ai-tracker" in str(hook.get("command", "")) or "capture_before_write.py" in str(hook.get("command", "")) for hook in h.get("hooks", []))
    ]

    # Add new hook
    settings["hooks"]["PreToolUse"].append(
        {
            "matcher": "Write",
            "hooks": [{"type": "command", "command": pre_tool_cmd}],
        }
    )
    print(f"Added PreToolUse hook: {pre_tool_cmd}")

    with open(settings_path, "w") as f:
        json.dump(settings, f, indent=2)

    print(f"\nUpdated {settings_path}")
    print("Claude Code hooks installed successfully!")


def uninstall_claude_hooks() -> None:
    """Remove Claude Code hooks for ai-tracker."""
    settings_path = get_claude_settings_path()

    if not settings_path.exists():
        print("No Claude settings file found.")
        return

    with open(settings_path) as f:
        settings = json.load(f)

    if "hooks" not in settings:
        print("No hooks configured.")
        return

    removed = False

    # Remove PostToolUse hooks
    if "PostToolUse" in settings["hooks"]:
        original_len = len(settings["hooks"]["PostToolUse"])
        settings["hooks"]["PostToolUse"] = [
            h for h in settings["hooks"]["PostToolUse"]
            if not any("ai-tracker" in str(hook.get("command", "")) or "log_claude_edit.py" in str(hook.get("command", "")) for hook in h.get("hooks", []))
        ]
        if len(settings["hooks"]["PostToolUse"]) < original_len:
            removed = True
            print("Removed PostToolUse hook")

    # Remove PreToolUse hooks
    if "PreToolUse" in settings["hooks"]:
        original_len = len(settings["hooks"]["PreToolUse"])
        settings["hooks"]["PreToolUse"] = [
            h for h in settings["hooks"]["PreToolUse"]
            if not any("ai-tracker" in str(hook.get("command", "")) or "capture_before_write.py" in str(hook.get("command", "")) for hook in h.get("hooks", []))
        ]
        if len(settings["hooks"]["PreToolUse"]) < original_len:
            removed = True
            print("Removed PreToolUse hook")

    if removed:
        with open(settings_path, "w") as f:
            json.dump(settings, f, indent=2)
        print(f"\nUpdated {settings_path}")
        print("Claude Code hooks removed successfully!")
    else:
        print("No ai-tracker hooks found to remove.")
