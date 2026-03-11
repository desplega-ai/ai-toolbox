---
name: reviewing
description: Structured critique of research, plan, and brainstorm documents for completeness, gaps, and quality.
---

# Reviewing

You are performing a structured critique of a document (research, plan, or brainstorm) to identify gaps, weaknesses, and quality issues.

## Working Agreement

These instructions establish a working agreement between you and the user. The key principles are:

1. **AskUserQuestion is your primary communication tool** - Whenever you need to ask the user anything (clarifications, preferences, decisions), use the **AskUserQuestion tool**. Don't output questions as plain text - always use the structured tool so the user can respond efficiently.

2. **Establish preferences upfront** - Ask about user preferences at the start of the workflow, not at the end when they may want to move on.

3. **Autonomy mode guides interaction level** - The user's chosen autonomy level determines how often you check in, but AskUserQuestion remains the mechanism for all questions.

### User Preferences

Before starting review (unless autonomy is Autopilot), establish these preferences:

**Output Mode** - Use **AskUserQuestion** with:

| Question | Options |
|----------|---------|
| "How should I present the review findings?" | 1. Append errata section to the document (Recommended), 2. Write a separate review file to thoughts/*/reviews/ |

**File Review Preference** - Check if the `file-review` plugin is available (look for `file-review:file-review` in available commands).

If file-review plugin is installed, use **AskUserQuestion** with:

| Question | Options |
|----------|---------|
| "Would you like to use file-review for inline feedback after the automated review?" | 1. Yes, open file-review after review (Recommended), 2. No, the automated review is sufficient |

Store these preferences and act on them during the review process.

## When to Use

This skill activates when:
- User invokes `/review` command
- Another skill references the reviewing skill at completion
- User asks to review, critique, or check a document

## Autonomy Mode

At the start of review, adapt your interaction level based on the autonomy mode:

| Mode | Behavior |
|------|----------|
| **Autopilot** | Run full review, auto-fix minor issues, present summary at end |
| **Critical** (Default) | Ask about Critical/Important findings, auto-fix Minor ones |
| **Verbose** | Walk through each finding, confirm before any changes |

The autonomy mode is passed by the invoking command. If not specified, default to **Critical**.

## Process Steps

### Step 1: Read & Classify

Read the input document fully. Determine the document type from its path and content structure:

| Path contains | Type |
|---------------|------|
| `/research/` | Research document |
| `/plans/` | Plan |
| `/brainstorms/` | Brainstorm |

If the type is ambiguous, infer from content structure or use **AskUserQuestion** to clarify.

### Step 2: Structural Check

Verify required sections exist based on document type:

**Research documents:**
- YAML frontmatter with required fields (date, researcher, topic, status)
- Research Question section
- Summary section
- Detailed Findings with file:line references
- Code References table
- Open Questions section

**Plans:**
- YAML frontmatter with required fields (date, planner, topic, status)
- Overview section
- Current State Analysis
- Desired End State with Key Discoveries
- What We're NOT Doing
- Phases with Changes Required and Success Criteria (both Automated and Manual Verification)
- Quick Verification Reference

**Brainstorms:**
- YAML frontmatter with required fields (date, author, topic, status)
- Context section
- Exploration section with Q&A pairs
- Synthesis section
- Next Steps section

### Step 3: Content Analysis

Apply type-specific quality criteria:

**Research documents:**
- Are findings supported by specific file:line references?
- Are there claims without evidence from the codebase?
- Are there obvious areas that weren't investigated?
- Are open questions actually open (not answerable from the findings)?

**Plans:**
- Are there missing phases or gaps in the implementation sequence?
- Are success criteria specific enough to be actionable?
- Are there unstated assumptions about the codebase?
- Is error handling or rollback addressed?
- Is there scope creep risk (doing more than stated)?

**Brainstorms:**
- Were important angles left unexplored?
- Were conclusions reached prematurely before sufficient exploration?
- Are constraints and requirements clearly identified?
- Is the document ready to feed into research or planning?

### Step 4: Gap Identification

Look for what's missing or assumed:
- Cross-reference claims against the codebase if needed (spawn **codebase-analyzer** agent for verification)
- Identify unstated assumptions
- Check for internal contradictions
- Verify external references are still valid

### Step 5: Present Findings

Categorize all findings into three severity levels:

| Severity | Meaning | Action |
|----------|---------|--------|
| **Critical** | Blocks correctness or completeness — must be addressed | Discuss with user |
| **Important** | Significant gap or weakness — should be addressed | Discuss with user (or auto-fix in Autopilot) |
| **Minor** | Formatting, typos, small inconsistencies | Auto-fix unless Verbose mode |

Present a summary as text output with findings grouped by severity.

### Step 6: Apply or Discuss

Based on output mode preference:

**If "Append errata":**
- Auto-fix Minor issues directly in the document
- For Critical/Important items, append a `## Review Errata` section at the end of the document with:
  ```
  ## Review Errata

  _Reviewed: YYYY-MM-DD by [reviewer]_

  ### Critical
  - [ ] [Finding description and recommended action]

  ### Important
  - [ ] [Finding description and recommended action]

  ### Resolved
  - [x] [Minor issue] — auto-fixed
  ```

**If "Separate file":**
- Write review to `thoughts/*/reviews/YYYY-MM-DD-review-of-<original-slug>.md`
- Include all findings with references back to the original document

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

## No Rewriting Rule

**CRITICAL**: The reviewer identifies issues — the reviewer does NOT rewrite the document. Present findings and let the original author address them. The only exception is Minor auto-fixes (typos, formatting).

## Review Integration

If the `file-review` plugin is available and the user selected "Yes" during User Preferences setup:
- After the automated review, invoke `/file-review:file-review <path>` for inline human comments
- Process feedback with `file-review:process-review` skill
- If user selected "No" or autonomy mode is Autopilot, skip this step
