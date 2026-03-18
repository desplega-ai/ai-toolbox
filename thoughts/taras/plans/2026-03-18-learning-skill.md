---
date: 2026-03-18T12:00:00-04:00
topic: "/learning skill for cc-plugin/base — compounding knowledge across projects and teams"
status: completed
planner: Claude
autonomy: critical
source: thoughts/taras/brainstorms/2026-03-17-learning-skill.md
git_commit: per-phase
---

# /learning Skill Implementation Plan

## Overview

Implement a `/learning` skill for cc-plugin/base that captures, stores, searches, and promotes institutional knowledge across projects and sessions. The skill uses a tiered backend model (local → qmd → agent-fs) where each tier adds reach without replacing the previous one.

This is a **pure markdown skill** — all logic lives in SKILL.md instructions, backend interaction is via existing tools (Write, Grep, Glob, Bash, MCP), and no runtime code is needed beyond updating `validate-thoughts.py`.

## Current State Analysis

- **cc-plugin/base** is at v1.7.0 with 11 skills and 13 commands
- Skills follow a consistent pattern: SKILL.md (frontmatter + process steps) + template.md + command.md
- `validate-thoughts.py` allows 5 subdirectories: research, plans, brainstorms, qa, questions — `learnings` is not yet allowed
- No existing skill explicitly captures cross-session knowledge (QA skill has a lightweight CLAUDE.md persist step, closest pattern)
- qmd MCP is available with `query`/`get`/`multi_get`/`status` tools — requires manual `qmd update` after writing files
- agent-fs CLI (v0.3.1) has `write`/`cat`/`search`/`fts`/`grep`/`ls` commands — usable via Bash tool
- Sub-skill pattern exists: `**OPTIONAL SUB-SKILL:** Consider using desplega:skill-name`

### Key Discoveries:
- `validate-thoughts.py:29-34` — hardcoded subdirectory patterns, needs `learnings` added
- `cc-plugin/base/skills/questioning/SKILL.md` — newest skill, good model for lightweight command routing
- `cc-plugin/base/skills/qa/SKILL.md:168-185` — only existing knowledge persistence pattern (persist to CLAUDE.md)
- qmd has no auto-indexing — `qmd update` must be called explicitly after writing files
- agent-fs supports semantic search (`agent-fs search`), FTS5 keyword search (`agent-fs fts`), and regex (`agent-fs grep`)
- Config lives in `~/.config/qmd/index.yml` — ai-toolbox thoughts already indexed as a collection

## Desired End State

1. `/learning` command works with all 5 subcommands (setup/status, capture, recall, promote, review)
2. Local backend works out of the box — writes to `thoughts/{user}/learnings/YYYY-MM-DD-<slug>.md`
3. qmd backend adds semantic search across learnings collections (when configured)
4. agent-fs backend adds remote team-wide storage (when configured)
5. All 10 existing skills have an OPTIONAL SUB-SKILL nudge to capture learnings
6. Config file `~/.agentic-learnings.json` stores backend preferences
7. Plugin version bumped to 1.8.0

**Verification:** Run `/learning` to see setup flow, `/learning capture "test insight"` to write a learning, `/learning recall "test"` to search, and check that existing skills mention the learning sub-skill.

## Quick Verification Reference

Common commands to verify the implementation:
- `cat cc-plugin/base/skills/learning/SKILL.md` — skill exists and is well-formed
- `cat cc-plugin/base/commands/learning.md` — command wrapper exists
- `python3 cc-plugin/base/hooks/validate-thoughts.py < test-input.json` — validates learnings path
- `grep -r "desplega:learning" cc-plugin/base/skills/` — sub-skill referenced in existing skills

Key files to check:
- `cc-plugin/base/skills/learning/SKILL.md` — main skill
- `cc-plugin/base/skills/learning/template.md` — learning file template
- `cc-plugin/base/commands/learning.md` — command wrapper
- `cc-plugin/base/hooks/validate-thoughts.py` — updated path validation
- `cc-plugin/base/.claude-plugin/plugin.json` — version bump

