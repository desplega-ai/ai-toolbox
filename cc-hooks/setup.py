#!/usr/bin/env python3
"""Setup script to add mac-notify hooks to Claude Code settings."""

import json
import os
import subprocess
import sys
from pathlib import Path


def install_dependencies():
    """Install PyObjC for faster notifications."""
    try:
        from Foundation import NSUserNotification
        print("✓ PyObjC already installed (fast notifications enabled)")
    except ImportError:
        print("Installing pyobjc-framework-Cocoa for faster notifications...")
        try:
            subprocess.check_call(
                [sys.executable, "-m", "pip", "install", "pyobjc-framework-Cocoa"],
                stdout=subprocess.DEVNULL
            )
            print("✓ PyObjC installed successfully")
        except subprocess.CalledProcessError as e:
            print(f"⚠ Could not install PyObjC: {e}")
            print("  Notifications will use osascript fallback (slower)")


def main():
    # Install dependencies first
    install_dependencies()

    settings_path = Path.home() / ".claude" / "settings.json"
    script_dir = Path(__file__).parent.resolve()
    notify_script = str(script_dir / "mac-notify.py")

    # Use the current Python executable to ensure PyObjC is available
    python_exe = sys.executable
    notify_command = f"{python_exe} {notify_script}"

    # Load existing settings or create new
    if settings_path.exists():
        with open(settings_path) as f:
            settings = json.load(f)
    else:
        settings_path.parent.mkdir(parents=True, exist_ok=True)
        settings = {}

    if "hooks" not in settings:
        settings["hooks"] = {}

    if "Notification" not in settings["hooks"]:
        settings["hooks"]["Notification"] = []

    matchers = ["permission_prompt", "idle_prompt", "elicitation_dialog"]

    # Build a map of existing hooks by matcher
    existing_hooks = {h.get("matcher"): h for h in settings["hooks"]["Notification"]}

    added = []
    updated = []
    for matcher in matchers:
        if matcher not in existing_hooks:
            # Add new hook
            settings["hooks"]["Notification"].append({
                "matcher": matcher,
                "hooks": [{"type": "command", "command": notify_command}]
            })
            added.append(matcher)
        else:
            # Update existing hook to use correct Python
            hook = existing_hooks[matcher]
            old_command = hook.get("hooks", [{}])[0].get("command", "")
            if old_command != notify_command:
                hook["hooks"] = [{"type": "command", "command": notify_command}]
                updated.append(matcher)

    with open(settings_path, "w") as f:
        json.dump(settings, f, indent=2)

    if added:
        print(f"✓ Added notification hooks: {', '.join(added)}")
    if updated:
        print(f"✓ Updated notification hooks: {', '.join(updated)}")
    if not added and not updated:
        print("✓ Notification hooks already configured")
    print(f"  Settings file: {settings_path}")


if __name__ == "__main__":
    main()
