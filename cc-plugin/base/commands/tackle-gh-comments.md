---
description: Work through every review comment and finding on a GitHub PR
model: inherit
argument-hint: "[PR number]"
---

# Tackle GitHub PR comments

A thin wrapper that invokes the `desplega:tackle-gh-comments` skill for one sweep over a PR.

## When Invoked

1. **Find the PR:**
   - If a PR number is given, use it.
   - Otherwise, use the PR of the current branch.

2. **ALWAYS invoke the `desplega:tackle-gh-comments` skill:**
   - Pass the PR number (if given)
   - Let the skill fetch, verify, fix, reply, resolve, and push

3. **If no PR is given and the current branch has no PR:**
   - Use AskUserQuestion: "Which PR should I work on?"

## Example Usage

```
/tackle-gh-comments
/tackle-gh-comments 1044
```

To continue until the PR is approved, use `/babysit-pr` instead.