## What We're NOT Doing

- **No runtime code** — skill is pure markdown instructions, no JS/Python skill runtime
- **No automatic sync** — cross-project is on-demand, not automatic
- **No brain integration** — brain is a separate tool, not a learning backend
- **No PreToolUse hook for recall nudging** — baked into each skill's SKILL.md instead (simpler, more deterministic)
- **No learning deduplication** — trust the agent to judge significance; pruning via `/learning review`
- **No qmd collection creation** — skill queries existing collections, doesn't create new ones
- **No agent-fs server setup** — assumes agent-fs is already configured if used as backend

## Implementation Approach

**Phase-by-phase, inside-out**: Start with the core skill + infrastructure (validate-thoughts, template, command), then integrate into existing skills as an optional sub-skill. The skill is self-contained in Phase 1 — it works standalone before any integration.

**Modeling after questioning skill**: The newest skill has the cleanest patterns. The learning skill will follow the same structure (frontmatter, when to use, process steps) but with subcommand routing similar to how the QA skill handles multiple input modes.

---

## Phase 1: Core Skill Infrastructure

### Overview
Create the learning skill (SKILL.md + template.md + command.md) and update validate-thoughts.py to allow the `learnings` subdirectory. After this phase, `/learning` is fully functional as a standalone skill.

### Changes Required:

#### 1. Learning Skill Definition
**File**: `cc-plugin/base/skills/learning/SKILL.md` (new)
**Changes**: Create the main skill file with:

**Frontmatter:**
```yaml
---
name: learning
description: Compounding knowledge across projects and teams. Captures, searches, and promotes institutional learnings via tiered backends (local/qmd/agent-fs).
---
```

**Sections:**
1. **When to Use** — triggers: `/learning` command, `desplega:learning` sub-skill reference, user says "let's capture this" or "what did we learn about X"
2. **Subcommand Routing** — parse first argument to route:
   - No args or `status` → Setup/Status flow
   - `capture <insight>` → Capture flow
   - `recall <topic>` → Recall flow
   - `promote <id-or-topic>` → Promote flow
   - `review` → Review flow
3. **Setup / Status** (`/learning` with no args):
   - Check for `~/.agentic-learnings.json`
   - If not found: explain the system, create config with local backend defaulting to `thoughts/{user}/learnings/`, ask via AskUserQuestion if user wants to configure qmd or agent-fs backends
   - **CLAUDE.md Bootstrap**: After config creation, offer via AskUserQuestion to add a bootstrap section to project CLAUDE.md:
     ```markdown
     ## Learning System
     Use `/learning recall <topic>` before research/planning to check for prior learnings.
     Use `/learning capture` to record significant insights, decisions, and gotchas.
     Config: `~/.agentic-learnings.json`
     ```
   - If found: show configured backends, count learnings per backend, show recent learnings
4. **Capture** (`/learning capture`):
   - If invoked with inline text: use that as the insight
   - If no text: ask via AskUserQuestion for the insight
   - Ask category via AskUserQuestion: product-decisions, technical-gotchas, human-nudges, patterns, mistakes
   - **Scope**: Ask via AskUserQuestion: personal (`thoughts/{user}/learnings/`) or shared (`thoughts/shared/learnings/`)?
     - Personal: visible only in this user's context
     - Shared: git-tracked, visible to all collaborators (human and agent)
     - When capturing to shared, include author name in filename slug to avoid multi-user conflicts (e.g., `2026-03-19-taras-qmd-indexing.md`)
   - Generate filename: `YYYY-MM-DD-<slug>.md` (slug from topic, max 50 chars)
   - Write learning file using template to chosen path
   - If qmd backend configured: run `qmd update` via Bash
   - If agent-fs backend configured: run `agent-fs write` via Bash
   - Confirm capture with file path
   - **Significance Threshold** (default heuristics, overridable via CLAUDE.md `## Learning Capture Rules` section):
     - Would this help someone else in a future session? (primary test)
     - Is this already documented in CLAUDE.md or code comments? (skip if yes)
     - Did the user correct the agent's approach? (always capture)
     - Was something surprisingly difficult or broken? (usually capture)
     - If a `## Learning Capture Rules` section exists in project or global CLAUDE.md, those rules take precedence over defaults
