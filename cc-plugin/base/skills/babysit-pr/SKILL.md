---
name: babysit-pr
description: Keep a GitHub PR moving until it is clean on its head commit. Each round fixes CI failures, handles review findings, rebases when needed, re-triggers the reviewers, and then waits in the background for the next event. Use when the user says "babysit the PR", "watch the PR until it's approved", "keep going until approved", "monitor the PR", or invokes /babysit-pr. Merges only when the user asks for it.
---

# Babysit a PR

This skill is a loop around `desplega:tackle-gh-comments`. Each round does these steps:

1. Read the PR state.
2. Fix what is wrong.
3. Push one time.
4. Re-trigger the reviewers.
5. Wait for the next event.

The loop stops when the PR is clean on its head commit, at the round limit, or when a
decision belongs to the user.

## Loop contract

A turn in a babysit run ends in exactly one of two ways:

1. A `wait` command runs in the background.
2. You write the final report: the PR is done, merged, or closed, the user told you to stop, or
   a stop question got no answer (see Guardrails).

Do not end a turn in a different way. When `wait` exits, start the next round at once. The
`next` field in the `wait` output repeats this instruction. This keeps the loop alive after a
context compaction.

To stop and ask, use `AskUserQuestion` (see Guardrails). The prompt pauses the round. It does
not end the round. After the answer, continue the round.

## Commands

```bash
STATE="${CLAUDE_PLUGIN_ROOT}/skills/babysit-pr/scripts/pr-state.ts"
COMMENTS="${CLAUDE_PLUGIN_ROOT}/skills/tackle-gh-comments/scripts/gh-pr-comments.ts"

bun $STATE snapshot                               # one compact JSON object for the round
bun $STATE wait --since <head-oid> --round 2/6    # blocks, prints one JSON line on the next event
bun $STATE rerequest --reviewer <login>           # formal re-request (--dry-run prints the command)
bun $COMMENTS list                                # full text of threads and findings on head
bun $COMMENTS list --all                          # also older findings and resolved threads
```

The scripts infer the repo and the PR from the current checkout. `--repo owner/name` and
`--pr N` override them.

`snapshot` gives `state`, `head`, `base`, `checks`, `threads`, `findings` (bodies cut to 300
characters), `reviewers`, and `gates`. The script reports facts only. You make these judgment
calls:

- Which reviewer is relevant.
- Which trigger to use.
- Whether a finding is addressed.

## Setup

1. **Find the PR.** Use the argument. Without an argument, use the PR of the current branch
   (`gh pr view --json number,url,headRefName`). Work in the PR's checkout. If the current branch
   (`git branch --show-current`) is not `headRefName`, stop and ask.
2. **Read the goal.** Read the PR body and this conversation. The goal is the scope fence for
   every round.
3. **Set the round limit.** Use `--max-rounds N`. The default is 6.
4. **Note `--merge`.** Without it, never merge.

## One round

1. **Snapshot.** Run `snapshot` and read the output.
2. **Done check.** If the PR meets the definition of done, write the final report. If
   `state` is `MERGED` or `CLOSED`, write the final report.
3. **Rebase** if `gates.upToDate` is false.
   1. Run `git fetch origin <base.ref>`.
   2. Record the old head (`git rev-parse HEAD`) and the old fork point
      (`git merge-base HEAD origin/<base.ref>`).
   3. Run `git rebase origin/<base.ref>`. If a conflict needs a judgment call, stop and ask.
   4. Run `git range-diff <old-fork-point>..<old-head> origin/<base.ref>..HEAD`. Make sure that
      no change of the PR is gone, and that no change from the base returned.
   5. Run the local checks.
4. **CI failures.** Find the link of each failing check with `gh pr checks <N> --repo <owner/name>`.
   For a GitHub Actions run, the link holds the run id. Read the logs
   (`gh run view <run-id> --log-failed`).
   Fix a real failure. An infrastructure flake is a failure that the code did not cause.
   Examples: a lost runner, a network timeout, a registry error. For a flake, run
   `gh run rerun <run-id> --failed` one time. If the same check fails again, treat the failure
   as real.
