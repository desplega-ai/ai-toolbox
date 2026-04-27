---
date: 2026-04-27
author: Taras
topic: "v-planning DAG structure"
tags: [brainstorm, planning, dag, parallel-execution, cc-plugin]
status: in-progress
exploration_type: idea
last_updated: 2026-04-27
last_updated_by: Claude
---

# v-planning DAG structure — Brainstorm

## Context

Designing a new planning skill `v-planning` (slash command `/v-plan`) as a small, clean variant of `cc-plugin/base/skills/planning/`. Where the existing `planning` skill produces a linear sequence of `Phase 1, Phase 2, ...` in a single markdown file, `v-planning` should produce a **DAG of vertical steps** so independent work can be parallelized by implementers.

**Output structure (proposed):**

```
thoughts/<user>/plans/<plan-name>/
├── root.md            # Overview + DAG graph + dependency map
├── step-1.md          # One node per file
├── step-2.md
└── step-N.md
```

Each `step-<n>.md` is self-contained enough that a worker (sub-agent or human) can pick it up and work on it without reading the others, provided its dependencies are done.

**Constraints:**
- Small, clean variant — not a rewrite. Reuse as much of the existing `planning` skill's structure (Success Criteria, Manual/Automated Verification, QA spec) as possible.
- Probably needs a separate implement skill (`v-implementing`) that knows how to fan out independent steps.
- Existing reference: `cc-plugin/base/skills/planning/{SKILL.md, template.md}`, `cc-plugin/base/skills/implementing/`, `cc-plugin/base/skills/phase-running/`.

**Structural questions to resolve before drafting:**
1. Node granularity — what is "a step"?
2. How are dependencies expressed (root.md list, step frontmatter, both)?
3. What lives in `root.md` vs `step-<n>.md`?
4. Are merge/integration nodes explicit in the DAG?
5. Where do Success Criteria attach — per step, at merge points, both?
6. How does the implementer fan out parallel work — read root + find ready steps, or some other mechanism?
7. Should `/v-plan` refuse degenerate-linear plans (route back to `/create-plan`)?

## Exploration

### Q1: What is a "step" (DAG node) — the unit of parallel work?

**Answer:** Vertical slice (full stack). Each step is a complete shippable unit — e.g. "add Foo entity" = DB migration + API + UI + tests in one step file. DAG branches when truly independent features can ship in parallel. ~3-8 steps per plan.

User note: *"essentially something that is qa'able on it's own"*

**Insights:**
- A step is a feature-level unit of value, not a technical-layer unit. This is a strong anchor — it tells us the DAG captures **feature dependencies**, not technical-layer dependencies.
- Because every step is QA-able on its own, every step gets its own Success Criteria + (optional) QA Spec — the existing `planning` skill's per-phase structure transfers cleanly to per-step.
- The skill should refuse / discourage fine-grained "concern slices" — those belong inside a step, not as separate steps.
- This also implies **steps can be reviewed/merged independently** (commit-per-step, PR-per-step optional).

### Q2: How are step dependencies expressed?

**Answer:** Both — frontmatter on each step is canonical, root.md renders a derived graph (mermaid + dep list).

**Insights:**
- Frontmatter is the machine-readable source of truth: `depends_on: [step-1, step-2]`. v-implementing reads this to find ready work.
- root.md is for humans — visual mermaid graph + plain-text dep list. Should be regeneratable from frontmatter (a small validation script could check they agree).
- Step files stay self-contained (deps in their own header), so a worker handed `step-3.md` can read it without root.md.

### Q3: Are merge/integration steps explicit DAG nodes?

**Answer:** Yes, explicit when needed. Optional, not mandatory — planner adds an explicit `step-N` for non-trivial integration; otherwise DAG just terminates.

**Insights:**
- Template needs to show both shapes: terminating leaves (no integration node) and a convergent integration step.
- Integration step looks identical to a normal step file structurally — just has multiple `depends_on` and its work is "stitch + e2e", which is fine. No special node type needed.
- This keeps the model uniform: every node is `step-<n>.md` with the same anatomy.

### Q4: Where do Success Criteria live?

**Answer:** Per-step + global in root. Each step has its own Automated + Manual Verification (mirrors the phase structure today). root.md gets a `## Global Verification` section for cross-cutting checks that only fire after the DAG is done.

**Insights:**
- Step success criteria = local validation, run by the worker on that step.
- Global verification = cross-cutting checks (whole-repo typecheck, e2e suite, full lint) — run after all leaves complete.
- This pairs naturally with explicit integration steps: integration step's Success Criteria can *be* the Global Verification, or Global Verification can be a separate post-DAG checklist. Clarify in template.

### Q5: Implementer — new skill or flag on existing?

**Answer:** New `v-implementing` skill + `/v-implement` command. Mirror the `/create-plan` ↔ `/implement-plan` pattern with `/v-plan` ↔ `/v-implement`.