5. **Recall** (`/learning recall`):
   - Query all configured backends in parallel:
     - Local: Grep for topic in `thoughts/{user}/learnings/` and `thoughts/shared/learnings/`
     - qmd: Use `mcp__qmd__query` with `[{type:'lex', query:'<topic>'}, {type:'vec', query:'<topic>'}]`, scoped to configured collections
     - agent-fs: Run `agent-fs search --query "<topic>"` or `agent-fs fts --query "<topic>"` via Bash
   - Present results ranked by relevance, with file:line references
   - Offer to read full learning or take action
6. **Promote** (`/learning promote`):
   - If given a file path or topic: read the learning
   - If no arg: run recall first, let user select
   - Ask via AskUserQuestion: promote to project CLAUDE.md or global `~/.claude/CLAUDE.md`?
   - Format the learning as a concise rule (1-3 lines)
   - Append to chosen CLAUDE.md under appropriate section
   - Mark the learning file as promoted (add `promoted_to:` in frontmatter)
7. **Review** (`/learning review`):
   - List all learnings from default backend (recent first) with 1-line summaries (date, category, topic)
   - Present list via AskUserQuestion (multiSelect): select which learnings to review
   - For each selected learning, show full content and ask via AskUserQuestion: keep, promote, archive, delete
   - If file-review is available, offer it as an alternative for batch review
   - Execute chosen actions
   - Report summary (kept N, promoted N, archived N, deleted N)
8. **Backend Adapter Reference** — instructions for each backend (all 4 operations: write, search, list, delete):
   - **Local**:
     - write: Write tool to `thoughts/{user}/learnings/` or `thoughts/shared/learnings/`
     - search: Grep/Glob for topic across both personal and shared learnings dirs
     - list: `Glob thoughts/{user}/learnings/*.md` + `Glob thoughts/shared/learnings/*.md`
     - delete: `Bash rm <path>` (learning file is just a local file)
   - **qmd**:
     - write: same as local (qmd indexes the local files), then `qmd update` via Bash
     - search: `mcp__qmd__query` with lex+vec sub-queries, scoped to configured collections
     - list: `mcp__qmd__multi_get` with glob pattern (e.g., `learnings/*.md`)
     - delete: delete local file + `qmd update` (qmd re-indexes, removing the entry)
   - **agent-fs**:
     - write: `agent-fs write /learnings/<filename> --content "<content>"` via Bash
     - search: `agent-fs search --query "<topic>"` (semantic) or `agent-fs fts --query "<topic>"` (keyword)
     - list: `agent-fs ls /learnings/` via Bash
     - delete: `agent-fs rm /learnings/<filename>` via Bash
9. **Config File Schema** — document the `~/.agentic-learnings.json` structure (as defined in brainstorm)

#### 2. Learning File Template
**File**: `cc-plugin/base/skills/learning/template.md` (new)
**Changes**: Create template for individual learning files:

```markdown
---
date: {DATE}
category: {CATEGORY}
topic: "{TOPIC}"
project: "{PROJECT}"
author: "{AUTHOR}"
tags: [{TAGS}]
promoted_to: null
---

# {TOPIC}

## Insight

{INSIGHT_CONTENT}

## Context

{CONTEXT — where/when discovered, what triggered this learning}

## Related

{OPTIONAL — links to files, PRs, issues, other learnings}
```

#### 3. Command Wrapper
**File**: `cc-plugin/base/commands/learning.md` (new)
**Changes**: Create command that routes to the skill:

```yaml
---
description: Capture, search, and promote institutional learnings across projects
model: inherit
argument-hint: [capture|recall|promote|review] [args...]
---
```

Body: invoke `desplega:learning` skill, pass full argument string. If no args, let skill handle setup/status flow.