5. **Findings.** If `threads.unresolved` is above 0 or `findings` is not empty, follow
   `desplega:tackle-gh-comments`: verify, fix, reply, and resolve. Do not push yet.
   - Keep the PR at the size of its goal. Fix real bugs in the intended case. Decline other
     findings with a written reason, and list them as follow-ups. Examples: tests that the goal
     does not need, guards for rare edge cases, extra integration or compatibility, small
     performance costs. Prefer the fix that deletes or narrows code.
   - `findings` holds only findings on the head commit. Some are approvals or status notes.
     Read each one. Act only on real requests.
   - A finding that you answered in an earlier round stays in `findings` until the next push.
     Do not answer it again.
   - A reviewer can review an older head after your last push. Its `latest.onHead` is then
     false. Read that review with `list --all` and handle it too.
6. **Push one time**, after all fixes of the round. After a rebase, run
   `git push --force-with-lease=<branch>:<old-head>`. If the lease fails, the remote branch has
   commits that you do not have. Fetch, then stop and ask. Do not overwrite those commits.
   Never force-push without a lease.
7. **Re-trigger** each relevant reviewer (see the next section). Send one trigger per reviewer
   per round. Send a trigger only after a push, or when a relevant reviewer has no activity on
   head.
8. **Wait.** Start `wait` in the background with the new head oid. Pass `--round N/M`: N is the
   number of counted rounds so far, and M is the round limit. End the turn.

A round counts toward the limit when it pushes a commit or posts a trigger. A round that only
reads the state and starts `wait` again does not count.

When `wait` exits, read its `event`:

| Event | Next step |
|-------|-----------|
| `merged`, `closed` | Write the final report. |
| `head-moved` | Pull the new head. Start the next round. |
| `check-failed`, `checks-done`, `review-activity`, `merge-state` | Start the next round. |
| `timeout` | Start the next round. After two `timeout` events in a row, stop and ask. |

## Reviewer discovery

Reviewer names differ per company and per repo. Do not classify a reviewer from its name.
Classify each entry in `snapshot.reviewers` from its evidence:

- **Not a reviewer.** These are deploy bots, CI bots, and dependency bots. They post deploy
  previews, CI timing tables, or dependency updates. Read their checks. Ignore their comments.
- **Runs on push.** It has activity on several heads, `triggeredBy` is null, and nobody
  requested it. Do not trigger it. Wait for it.
- **Formally requested.** `requestedNow` or `everRequested` is true, and no comment triggers
  it. Re-request it with `rerequest --reviewer <login>`. Humans and some bots use this path.
- **Comment-triggered.** It ran after a comment that mentions it. Find the trigger in this
  order:
  1. `triggeredBy.excerpt`: reuse the exact trigger that worked earlier on this PR.
  2. `bodyTail`: many bots state their trigger in a footer.
  3. Repo docs: `CLAUDE.md`, `AGENTS.md`, `CONTRIBUTING.md`, `.github/`.
  4. Ask the user one time with `AskUserQuestion`. Reuse the answer for the rest of the run.

  Post the trigger with `gh pr comment <N> --repo <owner/name> --body "<trigger>"`.

A relevant reviewer is a reviewer in one of the last three classes. Do not send comment
triggers to humans.

`isAuthor` is true when the PR author also posts reviews from the same account. The activity of
that account mixes code work and reviews. Read the bodies to find the reviews.

Examples from desplega-ai PRs (examples only, not rules):

- `desplega-bot` takes a comment trigger and gives a formal `APPROVED`.
- Codex (`chatgpt-codex-connector`) takes `@codex review`. Its footer states this trigger.
- Copilot (`copilot-pull-request-reviewer`) takes a formal re-request.

## Definition of done

