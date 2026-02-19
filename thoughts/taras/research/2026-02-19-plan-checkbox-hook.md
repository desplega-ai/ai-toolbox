---
date: 2026-02-19T00:00:00Z
topic: "Plan Checkbox Hook for cc-plugin/base"
author: Claude
status: draft
tags: [research, claude-code, hooks, cc-plugin, plan-tracking]
---

# Research: Plan Checkbox Hook for cc-plugin/base

## Goal

Implement a hook in `cc-plugin/base` that reminds/instructs the agent to check off completed items (`- [ ]` → `- [x]`) in the plan file it's working on after completing implementation steps.

## Current State

### Existing Hook Infrastructure

The plugin (`cc-plugin/base`) currently has **exactly one hook** registered in `.claude-plugin/plugin.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PLUGIN_ROOT}/hooks/validate-thoughts.py"
          }
        ]
      }
    ]
  }
}
```

This `validate-thoughts.py` hook:
- Fires before `Write` or `Edit` tool calls
- Only acts on files inside `thoughts/` directory
- Validates path format and frontmatter structure
- Uses **exit code 2 + stderr** to block and inject corrective messages back to Claude

There are **no** `PostToolUse`, `Stop`, `TaskCompleted`, or any other hook types registered.

### How the Implementing Skill Tracks Progress

The `skills/implementing/SKILL.md` already instructs Claude to:
1. Read the plan completely and check for existing `- [x]` checkmarks
2. Create a TodoWrite list for in-session tracking
3. After each phase, check off items via `Edit` tool calls
4. Resume from the first unchecked item if rejoining a session

**The problem**: These are _instructions in the skill markdown_, not enforced behavior. The agent can (and does) forget to check off boxes, especially during long implementation sessions or when focused on fixing issues.

### Plan File Format

Plans follow a consistent structure:
- YAML frontmatter with `status`, `date`, `topic`, `autonomy` fields
- Phases with `## Phase N: Name` headings
- Per-phase `### Success Criteria:` with checkbox items (`- [ ]` / `- [x]`)
- End-of-plan verification sections with checkboxes
- Rollout checklists with checkboxes

Checkbox patterns found:
```markdown
- [ ] `bun tsc --noEmit` passes          # Unchecked
- [x] `uv sync` runs without errors       # Checked
```

## Claude Code Hook System

### Available Hook Events (14 total)

| Event | Matcher Support | Key Use |
|-------|----------------|---------|
| `SessionStart` | `startup`, `resume`, `clear`, `compact` | Initial context injection |
| `UserPromptSubmit` | No | Augment user prompts |
| `PreToolUse` | Tool names (`Edit`, `Write`, `Bash`, etc.) | Gate/validate tool calls |
| `PermissionRequest` | Tool names | Auto-approve/deny |
| **`PostToolUse`** | **Tool names** | **React after tool execution** |
| `PostToolUseFailure` | Tool names | React to failures |
| `Notification` | Notification types | React to notifications |
| `SubagentStart` / `SubagentStop` | Agent types | Subagent lifecycle |
| **`Stop`** | **No** | **Prevent agent from stopping** |
| `TeammateIdle` | No | Multi-agent coordination |
| **`TaskCompleted`** | **No** | **React to task completion** |
| `PreCompact` | `manual`, `auto` | Before context compaction |
| `SessionEnd` | End reasons | Session cleanup |

### Hook Handler Types

1. **Command** (`type: "command"`): Shell script, receives JSON on stdin
2. **Prompt** (`type: "prompt"`): Single-turn LLM evaluation
3. **Agent** (`type: "agent"`): Multi-turn LLM agent with tool access (up to 50 turns)

### How Hooks Can Inject Messages

| Event | Injection Mechanism |
|-------|-------------------|
| `PreToolUse` | `additionalContext` in `hookSpecificOutput` (exit 0) or stderr (exit 2 to block) |
| **`PostToolUse`** | **`additionalContext` field — fed back to Claude after tool completes** |
| `UserPromptSubmit` | `additionalContext` or plain stdout |
| `SessionStart` | `additionalContext` |
| `SubagentStart` | `additionalContext` |
| `Stop` | `decision: "block"` with reason — **strictly block/allow, no informational-only mode** |
| Async hooks | `systemMessage` (shown on next turn) or `additionalContext` |

### Key Finding: Skill-Scoped Hooks (Frontmatter)

**Hooks can be defined directly in a skill's YAML frontmatter.** These hooks:
- Only fire when that skill is active
- Are automatically cleaned up when the skill finishes
- Eliminate the need for session detection or marker files

```yaml
---
name: my-skill
hooks:
  PostToolUse:
    - matcher: "Edit|Write"
      hooks:
        - type: command
          command: "./hooks/my-hook.sh"
---
```

