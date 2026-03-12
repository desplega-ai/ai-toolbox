"""tmux send-keys helper for desplega teams plugin.

Delivers messages to tmux panes. Handles vim mode (Escape → i),
message truncation, and pane existence checks.
"""

import subprocess
import sys


MAX_MESSAGE_LEN = 500


def send_to_pane(target, text, vim_mode=False):
    """Send text to a tmux pane via send-keys.

    Args:
        target: tmux pane identifier (e.g., "%42")
        text: message text to send
        vim_mode: if True, send Escape + i before text

    Returns:
        True if delivery succeeded, False if pane doesn't exist.
    """
    if not target:
        return False

    # Check target pane exists
    try:
        result = subprocess.run(
            ["tmux", "display-message", "-t", target, "-p", "#{pane_id}"],
            capture_output=True,
            timeout=5,
        )
        if result.returncode != 0:
            return False
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return False

    # Truncate long messages (reserve space for suffix)
    truncation_suffix = "... [truncated — use read-messages]"
    if len(text) > MAX_MESSAGE_LEN:
        text = text[:MAX_MESSAGE_LEN - len(truncation_suffix)] + truncation_suffix

    try:
        # Vim mode: escape insert mode first, then re-enter
        if vim_mode:
            subprocess.run(
                ["tmux", "send-keys", "-t", target, "Escape"],
                capture_output=True,
                timeout=5,
            )
            subprocess.run(
                ["tmux", "send-keys", "-t", target, "i"],
                capture_output=True,
                timeout=5,
            )

        # Send the text literally (-l flag), then Enter
        subprocess.run(
            ["tmux", "send-keys", "-t", target, "-l", text],
            capture_output=True,
            timeout=5,
        )
        subprocess.run(
            ["tmux", "send-keys", "-t", target, "Enter"],
            capture_output=True,
            timeout=5,
        )
        return True
    except (subprocess.TimeoutExpired, Exception) as e:
        print(f"WARNING: tmux send-keys failed: {e}", file=sys.stderr)
        return False
