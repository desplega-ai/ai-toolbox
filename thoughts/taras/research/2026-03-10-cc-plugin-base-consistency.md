---
date: 2026-03-10T12:00:00-05:00
researcher: Claude
git_commit: a340c85
branch: main
repository: ai-toolbox
topic: "cc-plugin/base consistency audit: file-review, AskUserQuestion, and workflow next-steps"
tags: [research, codebase, cc-plugin, base, consistency, file-review, AskUserQuestion, workflow]
status: complete
autonomy: autopilot
last_updated: 2026-03-11
last_updated_by: Claude (review)
---

# Research: cc-plugin/base Plugin Consistency Audit

**Date**: 2026-03-10
**Researcher**: Claude
**Git Commit**: a340c85
**Branch**: main

## Research Question

Audit the consistency of the `cc-plugin/base/` plugin across three dimensions:
1. Whether skills/agents consistently use `file-review` for document review
2. Whether skills/agents consistently use `AskUserQuestion` for ALL questions to users
3. Whether skills consistently follow-up with next steps based on the workflow flow diagram, proposing the next command

## Summary

The base plugin has **strong consistency in skills** but **significant gaps in commands** and **uneven workflow handoff coverage**. All 7 interactive skills share a common "Working Agreement" pattern for `AskUserQuestion` and a standardized `file-review` integration section. However, 4 commands bypass `AskUserQuestion` entirely, using plain-text questions instead. For workflow next-steps, only 3 of 7 interactive skills fully propose the correct next command in the chain; 2 are partial (offer `/review` but miss the primary successor), and 2 have no next-step guidance at all.

## Detailed Findings

### 1. File-Review Usage

**Pattern**: 7/8 skills implement a consistent three-part file-review pattern:
1. **User Preferences section** — check if `file-review:file-review` is available, ask via `AskUserQuestion`
2. **Store preference** for later use
3. **Review Integration section** — invoke `/file-review:file-review <path>` after artifact creation if opted in; skip if "No" or Autopilot

| Skill | Has file-review? | Pattern variant |
|-------|-----------------|-----------------|
| `brainstorming` | Yes | Standard (brainstorm doc) |
| `implementing` | Yes | Variant: for **code changes**, no dedicated Review Integration section |
| `phase-running` | No | Correct — non-interactive sub-agent |
| `planning` | Yes | Standard (plan doc) |
| `researching` | Yes | Standard (research doc) |
| `reviewing` | Yes | Standard (after automated review) |
| `tdd-planning` | Yes | Standard (TDD plan doc) |
| `verifying` | Yes | Standard (verification report) |

**Commands**: None mention file-review directly. This is correct since commands are thin wrappers that delegate to skills.

**Gap**: `implementing/SKILL.md` stores the preference (line 42) but lacks the dedicated "Review Integration" section that all other skills have. It's unclear when/how the preference is actually applied during implementation.

### 2. AskUserQuestion Usage

**Skills**: All 7 interactive skills share an identical "Working Agreement" boilerplate that establishes `AskUserQuestion` as the primary communication tool and explicitly prohibits plain-text questions. `phase-running` correctly prohibits it (non-interactive sub-agent). **Skills are fully consistent.**

**Commands with gaps**:

| Command | Issue | Details |
|---------|-------|---------|
| `bu-auto-instrument.md` | **Major** | 6+ locations saying "ask the user" in plain text. Never mentions `AskUserQuestion` at all. Lines 83-89, 137-139, 183-185, 211-213, 320-326. |
| `commit.md` | **Minor** | Line 23: `Ask: "I plan to create [N] commit(s)..."` — plain text pattern |
| `continue-handoff.md` | **Minor** | Line 14: `"Ask the user which one to continue from"` — plain text pattern |
| `verify-plan.md` | **Minor** | Line 25: `"ask which one to verify"` — bare "ask" without specifying AskUserQuestion |

**Consistent commands**: `brainstorm.md`, `create-plan.md`, `create-tdd-plan.md`, `research.md` all correctly reference `AskUserQuestion`.

**Agents**: All 5 agents correctly avoid `AskUserQuestion` — they run as background sub-agents.

### 3. Workflow Next-Steps / Follow-Up

**Intended workflow** (from `README.md:92-96`):
```
brainstorm → research → plan → review → implement (with phase-runner) → verify-plan
                                  ↑                                          |
                                  └──────────── review ←─────────────────────┘
```

| Skill | Offers next step? | Commands proposed | Missing |
|-------|-------------------|-------------------|---------|
| `brainstorming` | **Full** | `/review`, `/research`, `/create-plan` | — |
| `implementing` | **Full** | `/verify-plan`, `/review` | — |
| `verifying` | **Full** | `/review` | — |
| `planning` | **Partial** | `/review` only | `/implement-plan` after finalization |
| `researching` | **Partial** | `/review` only | `/create-plan` after completion |
| `reviewing` | **None** | — | Context-dependent next step (e.g., `/create-plan` after reviewing research, `/implement-plan` after reviewing plan) |
| `tdd-planning` | **None** | — | Both `/review` and `/implement-plan` |
| `phase-running` | N/A | N/A (sub-agent) | — |

**Key observation**: No skill references the workflow diagram from the README. The diagram exists only in `README.md:92-96` and is not embedded or referenced in any skill.

## Code References

