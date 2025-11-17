#!/usr/bin/env python3

"""
MacOS Notification Script for Claude AI
"""

import json
import sys
import os

# {
#   "session_id": "abc123",
#   "transcript_path": "/Users/.../.claude/projects/.../00893aaf-19fa-41d2-8238-13269b9b3ca0.jsonl",
#   "cwd": "/Users/...",
#   "permission_mode": "default",
#   "hook_event_name": "Notification",
#   "message": "Claude needs your permission to use Bash",
#   "notification_type": "permission_prompt"
# }

# Main execution
try:
    input_data = json.load(sys.stdin)

    notification_type = input_data.get("notification_type")
    permission_mode = input_data.get("permission_mode")
    message = input_data.get("message")

    cwd = input_data.get("cwd", os.getcwd())

    # Get the shortened cwd for display
    if cwd.startswith(os.path.expanduser("~")):
        cwd = "~" + cwd[len(os.path.expanduser("~")):]

    if not notification_type or not message:
        print("Missing required fields in input JSON.")
        sys.exit(0)

    # Use AppleScript to display notification
    # osascript -e 'display notification "Task completed!" with title "Build Status" subtitle "Success" sound name "Glass"'

    title = f"👀 Claude - {notification_type.replace('_', ' ').title()}"

    apple_script = f'display notification "{message}" with title "{title}" subtitle "{cwd}" sound name "Glass"'

    os.system(f"osascript -e '{apple_script}'")
    print("Notification displayed successfully.")

    sys.exit(0)
    
except Exception as e:
    print(f"Could not process notification: {e}", file=sys.stderr)
    sys.exit(1)
