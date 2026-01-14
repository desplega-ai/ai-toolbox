# Skill Wrapper Refactoring Implementation Plan

## Overview

Refactor the three main commands (`research`, `create-plan`, `implement-plan`) into extensible skill wrappers following the superpowers pattern. Each command becomes a thin wrapper that invokes a corresponding skill (`researching`, `planning`, `implementing`) with added autonomy controls and optional file-review integration.

## Current State Analysis

### What Exists Now
- **Commands** (`cc-plugin/base/commands/`):
  - `research.md` (213 lines) - all logic inline
  - `create-plan.md` (433 lines) - all logic inline
  - `implement-plan.md` (90 lines) - all logic inline
- **Skills directory** (`cc-plugin/base/skills/`) - empty, only contains `.gitkeep`

### Reference Implementations
- `cc-plugin/file-review/commands/process-comments.md:22-27` - thin wrapper pattern
- `cc-plugin/wts/commands/wts.md:11-22` - command invoking skill
- `cc-plugin/file-review/skills/process-review/SKILL.md` - skill with "When to Use" section
- `cc-plugin/wts/skills/wts-expert/SKILL.md` - expert skill pattern

### Key Constraints
- Skills use `skills/<name>/SKILL.md` directory convention
- Skill frontmatter: `name`, `description`
- Commands can restrict tools via `allowed-tools` frontmatter
- Autonomy supports flag and frontmatter detection

## Desired End State

After this plan is complete:

1. Three new skills exist in `cc-plugin/base/skills/`:
   - `researching/SKILL.md`
   - `planning/SKILL.md`
   - `implementing/SKILL.md`

2. Three commands are refactored to thin wrappers:
   - `research.md` → invokes `desplega:researching` skill
   - `create-plan.md` → invokes `desplega:planning` skill
   - `implement-plan.md` → invokes `desplega:implementing` skill

3. Each skill supports autonomy mode:
   - Autopilot: Work independently, only present final results
   - Critical (default): Ask only when blocked or for major decisions
   - Verbose: Check in frequently at each step

4. Researching and planning skills offer file-review integration when available

### Verification
- `/desplega:research <query>` works as before but with autonomy prompt
- `/desplega:create-plan <file>` works as before but with autonomy prompt
- `/desplega:implement-plan <plan>` works as before but with autonomy prompt
- Skills can be referenced via `**REQUIRED SUB-SKILL:** Use desplega:researching`

### Key Discoveries:
- Thin wrapper pattern: `cc-plugin/file-review/commands/process-comments.md:22-23`
- Skill invocation syntax: "Invoke the `plugin:skill-name` skill"
- Skill frontmatter only needs `name` and `description`
- Trigger conditions go in "When to Use" section

## What We're NOT Doing

- Auto-triggering skills based on context (commands always invoke skills explicitly)
- Feature flags for file-review detection (use skill presence check)
- Changes to the `agents/` directory structure
- Changes to other plugins (file-review, wts, swarm)
- Adding new tools or MCP integrations
- Modifying continue-handoff or other commands

## Implementation Approach

For each skill/command pair:
1. Create the skill directory and SKILL.md with extracted logic
2. Add autonomy mode handling section to skill
3. Add file-review integration hint (for researching/planning only)
4. Refactor command to thin wrapper
5. Add autonomy parameter parsing to command
6. Test the refactored command

---

## Phase 1: Researching Skill

### Overview
Create the `researching` skill and refactor `research.md` command to a thin wrapper.

### Changes Required:

#### 1. Create Researching Skill Directory
**Directory**: `cc-plugin/base/skills/researching/`
**Action**: Create directory

#### 2. Create SKILL.md
**File**: `cc-plugin/base/skills/researching/SKILL.md`
**Action**: Create new file with content extracted from `research.md`

