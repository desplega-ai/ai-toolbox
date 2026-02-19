---
date: 2026-02-19T00:00:00Z
topic: "Plan Checkbox Hook Implementation"
author: Claude
status: in-progress
autonomy: critical
tags: [plan, claude-code, hooks, cc-plugin, plan-tracking]
---

# Plan Checkbox Hook Implementation

## Overview

Implement two Python hook scripts in `cc-plugin/base/hooks/` that remind and enforce plan checkbox updates during implementation sessions. The hooks are scoped to the implementing skill via YAML frontmatter, so they only fire when that skill is active.

## Current State Analysis

- The implementing skill (`cc-plugin/base/skills/implementing/SKILL.md`) has instructions telling Claude to check off plan items, but these are markdown instructions that get forgotten during long sessions.
- There is one existing hook: `cc-plugin/base/hooks/validate-thoughts.py` (PreToolUse, Python).
- Plugin manifest at `cc-plugin/base/.claude-plugin/plugin.json` has one PreToolUse hook entry.
- No PostToolUse or Stop hooks exist anywhere in the plugin.
- Plans use `- [ ]` / `- [x]` checkbox format in Success Criteria sections.
- Plan frontmatter has a `status` field that can be set to `in-progress`.

### Key Discoveries:
- Skill-scoped hooks are defined in SKILL.md YAML frontmatter and only fire when that skill is active (`cc-plugin/base/skills/implementing/SKILL.md:1-4`)
- Hook scripts receive `session_id` in stdin JSON, enabling lazy marker file creation without the skill needing to know the session_id
- `${CLAUDE_PLUGIN_ROOT}` resolves to the plugin root directory in hook commands
- PostToolUse hooks can return `additionalContext` to inject messages back to Claude
- Stop hooks use `decision: "block"` + `reason` and support `stop_hook_active` to prevent infinite loops

## Desired End State

1. **PostToolUse hook** fires after Edit/Write during implementation, gently reminding Claude to check off completed plan items (throttled to every 2 minutes)
2. **Stop hook** blocks Claude's first stop attempt if unchecked **automated verification** items remain (manual verification items are excluded since they require human interaction)
3. Both hooks use a marker file at `~/.claude/active-plans/<session_id>.json` for fast plan lookup (lazy-created on first invocation)
4. The implementing skill sets `status: in-progress` in the plan frontmatter at start and `status: completed` at end
5. Hooks only fire during implementing skill sessions (skill-scoped frontmatter)

## Quick Verification Reference

Common commands to verify the implementation:
- `python3 cc-plugin/base/hooks/plan_utils.py` (module self-test if we add one)
- `echo '{"session_id":"test","cwd":"/tmp","hook_event_name":"PostToolUse","tool_name":"Edit","tool_input":{"file_path":"/tmp/test.py"}}' | python3 cc-plugin/base/hooks/plan_checkbox_reminder.py` (manual hook test)
- `echo '{"session_id":"test","cwd":"/tmp","hook_event_name":"Stop","stop_hook_active":false}' | python3 cc-plugin/base/hooks/plan_checkbox_stop.py` (manual hook test)

Key files to check:
- `cc-plugin/base/hooks/plan_utils.py` (shared utilities)
- `cc-plugin/base/hooks/plan_checkbox_reminder.py` (PostToolUse hook)
- `cc-plugin/base/hooks/plan_checkbox_stop.py` (Stop hook)
- `cc-plugin/base/skills/implementing/SKILL.md` (frontmatter + status management)

## What We're NOT Doing

- **Not adding plugin.json hooks** — hooks are scoped to the implementing skill via SKILL.md frontmatter, not registered globally
- **Not using LLM-based hooks** — command type hooks (Python scripts) are sufficient
- **Not handling subagent tool calls** — open question from research, out of scope for v1
- **Not adding SessionEnd cleanup** — marker files are tiny and keyed by session_id; can add cleanup later if needed
- **Not modifying the planning skill** — only the implementing skill gets hooks

## Implementation Approach

Two complementary mechanisms:
1. **PostToolUse reminder** (gentle): After code edits, inject a context message reminding Claude to check off plan items. Time-throttled to avoid noise.
2. **Stop enforcement** (firm but scoped): When Claude tries to stop, block once if unchecked **automated verification** items remain. Manual verification items are excluded since they require human interaction and are expected to be unchecked when pausing between phases. Allow on second attempt to prevent infinite loops.