#### 4. Path Validation Update
**File**: `cc-plugin/base/hooks/validate-thoughts.py`
**Changes**:
- Add `learnings_pattern` regex: `r'thoughts/[^/]+/learnings/\d{4}-\d{2}-\d{2}-[\w-]+\.md$'`
- Add `elif "/learnings/" in file_path:` block with validation (following existing pattern at lines 36-76)
- Update error message on line 74 to include 'learnings' in the list of valid subdirectories

### Success Criteria:

#### Automated Verification:
- [ ] `python3 -c "..."` — validate-thoughts.py accepts `thoughts/taras/learnings/2026-03-18-test.md` path
- [ ] `python3 -c "..."` — validate-thoughts.py rejects `thoughts/taras/learnings/bad-name.md` path
- [ ] `test -f cc-plugin/base/skills/learning/SKILL.md` — skill file exists
- [ ] `test -f cc-plugin/base/skills/learning/template.md` — template file exists
- [ ] `test -f cc-plugin/base/commands/learning.md` — command file exists
- [ ] `grep -q "learnings" cc-plugin/base/hooks/validate-thoughts.py` — learnings added to validator

#### Manual Verification:
- [ ] SKILL.md follows the same structure as questioning/SKILL.md (frontmatter, when to use, process steps)
- [ ] Template has proper YAML frontmatter with all fields from brainstorm
- [ ] Command.md follows the same pattern as question.md
- [ ] All 5 subcommands are documented in SKILL.md with clear routing logic

**Implementation Note**: After completing this phase, pause for manual confirmation. Create commit after verification passes.

---

## Phase 2: Existing Skill Integration

### Overview
Add an OPTIONAL SUB-SKILL reference to all 10 existing skills so they nudge the agent to capture learnings at the end of workflows. Also add a recall step at the beginning of relevant skills.

### Changes Required:

#### 1. Add Capture Nudge to All Skills
**Files** (10 skills to modify):
- `cc-plugin/base/skills/brainstorming/SKILL.md`
- `cc-plugin/base/skills/implementing/SKILL.md`
- `cc-plugin/base/skills/phase-running/SKILL.md`
- `cc-plugin/base/skills/planning/SKILL.md`
- `cc-plugin/base/skills/qa/SKILL.md`
- `cc-plugin/base/skills/questioning/SKILL.md`
- `cc-plugin/base/skills/researching/SKILL.md`
- `cc-plugin/base/skills/reviewing/SKILL.md`
- `cc-plugin/base/skills/tdd-planning/SKILL.md`
- `cc-plugin/base/skills/verifying/SKILL.md`

**Changes per skill**: Add before the final Workflow Handoff step:

```markdown
**OPTIONAL SUB-SKILL:** If significant insights, patterns, gotchas, or decisions emerged during this workflow, consider using `desplega:learning` to capture them via `/learning capture`. Focus on learnings that would help someone else in a future session.
```

Each skill needs the nudge placed at the right location — before the handoff/next-steps section, after the core work is done.

**Exception — phase-running**: Since phase-running runs in background (no AskUserQuestion), use a different nudge:
```markdown
**OPTIONAL SUB-SKILL:** If significant learnings emerged during this phase, note them in the phase completion report for the parent session to capture via `/learning capture`.
```

#### 2. Add Recall Step to Knowledge-Consuming Skills
**Files** (4 skills that benefit from recall at start):
- `cc-plugin/base/skills/researching/SKILL.md` — before investigation
- `cc-plugin/base/skills/planning/SKILL.md` — before analysis
- `cc-plugin/base/skills/implementing/SKILL.md` — before starting implementation
- `cc-plugin/base/skills/brainstorming/SKILL.md` — before exploration

**Changes per skill**: Add an early step (after context establishment, before core work):

```markdown
**OPTIONAL SUB-SKILL:** If `~/.agentic-learnings.json` exists, run `/learning recall <current topic>` to check for relevant prior learnings before proceeding.
```

### Success Criteria:

#### Automated Verification:
- [ ] `grep -c "desplega:learning" cc-plugin/base/skills/*/SKILL.md` — returns 10 (all skills)
- [ ] `grep -c "learning recall" cc-plugin/base/skills/*/SKILL.md` — returns 4 (research, plan, implement, brainstorm)

