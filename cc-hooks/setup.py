#!/usr/bin/env python3
"""Setup script to add mac-notify hooks to Claude Code settings."""

import json
import os
from pathlib import Path

def main():
    settings_path = Path.home() / ".claude" / "settings.json"
    script_dir = Path(__file__).parent.resolve()
    notify_script = str(script_dir / "mac-notify.py")

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
    existing_matchers = {h.get("matcher") for h in settings["hooks"]["Notification"]}

    for matcher in matchers:
        if matcher not in existing_matchers:
            settings["hooks"]["Notification"].append({
                "matcher": matcher,
                "hooks": [{"type": "command", "command": notify_script}]
            })

    with open(settings_path, "w") as f:
        json.dump(settings, f, indent=2)

    print(f"Added notification hooks to {settings_path}")

if __name__ == "__main__":
    main()
