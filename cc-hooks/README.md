# cc-hooks

Claude Code hooks for macOS notifications.

## Setup

```bash
python setup.py
```

This will:
1. Install `pymacos` for notifications
2. Add notification hooks to `~/.claude/settings.json`

Hooks are added for: permission prompts, idle prompts, and elicitation dialogs.

## How it works

The script sends the notification with [pymacos](https://github.com/JeanExtreme002/pymacos), which has no dependencies of its own and raises a clear error when notifications are turned off. If pymacos isn't installed, it falls back to `osascript`. Either way the message is passed as an argument, so quotes and apostrophes in it are fine.

Notifications show as coming from *Script Editor*: allow them in System Settings › Notifications › Script Editor.

## Manual Dependency Install

If auto-install fails, you can install manually:

```bash
pip install pymacos
```
