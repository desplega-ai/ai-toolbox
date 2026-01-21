---
name: planning
description: Implementation planning skill. Creates detailed technical plans through interactive research and iteration.
---

# Planning

You are creating detailed implementation plans through an interactive, iterative process. Be skeptical, thorough, and collaborative.

## Working Agreement

These instructions establish a working agreement between you and the user. The key principles are:

1. **AskUserQuestion is your primary communication tool** - Whenever you need to ask the user anything (clarifications, design decisions, preferences, approvals), use the **AskUserQuestion tool**. Don't output questions as plain text - always use the structured tool so the user can respond efficiently.

2. **Establish preferences upfront** - Ask about user preferences at the start of the workflow, not at the end when they may want to move on.

3. **Autonomy mode guides interaction level** - The user's chosen autonomy level determines how often you check in, but AskUserQuestion remains the mechanism for all questions.

### User Preferences

Before starting planning (unless autonomy is Autopilot), establish these preferences:

**Commit After Each Phase** - Use **AskUserQuestion** with:

| Question | Options |
|----------|---------|
| "Would you like me to create a commit after each phase once manual verification passes?" | 1. Yes, commit after each phase passes (Recommended), 2. No, I'll handle commits myself |

Store this preference and act on it during implementation (see "Commit Integration" section).

**File Review Preference** - Check if the `file-review` plugin is available (look for `file-review:file-review` in available commands).

If file-review plugin is installed, use **AskUserQuestion** with:

| Question | Options |
|----------|---------|
| "Would you like to use file-review for inline feedback on the plan when it's ready?" | 1. Yes, open file-review when plan is ready (Recommended), 2. No, just show me the plan |

Store this preference and act on it after plan creation (see "Review Integration" section).

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

Write the plan to `thoughts/<username|shared>/plans/YYYY-MM-DD-description.md`.

**Path selection:** Use the user's name (e.g., `thoughts/taras/plans/`) if known from context. Fall back to `thoughts/shared/plans/` when unclear.

**CRITICAL**: Every phase MUST include a `### Success Criteria:` section with both `#### Automated Verification:` and `#### Manual Verification:` subsections. See "Success Criteria Requirements" section at the end of this document for the exact format.

**Template:** Read and follow the template at `cc-plugin/base/skills/planning/template.md`

The template includes:
- Standard plan sections (Overview, Current State, Desired End State, etc.)
- Multiple phase examples with proper Success Criteria structure
- Correct heading hierarchy throughout

### Step 5: Review and Iterate

1. **Present draft plan location:**
   ```
   I've created the implementation plan at:
   `thoughts/<username|shared>/plans/YYYY-MM-DD-description.md`

   Please review it.
   ```

2. **Iterate based on feedback** (if not Autopilot)

3. **Finalize the plan** - DO NOT START implementation

## Review Integration

If the `file-review` plugin is available and the user selected "Yes" during User Preferences setup:
- After creating plans, invoke `/file-review:file-review <path>`
- If user selected "No" or autonomy mode is Autopilot, skip this step

## Commit Integration

If the user selected "Yes" to commits during User Preferences setup:
- After each phase's manual verification passes, create a commit with a descriptive message
- Commit message format: `[phase N] <brief description of what the phase accomplished>`
- Only commit after explicit confirmation that manual verification passed
- If user selected "No", skip commits entirely - the user will handle them

## Important Guidelines

1. **Be Skeptical**: Question vague requirements, verify with code
2. **Be Interactive**: Don't write full plan in one shot (unless Autopilot)
3. **Be Thorough**: Read context files COMPLETELY, include file:line references
4. **Be Practical**: Focus on incremental, testable changes
5. **No Open Questions**: Research or clarify immediately, don't leave questions in plan

## Success Criteria Requirements (MANDATORY)

**Every phase MUST have a Success Criteria section.** Plans without proper success criteria are incomplete.

### Required Structure

Each phase must end with this exact structure:

```markdown
### Success Criteria:

#### Automated Verification:
- [ ] [Command that can be run]: `command here`
- [ ] [Another automated check]: `command here`

#### Manual Verification:
- [ ] [Human testing step]
- [ ] [Another manual check]

**Implementation Note**: [When to pause for confirmation]
```

### Heading Hierarchy

Use these exact heading levels (this is critical for consistency):
- `### Success Criteria:` (h3) - section header
- `#### Automated Verification:` (h4) - subsection
- `#### Manual Verification:` (h4) - subsection

### What Goes Where

| Type | Examples |
|------|----------|
| **Automated** | `make test`, `npm run lint`, `tsc --noEmit`, `ls path/to/file`, `grep pattern file` |
| **Manual** | UI interactions, visual checks, performance testing, edge case validation |

### Validation Checklist

Before finalizing any plan, verify:
- [ ] Every phase has `### Success Criteria:` section
- [ ] Each has `#### Automated Verification:` with runnable commands
- [ ] Each has `#### Manual Verification:` with human testing steps
- [ ] All items use checkbox format `- [ ]`
- [ ] Automated checks are actual commands (not descriptions)
