#!/usr/bin/env python3

"""
MacOS Notification Script for Claude AI

Uses PyObjC for fast native notifications (~1-5ms) with osascript fallback (~100-200ms).
"""

import json
import sys
import os

# Try PyObjC import (fast path)
try:
    from Foundation import NSUserNotification, NSUserNotificationCenter, NSUserNotificationDefaultSoundName
    HAS_PYOBJC = True
except ImportError:
    HAS_PYOBJC = False


def notify_pyobjc(title, subtitle, message):
    """Send notification via PyObjC (~1-5ms)."""
    notification = NSUserNotification.alloc().init()
    notification.setTitle_(title)
    notification.setSubtitle_(subtitle)
    notification.setInformativeText_(message)
    notification.setSoundName_(NSUserNotificationDefaultSoundName)
    NSUserNotificationCenter.defaultUserNotificationCenter().deliverNotification_(notification)


def notify_osascript(title, subtitle, message, sound="Glass"):
    """Fallback: Send notification via osascript (~100-200ms)."""
    # Escape quotes and backslashes for AppleScript
    title = title.replace('\\', '\\\\').replace('"', '\\"')
    subtitle = subtitle.replace('\\', '\\\\').replace('"', '\\"')
    message = message.replace('\\', '\\\\').replace('"', '\\"')
    apple_script = f'display notification "{message}" with title "{title}" subtitle "{subtitle}" sound name "{sound}"'
    os.system(f"osascript -e '{apple_script}'")


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

    if HAS_PYOBJC:
        notify_pyobjc(title, cwd, message)
    else:
        notify_osascript(title, cwd, message)

    print("Notification displayed successfully.")
    sys.exit(0)

except Exception as e:
    print(f"Could not process notification: {e}", file=sys.stderr)
    sys.exit(1)
