---
date: 2026-03-09T16:40:00Z
researcher: claude
git_commit: 53589fb
branch: main
repository: ai-toolbox
topic: "New Skills for cc-plugin/base"
tags: [cc-plugin, skills, workflow, brainstorming, reviewing, implementation]
status: complete
autonomy: verbose
last_updated: 2026-03-09
last_updated_by: claude
---

# New Skills for cc-plugin/base

## Research Question

What new skills should be added to `cc-plugin/base` to fill workflow gaps around brainstorming, reviewing, and background phase execution?

## Summary

The current desplega workflow chain is: **research → plan → implement** (with TDD variant). Four gaps have been identified through repeated usage patterns:

1. **Brainstorming** — interactive exploration before committing to research
2. **Reviewing** — structured critique of research/plan documents
3. **Plan Verification** — post-implementation audit of plan completeness
4. **Phase Runner** — background execution of individual plan phases to save context

## Current State

### Existing Skills (cc-plugin/base v1.4.2)

| Skill | Purpose | Output |
|-------|---------|--------|
| `researching` | Document codebase as-is with parallel sub-agents | `thoughts/*/research/YYYY-MM-DD-*.md` |
| `planning` | Create implementation plans interactively | `thoughts/*/plans/YYYY-MM-DD-*.md` |
| `implementing` | Execute plans phase-by-phase with verification | Plan checkbox updates |
| `tdd-planning` | Create TDD plans with RED-GREEN-COMMIT cycles | `thoughts/*/plans/YYYY-MM-DD-tdd-*.md` |

### Existing Hooks

- `validate-thoughts.py` — enforces thoughts directory structure
- `plan_checkbox_reminder.py` — reminds to update checkboxes during implementation
- `plan_checkbox_stop.py` — blocks exit if automated verification items unchecked

### Relevant compound-engineering Skills (for reference)

- `brainstorming` — "WHAT before HOW" pattern, 4 phases, one question at a time
- `document-review` — 6-step refinement without rewriting, scores against criteria
- `spec-flow-analyzer` (agent) — exhaustive gap/flow analysis for specs/plans

---

## Proposed Skills

### 1. Brainstorming (`brainstorming/`)

**Purpose**: Interactive Q&A exploration of a topic before committing to research or planning. The "thinking out loud" phase.

**Why it's needed**: Today, when Taras wants to explore an idea before formalizing it into research, there's no structured way to do it. The conversation is ad-hoc, unstructured, and easily lost. Research skill jumps straight into documentation mode.

**Workflow position**: `brainstorm → research → plan → implement`

**Key design decisions**:

- **Output**: `thoughts/*/brainstorms/YYYY-MM-DD-*.md` (new subdirectory — confirmed)
- **Interaction model**: Socratic — Claude asks questions one at a time, progressively narrowing scope
- **Phases**:
  1. **Assess** — Understand what Taras wants to explore. Is it a problem, an idea, a comparison?
  2. **Explore** — Ask targeted questions to surface assumptions, constraints, prior art
  3. **Synthesize** — Summarize findings, identify open questions
  4. **Handoff** — Offer clear next steps: research, plan, or done
- **Autonomy modes**: Probably only Verbose and Critical make sense (Autopilot defeats the purpose of brainstorming)
- **YAGNI principle**: Resist premature solutions. The goal is understanding, not implementation.

**Differences from compound-engineering's brainstorming**:
- compound-eng targets feature implementation brainstorms specifically
- Ours should be more general — could brainstorm a tool idea, an architectural approach, a workflow improvement, etc.
- compound-eng documents to `docs/brainstorms/` — we'd use `thoughts/*/brainstorms/`
- We should integrate with `file-review` for post-brainstorm review

**Command**: `/brainstorm [topic]`

---

### 2. Reviewing (`reviewing/`)

**Purpose**: Structured critique of any research document or plan for completeness, gaps, and quality.