```markdown
---
name: researching
description: Comprehensive codebase research skill. Documents codebase as-is by spawning parallel sub-agents and synthesizing findings into research documents.
---

# Researching

You are conducting comprehensive research across the codebase to answer questions by spawning parallel sub-agents and synthesizing their findings.

## When to Use

This skill activates when:
- User invokes `/research` command
- Another skill references `**REQUIRED SUB-SKILL:** Use desplega:researching`
- User asks to document or understand a codebase area

## Autonomy Mode

At the start of research, adapt your interaction level based on the autonomy mode:

| Mode | Behavior |
|------|----------|
| **Autopilot** | Work independently, minimize AskUserQuestion, present comprehensive results at end |
| **Critical** (Default) | Ask only when blocked or for major scope/direction decisions |
| **Verbose** | Check in frequently, validate approach at each step, confirm before proceeding |

The autonomy mode is passed by the invoking command. If not specified, default to **Critical**.

## Critical Constraints

- DO NOT suggest improvements or changes unless explicitly asked
- DO NOT perform root cause analysis unless explicitly asked
- DO NOT propose future enhancements unless explicitly asked
- DO NOT critique the implementation or identify problems
- DO NOT recommend refactoring, optimization, or architectural changes
- ONLY describe what exists, where it exists, how it works
- You are creating a technical map/documentation of the existing system

## Research Process

### Before Starting

Perform a quick analysis of the research query. If anything is unclear and autonomy mode is not Autopilot, ask for clarification:

```
Thank you for your research question: "[user's question]". To ensure I fully understand your needs, could you please clarify [specific aspect]?
```

### Steps

1. **Read any directly mentioned files first:**
   - If the user mentions specific files, read them FULLY first
   - **IMPORTANT**: Use the Read tool WITHOUT limit/offset parameters
   - **CRITICAL**: Read files yourself before spawning sub-tasks

2. **Analyze and decompose the research question:**
   - Break down the query into composable research areas
   - Identify specific components, patterns, or concepts to investigate
   - Create a research plan using TodoWrite to track subtasks
   - Consider which directories, files, or architectural patterns are relevant

3. **Spawn parallel sub-agent tasks for comprehensive research:**
   - Create multiple Task agents to research different aspects concurrently:

   **For codebase research:**
   - Use **codebase-locator** agent to find WHERE files and components live
   - Use **codebase-analyzer** agent to understand HOW specific code works
   - Use **codebase-pattern-finder** agent to find examples of existing patterns

   **For library and framework research:**
   - Use the context7 MCP to fetch library/framework documentation

   **For web research (only if explicitly requested):**
   - Use **web-search-researcher** agent for external documentation

   **For nested researches:**
   - Spawn additional Tasks using `/research <topic>` for deep dives

4. **Wait for all sub-agents to complete and synthesize findings:**
   - IMPORTANT: Wait for ALL sub-agent tasks to complete before proceeding
   - Compile all results, prioritize live codebase findings as primary source
   - Connect findings across different components
   - Include specific file paths and line numbers

5. **Generate research document:**
   - If in plan mode, exit plan mode first
   - Structure document with YAML frontmatter followed by content:

   ```markdown
   ---
   date: [Current date and time with timezone in ISO format]
   researcher: [Researcher name]
   git_commit: [Current commit hash]
   branch: [Current branch name]
   repository: [Repository name]
   topic: "[User's Question/Topic]"
   tags: [research, codebase, relevant-component-names]
   status: complete
   autonomy: [autopilot|critical|verbose]
   last_updated: [Current date in YYYY-MM-DD format]
   last_updated_by: [Researcher name]
   ---

   # Research: [User's Question/Topic]

   **Date**: [Current date and time]
   **Researcher**: [Researcher name]
   **Git Commit**: [Current commit hash]
   **Branch**: [Current branch name]

   ## Research Question
   [Original user query]

   ## Summary
   [High-level documentation answering the user's question]

   ## Detailed Findings

   ### [Component/Area 1]
   - Description of what exists ([file.ext:line](link))
   - How it connects to other components
   - Current implementation details

   ## Code References
   - `path/to/file.py:123` - Description

   ## Architecture Documentation
   [Current patterns, conventions found]

   ## Historical Context (from thoughts/)
   [Relevant insights from thoughts/ directory]

   ## Related Research
   [Links to other research documents]

   ## Open Questions
   [Any areas needing further investigation]
   ```

6. **Add GitHub permalinks (if applicable):**
   - Check if on main branch or commit is pushed
   - Generate GitHub permalinks for code references

7. **Sync and present findings:**
   - Present concise summary with key file references
   - If autonomy mode is not Autopilot, ask if they have follow-up questions

8. **Handle follow-up questions:**
   - Append to the same research document
   - Update frontmatter `last_updated` fields
   - Spawn new sub-agents as needed

## Review Integration (Optional)

If the `file-review` plugin is available and autonomy mode is not Autopilot:
- After creating research documents, offer: "Would you like to review this in file-review for inline comments?"
- If yes, invoke `/file-review:file-review <path>`
- Process feedback with `file-review:process-review` skill

## Important Notes

- Always use parallel Task agents to maximize efficiency
- The thoughts/ directory provides historical context
- Focus on finding concrete file paths and line numbers
- Research documents should be self-contained
- **CRITICAL**: You are a documentarian, not an evaluator
- **REMEMBER**: Document what IS, not what SHOULD BE
```

#### 3. Refactor research.md Command
**File**: `cc-plugin/base/commands/research.md`
**Action**: Replace with thin wrapper

```markdown
---
description: Document codebase as-is with thoughts directory for historical context
model: opus
argument-hint: [--autonomy=MODE] [query]
allowed-tools: Read, Grep, Glob
---

# Research Codebase

A thin wrapper that invokes the `desplega:researching` skill with autonomy controls.

## When Invoked

1. **Parse autonomy mode from arguments:**
   - Check for `--autonomy=autopilot|critical|verbose` flag
   - If document frontmatter has `autonomy:` field, use that as default
   - Otherwise, ask the user via AskUserQuestion:

   ```
   How much should I check in with you during this research?
   - Autopilot: Work independently, only present final results
   - Critical questions (Recommended): Ask only when blocked or for major decisions
   - Verbose: Check in frequently, validate approach at each step
   ```

2. **Invoke the `desplega:researching` skill:**
   - Pass the research query (everything after the flag)
   - Pass the autonomy mode determined above
   - Let the skill handle all research logic

3. **If no query provided:**
   - Respond with: "I'm ready to research the codebase. Please provide your research question or area of interest."

## Example Usage

```
/research how does the authentication system work
/research --autonomy=autopilot document all API endpoints
/research --autonomy=verbose analyze the database schema
```
```

### Success Criteria:

#### Automated Verification:
- [x] Directory exists: `ls cc-plugin/base/skills/researching/`
- [x] SKILL.md exists: `cat cc-plugin/base/skills/researching/SKILL.md | head -5`
- [x] Command refactored: `wc -l cc-plugin/base/commands/research.md` should be ~50 lines (actual: 40 lines)
- [x] No syntax errors in markdown files

#### Manual Verification:
- [ ] `/desplega:research <query>` prompts for autonomy mode
- [ ] `/desplega:research --autonomy=autopilot <query>` skips autonomy prompt
- [ ] Research produces valid document with autonomy in frontmatter
- [ ] Autonomy mode affects interaction frequency appropriately

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation that the refactored command works correctly before proceeding to Phase 2.

---

## Phase 2: Planning Skill

### Overview
Create the `planning` skill and refactor `create-plan.md` command to a thin wrapper.

### Changes Required:

#### 1. Create Planning Skill Directory
**Directory**: `cc-plugin/base/skills/planning/`
**Action**: Create directory

#### 2. Create SKILL.md
**File**: `cc-plugin/base/skills/planning/SKILL.md`
**Action**: Create new file with content extracted from `create-plan.md`

```markdown
---
name: planning
description: Implementation planning skill. Creates detailed technical plans through interactive research and iteration.
---

# Planning

You are creating detailed implementation plans through an interactive, iterative process. Be skeptical, thorough, and collaborative.

## When to Use

This skill activates when:
- User invokes `/create-plan` command
- Another skill references `**REQUIRED SUB-SKILL:** Use desplega:planning`
- User asks to plan an implementation or create a technical spec

## Autonomy Mode

At the start of planning, adapt your interaction level based on the autonomy mode:

| Mode | Behavior |
|------|----------|
| **Autopilot** | Research independently, create complete plan, present for final review only |
| **Critical** (Default) | Get buy-in at major decision points, present design options for approval |
| **Verbose** | Check in at each step, validate understanding, confirm before each phase |

The autonomy mode is passed by the invoking command. If not specified, default to **Critical**.

## Process Steps

### Step 1: Context Gathering & Initial Analysis

1. **Read all mentioned files immediately and FULLY:**
   - Research documents, related plans, JSON/data files
   - **IMPORTANT**: Use Read tool WITHOUT limit/offset parameters
   - **CRITICAL**: Read files yourself before spawning sub-tasks

2. **Spawn initial research tasks:**
   - Use **codebase-locator** agent to find all files related to the task
   - Use **codebase-analyzer** agent to understand current implementation
   - Use **thoughts-locator** agent to find existing thoughts documents
   - Use context7 MCP for library/framework insights

3. **Read all files identified by research tasks**

4. **Analyze and verify understanding:**
   - Identify discrepancies or misunderstandings
   - Note assumptions needing verification

5. **Present understanding and questions (if not Autopilot):**
   ```
   Based on the research of the codebase, I understand we need to [summary].

   I've found that:
   - [Current implementation detail with file:line reference]
   - [Relevant pattern or constraint discovered]

   Questions that my research couldn't answer:
   - [Specific technical question]
   - [Design preference that affects implementation]
   ```

### Step 2: Research & Discovery

1. **If the user corrects any misunderstanding:**
   - Spawn new research tasks to verify
   - Read specific files/directories mentioned

2. **Create a research todo list** using TodoWrite

3. **Spawn parallel sub-tasks:**
   - **codebase-locator** - Find specific files
   - **codebase-analyzer** - Understand implementation details
   - **codebase-pattern-finder** - Find similar features to model after

4. **Present findings and design options (if not Autopilot):**
   ```
   **Current State:**
   - [Key discovery about existing code]

   **Design Options:**
   1. [Option A] - [pros/cons]
   2. [Option B] - [pros/cons]

   Which approach aligns best with your vision?
   ```

### Step 3: Plan Structure Development

1. **Create initial plan outline (if not Autopilot):**
   ```
   Here's my proposed plan structure:

   ## Overview
   [1-2 sentence summary]

   ## Implementation Phases:
   1. [Phase name] - [what it accomplishes]
   2. [Phase name] - [what it accomplishes]

   Does this phasing make sense?
   ```

2. **Get feedback on structure** before writing details

### Step 4: Detailed Plan Writing

Before proceeding, exit plan mode to write the plan file.

Write the plan to `thoughts/shared/plans/YYYY-MM-DD-description.md`:

```markdown
# [Feature/Task Name] Implementation Plan

## Overview
[Brief description of what we're implementing and why]

## Current State Analysis
[What exists now, what's missing, key constraints]

## Desired End State
[Specification of the desired end state and how to verify it]

### Key Discoveries:
- [Important finding with file:line reference]

## Quick Verification Reference

Common commands to verify the implementation:
- [Primary test command, e.g., `make test` or `npm test`]
- [Linting command, e.g., `make lint` or `npm run lint`]
- [Build command if applicable]

Key files to check:
- [Primary implementation file with path]
- [Test file(s) covering this feature]
- [Config files that may need updates]

## What We're NOT Doing
[Explicitly list out-of-scope items]

## Implementation Approach
[High-level strategy and reasoning]

## Phase 1: [Descriptive Name]

### Overview
[What this phase accomplishes]

### Changes Required:

#### 1. [Component/File Group]
**File**: `path/to/file.ext`
**Changes**: [Summary of changes]

### Success Criteria:

#### Automated Verification:
- [ ] Tests pass: `make test`
- [ ] Linting passes: `make lint`

#### Manual Verification:
- [ ] Feature works as expected
- [ ] No regressions

**Implementation Note**: After completing this phase, pause for manual confirmation.

---

## Testing Strategy
[Unit tests, integration tests, manual testing steps]

## References
- Related research: `thoughts/shared/research/[relevant].md`
```

### Step 5: Review and Iterate

1. **Present draft plan location:**
   ```
   I've created the implementation plan at:
   `thoughts/shared/plans/YYYY-MM-DD-description.md`

   Please review it.
   ```

2. **Iterate based on feedback** (if not Autopilot)

3. **Finalize the plan** - DO NOT START implementation

## Review Integration (Optional)

If the `file-review` plugin is available and autonomy mode is not Autopilot:
- After creating plans, offer: "Would you like to review this plan in file-review for inline comments?"
- If yes, invoke `/file-review:file-review <path>`

## Important Guidelines

1. **Be Skeptical**: Question vague requirements, verify with code
2. **Be Interactive**: Don't write full plan in one shot (unless Autopilot)
3. **Be Thorough**: Read context files COMPLETELY, include file:line references
4. **Be Practical**: Focus on incremental, testable changes
5. **No Open Questions**: Research or clarify immediately, don't leave questions in plan

## Success Criteria Guidelines

Always separate into:
- **Automated Verification**: Commands that can be run (`make test`, `npm run lint`)
- **Manual Verification**: Human testing required (UI/UX, performance)
```

#### 3. Refactor create-plan.md Command
**File**: `cc-plugin/base/commands/create-plan.md`
**Action**: Replace with thin wrapper

```markdown
---
description: Create detailed implementation plans through interactive research and iteration
model: opus
argument-hint: [--autonomy=MODE] [file_or_task]
---

# Create Plan

A thin wrapper that invokes the `desplega:planning` skill with autonomy controls.

## When Invoked

1. **Parse autonomy mode from arguments:**
   - Check for `--autonomy=autopilot|critical|verbose` flag
   - If provided file has `autonomy:` in frontmatter, use that as default
   - Otherwise, ask the user via AskUserQuestion:

   ```
   How much should I check in with you during planning?
   - Autopilot: Research and create plan independently, present for final review
   - Critical questions (Recommended): Ask only for major design decisions
   - Verbose: Check in at each step, validate approach throughout
   ```

2. **Invoke the `desplega:planning` skill:**
   - Pass any file paths or task descriptions
   - Pass the autonomy mode determined above
   - Let the skill handle all planning logic

3. **If no input provided:**
   - Respond with:
   ```
   I'll help you create a detailed implementation plan. Please provide:
   1. The task description
   2. Any relevant context, constraints, or specific requirements
   3. Links to related research or previous implementations
   ```

## Example Usage

```
/create-plan @thoughts/shared/research/my-feature.md
/create-plan --autonomy=autopilot implement user authentication
/create-plan --autonomy=verbose add caching layer
```
```

### Success Criteria:

#### Automated Verification:
- [x] Directory exists: `ls cc-plugin/base/skills/planning/`
- [x] SKILL.md exists: `cat cc-plugin/base/skills/planning/SKILL.md | head -5`
- [x] Command refactored: `wc -l cc-plugin/base/commands/create-plan.md` should be ~50 lines (actual: 45 lines)

#### Manual Verification:
- [ ] `/desplega:create-plan` prompts for autonomy mode
- [ ] `/desplega:create-plan --autonomy=autopilot @file` skips prompts
- [ ] Planning produces valid document with proper structure
- [ ] Autonomy mode affects interaction frequency appropriately

**Implementation Note**: After completing this phase, pause for manual confirmation before proceeding to Phase 3.

---

## Phase 3: Implementing Skill

### Overview
Create the `implementing` skill and refactor `implement-plan.md` command to a thin wrapper.

### Changes Required:

#### 1. Create Implementing Skill Directory
**Directory**: `cc-plugin/base/skills/implementing/`
**Action**: Create directory

#### 2. Create SKILL.md
**File**: `cc-plugin/base/skills/implementing/SKILL.md`
**Action**: Create new file with content extracted from `implement-plan.md`

```markdown
---
name: implementing
description: Plan implementation skill. Executes approved technical plans phase by phase with verification checkpoints.
---

# Implementing

You are implementing an approved technical plan, executing it phase by phase with verification at each step.

## When to Use

This skill activates when:
- User invokes `/implement-plan` command
- Another skill references `**REQUIRED SUB-SKILL:** Use desplega:implementing`
- User asks to execute or implement an existing plan

## Autonomy Mode

Adapt your behavior based on the autonomy mode:

| Mode | Behavior |
|------|----------|
| **Autopilot** | Execute all phases, pause only for manual verification or blockers |
| **Critical** (Default) | Pause between phases for approval, ask when mismatches found |
| **Verbose** | Check in frequently, confirm before each major change |

The autonomy mode is passed by the invoking command. If not specified, default to **Critical**.

## Initial Setup Questions

Before starting implementation (unless autonomy is Autopilot), ask the user:

### 1. Branch/Worktree Setup

First, check the current branch: `git branch --show-current`

Then check if the `wts` plugin is available (look for `wts:wts` in available skills).

**If wts plugin is installed:**
```
You're currently on branch `<current-branch>`. Where would you like to implement?
- Continue on current branch
- Create a new branch: `git checkout -b <branch-name>`
- Create a wts worktree: `wts create <alias> -n --tmux`
```

**If wts plugin is NOT installed:**
```
You're currently on branch `<current-branch>`. Where would you like to implement?
- Continue on current branch
- Create a new branch: `git checkout -b <branch-name>`
```

### 2. Commit Strategy

```
How would you like to handle commits during implementation?
- Commit after each phase (Recommended for complex plans)
- Commit at the end (Single commit for all changes)
- Let me decide as I go
```

If "Commit after each phase" is selected:
- After completing each phase's verification, create a commit with message: `[Phase N] <phase name>`
- Use the plan's phase descriptions for commit messages

Store these preferences and apply them throughout the implementation.

## Getting Started

When given a plan path:
1. Read the plan completely
2. Check for existing checkmarks (`- [x]`)
3. **Read files fully** - never use limit/offset parameters
4. Think deeply about how the pieces fit together
5. Create a todo list to track progress
6. Start implementing if you understand what needs to be done

If no plan path provided, ask for one.

## Implementation Philosophy

Plans are carefully designed, but reality can be messy. Your job is to:
- Follow the plan's intent while adapting to what you find
- Implement each phase fully before moving to the next
- Verify your work makes sense in the broader codebase context
- Update checkboxes in the plan as you complete sections

When things don't match the plan exactly, think about why and communicate clearly.

## Handling Mismatches

If you encounter a mismatch (and autonomy mode is not Autopilot):
- STOP and think deeply about why the plan can't be followed
- Present the issue clearly:
  ```
  Issue in Phase [N]:
  Expected: [what the plan says]
  Found: [actual situation]
  Why this matters: [explanation]

  How should I proceed?
  ```

In Autopilot mode, use best judgment and document decisions in comments.

## Verification Approach

After implementing a phase:
1. Run the success criteria checks (usually `make format` or folder-specific `Makefile`s)
2. Fix any issues before proceeding
3. Update progress in both the plan and your todos
4. Check off completed items in the plan file using Edit

### Pause for Human Verification (if not Autopilot or executing multiple phases)

```
Phase [N] Complete - Ready for Manual Verification

Automated verification passed:
- [List automated checks that passed]

Please perform the manual verification steps listed in the plan:
- [List manual verification items from the plan]

Let me know when manual testing is complete so I can proceed to Phase [N+1].
```

If instructed to execute multiple phases consecutively, skip the pause until the last phase.

Do not check off manual testing items until confirmed by the user.

## If You Get Stuck

When something isn't working as expected:
1. Make sure you've read and understood all relevant code
2. Consider if the codebase has evolved since the plan was written
3. Present the mismatch clearly and ask for guidance (unless Autopilot)
4. Use sub-tasks sparingly for targeted debugging

## Resuming Work

If the plan has existing checkmarks:
- Trust that completed work is done
- Pick up from the first unchecked item
- Verify previous work only if something seems off

Remember: You're implementing a solution, not just checking boxes. Keep the end goal in mind.
```

#### 3. Refactor implement-plan.md Command
**File**: `cc-plugin/base/commands/implement-plan.md`
**Action**: Replace with thin wrapper

```markdown
---
description: Implement technical plans from a predefined plan file
model: inherit
argument-hint: [--autonomy=MODE] [plan_path]
---

# Implement Plan

A thin wrapper that invokes the `desplega:implementing` skill with autonomy controls.

## When Invoked

1. **Parse autonomy mode from arguments:**
   - Check for `--autonomy=autopilot|critical|verbose` flag
   - If plan file has `autonomy:` in frontmatter, use that as default
   - Otherwise, default to **Critical** (don't prompt - implementation is more straightforward)

2. **Invoke the `desplega:implementing` skill:**
   - Pass the plan file path
   - Pass the autonomy mode determined above
   - Let the skill handle all implementation logic

3. **If no plan path provided:**
   - Respond with: "I need a plan file to proceed. Please provide the path to the plan you would like me to implement."

## Example Usage

```
/implement-plan thoughts/shared/plans/2026-01-14-my-feature.md
/implement-plan --autonomy=autopilot @plans/feature.md
/implement-plan --autonomy=verbose @current-plan.md
```
```

### Success Criteria:

#### Automated Verification:
- [x] Directory exists: `ls cc-plugin/base/skills/implementing/`
- [x] SKILL.md exists: `cat cc-plugin/base/skills/implementing/SKILL.md | head -5`
- [x] Command refactored: `wc -l cc-plugin/base/commands/implement-plan.md` should be ~40 lines (actual: 32 lines)
- [x] Delete .gitkeep: `rm cc-plugin/base/skills/.gitkeep` (no longer needed)

#### Manual Verification:
- [ ] `/desplega:implement-plan <plan>` works correctly
- [ ] Autonomy flag is respected
- [ ] Phase verification pauses work correctly
- [ ] Checkbox updates in plan file work

**Implementation Note**: After completing this phase, the refactoring is complete. Verify all three commands work correctly.

---

## Testing Strategy

### Unit Tests:
N/A - These are markdown files, not executable code

### Integration Tests:
- Test each command with different autonomy modes
- Test skill invocation via `**REQUIRED SUB-SKILL:**` notation
- Test file-review integration hints appear when plugin is available

### Manual Testing Steps:
1. `/desplega:research how does X work` - verify autonomy prompt appears
2. `/desplega:research --autonomy=autopilot how does Y work` - verify no prompts
3. `/desplega:create-plan implement feature Z` - verify interactive planning
4. `/desplega:implement-plan @plan.md` - verify phase-by-phase execution
5. Create a project-level skill extension to verify `**REQUIRED SUB-SKILL:**` works

## Performance Considerations

None - this is a markdown restructuring with no runtime implications.

## Migration Notes

- Old command content is replaced, not moved
- No backwards compatibility concerns (commands maintain same invocation syntax)
- Existing research/plan documents unaffected

## References

- Related research: `thoughts/shared/research/2026-01-14-skill-wrapper-refactoring.md`
- Reference thin wrapper: `cc-plugin/file-review/commands/process-comments.md`
- Reference skill: `cc-plugin/file-review/skills/process-review/SKILL.md`
- Superpowers pattern: https://github.com/obra/superpowers/tree/main/skills
