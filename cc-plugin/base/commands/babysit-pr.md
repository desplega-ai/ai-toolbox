---
description: Keep a GitHub PR moving until it is clean on its head commit
model: inherit
argument-hint: "[PR number] [--merge] [--max-rounds N]"
---

# Babysit PR

A thin wrapper that invokes the `desplega:babysit-pr` skill. The skill runs a round loop until the PR is clean on its head commit.

## When Invoked

1. **Parse the arguments:**
   - PR number: optional. Without it, use the PR of the current branch.
   - `--merge`: merge the PR when it is done. Without this flag, the skill never merges.
   - `--max-rounds N`: the round limit. The default is 6.

2. **ALWAYS invoke the `desplega:babysit-pr` skill:**
   - Pass the PR number and the flags
   - Let the skill handle the loop, the waiting, and the final report

3. **If no PR is given and the current branch has no PR:**
   - Use AskUserQuestion: "Which PR should I babysit?"

## Example Usage

```
/babysit-pr
/babysit-pr 1044
/babysit-pr 1044 --max-rounds 3
/babysit-pr 1044 --merge
```