**Insights:**
- Clean separation. `v-implementing` can evolve DAG semantics independently without weighing down the linear `implementing` skill.
- Symmetric naming makes the workflow discoverable.
- Both `v-` skills can lean on `phase-running` (or a `step-running` sibling) for the actual sub-agent fan-out — only the orchestration layer differs.

### Q6: Who executes a step file?

**Answer:** Sub-agents only (auto fan-out). Step files are plain markdown that humans *could* read, but the canonical execution path is `v-implementing` spawning Task sub-agents in parallel.

**Insights:**
- No `status` / `assignee` frontmatter fields. Execution state lives outside the file (TodoWrite, or v-implementing's own scratchpad).
- Step files are essentially **immutable specs** during execution — only edited if the plan itself changes.
- This simplifies the template significantly: step file = self-contained spec, that's it.

### Q7: Degenerate-linear plans?

**Answer:** Accept silently. A linear DAG is still a valid DAG; users decide.

**Insights:**
- No special-case branching logic in the skill. One code path.
- Slight risk: users use `/v-plan` for things that should be `/create-plan`. Acceptable cost for keeping the skill small.

## Synthesis

### Key Decisions

1. **Step = vertical slice.** A QA-able, shippable unit of value (~3-8 per plan). Not a technical-layer slice.
2. **Output layout:** `thoughts/<user>/plans/<YYYY-MM-DD-name>/` directory containing `root.md` + `step-1.md`...`step-N.md`.
3. **Dependencies:** canonical in step frontmatter (`depends_on: [step-1, step-2]`); rendered in `root.md` as a mermaid graph + plain-text dep list.
4. **Integration nodes:** explicit step when needed (multiple `depends_on`), implicit (DAG terminates) when not. No special node type — just another `step-<n>.md`.
5. **Success Criteria:** per-step (Automated + Manual) like the existing `planning` skill; global cross-cutting checks live in `root.md` under `## Global Verification`.
6. **Implementer:** new sibling skill `v-implementing` + command `/v-implement`. Mirrors `/create-plan` ↔ `/implement-plan`.
7. **Worker model:** sub-agents only (auto fan-out). No `status`/`assignee` in step files — execution state lives outside.
8. **Degenerate-linear plans:** accepted silently. One code path.

### Open Questions

- Should `v-implementing` reuse `phase-running` directly, or introduce a `step-running` sibling? (Defer — settle while drafting `v-implementing`. Likely just rename/parametrize phase-running.)
- Commit-per-step UX: each sub-agent commits its own step before terminating, parent merges? Defer to `v-implementing` design.
- Validation: should there be a small script that checks `root.md` graph matches step frontmatter, and that the DAG has no cycles? Nice-to-have, not blocking v1.

### Constraints Identified

- **Small and clean.** Skill file should stay close to existing `planning` skill in length and style — reuse phrasing where it fits.
- **Reuse Success Criteria + QA Spec structure verbatim** from `planning/template.md` for step files. Don't reinvent.
- **Plan must be a directory, not a file.** The existing `planning` skill writes a single `.md`; `v-planning` writes a dir. The implementing-side handoff has to know the difference.

### Core Requirements

**`v-planning` skill (`/v-plan`):**
- Same Process Steps as `planning` (context gathering → research → structure → write → review → handoff), differing only at the *write* step.
- Writes a plan **directory** at `thoughts/<user>/plans/<YYYY-MM-DD-name>/` with `root.md` + `step-<n>.md` files.
- `root.md`: Overview, Current State, Desired End State, What We're NOT Doing, Implementation Approach, **DAG diagram (mermaid)**, **Step index**, **Global Verification**.
- `step-<n>.md`: frontmatter (`id`, `name`, `depends_on`), Overview, Changes Required, **Success Criteria** (Automated + Manual), optional **QA Spec** — same anatomy as a current Phase.
- Hands off to `/v-implement` (instead of `/implement-plan`) when the user is ready.

**`v-implementing` skill (`/v-implement`):**
- Reads `root.md` + step frontmatter.
- Topological scheduler: at each tick, find steps where all `depends_on` are `done`, fan out as parallel sub-agents (one per ready step).
- Each sub-agent receives only its `step-<n>.md` + plan-level context from `root.md` (Current State, Desired End State).
- After all DAG nodes complete, run Global Verification from `root.md`.
- Mirrors the existing `implementing` skill's user-prefs (commit-per-step, file-review) where they apply.

## Next Steps

→ Plan directly (skip /research) — design is concrete enough to draft. Move to writing:

1. `cc-plugin/base/skills/v-planning/SKILL.md` + `v-planning/templates/{root.md, step.md}`
2. `cc-plugin/base/skills/v-implementing/SKILL.md`
3. `cc-plugin/base/commands/v-plan.md` + `cc-plugin/base/commands/v-implement.md`
4. Bump `cc-plugin/base/.claude-plugin/plugin.json` minor version
5. Add to base CLAUDE.md skill listing if applicable