**Why it's needed**: After `/research` or `/create-plan` produces a document, Taras often asks "is this complete? what am I missing?" — but the review is ad-hoc. A structured skill would ensure consistent, thorough reviews.

**Workflow position**: Used after `research` or `plan` (or `brainstorm`), before moving to the next step.

**Key design decisions**:

- **Input**: Path to a research doc, plan, or brainstorm
- **Output**: Appends an errata-style section at the end of the reviewed document (not inline markers, not a separate file)
- **Review dimensions** (adapted per document type):
  - **For research docs**: Completeness of findings, missing areas, unsupported claims, open questions not addressed
  - **For plans**: Missing phases, weak success criteria, unstated assumptions, missing error handling, missing rollback strategies, scope creep
  - **For brainstorms**: Unexplored angles, premature conclusions, missing constraints
- **Phases**:
  1. **Read & Classify** — Determine document type (research/plan/brainstorm), read fully
  2. **Structural Check** — Does it follow the template? Missing required sections?
  3. **Content Analysis** — Apply type-specific review criteria
  4. **Gap Identification** — What's missing? What assumptions are unstated?
  5. **Present Findings** — Summarize issues, categorize as Critical/Important/Minor
  6. **Apply or Discuss** — Auto-fix minor issues, discuss critical ones via AskUserQuestion
- **Integration with file-review**: After automated review, optionally launch `file-review` for Taras to add inline comments
- **No rewriting**: Review should identify issues, not rewrite the document

**Differences from compound-engineering's document-review**:
- compound-eng is YAGNI-focused (simplification bias) — ours should be completeness-focused
- compound-eng limits to 2 passes — we should let Taras decide when it's done
- We need type-specific criteria (research vs plan vs brainstorm)
- We should integrate with our `file-review` tool

**Command**: `/review [path]`

---

### 3. Plan Verification (`verifying/`)

**Purpose**: Post-implementation audit — cross-reference the plan against actual changes to ensure nothing was missed or left stale.

**Why it's needed**: After `/implement-plan` completes, the plan document may have stale sections, unchecked items from phases that were adapted during implementation, or sections that became irrelevant. The existing hooks only enforce checkbox completion *during* implementation — they don't do a holistic post-mortem.

**Workflow position**: Used after `implement`, before closing the feature/PR.

**Key design decisions**:

- **Input**: Path to a plan (or auto-detect active plan)
- **Output**: Verification report + plan updates
- **Checks**:
  1. **Checkbox audit** — Are all automated verification items actually checked? Were any skipped with justification?
  2. **Git diff correlation** — Do the files changed match what the plan said would be changed? Any unexpected files?
  3. **Scope verification** — "What We're NOT Doing" section — did any of those things creep in?
  4. **Success criteria validation** — Re-run automated verification commands to confirm they still pass
  5. **Testing criteria validation** — Verify tests pass and coverage meets plan expectations
  6. **Plan freshness** — Are phase descriptions still accurate, or were they adapted during implementation without updating the plan?
  7. **Status update** — Mark plan as `status: completed` if all checks pass
- **Mental model**: Think of this as a **PR reviewer for the plan** — it reviews the plan document against what was actually delivered
- **Autonomy modes**: All three make sense
  - Autopilot: Run all checks, update plan, report summary
  - Critical: Ask about discrepancies
  - Verbose: Walk through each check

**This is unique to desplega** — compound-engineering doesn't have an equivalent. Their code-simplicity-reviewer is post-implementation but focuses on code quality, not plan adherence.

**Command**: `/verify-plan [path]`

---

### 4. Phase Runner (`phase-running/`)

**Purpose**: Execute a single plan phase as a background sub-agent to save main session context.

**Why it's needed**: The current `/implement-plan` runs everything in the main session context. For large plans, this consumes enormous amounts of context window. Running individual phases in the background would:
- Keep the main session lean for oversight and decisions
- Allow parallel phase execution (when phases are independent)
- Provide better isolation — a phase failure doesn't pollute the main context

