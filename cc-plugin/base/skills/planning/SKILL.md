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

## Initial Setup Questions

Before starting planning (unless autonomy is Autopilot), use **AskUserQuestion** to ask:

### Review Preference

Check if the `file-review` plugin is available (look for `file-review:file-review` in available commands).

**If file-review plugin is installed**, use **AskUserQuestion** with:

| Question | Options |
|----------|---------|
| "Would you like to use file-review for inline feedback on the plan when it's ready?" | 1. Yes, open file-review when plan is ready (Recommended), 2. No, just show me the plan |

Store this preference and act on it after plan creation (see "Review Integration" section).

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

   First, present your findings as text:
   ```
   Based on the research of the codebase, I understand we need to [summary].

   I've found that:
   - [Current implementation detail with file:line reference]
   - [Relevant pattern or constraint discovered]
   ```

   Then, if there are questions that research couldn't answer, use **AskUserQuestion** with:

   | Question | Options |
   |----------|---------|
   | "[Specific technical question]" | Provide relevant options based on the choices available |
   | "[Design preference question]" | Provide relevant options based on the choices available |

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

   First, present findings as text:
   ```
   **Current State:**
   - [Key discovery about existing code]
   ```

   Then, use **AskUserQuestion** to present design options:

   | Question | Options |
   |----------|---------|
   | "Which approach aligns best with your vision?" | 1. [Option A] - [brief description], 2. [Option B] - [brief description] |

   Include pros/cons in the option descriptions to help the user decide.

### Step 3: Plan Structure Development

1. **Create initial plan outline (if not Autopilot):**

   Present the outline as text:
   ```
   Here's my proposed plan structure:

   ## Overview
   [1-2 sentence summary]

   ## Implementation Phases:
   1. [Phase name] - [what it accomplishes]
   2. [Phase name] - [what it accomplishes]
   ```

   Then, use **AskUserQuestion** to get approval:

   | Question | Options |
   |----------|---------|
   | "Does this phasing make sense?" | 1. Yes, proceed with this structure, 2. No, let's discuss changes |

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

## Review Integration

If the `file-review` plugin is available and the user selected "Yes" during Initial Setup Questions:
- After creating plans, invoke `/file-review:file-review <path>`
- If user selected "No" or autonomy mode is Autopilot, skip this step

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
