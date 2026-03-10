---
date: 2026-03-09T17:00:00Z
planner: claude
git_commit: 53589fb
branch: main
repository: ai-toolbox
topic: "New Skills for cc-plugin/base"
tags: [cc-plugin, skills, brainstorming, reviewing, verifying, phase-running]
status: completed
autonomy: verbose
research: thoughts/taras/research/2026-03-09-new-base-skills.md
last_updated: 2026-03-10
last_updated_by: claude
---

# New Skills for cc-plugin/base — Implementation Plan

## Overview

Add 4 new skills to `cc-plugin/base` to fill workflow gaps: **Reviewing**, **Brainstorming**, **Plan Verification**, and **Phase Runner**. These extend the existing `research → plan → implement` chain into: `brainstorm → research → plan → review → implement (with phase-runner) → verify-plan`, with `review` usable at any stage.

## Current State Analysis

### Existing Skills
- `skills/researching/` — SKILL.md + template.md
- `skills/planning/` — SKILL.md + template.md
- `skills/implementing/` — SKILL.md (no template, has hooks in frontmatter)
- `skills/tdd-planning/` — SKILL.md + template.md

### Existing Commands (thin wrappers)
- `commands/research.md`, `commands/create-plan.md`, `commands/create-tdd-plan.md`, `commands/implement-plan.md`

### Existing Hooks
- `hooks/validate-thoughts.py` — enforces `research/` and `plans/` subdirectories only
- `hooks/plan_checkbox_reminder.py` — reminds to update checkboxes
- `hooks/plan_checkbox_stop.py` — blocks exit if unchecked items
- `hooks/plan_utils.py` — shared utilities

### Key Patterns
- Skills: YAML frontmatter (name, description, optional hooks) → Working Agreement → When to Use → Autonomy Mode → Process Steps → Review Integration
- Commands: YAML frontmatter (description, model: inherit, argument-hint) → thin wrapper that parses `--autonomy=` and invokes skill
- All skills use `AskUserQuestion` for interaction, establish preferences upfront
- File review integration is standard across skills

## Desired End State

- 4 new skills registered and functional: `brainstorming`, `reviewing`, `verifying`, `phase-running`
- 4 new commands: `brainstorm`, `review`, `verify-plan`, `run-phase`
- `validate-thoughts.py` updated to allow `brainstorms/` subdirectory
- Plugin version bumped to `1.5.0`
- All skills follow existing patterns and conventions

### Key Discoveries:
- `validate-thoughts.py:30-46` hardcodes only `research/` and `plans/` patterns — must add `brainstorms/`
- Implementing skill registers hooks directly in SKILL.md frontmatter, not plugin.json — phase-running won't need plugin.json changes
- No `brainstorms/` directory exists yet anywhere in the repo
- `plugin.json` only registers hooks — skills/commands/agents are auto-discovered by directory convention

## Quick Verification Reference

Common commands to verify the implementation:
- Skills auto-register: check with `/find-skills` or look for them in the skill list
- Hook validation: `echo '{"tool_name":"Write","tool_input":{"file_path":"thoughts/taras/brainstorms/2026-01-01-test.md","content":"---\ndate: 2026-01-01\n---\n# Test"}}' | python3 cc-plugin/base/hooks/validate-thoughts.py`
- Plugin JSON validation: `python3 -c "import json; json.load(open('cc-plugin/base/.claude-plugin/plugin.json'))"`

Key files to check:
- `cc-plugin/base/skills/*/SKILL.md` — all skill definitions
- `cc-plugin/base/commands/*.md` — all command wrappers
- `cc-plugin/base/hooks/validate-thoughts.py` — thoughts directory validation
- `cc-plugin/base/.claude-plugin/plugin.json` — plugin manifest

## What We're NOT Doing

- Not modifying existing skills — EXCEPT: adding review integration prompts to researching/planning/brainstorming, and updating implementing to use phase-runner as its execution backend
- Not creating new agents — existing agents (codebase-locator, codebase-analyzer, etc.) are sufficient
- Not adding new hooks to plugin.json — new hook registrations go in SKILL.md frontmatter where needed
- Not implementing the `brainstorms/` directory itself — it will be created naturally when the brainstorming skill is first used
- Not building a dedicated UI or dashboard for phase-runner status

