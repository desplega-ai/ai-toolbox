---
name: v-planning
description: Vertical / parallel implementation planning skill. Creates DAG-structured plan directories where each step is an independent, QA-able vertical slice that sub-agents can pick up and implement in parallel. Use whenever the user wants a plan that fans out (multiple independent features), invokes /v-plan, or asks for a "parallel plan", "DAG plan", "vertical plan", or "plan that can be parallelized" — even if they don't say those exact words. Prefer the linear `planning` skill for strictly sequential work.
---

# v-planning

You are creating implementation plans as a **DAG of vertical steps**, not a linear sequence of phases. Each step is a complete, QA-able slice of value (e.g., a full feature: DB + API + UI + tests). The DAG captures *feature-level* dependencies, so independent steps can be implemented in parallel by sub-agents.

This skill is a small, focused variant of `planning`. The research/interview/iteration process is the same — only the **output shape** is different: a plan **directory** with `root.md` + one `step-<n>.md` per node.

## Working Agreement

These instructions establish a working agreement between you and the user:

1. **AskUserQuestion is your primary communication tool** — for clarifications, design decisions, preferences, approvals.
2. **Establish preferences upfront**, not at the end.
3. **Autonomy mode guides interaction level.**

### User Preferences

Before starting (unless autonomy is Autopilot), establish:

**File Review Preference** — If the `file-review` plugin is available, use **AskUserQuestion**:

| Question | Options |
|----------|---------|
| "Would you like to use file-review for inline feedback on the plan when it's ready?" | 1. Yes, open file-review when plan is ready (Recommended), 2. No, just show me the plan |

## When to Use

- User invokes `/v-plan` command
- User asks for a "parallel plan", "DAG plan", or work that can fan out
- The task naturally splits into independent vertical slices (multiple features, multiple entities, multiple subsystems)
- Another skill references `**REQUIRED SUB-SKILL:** Use desplega:v-planning`

For strictly sequential work, route to `planning` instead.

## Autonomy Mode

| Mode | Behavior |
|------|----------|
| **Autopilot** | Research independently, write the full plan dir, present for final review only |
| **Critical** (Default) | Get buy-in at major decision points (esp. step decomposition + DAG shape) |
| **Verbose** | Check in at each step, validate understanding, confirm before writing each step file |

## Process Steps

### Step 1: Context Gathering & Initial Analysis

Same as `planning`:
1. Read all mentioned files completely (no `limit`/`offset`).
2. Spawn parallel research sub-agents (`codebase-locator`, `codebase-analyzer`, `thoughts-locator`).
3. Read what they found.
4. Surface understanding + open questions via AskUserQuestion.

### Step 2: Research & Discovery

Same as `planning`. Verify any corrections via fresh research. Present findings + design options before committing.

### Step 3: DAG Decomposition

This is the key step that differs from `planning`.