| File | Line(s) | Description |
|------|---------|-------------|
| `cc-plugin/base/README.md` | 92-96 | Workflow flow diagram |
| `cc-plugin/base/skills/brainstorming/SKILL.md` | 24-31, 126-139, 147-151 | File-review prefs, handoff with next steps, review integration |
| `cc-plugin/base/skills/implementing/SKILL.md` | 34-42, 213-218 | File-review prefs (variant), completion with `/verify-plan` |
| `cc-plugin/base/skills/planning/SKILL.md` | 32-40, 182-186, 188-192 | File-review prefs, review offer (no `/implement-plan`), review integration |
| `cc-plugin/base/skills/researching/SKILL.md` | 24-31, 128-131, 139-143 | File-review prefs, review offer (no `/create-plan`), review integration |
| `cc-plugin/base/skills/reviewing/SKILL.md` | 30-38, 134-141, 175-179 | File-review prefs, findings presentation (no next steps), review integration |
| `cc-plugin/base/skills/tdd-planning/SKILL.md` | 46-53, 165-175, 179-181 | File-review prefs, finalization (no `/review` or `/implement-plan`), review integration |
| `cc-plugin/base/skills/verifying/SKILL.md` | 24-31, 142, 145-149 | File-review prefs, `/review` offer, review integration |
| `cc-plugin/base/commands/bu-auto-instrument.md` | 83-89, 137-139 | Plain-text questions (no AskUserQuestion) |
| `cc-plugin/base/commands/commit.md` | 23 | Plain-text "Ask:" pattern |
| `cc-plugin/base/commands/continue-handoff.md` | 14 | Plain-text "Ask the user" |
| `cc-plugin/base/commands/verify-plan.md` | 25 | Bare "ask" without AskUserQuestion |

## Architecture Documentation

### Consistent Patterns Found

1. **Working Agreement boilerplate** — All 7 interactive skills share identical text establishing `AskUserQuestion` as primary, prohibiting plain-text questions, and defining autonomy modes.
2. **File-review three-part pattern** — User Preferences → Store → Review Integration section at bottom of skill.
3. **Command = thin wrapper** — All commands parse arguments, determine autonomy mode, and delegate entirely to their skill. No business logic in commands.
4. **Agent isolation** — All 5 agents are non-interactive sub-agents that return results without user interaction.

### Inconsistent Patterns Found

1. **Commands bypass AskUserQuestion** — 4 of 11 commands use plain-text question patterns instead of the tool.
2. **Workflow handoff is uneven** — Only 3/7 interactive skills fully propose the correct workflow successor.
3. **`reviewing` skill is context-blind** — As a cross-cutting utility used at multiple stages, it doesn't know which workflow step comes next. It could inspect the document type (research/plan/brainstorm) to suggest the appropriate next command.
4. **`tdd-planning` diverges from `planning`** — Regular planning offers `/review`; TDD planning does not. They should be symmetric.
5. **`implementing` file-review variant** — Lacks the dedicated Review Integration section other skills have.

## Historical Context (from thoughts/)

No prior research on this specific topic was found in the thoughts/ directory.

## Related Research

None found.

## Open Questions

- Should `reviewing` inspect the document type to suggest context-appropriate next steps?
- Should the workflow diagram from `README.md` be embedded/referenced in each skill to ensure alignment?
- Is `bu-auto-instrument.md` intentionally different (perhaps added before the AskUserQuestion convention was established)?
- Should `implementing/SKILL.md` get a proper Review Integration section like the others?

## Review Errata

_Reviewed: 2026-03-11 by Claude (review skill, autopilot mode)_

### Critical

- [ ] **Hooks entirely omitted from audit scope.** The base plugin has 4 hook files (`plan_checkbox_reminder.py`, `plan_checkbox_stop.py`, `plan_utils.py`, `validate-thoughts.py`) registered in `plugin.json`. These are active runtime components that enforce consistency (e.g., checkbox tracking, thoughts-directory validation) but were not audited for any of the three dimensions. While hooks don't use `AskUserQuestion` or `file-review` directly, they represent a fourth consistency dimension (enforcement patterns) that should be documented.
- [ ] **`bu-auto-instrument.md` breaks the "commands are thin wrappers" claim.** The research states (line 119) that "All commands parse arguments, determine autonomy mode, and delegate entirely to their skill. No business logic in commands." However, `bu-auto-instrument.md` has NO corresponding skill -- it is the only command that contains business logic directly. This contradicts the architectural claim and should be called out as either an intentional exception or a consistency gap.

### Important

- [ ] **`commit.md` line reference off by one.** Research says line 23 for the `Ask:` pattern; the actual match is at line 22. Minor but could mislead someone spot-checking.
- [ ] **`continue-handoff.md` line reference off by one.** Research says line 14 for the `"Ask the user"` pattern; the actual match is at line 15. Same issue as above.
- [ ] **Template files not audited.** Four template files exist (`brainstorming/template.md`, `planning/template.md`, `researching/template.md`, `tdd-planning/template.md`). While templates are structural rather than behavioral, they could contain inconsistencies in their section structure, frontmatter requirements, or "Next Steps" sections that feed into the workflow handoff dimension.
- [ ] **`plugin.json` not mentioned.** The plugin configuration file defines which hooks are active and on which tool matchers. It is relevant context for understanding the enforcement layer of the plugin.

### Resolved

- [x] `tdd-planning` workflow table entry is correct but could be clearer — the file-review table (line 50) correctly shows it has a Review Integration section, while the workflow table (line 91) correctly shows it lacks next-step *command proposals*. These are distinct concepts (file-review integration vs. workflow handoff) but the juxtaposition could confuse readers. No factual error found.
- [x] All other file-review and AskUserQuestion findings verified accurate against the actual file contents.
- [x] Workflow next-step claims verified: `brainstorming` offers `/review`, `/research`, `/create-plan`; `implementing` offers `/verify-plan` and `/review`; `verifying` offers `/review`; `planning` offers only `/review`; `researching` offers only `/review`; `reviewing` and `tdd-planning` offer none. All confirmed.