This is the cleanest solution for scoping hooks to the implementing skill only.

### Stop Hook Behavior (Detailed)

- `decision: "block"` + `reason` prevents Claude from stopping; reason is shown to Claude as instruction to continue
- **No informational-only mode** — Stop hooks are strictly block/allow
- **Block-once pattern is possible**: Use a counter file + `stop_hook_active` field to block first attempt, allow second
- `stop_hook_active` field in input tells you if Claude is already continuing from a previous stop hook block (prevents infinite loops)
- `additionalContext` is **NOT** available for Stop hooks — only `decision` and `reason`

### Hook Input Data (stdin JSON)

All hooks receive:
```json
{
  "session_id": "...",
  "transcript_path": "/path/to/transcript.jsonl",
  "cwd": "/current/working/dir",
  "permission_mode": "default",
  "hook_event_name": "PostToolUse"
}
```

`PostToolUse` additionally receives: `tool_name`, `tool_input`, `tool_response`, `tool_use_id`.
`Stop` receives: `stop_hook_active`, `last_assistant_message`.

### Session Detection Limitations

- **No built-in way** for a hook to know which skill is currently active
- `transcript_path` could be parsed to find skill invocation markers, but this is fragile
- The hook system intentionally provides minimal environmental context
- **Solution: Use skill-scoped frontmatter hooks** (see above) — they inherently only fire when the skill is active

## Recommended Approach

### Architecture: Skill-Scoped PostToolUse + Stop Hook with Marker File

Two complementary mechanisms working together:

#### 1. Skill-Scoped PostToolUse Hook (Gentle Reminders)

Define a `PostToolUse` hook **in the implementing skill's SKILL.md frontmatter**. This eliminates the session detection problem entirely — the hook only fires when the implementing skill is active.

The hook:
- Fires after `Edit` or `Write` tool calls
- Reads a marker file at `~/.claude/active-plans/<session_id>.json` to find the active plan
- Skips if the edited file IS the plan file (already updating it)
- Uses **time-based throttling** (remind every ~2 minutes, not every edit)
- Also scans for plans with `status: in-progress` in frontmatter as fallback
- Returns `additionalContext` with a gentle reminder

#### 2. Skill-Scoped Stop Hook (Block-Once Enforcement)

Define a `Stop` hook in the same skill frontmatter. When Claude tries to stop:
- First time: Check plan for unchecked items, **block** with reason explaining what to check off
- Second time (`stop_hook_active: true`): Allow Claude to stop (prevents infinite loops)

This gives enforcement without being obnoxious.

#### 3. Marker File at `~/.claude/active-plans/`

- **Location**: `~/.claude/active-plans/<session_id>.json` — avoids git pollution, supports multiple concurrent implementations
- **Written by**: Implementing skill at start of implementation
- **Content**: `{ "plan_path": "/absolute/path/to/plan.md", "started_at": "ISO-8601" }`
- **Cleaned up by**: Implementing skill on completion + `SessionEnd` hook as safety net

### Why This Approach

