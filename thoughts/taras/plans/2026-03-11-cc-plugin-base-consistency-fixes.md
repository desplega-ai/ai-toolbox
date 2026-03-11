---
date: 2026-03-11T12:00:00-05:00
topic: "cc-plugin/base consistency fixes"
tags: [plan, cc-plugin, base, consistency, AskUserQuestion, workflow, file-review]
status: completed
researcher: Claude
based_on: thoughts/taras/research/2026-03-10-cc-plugin-base-consistency.md
---

# cc-plugin/base Consistency Fixes Implementation Plan

## Overview
Fix the consistency gaps identified in the [research audit](../research/2026-03-10-cc-plugin-base-consistency.md) across three dimensions: AskUserQuestion usage in commands, workflow next-step handoffs in skills, and missing Review Integration section in implementing skill.

## Current State Analysis
- **4 commands** use plain-text questions instead of `AskUserQuestion`: `bu-auto-instrument.md`, `commit.md`, `continue-handoff.md`, `verify-plan.md`
- **4 skills** have incomplete or missing workflow next-step handoffs: `planning`, `researching`, `reviewing`, `tdd-planning`
- **1 skill** (`implementing`) lacks the standard Review Integration section

### Key Discoveries:
- All 7 interactive skills share identical "Working Agreement" boilerplate — skills are consistent (`brainstorming/SKILL.md:14`)
- The brainstorming skill's "Handoff Phase" (`brainstorming/SKILL.md:126-139`) is the gold standard for workflow next-steps
- The standard Review Integration pattern is 5 lines, present in 6/7 interactive skills (`brainstorming/SKILL.md:146-151`)
- `bu-auto-instrument.md` is architecturally unique — it's the only command with no corresponding skill

## Desired End State
- All commands that ask users questions do so via `AskUserQuestion` tool
- All workflow-participating skills propose the correct next command(s) in the chain per the README workflow diagram
- `implementing/SKILL.md` has a proper Review Integration section matching the standard pattern

### Workflow diagram for reference (`README.md:92-96`):
```
brainstorm → research → plan → review → implement (with phase-runner) → verify-plan
                                  ↑                                          |
                                  └──────────── review ←─────────────────────┘
```

## Quick Verification Reference

Common commands to verify:
- Visual diff of all changed files: `git diff cc-plugin/base/`
- Grep for remaining plain-text "ask" patterns: `grep -rn "Ask the user\|Ask:" cc-plugin/base/commands/`
- Grep for AskUserQuestion presence: `grep -rn "AskUserQuestion" cc-plugin/base/commands/`

Key files to check:
- `cc-plugin/base/commands/{commit,continue-handoff,verify-plan,bu-auto-instrument}.md`
- `cc-plugin/base/skills/{planning,researching,reviewing,tdd-planning,implementing}/SKILL.md`

## What We're NOT Doing
- Not refactoring `bu-auto-instrument.md` into a skill+command architecture (out of scope, separate effort)
- Not adding hooks or enforcement mechanisms
- Not modifying agents (they correctly avoid user interaction)
- Not changing templates
- Not modifying the README workflow diagram

## Implementation Approach
Three phases, each targeting one consistency dimension. Small, surgical edits only — no restructuring.

---

## Phase 1: Fix AskUserQuestion in Commands

### Overview
Update 4 commands to use `AskUserQuestion` tool instead of plain-text questions. Three are minor (1-2 line changes), one is major (`bu-auto-instrument.md`).

### Changes Required:

#### 1. `commit.md` — Minor fix
**File**: `cc-plugin/base/commands/commit.md`
**Change**: Replace the plain-text `Ask:` at line 22 with an instruction to use `AskUserQuestion`.

**Before** (line 19-22):
```
3. **Present your plan to the user:**
   - List the files you plan to add for each commit
   - Show the commit message(s) you'll use
   - Ask: "I plan to create [N] commit(s) with these changes. Shall I proceed?"
```

**After**:
```
3. **Present your plan to the user:**
   - List the files you plan to add for each commit
   - Show the commit message(s) you'll use
   - Use **AskUserQuestion**: "I plan to create [N] commit(s) with these changes. Shall I proceed?" with options: 1. Yes, proceed  2. No, let me adjust
```

#### 2. `continue-handoff.md` — Minor fix
**File**: `cc-plugin/base/commands/continue-handoff.md`
**Change**: Replace plain "Ask the user" at lines 14-15 and "confirm" at line 28 with `AskUserQuestion` instructions.