**Workflow position**: Called by `implementing` skill or directly by user. Replaces the "execute phase" loop in the current implementing skill.

**Key design decisions**:

- **Execution model**: Spawns a background `Agent` (or `Task`) with:
  - The full plan context (or just the relevant phase + dependencies)
  - The phase number to execute
  - The autonomy mode
  - Access to all tools needed for implementation
- **Atomic execution**: Phase agents are atomic — they run to completion or stop in a blocked state. No interactive questions from sub-agents.
- **Communication**:
  - Phase agent reports completion or blocked state back to main session
  - Main session handles cross-phase coordination and human checkpoints
  - Phase agent updates plan checkboxes for its phase
- **Context efficiency**:
  - Main session only needs: plan overview + phase status summary
  - Phase agent gets: full phase details + relevant code context
  - Estimated context savings: 60-80% for multi-phase plans
- **Remaining design questions**:
  - How do we handle phases that depend on previous phase output?
  - Should the phase agent commit after completion, or wait for main session approval?
  - How does this interact with the existing implementing hooks?
- **Integration with existing implementing skill**:
  - Option A: Phase runner is a separate skill, implementing skill orchestrates it
  - Option B: Phase runner replaces the inner loop of implementing skill
  - **Recommendation**: Option A — implementing skill becomes an orchestrator that dispatches phases to phase-runner. This is backwards-compatible.

**This is novel** — neither compound-engineering nor any other plugin does background phase execution. It's a significant architectural addition.

**Command**: `/run-phase [plan-path] [phase-number]` (or invoked internally by implementing skill)

---

## Proposed Workflow (Complete)

```
brainstorm → research → plan → review → implement (with phase-runner) → verify-plan
     ↑                    ↑        ↑                                         |
     |                    |        |                                         |
     └── review ──────────┘        └── review ──────────────────────────────-┘
```

The `review` skill is usable at any stage. `verify-plan` is the final gate.

## Priority & Complexity Assessment

| Skill | Priority | Complexity | Reason |
|-------|----------|------------|--------|
| **Reviewing** | High | Low-Medium | Most frequently needed, straightforward to implement, high ROI |
| **Brainstorming** | High | Low | Simple interaction model, big workflow improvement |
| **Plan Verification** | Medium | Medium | Valuable but less frequent, needs git integration |
| **Phase Runner** | Medium-High | High | Biggest architectural change, most open questions, highest context savings |

## Recommended Implementation Order

1. **Reviewing** — immediate value, simple, no new infrastructure
2. **Brainstorming** — immediate value, simple, new `brainstorms/` directory needed
3. **Plan Verification** — moderate value, needs some new tooling (git diff correlation)
4. **Phase Runner** — highest value long-term but needs design iteration

## Resolved Questions

1. **Brainstorms directory** — New `brainstorms/` subdirectory in thoughts (confirmed).
2. **Review output format** — Reviewing skill should append an errata-style section at the end of the document (not inline, not separate file).
3. **Phase runner interaction** — Phase agents are atomic. They run to completion or stop in a blocked state. No interactive AskUserQuestion from sub-agents.
4. **validate-thoughts.py** — Yes, update to allow the new `brainstorms/` subdirectory.
5. **Plan verification scope** — Acts as a “PR reviewer for the plan”: verifies both plan file checkboxes against actual changes AND re-runs success/testing criteria. Full plan-vs-reality audit.

## References

- Existing skills: `cc-plugin/base/skills/` (researching, planning, implementing, tdd-planning)
- compound-engineering brainstorming: `~/.claude/plugins/cache/every-marketplace/compound-engineering/2.35.2/skills/brainstorming/SKILL.md`
- compound-engineering document-review: `~/.claude/plugins/cache/every-marketplace/compound-engineering/2.35.2/skills/document-review/SKILL.md`
- compound-engineering spec-flow-analyzer: `~/.claude/plugins/cache/every-marketplace/compound-engineering/2.35.2/agents/workflow/spec-flow-analyzer.md`
