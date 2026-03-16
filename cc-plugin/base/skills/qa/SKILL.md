---
name: qa
description: Functional validation skill. Captures test evidence (screenshots, recordings, links) and produces QA reports in thoughts/*/qa/.
---

# QA

You are performing functional validation of a feature, bugfix, or deployment. Your job is to prove it works (or doesn't) by executing test scenarios and capturing evidence.

## Working Agreement

These instructions establish a working agreement between you and the user. The key principles are:

1. **AskUserQuestion is your primary communication tool** - Whenever you need to ask the user anything (clarifications, preferences, decisions), use the **AskUserQuestion tool**. Don't output questions as plain text - always use the structured tool so the user can respond efficiently.

2. **Establish preferences upfront** - Ask about user preferences at the start of the workflow, not at the end when they may want to move on.

3. **Autonomy mode guides interaction level** - The user's chosen autonomy level determines how often you check in, but AskUserQuestion remains the mechanism for all questions.

### User Preferences

Before starting QA (unless autonomy is Autopilot), establish these preferences:

**QA Approach** - Use **AskUserQuestion** with:

| Question | Options |
|----------|---------|
| "How would you like to execute test scenarios?" | 1. Browser automation (qa-use) — if available, 2. Manual testing with guided steps, 3. Mixed — automate what we can, manual for the rest |

**Note on qa-use availability**: Check if the `qa-use` plugin is available (look for `qa-use:*` in available skills). Also check if the project's `CLAUDE.md` specifies a different QA/testing tool. If qa-use is not available and no alternative is specified, default to manual testing.

**File Review Preference** - Check if the `file-review` plugin is available (look for `file-review:file-review` in available commands).

If file-review plugin is installed, use **AskUserQuestion** with:

| Question | Options |
|----------|---------|
| "Would you like to use file-review for inline feedback on the QA report?" | 1. Yes, open file-review when report is ready, 2. No, just show me the report |

Store these preferences and act on them during the QA process.

## When to Use

This skill activates when:
- User invokes `/qa` command
- Another skill references `desplega:qa`
- User asks to test, validate, or QA a feature
- The implementing skill encounters a phase with a QA spec

## Autonomy Mode

At the start of QA, adapt your interaction level based on the autonomy mode:

| Mode | Behavior |
|------|----------|
| **Autopilot** | Execute all test cases, capture evidence, present summary at end |
| **Critical** (Default) | Ask about test case design, present results for review |
| **Verbose** | Walk through each test case, confirm before executing |

The autonomy mode is passed by the invoking command. If not specified, default to **Critical**.

## Process Steps

### Step 1: Context & Scope

Determine the source of QA specs. The skill handles three input modes:

**Plan path provided** → Read the plan, extract `### QA Spec` sections from each phase, aggregate into a QA document. Each phase's QA spec becomes a group of test cases.

**Separate QA spec document provided** → Read the standalone QA spec (could be a dedicated file in `thoughts/*/qa/` or any markdown with test scenarios), use it as the basis for the QA session.

**No source / PR / issue / description only** → Build test cases from scratch with the user. Use **AskUserQuestion** to establish:

| Question | Options |
|----------|---------|
| "What are we validating? Please describe the feature or provide context." | [Free text response] |

In all cases, create a QA document from the template at `cc-plugin/base/skills/qa/template.md`. Write it to `thoughts/<username|shared>/qa/YYYY-MM-DD-<topic>.md`.

**Path selection:** Use the user's name (e.g., `thoughts/taras/qa/`) if known from context. Fall back to `thoughts/shared/qa/` when unclear.

### Step 2: Test Case Design

Define test cases covering:
- **Happy path** — The main scenario works as intended
- **Edge cases** — Boundary conditions, empty inputs, large inputs
- **Error scenarios** — Invalid inputs, permission failures, network errors

**If sourced from a plan**: Aggregate phase QA specs into the test case list. Augment with additional exploratory cases.

**If sourced from a separate spec**: Use those scenarios as the starting point and augment with exploratory cases.

**If browser automation was selected and qa-use is available**: Design qa-use test steps for each test case (explore → snapshot → interact → screenshot).

Write all test cases into the QA document's `## Test Cases` section.

### Step 3: Execute Tests

**For browser automation (qa-use)**:
1. Use `qa-use:explore` to navigate to the target page
2. Take snapshots to understand page state
3. Interact with elements (click, type, navigate)
4. Capture screenshots as evidence

**For manual testing**:
1. Present each test case's steps to the user
2. Guide them through execution
3. Use **AskUserQuestion** to collect results:

| Question | Options |
|----------|---------|
| "TC-N: [Test case name]. Did it pass?" | 1. Pass, 2. Fail — [describe what happened], 3. Blocked — [describe blocker], 4. Skipped |

**For CLI verification**:
1. Execute the CLI commands directly
2. Compare output against expected results
3. Record pass/fail automatically

For each test case, record the actual result and pass/fail status.

### Step 4: Capture Evidence

Gather evidence for the QA report:
- **Screenshots**: Via qa-use browser screenshots or user-provided
- **Videos**: Session recording URLs (Loom, etc.)
- **Logs**: Console output, error messages, relevant log lines
- **External links**: Sentry issues, CI/CD runs, Grafana dashboards, PR URLs

Add all evidence to the QA document's `## Evidence` section.

### Step 5: Record Results

Update the QA document with:
- Actual results for each test case
- Pass/fail/blocked/skipped status per test case
- Evidence links inline with relevant test cases
- Any issues found in the `## Issues Found` section with severity tags (critical/major/minor)

### Step 6: Verdict

Aggregate results into an overall verdict:

| Verdict | When |
|---------|------|
| **PASS** | All test cases pass, no critical/major issues |
| **FAIL** | Any test case fails, or critical/major issues found |
| **BLOCKED** | Cannot complete testing due to environment/dependency issues |

Write a 1-2 sentence summary in the QA document's `## Verdict` section. Update the frontmatter `status` field to match (pass/fail/blocked).

### Step 7: Persist QA Knowledge

If the project's `CLAUDE.md` or `agents.md` doesn't document how QA is done for this project, offer to add a QA section describing:
- Testing approach used (manual, browser automation, CLI)
- Tools used (qa-use, Playwright, etc.)
- Common test patterns discovered

Use **AskUserQuestion** with:

| Question | Options |
|----------|---------|
| "This project doesn't have documented QA practices. Would you like me to add a QA section to CLAUDE.md?" | 1. Yes, add QA documentation, 2. No, skip this |

Also persist useful patterns to memory if they emerge across QA sessions.

## Review Integration

If the `file-review` plugin is available and the user selected "Yes" during User Preferences setup:
- After the QA report is complete, invoke `/file-review:file-review <qa-report-path>` for inline human comments
- Process feedback with `file-review:process-review` skill
- If user selected "No" or autonomy mode is Autopilot, skip this step

## Workflow Handoff

After the QA report is complete, use **AskUserQuestion** with:

| Question | Options |
|----------|---------|
| "QA complete. What's next?" | 1. Run post-QA verification (→ `/verify-plan`), 2. Run review on QA report (→ `/review`), 3. Done |

Based on the answer:
- **Verify**: Invoke the `desplega:verifying` skill
- **Review**: Invoke the `desplega:reviewing` skill on the QA document
- **Done**: Finalize the QA report