**Before** (lines 14-15):
```
3. Show the available handoffs to the user
4. Ask the user which one to continue from
```

**After**:
```
3. Show the available handoffs to the user
4. Use **AskUserQuestion** to ask which handoff to continue from (list them as options)
```

**Before** (line 28):
```
2. Present a brief summary to the user and confirm they want to continue
```

**After**:
```
2. Present a brief summary and use **AskUserQuestion**: "Continue from this handoff?" with options: 1. Yes, continue  2. No, pick a different one
```

> Note: Line 28 uses "confirm they want to continue" rather than "Ask the user" — still a plain-text question pattern that should use AskUserQuestion.

#### 3. `verify-plan.md` — Minor fix
**File**: `cc-plugin/base/commands/verify-plan.md`
**Change**: Replace bare "ask" at line 25 with `AskUserQuestion`.

**Before** (line 25):
```
   - If multiple found, ask which one to verify
```

**After**:
```
   - If multiple found, use **AskUserQuestion** to ask which plan to verify (list them as options)
```

#### 4. `bu-auto-instrument.md` — Major fix
**File**: `cc-plugin/base/commands/bu-auto-instrument.md`
**Change**: Replace all 8+ plain-text question blocks with `AskUserQuestion` instructions. This command has no corresponding skill, so the fixes must be inline.

Locations to fix:
- **Lines 83-91**: "First, ask the user:" with 5 numbered questions → Convert to `AskUserQuestion` with structured questions
- **Lines 137-140**: "Ask the user:" with 3 bullets → Convert to `AskUserQuestion`
- **Lines 183-186**: "Ask the user:" with 3 bullets → Convert to `AskUserQuestion`
- **Lines 212-214**: "Ask the user:" with 2 bullets → Convert to `AskUserQuestion`
- **Line 222**: "Ask questions when business logic is unclear" → Reference `AskUserQuestion` as the tool
- **Lines 318-327**: "Key Questions to Ask" section → Reference `AskUserQuestion` as the tool to use
- **Lines 329-335**: Additional "ask" and "Wait for user confirmation" patterns → Reference `AskUserQuestion`
- **Lines 339-342**: "Ready! Please provide:" → Convert to `AskUserQuestion`

For each location, change the pattern from:
```
**Ask the user:**
- "Question 1?"
- "Question 2?"
```
To:
```
Use **AskUserQuestion** with:

| Question | Options |
|----------|---------|
| "Question 1?" | 1. [Option A], 2. [Option B] |
```

Where questions have free-form answers (e.g., "What does this application do?"), use the AskUserQuestion tool description field to explain what's needed, with options like "1. [Category A], 2. [Category B], 3. Other (describe)".

### Success Criteria:

#### Automated Verification:
- [ ] No plain-text "Ask:" patterns remain: `grep -rn "^\s*- Ask:" cc-plugin/base/commands/`
- [ ] No "Ask the user" patterns remain: `grep -rn "Ask the user" cc-plugin/base/commands/`
- [ ] AskUserQuestion present in all 4 files: `grep -l "AskUserQuestion" cc-plugin/base/commands/{commit,continue-handoff,verify-plan,bu-auto-instrument}.md | wc -l` (expect 4)
- [ ] All 11 commands still valid markdown: `find cc-plugin/base/commands -name "*.md" | wc -l` (expect 11)

#### Manual Verification:
- [ ] Read each changed command and confirm the AskUserQuestion usage feels natural (not forced)
- [ ] Confirm `bu-auto-instrument.md` questions still make sense with structured options
- [ ] Spot-check that no question context was lost in the conversion

**Implementation Note**: After completing this phase, pause for manual confirmation.

---

## Phase 2: Fix Workflow Next-Step Handoffs in Skills

### Overview
Add proper workflow next-step proposals to 4 skills that are missing them. Follow the brainstorming skill's "Handoff Phase" pattern (`brainstorming/SKILL.md:126-139`) as the gold standard.

### Changes Required:

#### 1. `planning/SKILL.md` — Add `/implement-plan` handoff
**File**: `cc-plugin/base/skills/planning/SKILL.md`
**Where**: After line 186 (`4. **Finalize the plan** - DO NOT START implementation`), before the Review Integration section.

**Add** a new step 5 after the existing step 4:

```markdown
5. **Workflow handoff:**
   After the plan is finalized (and optionally reviewed), use **AskUserQuestion** with:

   | Question | Options |
   |----------|---------|
   | "The plan is ready. What's the next step?" | 1. Implement this plan (→ `/implement-plan`), 2. Run a review first (→ `/review`), 3. Done for now (park the plan) |

   Based on the answer:
   - **Implement**: Suggest the `/implement-plan` command with the plan file path
   - **Review**: Invoke the `desplega:reviewing` skill on the plan document
   - **Done**: Set the plan's `status` to `ready` or `parked` as appropriate
```

#### 2. `researching/SKILL.md` — Add `/create-plan` handoff
**File**: `cc-plugin/base/skills/researching/SKILL.md`
**Where**: After step 9 (line 136, "Handle follow-up questions"), before the Review Integration section. Add as a new step 10.

**Add**:

```markdown
10. **Workflow handoff:**
    After research is complete (and optionally reviewed), use **AskUserQuestion** with:

    | Question | Options |
    |----------|---------|
    | "Research is complete. What's the next step?" | 1. Create a plan based on this research (→ `/create-plan`), 2. Run a review first (→ `/review`), 3. Done for now |

    Based on the answer:
    - **Plan**: Suggest the `/create-plan` command with the research file as input context
    - **Review**: Invoke the `desplega:reviewing` skill on the research document
    - **Done**: No further action needed
```

#### 3. `reviewing/SKILL.md` — Add context-dependent next steps
**File**: `cc-plugin/base/skills/reviewing/SKILL.md`
**Where**: After Step 6 (line 168), before the Review Integration section. Add as a new Step 7.

This is the most nuanced change. The reviewing skill is a cross-cutting utility used on brainstorms, research docs, plans, and post-implementation plans. The next step depends on what was reviewed. Inspect the document type from frontmatter or path.

**Add**:

```markdown
### Step 7: Workflow Handoff

After the review is complete, determine the document type (from frontmatter, file path, or content) and propose the appropriate next step.

Use **AskUserQuestion** with context-dependent options:

**If reviewing a brainstorm document:**

| Question | Options |
|----------|---------|
| "Review complete. What's next for this brainstorm?" | 1. Start research (→ `/research`), 2. Create a plan directly (→ `/create-plan`), 3. Done for now |

**If reviewing a research document:**

| Question | Options |
|----------|---------|
| "Review complete. What's next for this research?" | 1. Create a plan (→ `/create-plan`), 2. Done for now |

**If reviewing a plan document:**

| Question | Options |
|----------|---------|
| "Review complete. What's next for this plan?" | 1. Start implementation (→ `/implement-plan`), 2. Done for now |

**If reviewing a post-implementation verification:**

| Question | Options |
|----------|---------|
| "Review complete. What's next?" | 1. Done — mark as complete, 2. Address remaining items |

**If document type is unclear**, ask a generic question:

| Question | Options |
|----------|---------|
| "Review complete. Would you like to proceed to the next workflow step?" | 1. Yes, suggest next step, 2. Done for now |
```

#### 4. `tdd-planning/SKILL.md` — Add `/review` and `/implement-plan` handoff
**File**: `cc-plugin/base/skills/tdd-planning/SKILL.md`
**Where**: Replace line 175 (`3. **Finalize the plan** - DO NOT START implementation`) with expanded content matching the planning skill pattern.

**Replace** step 3 with:

```markdown
3. **Offer structured review:**
   - After iteration, offer: "Would you like me to run `/review` on this TDD plan for completeness and gap analysis?"
   - If yes, invoke the `desplega:reviewing` skill on the plan document

4. **Workflow handoff:**
   After the plan is finalized (and optionally reviewed), use **AskUserQuestion** with:

   | Question | Options |
   |----------|---------|
   | "The TDD plan is ready. What's the next step?" | 1. Implement this plan (→ `/implement-plan`), 2. Run a review first (→ `/review`), 3. Done for now (park the plan) |

   Based on the answer:
   - **Implement**: Suggest the `/implement-plan` command with the plan file path
   - **Review**: Invoke the `desplega:reviewing` skill on the plan document
   - **Done**: Set the plan's `status` to `ready` or `parked` as appropriate

5. **Finalize the plan** - DO NOT START implementation
```

### Success Criteria:

#### Automated Verification:
- [ ] Planning has `/implement-plan` reference: `grep -c "implement-plan" cc-plugin/base/skills/planning/SKILL.md` (expect >= 1)
- [ ] Researching has `/create-plan` reference: `grep -c "create-plan" cc-plugin/base/skills/researching/SKILL.md` (expect >= 1)
- [ ] Reviewing has context-dependent handoff: `grep -c "Workflow Handoff" cc-plugin/base/skills/reviewing/SKILL.md` (expect 1)
- [ ] TDD planning has both `/review` offer and `/implement-plan`: `grep -c "implement-plan" cc-plugin/base/skills/tdd-planning/SKILL.md` (expect >= 1)
- [ ] All skill files are valid markdown: `find cc-plugin/base/skills -name "SKILL.md" | wc -l` (expect 8)

