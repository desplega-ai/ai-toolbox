---
date: 2026-03-17T10:45:00Z
planner: claude
topic: "Add /desplega:question (/questioning) skill to cc-plugin/base"
tags: [cc-plugin, skill, question, one-shot]
status: completed
autonomy: autopilot
last_updated: 2026-03-17
last_updated_by: claude
---

# `/desplega:question` (`/questioning`) Skill — Implementation Plan

## Overview

Add a new one-shot question-answering skill to `cc-plugin/base/` that uses the research process to answer questions inline (no document by default), then offers to continue with more questions, save the answer, start a brainstorm, or start research.

## Current State Analysis

- 10 skills exist in `cc-plugin/base/skills/`, each with a `SKILL.md` and optional `template.md`
- 12 commands in `cc-plugin/base/commands/`, each a thin wrapper invoking a skill
- `validate-thoughts.py` validates paths for `research/`, `plans/`, `brainstorms/`, `qa/` — no `questions/` support
- Plugin version: `1.6.0`

## Desired End State

- `/question how does X work?` answers inline using research sub-agents, then offers handoff
- Optional persistence to `thoughts/<user>/questions/YYYY-MM-DD-<topic>.md`
- `validate-thoughts.py` accepts the `questions/` subdirectory
- Plugin bumped to `1.7.0`

### Key Discoveries:
- No autonomy flags needed — skill is always one-shot (`validate-thoughts.py:29-68`)
- Hook must be updated to add `questions/` pattern (`validate-thoughts.py:30-33`, `63-68`)
- Template needed for optional save feature only (`skills/brainstorming/template.md` as reference)

## Quick Verification Reference

Common commands to verify:
- `python3 cc-plugin/base/hooks/validate-thoughts.py < /dev/null; echo $?` (should exit 0)
- `ls cc-plugin/base/skills/questioning/SKILL.md`
- `ls cc-plugin/base/commands/question.md`

Key files to check:
- `cc-plugin/base/skills/questioning/SKILL.md` (new)
- `cc-plugin/base/commands/question.md` (new)
- `cc-plugin/base/skills/questioning/template.md` (new, for optional save)
- `cc-plugin/base/hooks/validate-thoughts.py` (modified)
- `cc-plugin/base/.claude-plugin/plugin.json` (version bump)

## What We're NOT Doing

- No changes to the researching skill itself
- No changes to the brainstorming skill
- No new hooks or agents
- No changes to other existing skills (no cross-cutting integration like QA had)

## Implementation Approach

Simple additive change: create 3 new files, modify 2 existing files. Single phase since all changes are small and interdependent.

---

## Phase 1: Create Questioning Skill and Update Hooks

### Overview

Create the command wrapper, skill definition, optional save template, update the validation hook, and bump the plugin version.

### Changes Required:

#### 1. Command Wrapper
**File**: `cc-plugin/base/commands/question.md` (new)
**Changes**: Thin wrapper following the `brainstorm.md` pattern. No autonomy flags (it's a question). Invokes `desplega:questioning` skill. Uses AskUserQuestion if no query provided.

#### 2. Skill Definition
**File**: `cc-plugin/base/skills/questioning/SKILL.md` (new)
**Changes**: Full skill definition with:
- Frontmatter: `name: questioning`, description
- No Working Agreement / User Preferences (lightweight)
- Process: analyze question → spawn sub-agents as needed → synthesize → answer inline → handoff
- Sub-agents: same as research (codebase-locator, codebase-analyzer, codebase-pattern-finder, context7, web-search-researcher) but spawned selectively based on question type
- No "documentarian" constraint — answer the question directly, including root cause if needed
- Handoff via AskUserQuestion: ask another question, save answer, brainstorm, research, done
- Optional save: persist to `thoughts/<user>/questions/YYYY-MM-DD-<topic>.md` using template

#### 3. Save Template
**File**: `cc-plugin/base/skills/questioning/template.md` (new)
**Changes**: Lightweight Q&A template with frontmatter (date, author, topic, tags, status) and sections for Question, Answer, and optional Follow-up/References.

#### 4. Validation Hook
**File**: `cc-plugin/base/hooks/validate-thoughts.py` (modify)
**Changes**:
- Add `questions_pattern` regex at line ~33 (alongside existing patterns)
- Add `elif "/questions/" in file_path:` block at line ~56 (before the `else` block)
- Update error message at line ~66 to include `'questions'` in the list

#### 5. Plugin Version
**File**: `cc-plugin/base/.claude-plugin/plugin.json` (modify)
**Changes**: Bump `"version"` from `"1.6.0"` to `"1.7.0"`

### Success Criteria:

#### Automated Verification:
- [x] New files exist: `ls cc-plugin/base/commands/question.md cc-plugin/base/skills/questioning/SKILL.md cc-plugin/base/skills/questioning/template.md`
- [x] Validate-thoughts accepts questions path: exit 0
- [x] Validate-thoughts still rejects invalid paths: exit 2 with correct error
- [x] Plugin version is 1.7.0: `"version": "1.7.0"`
- [x] SKILL.md has valid frontmatter: `name: questioning`

#### Manual Verification:
- [ ] Command wrapper follows the pattern of `brainstorm.md` (no autonomy, delegates to skill)
- [ ] SKILL.md instructions are clear and complete for Claude to follow
- [ ] Template is lightweight — just Q&A format, not a full research document
- [ ] Handoff options include: another question, save, brainstorm, research, done

**Implementation Note**: Single phase — after completing all changes, run automated verification. No need for inter-phase checkpoints.

---

## Manual E2E Verification

After implementation, test end-to-end by:

1. **Invoke the command**: `/question how does the validate-thoughts hook work?`
   - Verify: Claude answers inline without creating a file
   - Verify: Handoff options are presented via AskUserQuestion

2. **Test "Save this answer" flow**: Select "Save this answer" from handoff
   - Verify: File is created at `thoughts/taras/questions/2026-03-17-<topic>.md`
   - Verify: File has proper frontmatter and Q&A content

3. **Test "Ask another question" loop**: Select "Ask another question"
   - Verify: Claude asks for the next question and answers it

4. **Test handoff to brainstorm**: Select "Start a brainstorm"
   - Verify: `/brainstorm` is invoked with the topic as context

5. **Test handoff to research**: Select "Start research"
   - Verify: `/research` is invoked with the topic as context

## References

- Related research: `thoughts/taras/research/2026-03-17-questioning-skill.md`