#### Manual Verification:
- [ ] Capture nudge is positioned correctly in each skill (before handoff, after core work)
- [ ] Recall step is positioned correctly in consuming skills (early, after context, before work)
- [ ] Wording is consistent across all skills
- [ ] Phase-running skill nudge accounts for background execution (no AskUserQuestion)

**Implementation Note**: After completing this phase, pause for manual confirmation. Create commit after verification passes.

---

## Phase 3: Release

### Overview
Bump plugin version, update any documentation references, and run final E2E verification.

### Changes Required:

#### 1. Plugin Manifest
**File**: `cc-plugin/base/.claude-plugin/plugin.json`
**Changes**: Bump version from `1.7.0` to `1.8.0` (minor version for new feature)

#### 2. Brainstorm Status Update
**File**: `thoughts/taras/brainstorms/2026-03-17-learning-skill.md`
**Changes**: Update status from `in-progress` to `completed`, update `last_updated` to today

### Success Criteria:

#### Automated Verification:
- [ ] `grep '"version"' cc-plugin/base/.claude-plugin/plugin.json` — shows `1.8.0`
- [ ] `grep 'status:' thoughts/taras/brainstorms/2026-03-17-learning-skill.md` — shows `completed`

#### Manual Verification:
- [ ] Version bump is correct (1.7.0 → 1.8.0)

**Implementation Note**: After completing this phase, pause for manual confirmation. Create commit after verification passes.

---

## Manual E2E Verification

After all phases are complete, verify the full workflow:

```bash
# 1. Check all files exist
ls cc-plugin/base/skills/learning/SKILL.md
ls cc-plugin/base/skills/learning/template.md
ls cc-plugin/base/commands/learning.md

# 2. Validate the learning path is accepted by the hook
echo '{"tool_name":"Write","tool_input":{"file_path":"thoughts/taras/learnings/2026-03-18-test-learning.md","content":"---\ndate: 2026-03-18\ntopic: test\n---\n# Test"},"session_id":"test","cwd":"/tmp"}' | python3 cc-plugin/base/hooks/validate-thoughts.py
echo $?  # Should be 0

# 3. Validate bad path is rejected
echo '{"tool_name":"Write","tool_input":{"file_path":"thoughts/taras/learnings/bad.md","content":"no frontmatter"},"session_id":"test","cwd":"/tmp"}' | python3 cc-plugin/base/hooks/validate-thoughts.py
echo $?  # Should be 2

# 4. Check sub-skill references in all existing skills
grep -r "desplega:learning" cc-plugin/base/skills/*/SKILL.md | wc -l  # Should be >= 10

# 5. Check recall references in consuming skills
grep -l "learning recall" cc-plugin/base/skills/{researching,planning,implementing,brainstorming}/SKILL.md | wc -l  # Should be 4

# 6. Check plugin version
grep '"version"' cc-plugin/base/.claude-plugin/plugin.json  # Should show 1.8.0
```

Then in a new Claude Code session:
1. Run `/learning` — should show setup wizard (no config exists yet)
2. Complete setup — should create `~/.agentic-learnings.json` with local backend
3. Run `/learning capture "qmd requires manual qmd update after writing files"` — should write to `thoughts/taras/learnings/`
4. Run `/learning recall qmd` — should find the captured learning
5. Run `/research <topic>` — should see recall nudge and capture nudge in the workflow

## Testing Strategy

- **Automated**: validate-thoughts.py can be tested with piped JSON input (shown in E2E section)
- **Manual**: Each subcommand tested in a fresh session
- **Integration**: Run an existing skill (`/research`) and verify learning nudges appear at appropriate points

## References
- Brainstorm: `thoughts/taras/brainstorms/2026-03-17-learning-skill.md`
- Research (qmd): qmd requires `qmd update` for indexing, collections in `~/.config/qmd/index.yml`
- Research (agent-fs): v0.3.1, CLI has write/cat/search/fts/grep, auth via API key + org/drive
- Research (cc-plugin): 11 skills, OPTIONAL SUB-SKILL pattern, hooks via Python, plugin at v1.7.0

