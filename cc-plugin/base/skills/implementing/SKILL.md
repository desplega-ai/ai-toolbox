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