1. **Skill-scoped hooks** solve the "only during implementation" problem cleanly — no session parsing needed
2. **Marker file in `~/.claude/`** avoids git pollution and supports multiple repos (per Taras's feedback)
3. **Time-based throttling** over count-based (per Taras's feedback)
4. **Frontmatter scanning** (`status: in-progress`) as fallback alongside marker file (per Taras's feedback)
5. **Non-blocking reminders** (PostToolUse) + **one-time enforcement** (Stop) covers both gentle and firm nudges
6. **Lightweight** — bash scripts, not LLM agents

### Implementation Sketch

#### Implementing Skill Frontmatter Addition

```yaml
---
# ... existing frontmatter ...
hooks:
  PostToolUse:
    - matcher: "Edit|Write"
      hooks:
        - type: command
          command: "${CLAUDE_PLUGIN_ROOT}/hooks/plan-checkbox-reminder.sh"
  Stop:
    - hooks:
        - type: command
          command: "${CLAUDE_PLUGIN_ROOT}/hooks/plan-checkbox-stop.sh"
---
```

#### PostToolUse Hook (`plan-checkbox-reminder.sh`)

```bash
#!/bin/bash
# hooks/plan-checkbox-reminder.sh
# Gentle reminder to check off plan items after code edits
INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // ""')
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // ""')

# Skip if editing a plan file directly (already working on it)
if [[ "$FILE_PATH" == *"/thoughts/"* ]]; then
  exit 0
fi

# Find active plan via marker file
MARKER="$HOME/.claude/active-plans/${SESSION_ID}.json"
PLAN_FILE=""
if [[ -f "$MARKER" ]]; then
  PLAN_FILE=$(jq -r '.plan_path // ""' "$MARKER")
fi

# Fallback: scan for in-progress plans via frontmatter
if [[ -z "$PLAN_FILE" || ! -f "$PLAN_FILE" ]]; then
  CWD=$(echo "$INPUT" | jq -r '.cwd // ""')
  PLAN_FILE=$(grep -rl '^status: in-progress' "$CWD/thoughts/" 2>/dev/null | head -1)
fi

if [[ -z "$PLAN_FILE" || ! -f "$PLAN_FILE" ]]; then
  exit 0
fi

# Count unchecked items
UNCHECKED=$(grep -c '^\s*- \[ \]' "$PLAN_FILE" 2>/dev/null || echo 0)
if [[ "$UNCHECKED" -eq 0 ]]; then
  exit 0
fi

# Time-based throttle: remind at most every 2 minutes
THROTTLE_FILE="/tmp/.plan-reminder-${SESSION_ID}"
NOW=$(date +%s)
LAST_REMINDER=$(cat "$THROTTLE_FILE" 2>/dev/null || echo 0)
ELAPSED=$((NOW - LAST_REMINDER))

if [[ "$ELAPSED" -lt 120 ]]; then
  exit 0
fi

echo "$NOW" > "$THROTTLE_FILE"

# Return reminder as additionalContext
PLAN_BASENAME=$(basename "$PLAN_FILE")
jq -n --arg plan "$PLAN_BASENAME" --arg path "$PLAN_FILE" --arg count "$UNCHECKED" '{
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "additionalContext": ("PLAN PROGRESS REMINDER: You are implementing plan \"" + $plan + "\" (" + $path + "). There are " + $count + " unchecked items. After completing a phase or significant task, check off completed items (change `- [ ]` to `- [x]`) in the plan file.")
  }
}'
```

#### Stop Hook (`plan-checkbox-stop.sh`)

```bash
#!/bin/bash
# hooks/plan-checkbox-stop.sh
# Block first stop attempt if plan has unchecked items
INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // ""')
STOP_HOOK_ACTIVE=$(echo "$INPUT" | jq -r '.stop_hook_active // false')

# If already blocked once, allow stop (prevent infinite loop)
if [[ "$STOP_HOOK_ACTIVE" == "true" ]]; then
  exit 0
fi

# Find active plan
MARKER="$HOME/.claude/active-plans/${SESSION_ID}.json"
PLAN_FILE=""
if [[ -f "$MARKER" ]]; then
  PLAN_FILE=$(jq -r '.plan_path // ""' "$MARKER")
fi

if [[ -z "$PLAN_FILE" || ! -f "$PLAN_FILE" ]]; then
  exit 0
fi

# Count unchecked items
UNCHECKED=$(grep -c '^\s*- \[ \]' "$PLAN_FILE" 2>/dev/null || echo 0)
if [[ "$UNCHECKED" -eq 0 ]]; then
  exit 0
fi

# Block: remind to check off items
jq -n --arg plan "$PLAN_FILE" --arg count "$UNCHECKED" '{
  "decision": "block",
  "reason": ("Before finishing, please update the plan file at " + $plan + ". There are " + $count + " unchecked items. Check off any items you have completed (change `- [ ]` to `- [x]`), then you can finish.")
}'
```

## Discarded Approaches

| Approach | Why Discarded |
|----------|--------------|
| TaskCompleted hook | Per Taras: "noup" — depends on TodoWrite usage which isn't enforced |
| Agent hook (LLM-based) | Overkill — too expensive and slow for a reminder |
| Plugin-level hook (plugin.json) | Would fire in all sessions, not just implementation |
| `${CWD}/.claude/.active-plan` marker | Git pollution risk, doesn't support multiple repos (per Taras) |
| Count-based throttling | Time-based is more predictable (per Taras) |

## Open Questions

1. **Subagent awareness**: If the implementing skill delegates to subagents, do PostToolUse hooks from skill frontmatter fire for subagent tool calls? (Needs testing)
2. **Frontmatter hook support for `${CLAUDE_PLUGIN_ROOT}`**: Does the `${CLAUDE_PLUGIN_ROOT}` variable resolve correctly when hooks are defined in skill frontmatter vs plugin.json? May need to use a relative path or absolute path instead.
3. **Marker file cleanup**: SessionEnd hook as safety net, or rely on the implementing skill's own cleanup?

## References

- Hook docs: https://code.claude.com/docs/en/hooks.md
- Hook guide: https://code.claude.com/docs/en/hooks-guide.md
- Existing hook: `cc-plugin/base/hooks/validate-thoughts.py`
- Implementing skill: `cc-plugin/base/skills/implementing/SKILL.md`
- Plugin manifest: `cc-plugin/base/.claude-plugin/plugin.json`
- ai-tracker PostToolUse example: `ai-tracker/src/ai_tracker/hooks/log_claude_edit.py`