Both share common logic via `plan_utils.py`: finding the active plan (marker file → frontmatter scan fallback), counting unchecked items, and managing the marker file lifecycle.

---

## Phase 1: Hook Scripts

### Overview
Create three Python files in `cc-plugin/base/hooks/`: shared utilities, PostToolUse reminder hook, and Stop enforcement hook.

### Changes Required:

#### 1. Shared Utilities
**File**: `cc-plugin/base/hooks/plan_utils.py` (new)
**Changes**: Create module with shared functions:

- `find_active_plan(session_id: str, cwd: str) -> str | None`
  - Check marker file at `~/.claude/active-plans/<session_id>.json`
  - If no marker: scan `<cwd>/thoughts/` recursively for files with `status: in-progress` in YAML frontmatter
  - If found via scan: create marker file for future fast lookup
  - Return absolute path to plan file, or None
- `count_unchecked_items(plan_path: str, automated_only: bool = False) -> tuple[int, list[str]]`
  - Returns `(count, unchecked_lines)` — count of unchecked items plus the actual text lines for display in the reminder
  - If `automated_only=False`: count ALL lines matching `^\s*- \[ \]` in the plan file
  - If `automated_only=True`: only count unchecked items under `#### Automated Verification:` sections (stop counting at the next `####` heading or `---` separator)
  - This distinction matters: the PostToolUse reminder counts all items (broad reminder), while the Stop hook only enforces automated items (manual items require human interaction)
  - Parser is a simple line-by-line state machine: toggle `in_automated_section` flag on/off when hitting `#### Automated Verification:` / next `####`/`###`/`##`/`---` heading
  - Note: some older plans lack `####` subheadings — handled gracefully (0 automated items)
- `count_unchecked_by_phase(plan_path: str, automated_only: bool = False) -> dict[str, tuple[int, bool]]`
  - Returns per-phase data: `{phase_name: (unchecked_count, has_any_checked)}`
  - Parses `## Phase N: Name` headings to identify phase boundaries
  - `has_any_checked` is True if the phase has at least one `- [x]` item (any section, not just automated)
  - **Phase-started heuristic**: a phase is considered "started" if:
    1. It is **Phase 1** and a marker file exists for this session (covers the cold-start case — implementation just began, nothing checked yet), OR
    2. It has at least one `[x]` item (any section, automated or manual)
  - Only started phases are enforced by the Stop hook. Future phases (all `[ ]` and not Phase 1) are skipped.
  - The PostToolUse reminder uses the total count across all phases (no phase filtering)
  - The Stop hook calls this with `automated_only=True` and sums unchecked items only from started phases
- `create_marker(session_id: str, plan_path: str) -> None`
  - Create `~/.claude/active-plans/<session_id>.json` with `{"plan_path": "<abs-path>", "created_at": "<ISO-8601>"}`
  - Create directory if it doesn't exist
- `is_plan_file(file_path: str) -> bool`
  - Check if the file path is inside a `thoughts/` directory (skip reminders when editing the plan itself)
- `should_throttle(session_id: str, interval_seconds: int = 120) -> bool`
  - Check `/tmp/.plan-reminder-<session_id>` timestamp
  - Return True if last reminder was less than `interval_seconds` ago
  - Update timestamp file when returning False

#### 2. PostToolUse Reminder Hook
**File**: `cc-plugin/base/hooks/plan_checkbox_reminder.py` (new)
**Changes**: Create PostToolUse hook script:

- Read stdin JSON
- Extract `session_id`, `cwd`, `tool_input.file_path`
- Skip if editing a plan/thoughts file (`is_plan_file()`)
- Skip if throttled (`should_throttle()`)
- Find active plan (`find_active_plan()`)
- Count unchecked items (`count_unchecked_items()`)
- If unchecked > 0: output JSON with `hookSpecificOutput.additionalContext` reminder
- Exit 0 in all cases (never block)

#### 3. Stop Enforcement Hook
**File**: `cc-plugin/base/hooks/plan_checkbox_stop.py` (new)
**Changes**: Create Stop hook script:

