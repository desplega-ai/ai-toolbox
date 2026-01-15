# cc-hooks

Claude Code hooks for macOS notifications.

## Setup

```bash
python setup.py
```

This will:
1. Install `pyobjc-framework-Cocoa` for fast native notifications
2. Add notification hooks to `~/.claude/settings.json`

Hooks are added for: permission prompts, idle prompts, and elicitation dialogs.

## Performance

The script uses PyObjC's NSUserNotificationCenter for fast notifications (~1-5ms). If PyObjC is not available, it falls back to osascript (~100-200ms).

## Manual Dependency Install

If auto-install fails, you can install manually:

```bash
pip install pyobjc-framework-Cocoa
```