## Implementation Approach

Each skill follows the same creation pattern:
1. Create `skills/<name>/SKILL.md` following the established structure
2. Create `skills/<name>/template.md` if the skill produces structured output files
3. Create `commands/<name>.md` as a thin wrapper with autonomy parsing
4. Update any hooks or infrastructure as needed

Skills are implemented in order of increasing complexity: Reviewing (simplest, no new infrastructure) → Brainstorming (needs template + validate-thoughts update) → Plan Verification (needs git integration logic) → Phase Runner (most complex, background execution model).

---

## Phase 1: Infrastructure

### Overview
Update `validate-thoughts.py` to allow the new `brainstorms/` subdirectory and bump the plugin version.

### Changes Required:

#### 1. Update validate-thoughts.py
**File**: `cc-plugin/base/hooks/validate-thoughts.py`
**Changes**:
- Add `brainstorms_pattern` regex at line ~31: `r'thoughts/[^/]+/brainstorms/\d{4}-\d{2}-\d{2}-[\w-]+\.md$'`
- Add `elif "/brainstorms/" in file_path:` block after the plans check (line ~46)
- Update the error message in the else block (line ~48) to include `brainstorms` as a valid subdirectory

#### 2. Bump plugin version
**File**: `cc-plugin/base/.claude-plugin/plugin.json`
**Changes**: Update `"version"` from `"1.4.2"` to `"1.5.0"` (new features warrant minor version bump)

### Success Criteria:

#### Automated Verification:
- [x] Hook allows brainstorms path: `echo '{"tool_name":"Write","tool_input":{"file_path":"/repo/thoughts/taras/brainstorms/2026-01-01-test.md","content":"---\ndate: 2026-01-01\n---\n# Test"}}' | python3 cc-plugin/base/hooks/validate-thoughts.py; echo "exit: $?"`
- [x] Hook still blocks invalid paths: `echo '{"tool_name":"Write","tool_input":{"file_path":"/repo/thoughts/taras/invalid/2026-01-01-test.md","content":"test"}}' | python3 cc-plugin/base/hooks/validate-thoughts.py 2>&1; echo "exit: $?"`
- [x] Hook still validates research and plans: `echo '{"tool_name":"Write","tool_input":{"file_path":"/repo/thoughts/taras/research/2026-01-01-test.md","content":"---\ndate: 2026-01-01\n---\n# Test"}}' | python3 cc-plugin/base/hooks/validate-thoughts.py; echo "exit: $?"`
- [x] Plugin JSON is valid: `python3 -c "import json; d=json.load(open('cc-plugin/base/.claude-plugin/plugin.json')); print(d['version'])"`

> **Note**: Test commands use `/repo/thoughts/...` (absolute-style paths) because Claude Code always provides absolute paths to tool hooks. The hook's regex checks for `/thoughts/` with a leading slash, so relative paths like `thoughts/taras/...` would not exercise the validation correctly.

#### Manual Verification:
- [ ] Review the validate-thoughts.py diff to confirm the new pattern matches the existing style
- [ ] Confirm version bump is appropriate (1.4.2 → 1.5.0)

**Implementation Note**: After completing this phase, pause for manual confirmation.

---

## Phase 2: Reviewing Skill

### Overview
Create the reviewing skill for structured critique of research docs, plans, and brainstorms. Supports appending errata to the document or writing a separate review file. **Additionally, update existing skills (researching, planning, brainstorming, implementing) to offer the reviewing skill at the end of their workflow.**

### Changes Required:

#### 1. Create SKILL.md
**File**: `cc-plugin/base/skills/reviewing/SKILL.md`
**Changes**: New file with the following structure:

**Frontmatter**:
```yaml
name: reviewing
description: Structured critique of research, plan, and brainstorm documents for completeness, gaps, and quality.
```

**Key sections**:
- **Working Agreement**: Standard AskUserQuestion-first pattern
- **User Preferences**:
  - Output mode: "Append errata to document (Recommended)" vs "Write separate review file to thoughts/*/reviews/"
  - File review integration preference