1. Identify **vertical slices**. Each slice should be:
   - **QA-able on its own** — has its own success criteria, can be demoed/tested in isolation
   - **Roughly feature-sized**, not layer-sized (don't split "DB migration" and "API endpoint" into separate steps)
   - **One of ~3–8 steps total** for most plans. More than that → reconsider granularity.

2. Identify **dependencies** between slices. A depends on B if B must be merged before A can start (shared types, shared schema, shared base component).

3. Identify **integration steps** (optional). If multiple parallel slices need a non-trivial stitching step (cross-cutting e2e, shared-surface reconciliation), add an explicit `step-N` whose `depends_on` lists the parallel siblings.

4. Present the DAG outline as text + ASCII/mermaid graph, then use **AskUserQuestion** to confirm shape:

   | Question | Options |
   |----------|---------|
   | "Does this step decomposition + DAG shape look right?" | 1. Yes, proceed, 2. No, let's discuss changes |

A linear DAG (chain with no fan-out) is acceptable — produce it without complaint.

### Step 4: Write the Plan Directory

Exit plan mode and write the plan as a directory:

```
thoughts/<username|shared>/plans/YYYY-MM-DD-<description>/
├── root.md
├── step-1.md
├── step-2.md
└── step-N.md
```

**Path selection:** Use the user's name (e.g., `thoughts/taras/plans/`) if known from context. Fall back to `thoughts/shared/plans/` when unclear.

**Templates:**
- `root.md` — read and follow `cc-plugin/base/skills/v-planning/templates/root.md`
- `step-<n>.md` — read and follow `cc-plugin/base/skills/v-planning/templates/step.md`

**Critical rules:**
- Every `step-<n>.md` has frontmatter with `id`, `name`, and `depends_on: [step-X, ...]` (empty list `[]` if no deps). This is the **canonical** dependency source.
- `root.md` renders a derived view: a mermaid graph + a step-index table. Keep it consistent with the frontmatter.
- Every `step-<n>.md` includes `### Success Criteria:` with `#### Automated Verification:` and `#### Manual Verification:` subsections (same format as `planning`'s phases — see template).
- `root.md` includes a `## Global Verification` section for cross-cutting checks that only fire after the whole DAG completes.
- Steps with user-facing changes SHOULD include an optional `### QA Spec (optional):` section after Success Criteria. Internal refactors omit it.

**OPTIONAL SUB-SKILL:** When a step references a script that doesn't yet exist (e.g. `bun scripts/check-foo.ts`), it can be generated during implementation via `desplega:script-builder`. Use a checkbox like `- [ ] Run scripts/foo.ts (generate via /script-builder if missing)`.

### Step 5: Review and Iterate

1. Present the plan directory location:
   ```
   I've created the plan directory at:
   `thoughts/<username|shared>/plans/YYYY-MM-DD-<description>/`

   Files: root.md, step-1.md, ..., step-N.md
   Please review.
   ```
2. Iterate based on feedback. When edits change dependencies, update both the step's frontmatter **and** the rendered DAG/index in `root.md`.
3. Offer `/review` for a structured completeness pass.
4. Set `root.md` frontmatter `status: ready` when finalized. **Do not start implementation.**

### Step 6: Handoff

Use **AskUserQuestion**:

| Question | Options |
|----------|---------|
| "The plan is ready. What's next?" | 1. Implement in parallel (→ `/v-implement`), 2. Run `/review` first, 3. Done for now (park the plan) |

- **Implement** → suggest `/v-implement <plan-dir>`.
- **Review** → invoke `desplega:reviewing` on `root.md`.
- **Done** → set `root.md` `status` to `parked`.

## Important Guidelines

1. **Steps are vertical slices, not layers.** If you find yourself writing `step-1: DB migration` and `step-2: API endpoint` for the same feature, collapse them into one step.
2. **Frontmatter is canonical for deps.** `root.md`'s graph is derived. If they disagree, frontmatter wins.
3. **Self-contained steps.** A sub-agent handed only `step-<n>.md` (plus the plan-level context from `root.md`) should be able to implement it without reading sibling steps.
4. **No status/assignee in step frontmatter.** Execution state lives outside the file. Steps are immutable specs during implementation.
5. **Heading hierarchy is the same as `planning`** — `### Success Criteria:` (h3), `#### Automated Verification:` (h4), `#### Manual Verification:` (h4). Consistency matters for downstream tooling.

## Success Criteria Requirements

Every `step-<n>.md` MUST end with:

```markdown
### Success Criteria:

#### Automated Verification:
- [ ] [Command]: `command here`

#### Manual Verification:
- [ ] [Human testing step]

**Implementation Note**: [When to pause for confirmation, if commit-per-step requested]
```

`root.md` MUST end with:

```markdown
## Global Verification

Run after all steps complete:
- [ ] [Whole-repo automated check]: `command here`
- [ ] [Cross-cutting manual check]
```
