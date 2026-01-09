---
date: 2026-01-09T09:45:00-08:00
researcher: Claude
git_commit: e616532d713c40f206a01f26e6ae3f25c1edff27
branch: main
repository: ai-toolbox
topic: "Existing Claude Code hooks setup audit"
tags: [research, claude-code, hooks, wakatime, ai-tracker, settings]
status: complete
last_updated: 2026-01-09
last_updated_by: Claude
---

# Research: Existing Claude Code Hooks Setup

**Date**: 2026-01-09T09:45:00-08:00
**Researcher**: Claude
**Git Commit**: e616532d713c40f206a01f26e6ae3f25c1edff27
**Branch**: main
**Repository**: ai-toolbox

## Research Question
What hooks configuration already exists in ~/.claude/settings.json? Document existing hooks (like wakatime) that need to be preserved/merged when adding the ai-tracker hook.

## Summary

The `~/.claude/settings.json` file contains a comprehensive hooks configuration with two main systems:

1. **WakaTime Integration** - Installed globally via npm, tracks coding activity across 5 hook events
2. **Mac Notification System** - Local Python script handling 3 notification types

When adding the ai-tracker hook, these existing hooks must be preserved by adding the new hook to the `hooks` array within each matcher configuration.

## Detailed Findings

### Current Hook Events Configuration

The settings.json defines hooks for 6 different Claude Code events:

| Hook Event | Matchers | Commands |
|------------|----------|----------|
| PreToolUse | `*` (all tools) | claude-code-wakatime |
| PostToolUse | `*` (all tools) | claude-code-wakatime |
| UserPromptSubmit | `*` (all prompts) | claude-code-wakatime |
| SessionStart | `*` (all sessions) | claude-code-wakatime |
| Stop | `*` (all stops) | claude-code-wakatime |
| Notification | permission_prompt, idle_prompt, elicitation_dialog | mac-notify.py |

### WakaTime Hook

**Location**: `/Users/taras/.nvm/versions/node/v23.9.0/bin/claude-code-wakatime`

The WakaTime hook is registered on 5 events with a wildcard matcher (`*`), meaning it fires for all tool uses, prompts, session starts, and stops. This is a global npm package.

**Current Configuration Pattern** (repeated for each event):
```json
{
  "matcher": "*",
  "hooks": [
    {
      "type": "command",
      "command": "claude-code-wakatime"
    }
  ]
}
```

### Mac Notification Hook

**Location**: `/Users/taras/Documents/code/ai-toolbox/cc-hooks/mac-notify.py`

A Python script that displays macOS native notifications using AppleScript. It handles three notification types:
- `permission_prompt` - When Claude needs user permission
- `idle_prompt` - When Claude is waiting for user input
- `elicitation_dialog` - When Claude needs clarification

The script receives JSON via stdin with fields: `session_id`, `transcript_path`, `cwd`, `permission_mode`, `hook_event_name`, `message`, `notification_type`.

### Other Settings of Note

The settings.json also contains:
- `cleanupPeriodDays`: 9999999 (effectively disabled)
- `permissions.defaultMode`: "default"
- `statusLine`: Custom status line using `bun /Users/taras/.claude/statusline.ts`
- `enabledPlugins`: Various plugins including base@desplega-ai-toolbox
- `alwaysThinkingEnabled`: false
- `promptSuggestionEnabled`: false

## Merge Strategy for ai-tracker Hook

### Recommended Approach: Add to Existing Arrays

The Claude Code hooks system supports multiple hooks per matcher. To add ai-tracker while preserving existing hooks, add it to the `hooks` array within each matcher:

**Example for PreToolUse** (apply same pattern to other events):
```json
{
  "PreToolUse": [
    {
      "matcher": "*",
      "hooks": [
        {
          "type": "command",
          "command": "claude-code-wakatime"
        },
        {
          "type": "command",
          "command": "/path/to/ai-tracker-hook"
        }
      ]
    }
  ]
}
```

### Events to Target for ai-tracker

Based on the existing wakatime pattern, ai-tracker should likely hook into:
- **PreToolUse** - Track when tools are about to be used
- **PostToolUse** - Track after tools complete (for cost/token tracking)
- **UserPromptSubmit** - Track user interactions
- **SessionStart** - Track session beginnings
- **Stop** - Track session endings

### Implementation Considerations

1. **Order of Execution**: Hooks in the array execute in order. If ai-tracker needs data from prior hooks, place it later in the array.

2. **Failure Isolation**: Each hook executes independently. A failing hook should not affect others.

3. **Script vs Global Command**:
   - WakaTime uses a global npm command (`claude-code-wakatime`)
   - Mac-notify uses an absolute path to a script
   - ai-tracker should use an absolute path for consistency with the local setup

4. **Input Format**: Hooks receive JSON via stdin. The ai-tracker hook should parse the same format used by mac-notify.py.

## Code References

- `~/.claude/settings.json` - Main Claude Code settings file
- `/Users/taras/Documents/code/ai-toolbox/cc-hooks/mac-notify.py` - Mac notification script example
- `/Users/taras/.nvm/versions/node/v23.9.0/bin/claude-code-wakatime` - WakaTime global command

## Settings File Structure

```json
{
  "cleanupPeriodDays": 9999999,
  "permissions": { "defaultMode": "default" },
  "hooks": {
    "PreToolUse": [...],
    "PostToolUse": [...],
    "UserPromptSubmit": [...],
    "SessionStart": [...],
    "Stop": [...],
    "Notification": [...]
  },
  "statusLine": {...},
  "enabledPlugins": {...},
  "alwaysThinkingEnabled": false,
  "promptSuggestionEnabled": false
}
```

## Related Research

- `/Users/taras/Documents/code/ai-toolbox/thoughts/shared/research/2026-01-08-cc-notch-macos-menubar-cost-tracker.md` - Research on cost tracking for Claude Code
- `/Users/taras/Documents/code/ai-toolbox/thoughts/shared/plans/2026-01-08-cc-notch-menubar-cost-tracker.md` - Implementation plan for menubar cost tracker

## Open Questions

1. Should ai-tracker use the same events as wakatime (all 5) or a subset?
2. What is the expected input/output format for the ai-tracker hook?
3. Should ai-tracker be installed as a global command or remain as a local script?
4. Does ai-tracker need to integrate with the existing statusline.ts for real-time display?