---

## Review

**Reviewer:** Claude | **Date:** 2026-03-18 | **Autonomy:** Critical

### Requirement Coverage (vs. Brainstorm Core Requirements)

| # | Requirement | Covered? | Notes |
|---|-------------|----------|-------|
| 1 | `/learning` command — setup wizard + status | Yes | Phase 1, section 3 |
| 2 | `/learning capture` — write to default backend | Yes | Phase 1, section 4 |
| 3 | `/learning recall` — search across backends | Yes | Phase 1, section 5 |
| 4 | `/learning promote` — add to CLAUDE.md | Yes | Phase 1, section 6 |
| 5 | `/learning review` — prune/quality review | Yes | Phase 1, section 7 |
| 6 | Backend adapter pattern (write/search/list/delete) | Partial | **Gap: `list()` and `delete()` not explicitly specified per backend** — only described for local. agent-fs has `rm` and `ls`, qmd has `multi_get`. Should document all 4 operations per backend. |
| 7 | Sub-skill integration | Yes | Phase 2, OPTIONAL SUB-SKILL in all 10 skills |
| 8 | Config file `~/.agentic-learnings.json` | Yes | Phase 1, section 9 |
| 9 | CLAUDE.md bootstrap — setup adds awareness section | **Missing** | The setup flow says "explain the system" but doesn't say "add a section to project/global CLAUDE.md." The brainstorm explicitly requires this (Key Decision #9, Core Req #9). |
| 10 | Hook/nudge for recall at skill start | Yes | Phase 2 — baked into SKILL.md instructions (not hook). Justified in "What We're NOT Doing." |

### Open Questions Resolution

| Question | Resolved? | Resolution |
|----------|-----------|------------|
| File naming convention | Yes | `YYYY-MM-DD-<slug>.md`, slug from topic, max 50 chars |
| qmd indexing | Yes | Manual `qmd update` required, no auto-index |
| agent-fs CLI maturity | Yes | v0.3.1, 26+ commands, stable enough for shell-out |
| Skill modification scope | Yes | OPTIONAL SUB-SKILL (user confirmed) |
| Significance threshold | Partial | Plan says "trust the agent" — no concrete guidance. See Issue #3. |
| Pruning mechanics | Partial | Review subcommand described but UX is vague (batch vs one-at-a-time). See Issue #4. |
| Multi-user scenarios | Not addressed | See Issue #5. |

### Issues Found

#### Issue 1: CLAUDE.md Bootstrap Missing (Severity: Medium)
**Brainstorm Key Decision #9 + Core Requirement #9:** "Setup adds awareness section to CLAUDE.md." The plan's setup flow creates `~/.agentic-learnings.json` and explains the system, but never writes a CLAUDE.md section. Future sessions won't know the learning system exists unless the user remembers to use it.

**Recommendation:** Add to the Setup/Status flow (Phase 1, section 3): after creating config, offer via AskUserQuestion to add a bootstrap section to project CLAUDE.md like:
```markdown
## Learning System
Use `/learning recall <topic>` before research/planning to check for prior learnings.
Use `/learning capture` to record significant insights, decisions, and gotchas.
Config: `~/.agentic-learnings.json`
```

#### Issue 2: Backend Adapter Completeness (Severity: Low)
**Brainstorm Core Requirement #6:** "Each backend has a consistent interface: write, search, list, delete." The plan documents write and search per backend, but `list()` and `delete()` are only implicitly covered in the review subcommand.

**Recommendation:** Add explicit list/delete instructions per backend in the Backend Adapter Reference section:
- **Local**: `Glob thoughts/{user}/learnings/*.md` for list, `Bash rm` for delete
- **qmd**: `mcp__qmd__multi_get` with glob pattern for list (no delete — delete local file + `qmd update`)
- **agent-fs**: `agent-fs ls` for list, `agent-fs rm` for delete