- Read stdin JSON
- Extract `session_id`, `cwd`, `stop_hook_active`
- If `stop_hook_active` is true: exit 0 (allow stop, prevent infinite loop)
- Find active plan (`find_active_plan()`)
- Get per-phase unchecked automated items (`count_unchecked_by_phase(automated_only=True)`)
- Filter to only "started" phases (phases with at least one `[x]` item — future phases are skipped)
- Sum unchecked automated items across started phases
- If sum > 0: output JSON with `decision: "block"` and `reason` listing the plan file and which automated items in started phases are unchecked
- If sum == 0: exit 0 (allow stop — manual items and future-phase items don't block)

### Success Criteria:

#### Automated Verification:
- [x] Files exist: `ls cc-plugin/base/hooks/plan_utils.py cc-plugin/base/hooks/plan_checkbox_reminder.py cc-plugin/base/hooks/plan_checkbox_stop.py`
- [x] Scripts are executable: `test -x cc-plugin/base/hooks/plan_checkbox_reminder.py && test -x cc-plugin/base/hooks/plan_checkbox_stop.py && echo OK`
- [x] Python syntax valid: `python3 -c "import py_compile; py_compile.compile('cc-plugin/base/hooks/plan_utils.py', doraise=True); py_compile.compile('cc-plugin/base/hooks/plan_checkbox_reminder.py', doraise=True); py_compile.compile('cc-plugin/base/hooks/plan_checkbox_stop.py', doraise=True); print('OK')"`
- [x] PostToolUse hook returns empty on non-plan edit (no active plan): `echo '{"session_id":"test123","cwd":"/tmp","hook_event_name":"PostToolUse","tool_name":"Edit","tool_input":{"file_path":"/tmp/test.py"}}' | python3 cc-plugin/base/hooks/plan_checkbox_reminder.py; echo "exit: $?"`
- [x] Stop hook allows stop when no active plan: `echo '{"session_id":"test123","cwd":"/tmp","hook_event_name":"Stop","stop_hook_active":false}' | python3 cc-plugin/base/hooks/plan_checkbox_stop.py; echo "exit: $?"`
- [x] Stop hook allows stop when stop_hook_active is true: `echo '{"session_id":"test123","cwd":"/tmp","hook_event_name":"Stop","stop_hook_active":true}' | python3 cc-plugin/base/hooks/plan_checkbox_stop.py; echo "exit: $?"`

#### Manual Verification:
- [ ] Create a test plan with `status: in-progress` and unchecked items, verify PostToolUse hook returns reminder JSON
- [ ] Verify Stop hook blocks with unchecked automated verification items and returns proper JSON
- [ ] Verify Stop hook allows stop when only manual verification items are unchecked
- [ ] Verify time-based throttling works (second invocation within 2 min returns nothing)
- [ ] Verify marker file is created at `~/.claude/active-plans/test123.json` after first invocation

**Implementation Note**: After completing this phase, pause for manual verification. Test scripts with mock JSON input before proceeding to skill integration.

---

## Phase 2: Skill Integration

### Overview
Add hook frontmatter to the implementing skill's SKILL.md and add instructions for managing plan `status` field.

### Changes Required:

#### 1. SKILL.md Frontmatter Hooks
**File**: `cc-plugin/base/skills/implementing/SKILL.md`
**Changes**: Add hooks to the YAML frontmatter:

```yaml
---
name: implementing
description: Plan implementation skill. Executes approved technical plans phase by phase with verification checkpoints.
hooks:
  PostToolUse:
    - matcher: "Edit|Write"
      hooks:
        - type: command
          command: "${CLAUDE_PLUGIN_ROOT}/hooks/plan_checkbox_reminder.py"
  Stop:
    - hooks:
        - type: command
          command: "${CLAUDE_PLUGIN_ROOT}/hooks/plan_checkbox_stop.py"
---
```

#### 2. Status Management Instructions
**File**: `cc-plugin/base/skills/implementing/SKILL.md`
**Changes**: Add to the "Getting Started" section (after step 2 "Check for existing checkmarks"):

Add a new step: "Set plan status to `in-progress` by editing the frontmatter `status` field. This signals to progress-tracking hooks which plan is active."

Add to the end of the skill (after "Resuming Work" section): a "Completing Implementation" section instructing Claude to set `status: completed` when all phases are done and verified.

### Success Criteria:

#### Automated Verification:
- [x] SKILL.md has valid YAML frontmatter: `python3 -c "import yaml; f=open('cc-plugin/base/skills/implementing/SKILL.md'); content=f.read(); fm=content.split('---')[1]; yaml.safe_load(fm); print('OK')"` (validated via `ruby -e "require 'yaml'; content = File.read('cc-plugin/base/skills/implementing/SKILL.md'); fm = content.split('---')[1]; YAML.safe_load(fm); puts 'OK'"` because this environment's `python3` lacks PyYAML)
- [x] Frontmatter includes PostToolUse hook: `grep -q 'PostToolUse' cc-plugin/base/skills/implementing/SKILL.md && echo OK`
- [x] Frontmatter includes Stop hook: `grep -q 'Stop:' cc-plugin/base/skills/implementing/SKILL.md && echo OK`
- [x] Status management instructions present: `grep -q 'status: in-progress' cc-plugin/base/skills/implementing/SKILL.md && echo OK`
- [x] Hook commands reference correct paths: `grep -q 'plan_checkbox_reminder.py' cc-plugin/base/skills/implementing/SKILL.md && grep -q 'plan_checkbox_stop.py' cc-plugin/base/skills/implementing/SKILL.md && echo OK`

#### Manual Verification:
- [ ] Review the SKILL.md diff to confirm frontmatter is well-formed and doesn't break the skill's existing content
- [ ] Verify `${CLAUDE_PLUGIN_ROOT}` resolves correctly by checking the plugin's installed path
- [ ] Review the status management instructions for clarity

**Implementation Note**: After completing this phase, pause for manual confirmation before proceeding to E2E testing.

---

## Phase 3: Manual E2E Testing

### Overview
End-to-end verification using a real implementation session.

### Test Plan:

1. **Setup**: Create a test plan file at `thoughts/taras/plans/2026-02-19-test-checkbox-hook.md` with:
   - Frontmatter with `status: approved`
   - A few phases with `- [ ]` checkbox items

2. **Invoke implementing skill**: Run `/implement-plan thoughts/taras/plans/2026-02-19-test-checkbox-hook.md`

3. **Verify status update**: Check that the skill changes `status: approved` → `status: in-progress`

4. **Verify PostToolUse reminder**: Make a code edit and observe if the reminder appears in the context (may need verbose mode `Ctrl+O`)

5. **Verify Stop hook**: Try to finish the session and observe if it blocks with unchecked items

6. **Verify throttling**: Make multiple edits in quick succession, confirm reminder only appears once per 2-minute window

7. **Cleanup**: Remove test plan file

### Success Criteria:

#### Automated Verification:
- [x] No stale marker files in `~/.claude/active-plans/`: `ls ~/.claude/active-plans/ 2>/dev/null | wc -l`

#### Manual Verification:
- [ ] PostToolUse reminder fires after code edit during implementation
- [ ] Reminder does NOT fire when editing the plan file itself
- [ ] Stop hook blocks first stop attempt when unchecked automated verification items exist
- [ ] Stop hook allows stop when only manual verification items are unchecked (e.g., between-phase pause)
- [ ] Stop hook allows second stop attempt (stop_hook_active=true)
- [ ] Time-based throttling limits reminders to ~2 minute intervals
- [ ] Marker file created at `~/.claude/active-plans/<session_id>.json`
- [ ] Plan status set to `in-progress` at start of implementation

**Implementation Note**: This phase is entirely manual. If `${CLAUDE_PLUGIN_ROOT}` doesn't resolve in skill frontmatter, fall back to using a relative path from the skill file or an absolute path pattern.

---

## Testing Strategy

- **Unit testing**: Manual testing with mock JSON piped to stdin (Phase 1)
- **Integration testing**: YAML frontmatter validation (Phase 2)
- **E2E testing**: Real implementation session with a test plan (Phase 3)

## References
- Research document: `thoughts/taras/research/2026-02-19-plan-checkbox-hook.md`
- Existing hook pattern: `cc-plugin/base/hooks/validate-thoughts.py`
- Implementing skill: `cc-plugin/base/skills/implementing/SKILL.md`
- Plugin manifest: `cc-plugin/base/.claude-plugin/plugin.json`
- Claude Code hooks docs: https://code.claude.com/docs/en/hooks.md
- Claude Code hooks guide: https://code.claude.com/docs/en/hooks-guide.md