- **When to Use**: `/review` command, referenced by other skills, user asks to review a document
- **Autonomy Mode**: Standard 3-tier (Autopilot/Critical/Verbose)
- **Process Steps**:
  1. **Read & Classify** — Read the input document fully. Determine type from path (`/research/` → research, `/plans/` → plan, `/brainstorms/` → brainstorm) and content structure
  2. **Structural Check** — Verify required sections exist per type:
     - Research: frontmatter, research question, summary, detailed findings, references
     - Plans: frontmatter, overview, current state, desired end state, phases with success criteria, what we're NOT doing
     - Brainstorms: frontmatter, initial context, Q&A sections, synthesis/next steps
  3. **Content Analysis** — Apply type-specific criteria:
     - Research: completeness of findings, unsupported claims, missing areas, open questions not addressed
     - Plans: missing phases, weak success criteria, unstated assumptions, missing error handling/rollback, scope creep risk
     - Brainstorms: unexplored angles, premature conclusions, missing constraints, readiness for research
  4. **Gap Identification** — What's missing? What assumptions are unstated? Cross-reference with codebase if needed (spawn codebase-analyzer agent)
  5. **Present Findings** — Categorize as Critical/Important/Minor. Present summary via text output
  6. **Apply or Discuss** — Auto-fix Minor issues (typos, formatting). Use AskUserQuestion for Critical/Important items. If output mode is "append", add `## Review Errata` section. If "separate", write to `thoughts/*/reviews/YYYY-MM-DD-review-of-<original-slug>.md`
- **Review Integration**: Offer file-review after automated review for inline human comments
- **No rewriting rule**: Identify issues, don't rewrite the document. The author should address findings.

#### 2. Update existing skills to offer review at completion
**Files**:
- `cc-plugin/base/skills/researching/SKILL.md` — After step 7 (present findings), add: "Offer to run `/review` on the research document for structured quality check"
- `cc-plugin/base/skills/planning/SKILL.md` — After step 5 (review and iterate), add: "Offer to run `/review` on the plan for completeness and gap analysis"
- `cc-plugin/base/skills/implementing/SKILL.md` — In "Completing Implementation" section, add: "Offer to run `/verify-plan` for post-implementation audit, then `/review` for final quality check"
- `cc-plugin/base/skills/brainstorming/SKILL.md` — In the Handoff phase, the review option is already implicit via file-review, but add: "Before handoff, offer to run `/review` on the brainstorm document to identify unexplored areas"

**Changes**: Each skill gets a small addition to its Review Integration or completion section, connecting it to the reviewing skill via AskUserQuestion.

#### 3. Create command wrapper
**File**: `cc-plugin/base/commands/review.md`
**Changes**: New file following the thin wrapper pattern:

```yaml
---
description: Structured critique of research, plan, and brainstorm documents
model: inherit
argument-hint: [--autonomy=MODE] [--output=append|separate] <path>
---
```

Body: Parse `--autonomy=` and `--output=` flags, invoke `desplega:reviewing` skill. If no path provided, ask for one.

### Success Criteria:

#### Automated Verification:
- [x] SKILL.md exists: `ls cc-plugin/base/skills/reviewing/SKILL.md`
- [x] Command exists: `ls cc-plugin/base/commands/review.md`
- [x] SKILL.md has valid frontmatter: `head -5 cc-plugin/base/skills/reviewing/SKILL.md`
- [x] Command has valid frontmatter: `head -5 cc-plugin/base/commands/review.md`

#### Manual Verification:
- [ ] SKILL.md follows the same structural pattern as existing skills (researching, planning)
- [ ] Review criteria are comprehensive and type-specific
- [ ] The errata output format is clear and actionable
- [ ] The separate file output path follows thoughts directory conventions

**Implementation Note**: After completing this phase, pause for manual confirmation.

---

## Phase 3: Brainstorming Skill

### Overview
Create the brainstorming skill for interactive exploration before research. Documents grow progressively — starting with initial context, accumulating Q&A sections, ending as a lightweight pre-PRD that feeds into `/research`.

