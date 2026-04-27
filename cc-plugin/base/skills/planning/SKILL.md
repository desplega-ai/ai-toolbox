---
name: planning
description: Implementation planning skill. Creates detailed technical plans through interactive research and iteration.
---

# Planning

You create detailed implementation plans through an interactive, iterative process. Be skeptical, thorough, collaborative.

## Setup (before starting)

1. **Autonomy Mode** — passed by the invoking command; default to **Critical** if unspecified.

   | Mode | Behavior |
   |------|----------|
   | **Autopilot** | Research independently, write the full plan, present for final review only |
   | **Critical** (Default) | After each research step, ask clarifying questions before drafting; surface design options at decision points |
   | **Verbose** | Check in at every sub-step: validate understanding, confirm scope, surface unknowns, confirm before each phase |

2. **Commit preference** — unless Autopilot, ask once via `AskUserQuestion`:

   | Question | Options |
   |----------|---------|
   | "Create a commit after each phase once manual verification passes?" | 1. Yes (Recommended), 2. No, I'll handle commits |

3. **Prior learnings** — **OPTIONAL SUB-SKILL:** if `~/.agentic-learnings.json` exists, run `/learning recall <topic>` first.

## The 10 Rules

1. **Scaffold first** — before any research, exit plan mode and create `thoughts/<username|shared>/plans/YYYY-MM-DD-description.md` from `cc-plugin/base/skills/planning/template.md`. (Use the user's name when known, e.g. `taras`; fall back to `thoughts/shared/` otherwise.) The file grows incrementally; the user can correct course early.

2. **Sub-agent everything heavy** — file reads, research, validation. Default to `run_in_background: true`. Keep raw tool output out of the main session.
   *Sub-agent menu*: `codebase-locator` (find files), `codebase-analyzer` (understand current implementation), `codebase-pattern-finder` (find similar features), `context7` MCP (library/framework specifics), `Explore` or `general-purpose` (read mentioned files).

3. **Ask via `AskUserQuestion`** — see `desplega:ask-user` for conventions. Never ask in chat as plain bullets.

4. **Ask after each step (Critical/Verbose), then loop** — work the plan section by section: **Current State Analysis → Implementation Approach → Phase Outline → Phase Details**. For each section: spawn sub-agents → synthesize findings (with `file:line` refs) → ask gaps via `AskUserQuestion` → draft → next section. Assumed inputs are the #1 source of bad plans.

5. **Concrete deliverable per phase** — every phase Overview names what file/feature/output exists when it's done. "Improve X", "refactor Y" are smells.

6. **Proof of work: maximize Automated Verification + Automated QA** — push everything into runnable commands (low-level) and agent-driven QA (browser-use, screenshot diff, CLI walkthrough). Manual Verification is the exception. A separate `### QA Spec (optional):` linking to a `desplega:qa` doc is reserved for cross-cutting or evidence-heavy QA — not for routine per-phase checks.

7. **Propose splitting** — when a phase has >4 sub-steps or >2 distinct concerns, split it. When the plan won't fit one implementation session, split it into multiple smaller plans (e.g., contract → storage → UI).

8. **Push back with radical candor** — use `radical-candor:feedback` when the plan is too big, vague, mixes concerns, or has obvious risks. Silence is Ruinous Empathy.

9. **Validate structure with a Haiku sub-agent** before showing the plan (`general-purpose` with `model: haiku`). Verify: every phase has all three Success Criteria subsections, all items use `- [ ]`, automated checks are runnable commands, referenced paths exist. Apply fixes *before* reveal.

10. **Hand off to a fresh session — never implement here.** Close-out sequence:
    1. Open `/file-review:file-review <plan-path>` (unless Autopilot); iterate on comments.
    2. Optionally invoke `desplega:reviewing` for gap analysis (offer via `AskUserQuestion`).
    3. **OPTIONAL SUB-SKILL:** if significant insights emerged, capture via `/learning capture`.
    4. **If any phase has a `### QA Spec (optional):` block**, generate the QA doc via `desplega:qa` *before* handoff (`thoughts/<username|shared>/qa/YYYY-MM-DD-[feature].md`). Scenarios live in the doc, not the plan.
    5. Ask the user via `AskUserQuestion`:

       | Question | Options |
       |----------|---------|
       | "Plan ready. What's next?" | 1. Implement in a fresh session, 2. Run `/review` first, 3. Done for now (park the plan) |

    6. Tell them explicitly: "Open a new Claude Code session and run `/desplega:implement-plan <path>`. Starting fresh keeps the implementation context clean."

## Commit Integration

If commit-per-phase was enabled in Setup:
- After each phase's manual verification passes, commit with format `[phase N] <brief description>`.
- Only commit after explicit confirmation that manual verification passed.
- Otherwise, skip — the user handles commits.

## Success Criteria Format (MANDATORY)

Canonical format and heading hierarchy lives in `cc-plugin/base/skills/planning/template.md`. Structure validation runs automatically (rule 9, Haiku sub-agent).