#### Issue 3: Significance Threshold Guidance (Severity: Low)
The brainstorm identified noise/quality as a top-3 failure mode. The plan says "trust the agent to judge significance" but provides no guidance. The skill will be invoked by the agent itself via sub-skill nudges — without criteria, it may over-capture or under-capture.

**Recommendation:** Add a brief "What's Worth Capturing" section to SKILL.md with heuristics:
- Would this help someone else in a future session? (primary test)
- Is this already documented in CLAUDE.md or code comments? (skip if yes)
- Did the user correct the agent's approach? (always capture)
- Was something surprisingly difficult or broken? (usually capture)

#### Issue 4: Review UX Underspecified (Severity: Low)
The review subcommand says "for each (or batch)" but doesn't specify which. With many learnings, one-at-a-time is tedious; pure batch loses nuance.

**Recommendation:** Specify: list all learnings with 1-line summaries, let user select which to review via AskUserQuestion (multiSelect), then process selected ones. If file-review is available, offer it as alternative.

#### Issue 5: Multi-User Conflict Not Addressed (Severity: Low)
The brainstorm raised this: when two agents capture learnings in the same repo, separate user dirs (`thoughts/taras/learnings/`, `thoughts/2pac/learnings/`) avoid file conflicts. But `thoughts/shared/learnings/` could have conflicts.

**Recommendation:** This is low-risk for now (separate user dirs are the default). Add a note in SKILL.md: "When capturing to `thoughts/shared/learnings/`, include the author's name in the filename slug to avoid conflicts."

#### Issue 6: Phase-Running Skill Needs Special Nudge (Severity: Low)
Phase-running runs in background with no AskUserQuestion. The plan's success criteria mentions this (line 269) but the nudge text (line 241) uses `/learning capture` which implies interactive flow.

**Recommendation:** For phase-running specifically, the nudge should say: "If significant learnings emerged, note them in the phase completion report for the parent session to capture via `/learning capture`." (Delegate to parent, don't try to capture in background.)

#### Issue 7: Recall Nudge Wording Inconsistency (Severity: Trivial)
Phase 2, section 2 uses `**OPTIONAL:**` but the established pattern is `**OPTIONAL SUB-SKILL:**`. Should be consistent.

**Recommendation:** Change to `**OPTIONAL SUB-SKILL:**` for consistency.

### Strengths

1. **Clean phase structure** — Phase 1 delivers a standalone skill, Phase 2 integrates, Phase 3 releases. Each phase is independently valuable.
2. **Good research incorporation** — qmd update requirement, agent-fs CLI commands, and skill patterns are correctly reflected.
3. **Thorough E2E verification** — both automated (hook testing) and manual (session-based) verification steps.
4. **Modeling after questioning skill** — using the newest, cleanest skill as reference is the right call.
5. **Explicit "What We're NOT Doing"** — clear scope boundaries prevent feature creep.

### Verdict

**Ready with minor fixes.** The plan is solid and implementable. Issues 1 (CLAUDE.md bootstrap) is the most important to address before implementation. Issues 2-7 are improvements that can be incorporated during implementation without changing the phase structure.

**Recommendation:** Address Issue 1 in Phase 1 before implementing. Issues 2-7 can be handled inline during SKILL.md authoring.

### Post-Review Updates (2026-03-19)

All 7 issues addressed:
- **Issue 1 (CLAUDE.md bootstrap):** Added to Setup/Status flow — offers to add bootstrap section after config creation
- **Issue 2 (Backend adapter completeness):** All 4 operations (write/search/list/delete) now specified per backend
- **Issue 3 (Significance threshold):** Added default heuristics + CLAUDE.md `## Learning Capture Rules` override mechanism
- **Issue 4 (Review UX):** Specified: list with summaries → multiSelect → per-item action. File-review offered as alternative.
- **Issue 5 (Multi-user conflicts):** Shared learnings include author name in slug. Personal vs shared is a capture-time choice.
- **Issue 6 (Phase-running nudge):** Separate nudge text that delegates to parent session instead of trying to capture in background.
- **Issue 7 (Recall wording):** Changed to `**OPTIONAL SUB-SKILL:**` for consistency.