### Changes Required:

#### 1. Create SKILL.md
**File**: `cc-plugin/base/skills/brainstorming/SKILL.md`
**Changes**: New file with the following structure:

**Frontmatter**:
```yaml
name: brainstorming
description: Interactive exploration of ideas through Socratic Q&A. Produces progressive documents that serve as lightweight pre-PRDs feeding into research.
```

**Key sections**:
- **Working Agreement**: Standard AskUserQuestion-first pattern
- **User Preferences**: File review preference only. Autonomy modes limited to Verbose (default) and Critical — Autopilot doesn't make sense for interactive brainstorming.
- **When to Use**: `/brainstorm` command, user wants to explore an idea, user isn't ready for formal research yet
- **Process Steps**:
  1. **Initialize Document** — Create `thoughts/*/brainstorms/YYYY-MM-DD-<topic>.md` with frontmatter and initial context. Write what we know so far: the topic, any context provided, initial thoughts.
  2. **Assess Phase** — Understand what the user wants to explore. Use AskUserQuestion: "What kind of exploration is this?" (Problem to solve / Idea to develop / Comparison to make / Workflow to improve / Other). Update document with the exploration type and framing.
  3. **Explore Phase** — Socratic Q&A loop. Ask ONE question at a time via AskUserQuestion. After each answer:
     - Append a new section to the document: `## Q: [question]` followed by the answer and any insights
     - Identify the next most important question to narrow scope
     - Continue until the user signals they're satisfied or natural saturation
  4. **Synthesize Phase** — Append a `## Synthesis` section summarizing:
     - Key decisions made
     - Open questions remaining
     - Constraints identified
     - Core requirements (lightweight PRD-style)
  5. **Handoff Phase** — Use AskUserQuestion: "What's the next step?" with options:
     - "Start research based on this brainstorm" → suggest `/research` command with this file as input
     - "Create a plan directly" → suggest `/create-plan` with this file as input
     - "Done for now" → finalize document, set status to `parked` or `complete`
- **YAGNI Principle**: Explicitly resist premature solutions during Explore phase. The goal is understanding, not implementation. If the user starts solutioning, gently redirect to requirements.
- **Review Integration**: Offer file-review after synthesis for inline feedback
- **Document Evolution**: The brainstorm document is a living artifact during the session. It starts rough and gains structure. By the end, it should be readable as a standalone context document.

#### 2. Create template
**File**: `cc-plugin/base/skills/brainstorming/template.md`
**Changes**: New template file with:
- YAML frontmatter (date, author, topic, tags, status, exploration_type)
- `# [Topic] — Brainstorm` heading
- `## Context` section (initial framing)
- `## Exploration` section (Q&A pairs accumulate here)
- `## Synthesis` section (filled at end)
- `## Next Steps` section (handoff decisions)

#### 3. Create command wrapper
**File**: `cc-plugin/base/commands/brainstorm.md`
**Changes**: New file following the thin wrapper pattern:

```yaml
---
description: Interactive exploration of ideas through Socratic Q&A
model: inherit
argument-hint: [--autonomy=MODE] [topic]
---
```

Body: Parse `--autonomy=` flag (only verbose/critical valid). Invoke `desplega:brainstorming` skill. If no topic, ask "What would you like to explore?"

### Success Criteria:

#### Automated Verification:
- [x] SKILL.md exists: `ls cc-plugin/base/skills/brainstorming/SKILL.md`
- [x] Template exists: `ls cc-plugin/base/skills/brainstorming/template.md`
- [x] Command exists: `ls cc-plugin/base/commands/brainstorm.md`
- [x] SKILL.md has valid frontmatter: `head -5 cc-plugin/base/skills/brainstorming/SKILL.md`

#### Manual Verification:
- [ ] The progressive document approach is clear — each Q&A becomes a section
- [ ] The Socratic interaction model is well-defined (one question at a time)
- [ ] Handoff to research/planning is explicit and actionable
- [ ] Template supports the progressive growth pattern
- [ ] YAGNI principle is clearly articulated

**Implementation Note**: After completing this phase, pause for manual confirmation.