#### Manual Verification:
- [ ] Read each modified skill's handoff section and confirm it follows the brainstorming gold standard pattern
- [ ] Verify the reviewing skill's context-dependent logic covers all document types in the workflow
- [ ] Confirm `tdd-planning` now mirrors `planning` in its review+handoff pattern
- [ ] Walk through the workflow diagram mentally and confirm every arrow has a corresponding handoff

**Implementation Note**: After completing this phase, pause for manual confirmation.

---

## Phase 3: Add Review Integration Section to Implementing Skill

### Overview
Add the standard Review Integration section to `implementing/SKILL.md`, which currently stores the file-review preference but never acts on it.

### Changes Required:

#### 1. `implementing/SKILL.md` — Add Review Integration section
**File**: `cc-plugin/base/skills/implementing/SKILL.md`
**Where**: After the "Completing Implementation" section (after line 219), at the end of the file. This matches the placement in all other skills (Review Integration is always the last major section).

**Add**:

```markdown
## Review Integration

If the `file-review` plugin is available and the user selected "Yes" during User Preferences setup:
- After significant code changes in each phase, invoke `/file-review:file-review <changed-file-path>` for inline human comments
- Process feedback with `file-review:process-review` skill before moving to the next phase
- If user selected "No" or autonomy mode is Autopilot, skip this step
```

Note: This is slightly adapted from the standard pattern because implementing reviews **code changes** (not a single document), so it references "significant code changes in each phase" rather than "after creating [document]".

### Success Criteria:

#### Automated Verification:
- [ ] Review Integration section exists: `grep -c "## Review Integration" cc-plugin/base/skills/implementing/SKILL.md` (expect 1)
- [ ] References file-review: `grep -c "file-review" cc-plugin/base/skills/implementing/SKILL.md` (expect >= 3)
- [ ] All 8 skills now have Review Integration (or deliberate exclusion): `grep -rl "Review Integration" cc-plugin/base/skills/*/SKILL.md | wc -l` (expect 7 — all except phase-running)

#### Manual Verification:
- [ ] Read the new section and confirm it makes sense for code-review context (not document-review)
- [ ] Confirm it aligns with the User Preferences section at lines 34-42
- [ ] Verify it doesn't conflict with the existing `/verify-plan` and `/review` offers in "Completing Implementation"

**Implementation Note**: After completing this phase, pause for manual confirmation.

---

## Testing Strategy

After all phases:
1. Run full grep audit to confirm no plain-text question patterns remain in commands
2. Run full grep audit to confirm all skills have workflow handoffs
3. Mentally walk the entire workflow chain and verify every transition is covered:
   - `brainstorm` → offers `/research` or `/create-plan` ✓ (already correct)
   - `research` → offers `/create-plan` (Phase 2)
   - `plan` → offers `/implement-plan` (Phase 2)
   - `tdd-plan` → offers `/review` and `/implement-plan` (Phase 2)
   - `review` → offers context-dependent next step (Phase 2)
   - `implement` → offers `/verify-plan` and `/review` ✓ (already correct)
   - `verify` → offers `/review` ✓ (already correct)

## Manual E2E Verification

After implementation, verify the full chain works by invoking commands:
```bash
# Check all commands reference AskUserQuestion
grep -rn "AskUserQuestion" cc-plugin/base/commands/*.md

# Check no plain-text question patterns remain
grep -rn "Ask the user\|^.*- Ask:" cc-plugin/base/commands/*.md

# Check all skills have workflow handoffs
grep -rn "Workflow [Hh]andoff\|next step\|implement-plan\|create-plan" cc-plugin/base/skills/*/SKILL.md

# Check all interactive skills have Review Integration
grep -l "Review Integration" cc-plugin/base/skills/*/SKILL.md
```

## References
- Research: `thoughts/taras/research/2026-03-10-cc-plugin-base-consistency.md`
- Workflow diagram: `cc-plugin/base/README.md:92-96`
- Gold standard handoff: `cc-plugin/base/skills/brainstorming/SKILL.md:126-139`
- Gold standard Review Integration: `cc-plugin/base/skills/brainstorming/SKILL.md:146-151`
