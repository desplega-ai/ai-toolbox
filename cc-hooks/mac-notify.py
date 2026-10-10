#!/usr/bin/env python3

"""
MacOS Notification Script for Claude AI

Uses pymacos when installed, with an osascript fallback. Both pass the text as
arguments, so quotes, apostrophes and emoji in the message go through as they are.
"""

import json
import sys
import os
import subprocess

# pymacos: posts the notification and raises a clear error when notifications
# are turned off for Script Editor, which macOS would otherwise drop silently.
try:
    import macos
    HAS_PYMACOS = True
except ImportError:
    HAS_PYMACOS = False


def notify_pymacos(title, subtitle, message, sound="Glass"):
    """Send notification via pymacos."""
    macos.notify(message, title=title, subtitle=subtitle, sound=sound)


def notify_osascript(title, subtitle, message, sound="Glass"):
    """Fallback: Send notification via osascript."""
    # The text goes in as arguments (on run argv), never into the script or a shell
    # command, so nothing in it needs escaping.
    statement = (
        "display notification (item 3 of argv) with title (item 1 of argv) "
        "subtitle (item 2 of argv) sound name (item 4 of argv)"
    )
    result = subprocess.run(
        ["osascript", "-e", "on run argv", "-e", statement, "-e", "end run", title, subtitle, message, sound],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        # osascript explains the failure on stderr ("execution error: ..."), which
        # says more than the exit status alone.
        raise RuntimeError(result.stderr.strip() or f"osascript exited with status {result.returncode}")


# Main execution
try:
    input_data = json.load(sys.stdin)

    notification_type = input_data.get("notification_type")
    message = input_data.get("message")
    cwd = input_data.get("cwd", os.getcwd())

    # Get the shortened cwd for display
    if cwd.startswith(os.path.expanduser("~")):
        cwd = "~" + cwd[len(os.path.expanduser("~")):]

    if not notification_type or not message:
        print("Missing required fields in input JSON.")
        sys.exit(0)

    title = f"👀 Claude - {notification_type.replace('_', ' ').title()}"

    if HAS_PYMACOS:
        notify_pymacos(title, cwd, message)
    else:
        notify_osascript(title, cwd, message)

    print("Notification displayed successfully.")
    sys.exit(0)

except Exception as e:
    print(f"Could not process notification: {e}", file=sys.stderr)
    sys.exit(1)