All of these conditions are true on `head.oid`:

- `gates.requiredChecksGreen` is true.
  - If `checks.requiredCount` is 0, `requiredChecksGreen` uses all checks.
  - You can waive a known unrelated failing check (for example a deploy preview on a fork).
    Write the reason in the final report.
  - `checks.required` also lists the required checks of the base branch rules that have not
    started yet. Their status is `EXPECTED`, and they count as pending. The script reads
    rulesets, and classic branch protection when your account can read it.
  - `requiredChecksGreen` is also true when no check exists. If `checks.required` and
    `checks.optional` are both empty right after a push, wait for one more event. GitHub may not
    have registered the checks yet.
- `gates.noUnresolvedThreads` is true, and each finding on head has an answer.
- `gates.upToDate` is true.
- `gates.reviewDecisionOk` is true.
- Each relevant reviewer is clean on head. Either `approvedOnHead` is true, or
  `latest.onHead` is true and its latest activity has no new finding. Read the body of that
  activity. Machine-readable markers in bot comments are hints, not rules.

## Waiting

- **Claude Code:** run `wait` with Bash `run_in_background: true`. Then end the turn with one
  short status line. The harness starts your next turn when `wait` exits. Read the JSON line
  of `wait` from the task output.
- **Unattended Claude Code runs** (`-p`, SDK, CI) stop background tasks after 30 minutes by
  default. Use `--timeout 1500` there.
- **Harnesses without background re-invocation** (for example Codex CLI): run `wait` in the
  foreground. Set `--timeout` at least two intervals below the time limit of the tool. On
  `timeout`, run `wait` again in the same turn.
- Use `wait` for all waiting. Do not use `sleep` loops or other polling.
- Only one `wait` runs per PR. A second `wait` exits at once with an error that gives the pid
  of the first. Then end the turn. The first `wait` starts the next round when it exits. If you
  cannot find that background task, run `kill <pid>` and start `wait` again.
- **Optional `/goal`.** In Claude Code, give the user this line to paste. `/goal` is a user
  command, so you cannot set it yourself.

  ```text
  /goal The babysit-pr run for <PR url> wrote its final report: the PR is clean on its head commit, merged, or closed, or the user told it to stop.
  ```

## Guardrails

Stop and ask when one of these conditions occurs:

- The run reaches the round limit.
- The same finding appears again after a fix.
- A finding says that the goal or the approach of the PR is wrong.
- The PR looks obsolete, for example an overlapping PR already merged the change.
- A rebase conflict needs a judgment call.
- A reviewer ignores two triggers in a row.
- `gates.reviewDecisionOk` is the only false gate, and each relevant reviewer is clean on head.
  An old `CHANGES_REQUESTED` review then blocks the PR. Find its author with
  `gh pr view <N> --repo <owner/name> --json latestReviews`. Only that author can clear it.

To stop and ask, use `AskUserQuestion`. A question in a normal message looks like a finished
run, and the user can miss it. Put the PR url, the blocker, and the options in the question. Put
your recommendation first. If no question tool exists, or the prompt returns no answer, write
the final report and start it with the question. Leave the PR open and unmerged.

Always obey these rules:

- Never merge without `--merge`. With `--merge`, merge only when the PR is done. Use the merge
  method of the repo. If you cannot find the method, ask.
- Right before a merge, run `git fetch` and a new `snapshot`. Merge only when that snapshot
  meets the definition of done on the same `head.oid`.
- Never use `--admin` or another bypass of branch protection.
- Never close a PR without asking.
- Post no filler comments. If nothing changed, post nothing on the PR.
- Send a `PushNotification` each time you stop and ask, and each time you write the final
  report.

## Final report

- PR url, and rounds used out of the limit.
- Per round: what you fixed, with commit shas.
- Declined findings, each with its reason. Mark the ones that are follow-ups.
- Waived checks, each with its reason.
- Status: "ready to merge", "merged", or "stopped" with the reason or the question.