---

## Phase 4: Plan Verification Skill

### Overview
Create the plan verification skill for post-implementation auditing. Cross-references the plan against actual changes to ensure nothing was missed or left stale.

### Changes Required:

#### 1. Create SKILL.md
**File**: `cc-plugin/base/skills/verifying/SKILL.md`
**Changes**: New file with the following structure:

**Frontmatter**:
```yaml
name: verifying
description: Post-implementation plan verification. Cross-references plans against actual changes for completeness and accuracy.
```

**Key sections**:
- **Working Agreement**: Standard AskUserQuestion-first pattern
- **User Preferences**: File review preference
- **When to Use**: `/verify-plan` command, after implementation completes, before closing a feature/PR
- **Autonomy Mode**: All three modes supported
  - Autopilot: Run all checks, update plan, report summary
  - Critical: Ask about discrepancies
  - Verbose: Walk through each check
- **Process Steps**:
  1. **Load Plan** — Read the plan fully. If no path provided, search for plans with `status: in-progress` or `status: completed` in `thoughts/*/plans/`. Use AskUserQuestion if multiple found.
  2. **Checkbox Audit** — Parse all `- [ ]` and `- [x]` items. Report:
     - Total items vs checked items
     - Any automated verification items still unchecked
     - Any manual verification items still unchecked (these may be intentionally unchecked)
  3. **Git Diff Correlation** — Run `git diff <plan-commit>..HEAD --name-only` (using the plan's `git_commit` frontmatter). Compare changed files against files mentioned in the plan's "Changes Required" sections. Flag:
     - Files changed that aren't mentioned in the plan (unexpected changes)
     - Files mentioned in the plan that weren't changed (missing implementation)
  4. **Scope Verification** — Read the "What We're NOT Doing" section. Search the git diff for evidence of scope creep (files or patterns related to out-of-scope items).
  5. **Success Criteria Re-run** — For each phase's "Automated Verification" section, re-run the commands and report pass/fail. Skip commands that are clearly stale (e.g., reference files that no longer exist).
  6. **Plan Freshness Check** — Compare phase descriptions against actual implementation. Flag phases where the description no longer matches what was done (e.g., file paths changed, approach adapted).
  7. **Verification Report** — Present findings categorized as:
     - **Blocking**: Unchecked automated items, failing success criteria
     - **Warning**: Unexpected files changed, scope concerns
     - **Info**: Stale descriptions, minor mismatches
  8. **Status Update** — If all blocking items resolved, offer to set plan `status: completed`. Update `last_updated` and `last_updated_by` in frontmatter.
- **Integration with reviewing skill**: After verification, optionally invoke the reviewing skill on the plan for a final quality check.

#### 2. Create command wrapper
**File**: `cc-plugin/base/commands/verify-plan.md`
**Changes**: New file:

```yaml
---
description: Post-implementation plan verification and audit
model: inherit
argument-hint: [--autonomy=MODE] [plan-path]
---
```

Body: Parse `--autonomy=` flag. Invoke `desplega:verifying` skill. If no path, search for active plans.

### Success Criteria:

#### Automated Verification:
- [x] SKILL.md exists: `ls cc-plugin/base/skills/verifying/SKILL.md`
- [x] Command exists: `ls cc-plugin/base/commands/verify-plan.md`
- [x] SKILL.md has valid frontmatter: `head -5 cc-plugin/base/skills/verifying/SKILL.md`

#### Manual Verification:
- [ ] Git diff correlation logic is clearly described
- [ ] Scope verification approach is practical (not too aggressive with false positives)
- [ ] The blocking/warning/info categorization makes sense
- [ ] The skill handles edge cases: no git_commit in frontmatter, plan on different branch, etc.

**Implementation Note**: After completing this phase, pause for manual confirmation.

---

## Phase 5: Phase Runner Skill

### Overview
Create the phase runner skill for executing individual plan phases as background sub-agents. This saves main session context and enables parallel execution of independent phases.

### Changes Required:

#### 1. Create SKILL.md
**File**: `cc-plugin/base/skills/phase-running/SKILL.md`
**Changes**: New file with the following structure:

**Frontmatter**:
```yaml
name: phase-running
description: Execute individual plan phases as background sub-agents for context-efficient implementation.
hooks:
  PostToolUse:
    - matcher: "Edit|Write"
      hooks:
        - type: command
          command: "${CLAUDE_PLUGIN_ROOT}/hooks/plan_checkbox_reminder.py"
```

Note: Inherits the same PostToolUse hook as the implementing skill — phase agents need checkbox reminders too.

**Key sections**:
- **Working Agreement**: Minimal — phase agents are atomic, they don't ask interactive questions
- **When to Use**: Invoked by implementing skill as default execution mode for each phase. The `/run-phase` command exists for advanced manual use but is not the primary entry point.
- **Autonomy Mode**: Always runs as Autopilot within the sub-agent. The calling context (implementing skill or user) controls the outer autonomy.
- **Execution Model**:
  - The skill is designed to run inside a background `Agent` (sub-agent), NOT in the main session
  - The implementing skill (or user) spawns it via the Agent tool with `run_in_background: true`
  - The phase agent receives: plan path, phase number, and relevant context
- **Process Steps**:
  1. **Load Context** — Read the full plan. Extract the specific phase to execute. Read all files mentioned in the phase's "Changes Required" section.
  2. **Pre-flight Check** — Verify:
     - Previous phases are completed (checkboxes checked)
     - No merge conflicts or dirty state in target files
     - Phase dependencies are met (files from previous phases exist)
  3. **Execute Phase** — Implement all changes described in the phase:
     - Follow the plan's instructions precisely
     - Create/edit files as specified
     - Run automated verification commands from the phase's success criteria
  4. **Report Results** — The agent's return message includes:
     - Status: `completed` | `blocked` | `failed`
     - If completed: list of files changed, automated checks passed
     - If blocked: what's blocking and why
     - If failed: error details and partial progress
  5. **Update Plan** — Check off automated verification items that passed. Do NOT check off manual verification items.
- **Atomicity**: Phase agents run to completion or stop. They do NOT use AskUserQuestion. If something is ambiguous, they report `blocked` status with details.
- **Context Handoff Pattern**:
  - Caller provides: plan path + phase number + autonomy mode
  - Phase agent reads: plan + relevant source files
  - Phase agent returns: status + changed files + verification results
  - Caller handles: manual verification, cross-phase coordination, human checkpoints

#### 2. Update implementing skill to use phase-runner
**File**: `cc-plugin/base/skills/implementing/SKILL.md`
**Changes**: Modify the implementation execution model so each phase runs via phase-runner as a background sub-agent:

Update the "Verification Approach" / phase execution section to replace the current inline execution with:
1. Read phase overview (minimal context in main session)
2. Spawn `desplega:phase-running` agent in background with plan path + phase number
3. Wait for agent completion notification
4. Review agent's report (status, changed files, verification results)
5. Handle manual verification with user
6. Proceed to next phase

The implementing skill becomes an **orchestrator** — it coordinates phases, handles human checkpoints, and manages cross-phase decisions, but delegates actual implementation work to phase-runner sub-agents.

**Backward compatibility**: Add a user preference at setup: "Execute phases in background (Recommended) or inline (classic)?" — so users can opt out if needed.

#### 3. Create command wrapper
**File**: `cc-plugin/base/commands/run-phase.md`
**Changes**: New file:

```yaml
---
description: Execute a single plan phase as a background sub-agent
model: inherit
argument-hint: <plan-path> <phase-number>
---
```

Body: Validate plan path and phase number are provided. Spawn background Agent with `desplega:phase-running` skill, passing plan path and phase number. Report agent launch status.

### Success Criteria:

#### Automated Verification:
- [x] SKILL.md exists: `ls cc-plugin/base/skills/phase-running/SKILL.md`
- [x] Command exists: `ls cc-plugin/base/commands/run-phase.md`
- [x] SKILL.md has valid frontmatter: `head -5 cc-plugin/base/skills/phase-running/SKILL.md`
- [x] Hook reference in frontmatter points to existing file: `ls cc-plugin/base/hooks/plan_checkbox_reminder.py`

#### Manual Verification:
- [ ] The execution model is clear — runs in background Agent, not main session
- [ ] Atomicity contract is well-defined (no AskUserQuestion, report blocked/failed)
- [ ] Context handoff pattern is practical — phase agent gets enough context
- [ ] Pre-flight checks cover the important cases
- [ ] The implementing skill now delegates to phase-runner by default
- [ ] The "inline (classic)" opt-out preference works
- [ ] The orchestrator flow is clear: spawn → wait → review report → manual verification → next

**Implementation Note**: After completing this phase, pause for manual confirmation.

---

## Phase 6: Integration & Documentation

### Overview
Update the plugin README, verify all skills register correctly, and ensure the complete workflow is documented.

### Changes Required:

#### 1. Final version bump verification
**File**: `cc-plugin/base/.claude-plugin/plugin.json`
**Changes**: Verify the version is `1.5.0` (set in Phase 1). If any additional version-worthy changes were made during implementation, consider if a higher version is needed.

#### 2. Update README
**File**: `cc-plugin/base/README.md`
**Changes**:
- Add new skills to the skills table: brainstorming, reviewing, verifying, phase-running
- Add new commands to the commands table: brainstorm, review, verify-plan, run-phase
- Update the workflow diagram to show the complete chain: `brainstorm → research → plan → review → implement (with phase-runner) → verify-plan`
- Update version references if any

#### 3. Verify skill registration
Run through each new skill to confirm it appears in the available skills list and responds to its command.

#### 4. Update validate-thoughts.py error message
Ensure the error message in the else block lists all valid subdirectories: `research`, `plans`, `brainstorms`.

### Success Criteria:

#### Automated Verification:
- [x] README references all new skills: `grep -c 'brainstorming\|reviewing\|verifying\|phase-running' cc-plugin/base/README.md`
- [x] README references all new commands: `grep -c 'brainstorm\|/review\|verify-plan\|run-phase' cc-plugin/base/README.md`
- [x] All skill directories exist: `ls -d cc-plugin/base/skills/brainstorming cc-plugin/base/skills/reviewing cc-plugin/base/skills/verifying cc-plugin/base/skills/phase-running`
- [x] All command files exist: `ls cc-plugin/base/commands/brainstorm.md cc-plugin/base/commands/review.md cc-plugin/base/commands/verify-plan.md cc-plugin/base/commands/run-phase.md`
- [x] Plugin JSON is valid: `python3 -c "import json; json.load(open('cc-plugin/base/.claude-plugin/plugin.json'))"`

#### Manual Verification:
- [ ] README accurately describes the new workflow
- [ ] All new skills appear in the available skills list when the plugin is loaded
- [ ] Each command responds appropriately when invoked without arguments

**Implementation Note**: After completing this phase, pause for manual confirmation.

---

## Testing Strategy

Since these are markdown-based skill definitions (not executable code), testing is primarily:
1. **Structural validation**: Files exist, frontmatter is valid, patterns match existing skills
2. **Hook testing**: validate-thoughts.py accepts new paths, rejects invalid ones
3. **Integration testing**: Each skill appears in the skill list, each command is invocable
4. **End-to-end**: Run `/brainstorm test topic` and verify the full flow works

## Manual E2E Verification

After all phases complete:
- [ ] `/brainstorm test topic` — starts interactive brainstorm, creates file in `thoughts/taras/brainstorms/`
- [ ] `/review thoughts/taras/research/2026-03-09-new-base-skills.md` — reviews the research doc, appends errata
- [ ] `/verify-plan thoughts/taras/plans/2026-03-09-new-base-skills.md` — runs verification on this plan itself
- [ ] `/run-phase thoughts/taras/plans/2026-03-09-new-base-skills.md 1` — executes phase 1 in background (test on a dummy plan)

## References

- Research: `thoughts/taras/research/2026-03-09-new-base-skills.md`
- Existing skills: `cc-plugin/base/skills/` (researching, planning, implementing, tdd-planning)
- compound-engineering brainstorming: reference for "WHAT before HOW" pattern
- compound-engineering document-review: reference for review criteria structure
