"""Setup script to add ai-tracker hooks to Claude Code settings."""

import json
from pathlib import Path

from .config import get_claude_settings_path


def install_claude_hooks() -> None:
    """Install Claude Code hooks for ai-tracker."""
    settings_path = get_claude_settings_path()
    script_dir = Path(__file__).parent.resolve()
    log_edit_script = str(script_dir / "hooks" / "log_claude_edit.py")
    capture_script = str(script_dir / "hooks" / "capture_before_write.py")

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

    # Check if ai-tracker hook already exists by looking for our script path
    existing_post = [
        h
        for h in settings["hooks"]["PostToolUse"]
        if any("log_claude_edit.py" in str(hook.get("command", "")) for hook in h.get("hooks", []))
    ]

    if not existing_post:
        settings["hooks"]["PostToolUse"].append(
            {
                "matcher": "Edit|Write",
                "hooks": [{"type": "command", "command": f"python3 {log_edit_script}"}],
            }
        )
        print(f"Added PostToolUse hook: {log_edit_script}")

    # Add PreToolUse hook for Write (to capture original content)
    if "PreToolUse" not in settings["hooks"]:
        settings["hooks"]["PreToolUse"] = []

    existing_pre = [
        h
        for h in settings["hooks"]["PreToolUse"]
        if any("capture_before_write.py" in str(hook.get("command", "")) for hook in h.get("hooks", []))
    ]

    if not existing_pre:
        settings["hooks"]["PreToolUse"].append(
            {
                "matcher": "Write",
                "hooks": [{"type": "command", "command": f"python3 {capture_script}"}],
            }
        )
        print(f"Added PreToolUse hook: {capture_script}")

    with open(settings_path, "w") as f:
        json.dump(settings, f, indent=2)

    print(f"\nUpdated {settings_path}")
    print("Claude Code hooks installed successfully!")
