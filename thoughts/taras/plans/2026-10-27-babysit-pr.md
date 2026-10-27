---
date: 2026-10-27
author: Claude (with Taras)
topic: "babysit-pr skill + tackle-gh-comments adaptation"
status: completed
autonomy: autopilot
research: thoughts/taras/research/2026-10-27-babysit-pr-goal-loop.md
---

# babysit-pr Implementation Plan

## Overview

Add a `babysit-pr` skill to the `desplega` plugin. It keeps a PR moving (CI fixes, review
findings, re-triggered reviewers, rebases) until the PR is clean on its head commit. Adapt
`tackle-gh-comments` so it sees findings outside review threads and links to the new skill.

- **Motivation**: today "re-request review + tackle comments" is one sweep and stops. Taras wants a
  goal-like loop that ends only when the PR is approved (bots clean + required checks green).
- **Related**: `cc-plugin/base/skills/tackle-gh-comments/`,
  https://gist.github.com/tomasdev/8c950704330abbf34077b3b2039d27ff,
  `thoughts/taras/research/2026-10-27-babysit-pr-goal-loop.md`

## Current State Analysis

- `tackle-gh-comments/SKILL.md:14-25` is a single sweep: fetch, verify, fix, reply, resolve,
  verify, push. Its done state is threads only (`SKILL.md:118-121`). Bot re-reviews are a trap note
  with no wait and no stop rule (`SKILL.md:111-112`).
- `tackle-gh-comments/scripts/gh-pr-comments.ts` reads `reviewThreads` only
  (`THREADS_QUERY`, `:105-124`). It cannot see review bodies (desplega-bot puts "Changes needed"
  there), bot summary issue comments (Codex), checks, `reviewDecision`, or `mergeStateStatus`.
- The script runs its CLI `switch` at module top level (`:243-292`), so another script cannot
  import its helpers (`graphql` `:65`, `context` `:86`, `fetchThreads` `:126`) without running it.
  Bun 1.4.3 supports `import.meta.main` (checked: prints `true` when run directly).
- No `commands/tackle-gh-comments.md`, although the skill description promises
  `/tackle-gh-comments` (`SKILL.md:3`).
- Nothing else in `cc-plugin/**` handles PRs, CI, re-review, or waiting on external events.
- `implementing/SKILL.md:197` and `v-implementing/SKILL.md:167` hand PR comments to
  `tackle-gh-comments`.
- Plugin version `2.7.4` in `cc-plugin/base/.claude-plugin/plugin.json:4`. There is no root
  `plugin.json` for this plugin, and `marketplace.json` has no version field.
- `claude plugin validate cc-plugin/base` passes today ("Validation passed with warnings").
- Real-repo facts that shape the code (research section 5):
  - `reviewDecision` is `null` when a repo has no required-review rule.
  - `desplega-ai/ai-toolbox` has zero required checks (only non-required Vercel status contexts,
    checked on #42).
  - Reviewers differ per repo and company. desplega-ai uses `desplega-bot` (comment trigger,
    formal `APPROVED`), Codex (`@codex review`), Copilot (formal re-request). None re-reviews on
    push.

## Desired End State

- `/desplega:babysit-pr [PR] [--merge] [--max-rounds N]` runs a round loop in the current session.
  Each round ends with a background `wait` or a final report. It stops when the PR is clean on
  head, when max rounds is reached, or on a stop-and-ask condition. It merges only with `--merge`.
- `babysit-pr/scripts/pr-state.ts` gives `snapshot`, `wait`, and `rerequest`. It reports facts. The
  agent makes judgment calls (reviewer relevance, triggers, "is this finding addressed").
- No reviewer is hardcoded. The skill discovers reviewers and their triggers from the PR history,
  bot footers, and repo docs.
- `tackle-gh-comments` shows findings outside threads, links to `babysit-pr`, and has a
  `/tackle-gh-comments` command.
- Plugin version `2.8.0`. README lists the new skill and both commands.

## What We're NOT Doing

- No Stop hook and no state file (Taras decision: prose-only loop contract). If early exits show
  up in real use, a gated Stop hook modelled on `hooks/plan_checkbox_stop.py` is the follow-up.
- No `/goal` integration in code. SKILL.md only offers an optional `/goal` line.
- No `Monitor`, `/loop`, or `ScheduleWakeup` (the latter two are denied on Taras's machine).
- No hardcoded reviewer table. One exception: the gh CLI alias `@copilot` for GitHub's own
  `copilot-pull-request-reviewer` bot. That is a gh CLI quirk, not a company reviewer.
- No cloud runner (`/autofix-pr`, swarm task). The loop runs in the session that owns the PR.
- No change to `verify` semantics in `gh-pr-comments.ts` (threads only).

## Implementation Approach

- Phase 1 makes `gh-pr-comments.ts` importable and adds outside-thread findings, so Phase 2 reuses
  one auth and GraphQL path instead of copying it.
- Phase 2 builds `pr-state.ts` and proves it against real, already-merged or failing PRs with
  read-only calls.
- Phase 3 writes the prose (SKILL.md, commands, README, cross-links) and bumps the version.
- Proof of work is read-only GraphQL runs against known PRs (desplega-ai/ai-toolbox#38,
  desplega-ai/agent-swarm#2339, #1083, #2484). Write actions (comments, re-requests, pushes) are
  covered by `--dry-run` and by the Manual E2E on a real PR.
- Scope check: this is 3 phases in one subsystem, close to the `/one-shot` threshold. A full plan
  is still the better fit, because `wait` has real edge cases (settle window, own-activity filter,
  transient errors) that need explicit checks.

## Quick Verification Reference

```bash
T=cc-plugin/base/skills/tackle-gh-comments/scripts/gh-pr-comments.ts
P=cc-plugin/base/skills/babysit-pr/scripts/pr-state.ts
bun build $T --target=bun --outfile=/tmp/babysit-build/t.js     # parse + resolve imports
bun build $P --target=bun --outfile=/tmp/babysit-build/p.js
claude plugin validate cc-plugin/base
```

---

## Phase 1: Make tackle-gh-comments importable and show findings outside threads

### Overview

`gh-pr-comments.ts` exports its helpers without running its CLI on import, prints findings that
live outside review threads, and has a `findings` JSON command. `/tackle-gh-comments` exists.

### Changes Required:

#### 1. Importable script
**File**: `cc-plugin/base/skills/tackle-gh-comments/scripts/gh-pr-comments.ts`
**Changes**:
- Wrap the CLI `switch` (`:243-292`) in `if (import.meta.main) { ... }`.
- `export` `graphql`, `context`, `fetchThreads`, the types, and the new `fetchFindings`.

#### 2. Findings outside threads
**File**: same script
**Changes**:
- New GraphQL query for: `viewer { login }`, PR `author`, `headRefOid`, head commit
  `committedDate`, `reviews(last: 50) { id author{login __typename} state body submittedAt url
  commit{oid} }`, `comments(last: 100) { id author{login __typename} body createdAt url }`.
- `fetchFindings(ctx, { all })` returns review bodies and issue comments that are non-empty and not
  by the viewer. Without `--all`: only reviews on `headRefOid` and comments created after the head
  commit's `committedDate`.
- `list` prints a second section, "Findings outside threads", after the threads (author, kind,
  url, body truncated to 1,500 characters with the url for the rest).
- New `findings` command prints the same data as JSON. `json` keeps its current output (threads
  array) so nothing that parses it breaks.
- Update the header usage comment (`:9-17`).

#### 3. SKILL.md
**File**: `cc-plugin/base/skills/tackle-gh-comments/SKILL.md`
**Changes**:
- Commands block: add `bun $SKILL findings`.
- Loop step 1: "Fetch: `list` the unresolved threads and the findings outside threads."
- "Traps": replace the "A bot re-reviews after each push" bullet with: re-run `list` after the push
  settles for one more sweep, and "To keep going until the PR is approved (re-trigger reviewers,
  wait, fix CI, repeat), use `desplega:babysit-pr`."
- Reply guidance: findings outside threads have no thread to resolve. Answer them with one PR
  comment that names each finding and its outcome.

#### 4. Command wrapper
**File**: `cc-plugin/base/commands/tackle-gh-comments.md` (new)
**Changes**: same structure as `commands/question.md`: frontmatter (`description`,
`model: inherit`, `argument-hint: "[PR number]"`), "ALWAYS invoke the `desplega:tackle-gh-comments`
skill", example usage.

### Success Criteria:

#### Automated Verification:
- [x] Script parses and resolves: `bun build cc-plugin/base/skills/tackle-gh-comments/scripts/gh-pr-comments.ts --target=bun --outfile=/tmp/babysit-build/t.js`
- [x] Import does not run the CLI and exposes helpers: `cd cc-plugin/base/skills/tackle-gh-comments/scripts && bun -e 'const m = await import("./gh-pr-comments.ts"); console.log(["graphql","context","fetchThreads","fetchFindings"].every(k => typeof m[k] === "function"))'` prints `true` and nothing else
- [x] `json` output shape unchanged: `bun cc-plugin/base/skills/tackle-gh-comments/scripts/gh-pr-comments.ts json --repo desplega-ai/agent-swarm --pr 2339 | jq -e 'type == "array"'`
- [x] `findings --all` returns desplega-bot review bodies: `bun cc-plugin/base/skills/tackle-gh-comments/scripts/gh-pr-comments.ts findings --repo desplega-ai/agent-swarm --pr 2339 --all | jq -e 'map(select(.author == "desplega-bot" and .kind == "review")) | length > 0'`
- [x] `findings --all` returns the Codex summary comment: `bun cc-plugin/base/skills/tackle-gh-comments/scripts/gh-pr-comments.ts findings --repo desplega-ai/agent-swarm --pr 2339 --all | jq -e 'map(select(.body | contains("codex"))) | length > 0'`
- [x] Command file exists with the wrapper frontmatter: `grep -q '^model: inherit$' cc-plugin/base/commands/tackle-gh-comments.md`
- [x] SKILL.md links forward: `grep -q 'desplega:babysit-pr' cc-plugin/base/skills/tackle-gh-comments/SKILL.md`
- [x] Plugin still validates: `claude plugin validate cc-plugin/base`

#### Automated QA:
- [x] Run `list --all` on desplega-ai/agent-swarm#2339 and on desplega-ai/ai-toolbox#38. Confirm by reading the output that the threads section is unchanged in format and the new section shows the review bodies and bot comments with urls, with no comment by the gh viewer.

#### Manual Verification:
- [ ] Taras reads the new SKILL.md text for the outside-thread reply rule and the babysit-pr link.

**Implementation Note**: After this phase, pause for manual confirmation. Commit per phase is not configured (Autopilot); Taras handles commits unless he asks otherwise.

---

## Phase 2: `pr-state.ts` (snapshot, wait, rerequest)

### Overview

`cc-plugin/base/skills/babysit-pr/scripts/pr-state.ts` exists. It imports the helpers from
`gh-pr-comments.ts` and gives three commands that report facts for the loop.

### Changes Required:

#### 1. `snapshot`
**File**: `cc-plugin/base/skills/babysit-pr/scripts/pr-state.ts` (new)
**Changes**: one compact JSON object on stdout:
- `repo`, `number`, `url`, `state` (OPEN / MERGED / CLOSED), `isDraft`, `viewer`, `author`.
- `head { oid, committedDate }`, `base { ref, oid }`.
- `reviewDecision`, `mergeStateStatus`, `mergeable`.
- `checks { required: [...], optional: [...] }`. Each entry: `name`, `status`, `conclusion`.
  Covers `CheckRun` and `StatusContext`, with `isRequired(pullRequestNumber: N)`.
- `threads { unresolved, total }` (from `fetchThreads`).
- `findings`: fresh outside-thread findings (from `fetchFindings`), body cut to 300 characters.
- `reviewers`: one entry per account (not viewer, not PR author) that reviewed, commented, or was
  requested. Fields: `login`, `type` (`User` / `Bot`), `requestedNow` (in `reviewRequests`),
  `everRequested` (any `ReviewRequestedEvent`), `counts { reviews, threadComments, comments }`,
  `latest { kind, at, commitOid, onHead, state }`, `approvedOnHead`, `triggeredBy` (the most
  recent comment by someone else that mentions `@login`, posted before its latest activity:
  `author`, `at`, `excerpt`), `bodyTail` (last 300 characters of its latest body, where bots
  state their triggers).
- `gates`: `requiredChecksGreen`, `noUnresolvedThreads`, `upToDate` (not `BEHIND` / `DIRTY` /
  `CONFLICTING`), `reviewDecisionOk` (`null` or `APPROVED`). When the PR has zero required checks,
  `requiredChecksGreen` uses all checks and `checks.requiredCount` is `0`, so the agent knows.
  `UNKNOWN` merge state: retry the query up to 3 times, 2 s apart, before reporting it.

#### 2. `wait`
**File**: same script
**Changes**: `wait --since <oid> [--interval 60] [--timeout 2700] [--round N/M]`.
- Takes a baseline snapshot, then polls every `--interval` seconds.
- Exits 0 with one JSON line `{ event, detail, next }` on the first actionable change:
  `merged` / `closed`, `head-moved` (head oid differs from `--since`), `check-failed` (a check
  completed with a failing conclusion), `checks-done` (no pending check left), `review-activity`
  (new review, thread comment, or issue comment by anyone except the viewer), `merge-state`
  (became `BEHIND` / `DIRTY` / `CONFLICTING`), `timeout`.
- Settle window: after `review-activity`, poll one more interval before exiting, so a bot that
  posts a review and its threads in several calls is captured in one event.
- Ignores check transitions that are not terminal (queued to in_progress).
- `next` repeats the loop instruction, for example
  `"babysit-pr round 3/6 for desplega-ai/x#123: run snapshot and continue the loop"`.
- Transient GraphQL or network errors: retry with backoff. After 3 failures in a row, exit 1 with
  the error on stderr.

#### 3. `rerequest`
**File**: same script
**Changes**: `rerequest --reviewer <login> [--dry-run]` runs
`gh pr edit <N> --repo <o/n> --add-reviewer <login>` ("Add or re-request reviewers by their
login", `gh pr edit --help`). Maps the bot login `copilot-pull-request-reviewer` to `@copilot`
(gh CLI alias, comment in code says why). `--dry-run` prints the command and does not run it.
Comment-triggered reviewers need no command: the agent posts the trigger with `gh pr comment`.

### Success Criteria:

#### Automated Verification:
- [x] Script parses and resolves its import: `bun build cc-plugin/base/skills/babysit-pr/scripts/pr-state.ts --target=bun --outfile=/tmp/babysit-build/p.js`
- [x] Approved PR: `bun cc-plugin/base/skills/babysit-pr/scripts/pr-state.ts snapshot --repo desplega-ai/ai-toolbox --pr 38 | jq -e '.reviewDecision == "APPROVED" and .state == "MERGED" and (.reviewers | map(.login) | index("desplega-bot") != null)'`
- [x] Zero required checks reported: `bun cc-plugin/base/skills/babysit-pr/scripts/pr-state.ts snapshot --repo desplega-ai/ai-toolbox --pr 42 | jq -e '.checks.requiredCount == 0'`
- [x] Failing required check: `bun cc-plugin/base/skills/babysit-pr/scripts/pr-state.ts snapshot --repo desplega-ai/desplega.ai --pr 396 | jq -e '.gates.requiredChecksGreen == false and (.checks.required | map(.name) | index("CI Gate") != null)'` (changed during implementation: agent-swarm#2484 got a new head on 2026-10-27 and has no required check on it now)
- [x] Re-requested bot is discovered: `bun cc-plugin/base/skills/babysit-pr/scripts/pr-state.ts snapshot --repo desplega-ai/agent-swarm --pr 1083 | jq -e '.reviewers[] | select(.login == "copilot-pull-request-reviewer") | .everRequested == true and .type == "Bot"'`
- [x] Comment trigger is discovered: `bun cc-plugin/base/skills/babysit-pr/scripts/pr-state.ts snapshot --repo desplega-ai/agent-swarm --pr 2339 | jq -e '[.reviewers[] | select(.triggeredBy != null)] | length > 0'`
- [x] `wait` on a merged PR exits at once: `timeout 30 bun cc-plugin/base/skills/babysit-pr/scripts/pr-state.ts wait --repo desplega-ai/ai-toolbox --pr 38 --since 0000000 --interval 5 --timeout 20 | jq -e '.event == "merged"'` (changed during implementation: `wait` now rejects a `--since` shorter than 7 characters)
- [x] `wait` detects a moved head on an open PR: `N=$(gh pr list -R desplega-ai/agent-swarm --state open --limit 1 --json number -q '.[0].number'); timeout 30 bun cc-plugin/base/skills/babysit-pr/scripts/pr-state.ts wait --repo desplega-ai/agent-swarm --pr $N --since deadbeef --interval 5 --timeout 20 | jq -e '.event == "head-moved" and (.next | contains("babysit-pr"))'`
- [x] `wait` times out cleanly: `H=$(gh pr view $N -R desplega-ai/agent-swarm --json headRefOid -q .headRefOid); timeout 40 bun cc-plugin/base/skills/babysit-pr/scripts/pr-state.ts wait --repo desplega-ai/agent-swarm --pr $N --since $H --interval 5 --timeout 15 | jq -e '.event | IN("timeout","review-activity","check-failed","checks-done","merge-state")'` (reuse `$N` from the previous check)
- [x] `rerequest` maps the Copilot alias: `bun cc-plugin/base/skills/babysit-pr/scripts/pr-state.ts rerequest --repo desplega-ai/agent-swarm --pr 1083 --reviewer copilot-pull-request-reviewer --dry-run | grep -q -- '--add-reviewer @copilot'`
- [x] No reviewer name is hardcoded except the Copilot alias: `grep -n -i -E 'desplega-bot|codex|coderabbit|greptile|cubic' cc-plugin/base/skills/babysit-pr/scripts/pr-state.ts` prints nothing

#### Automated QA:
- [x] Run `snapshot` on desplega-ai/agent-swarm#2339 and read the JSON. Confirm: `reviewers` excludes the viewer and the PR author; deploy and CI bots appear only as plain facts (no classification in the script); `bodyTail` holds the Codex footer that names its trigger; output stays under ~8 KB.

#### Manual Verification:
- [ ] None. All checks are read-only and automated.

**Implementation Note**: After this phase, pause for manual confirmation.

---

## Phase 3: babysit-pr skill, command, cross-links, version bump

### Overview

`cc-plugin/base/skills/babysit-pr/SKILL.md` and `commands/babysit-pr.md` exist. The README lists
them, the implementing skills point to the loop, and the plugin is at `2.8.0`.

### Changes Required:

#### 1. SKILL.md
**File**: `cc-plugin/base/skills/babysit-pr/SKILL.md` (new)
**Changes**: prose, in this order:
- Frontmatter `name: babysit-pr` and a description with triggers: "babysit the PR", "watch the PR
  until it's approved", "keep going until approved", "monitor the PR", `/babysit-pr`.
- **Loop contract** (first section): a turn ends in exactly one of two ways: a background `wait`
  runs, or the final report is written. Never neither. When `wait` exits, start the next round.
- **Setup**: find the PR, read its goal (PR body + this conversation), set max rounds (default 6),
  note `--merge`.
- **One round**: `snapshot` → done check → rebase if `upToDate` is false → CI failures (read the
  logs, fix real failures, `gh run rerun --failed` once for an infra flake) → findings: follow
  `desplega:tackle-gh-comments` (verify, fix, reply, resolve, push last) → push once → re-trigger
  relevant reviewers → `wait` in the background.
- **Reviewer discovery**: classify each `snapshot.reviewers` entry as not-a-reviewer (deploy, CI,
  dependency bots), runs-on-push (activity on several heads with no trigger), formally requested
  (`rerequest`), or comment-triggered (reuse `triggeredBy`, then the trigger in `bodyTail`, then
  repo docs, then ask Taras once). Say that reviewer names differ per company; examples only.
- **Definition of done**: all `gates` true (with the zero-required-checks rule: a known unrelated
  failing check can be waived only with a written reason in the final report), and every relevant
  reviewer clean on head (approved, or its latest activity on head left no new finding).
- **Waiting**: Claude Code: `wait` with `run_in_background: true`. Harnesses without background
  re-invocation: run `wait` in the foreground with `--timeout` under the tool limit and loop.
  Optional: a ready `/goal` condition line for Taras to paste.
- **Guardrails / stop and ask**: max rounds; same finding returns after a fix; finding outside the
  PR's goal; PR looks obsolete; rebase conflict that needs judgment; a reviewer ignores two
  triggers in a row. Never merge without `--merge`. Never close a PR without asking. No filler
  comments. `PushNotification` on done and on every stop-and-ask.
- **Final report**: PR url, rounds used, what was fixed per round, declined findings with reasons,
  waived checks, and "ready to merge" or "merged".

#### 2. Command wrapper
**File**: `cc-plugin/base/commands/babysit-pr.md` (new)
**Changes**: `argument-hint: "[PR number] [--merge] [--max-rounds N]"`, "ALWAYS invoke the
`desplega:babysit-pr` skill", example usage.

#### 3. Cross-links
**Files**: `cc-plugin/base/skills/implementing/SKILL.md:197`,
`cc-plugin/base/skills/v-implementing/SKILL.md:167`
**Changes**: append "To keep the PR moving until it is approved, use `desplega:babysit-pr`."

#### 4. README and version
**Files**: `cc-plugin/base/README.md`, `cc-plugin/base/.claude-plugin/plugin.json`
**Changes**: README skills table gets a `babysit-pr` row after `tackle-gh-comments`. Commands
table gets `tackle-gh-comments` and `babysit-pr` rows. `plugin.json` version `2.7.4` → `2.8.0`.

### Success Criteria:

#### Automated Verification:
- [x] Skill frontmatter: `sed -n 2p cc-plugin/base/skills/babysit-pr/SKILL.md | grep -q '^name: babysit-pr$'`
- [x] Back-link to the inner step: `grep -q 'desplega:tackle-gh-comments' cc-plugin/base/skills/babysit-pr/SKILL.md`
- [x] Every script command named in SKILL.md exists: `for c in snapshot wait rerequest; do grep -q "\"$c\"" cc-plugin/base/skills/babysit-pr/scripts/pr-state.ts || echo "missing $c"; done` prints nothing
- [x] Loop contract present: `grep -q -i 'loop contract' cc-plugin/base/skills/babysit-pr/SKILL.md`
- [x] No em dashes in new or changed prose: `grep -n $'\xe2\x80\x94' cc-plugin/base/skills/babysit-pr/SKILL.md cc-plugin/base/commands/babysit-pr.md cc-plugin/base/commands/tackle-gh-comments.md` prints nothing
- [x] Version bumped: `jq -e '.version == "2.8.0"' cc-plugin/base/.claude-plugin/plugin.json`
- [x] README rows: `grep -c -E 'babysit-pr|tackle-gh-comments' cc-plugin/base/README.md` prints at least 4
- [x] Implementing pointers: `grep -l 'desplega:babysit-pr' cc-plugin/base/skills/implementing/SKILL.md cc-plugin/base/skills/v-implementing/SKILL.md | wc -l` prints 2
- [x] Plugin validates: `claude plugin validate cc-plugin/base`
- [x] Command file exists with the wrapper frontmatter: `grep -q '^model: inherit$' cc-plugin/base/commands/babysit-pr.md`

#### Automated QA:
- [x] Save the inputs: `bun cc-plugin/base/skills/babysit-pr/scripts/pr-state.ts snapshot --repo desplega-ai/agent-swarm --pr 2339 > /tmp/babysit-qa-2339.json` and the same for `--repo desplega-ai/ai-toolbox --pr 38 > /tmp/babysit-qa-38.json`.
- [x] Skill dry run with a fresh Sonnet sub-agent: give it only `babysit-pr/SKILL.md` and `/tmp/babysit-qa-2339.json`. Ask: "Round 1. List each action you take, in order, and how this turn ends." Pass when it: classifies reviewers from the JSON evidence (no names it could not see), re-triggers each comment-triggered reviewer with the trigger from `triggeredBy` or `bodyTail`, ends the turn with a background `wait`, and does not merge.
- [x] Second dry run with `/tmp/babysit-qa-38.json` (merged and approved). Pass when it writes a final report and starts no `wait`.

#### Manual Verification:
- [ ] Taras reads `babysit-pr/SKILL.md` end to end for tone and rules.

**Implementation Note**: After this phase, pause for manual confirmation, then run the Manual E2E.

---

## Implementation Notes (2026-10-27, Autopilot)

- Executors: Codex gpt-6.1-sol (Phase 1 script: medium, Phase 2 script: high). Prose by Claude. Codex sandbox has no
  GitHub access, so the orchestrator ran every live check.
- Phase 1 review fixes: `renderFindings()` helper, unused `author` dropped from the findings query, read limits in
  the header, done rule split into a checklist. Added on purpose: "every finding outside threads has an answer" in
  the tackle-gh-comments done rule (matches the new reply rule; `verify` stays threads-only).
- Phase 2 deviations from the plan:
  - `triggeredBy` also matches a mention of a hyphen-separated login part (4+ chars). Codex posts as
    `chatgpt-codex-connector` but answers to `@codex`. Without it, the #2339 trigger check fails.
  - `bodyTail` comes from the latest review or issue comment, not from a thread reply (bot footers live there).
  - The PR author stays in `reviewers` (with `isAuthor`) when it posted a review with a body. On agent-swarm#2339
    `desplega-bot` is both author and main reviewer.
  - Failing-required-check test moved to desplega-ai/desplega.ai#396 (`CI Gate`). agent-swarm#2484 got a new head
    with no required check.
  - `wait` also treats an edited comment or review (`updatedAt`) as activity. Reactions are not tracked.
  - `wait` accepts an abbreviated `--since` (7+ chars, prefix match) and rejects shorter values. `wait` polls a lighter
    query set than `snapshot`. `pr-state.test.ts` (bun test, mocked fetch, 24 tests) covers the `wait` edge cases.
  - `parseArgs` is now exported from `gh-pr-comments.ts` and shared.
- Phase 3 prose was drafted while Phase 2 ran, then given a strict STE pass.
- Phase 3 QA: agent-swarm#2339 is MERGED now, so the round-1 dry run used a copy of its snapshot with `state` set to
  OPEN (`/tmp/babysit-qa-2339-open.json`). It passed: reviewers classified from evidence, `desplega-bot` and Codex
  re-triggered with their `triggeredBy` text, turn ended with a background `wait`, no merge. The #38 dry run wrote a
  final report and started no `wait`.
- Phase 3 review fixes in SKILL.md: `AskUserQuestion` pauses a round (loop contract), findings step no longer
  contradicts "push one time", `--round N/M` defined, `gh pr checks` named to find run ids, `PushNotification` on every
  final report, new stop-and-ask when a stale `CHANGES_REQUESTED` review is the only blocker. Removed em dashes from
  the two changed cross-link lines.
- Not done: a gated Stop hook (follow-up per the Appendix). Reactions (for example a bot's thumbs-up) are not seen by
  `wait`. A clean re-review that only reacts shows up at the next `timeout`.

## Appendix

- **Follow-up plans**: gated Stop hook (`hooks/babysit_stop.py`, modelled on
  `plan_checkbox_stop.py`) if prose-only proves too weak in practice.
- **Derail notes**:
  - `stop_confirm.py` blocks at severe context pressure. A long babysit run grows context each
    round; the compact `snapshot` output is the main defence.
  - Stop-hook `background_tasks` entry shape is undocumented. Capture a payload before any future
    hook relies on it.
- **References**:
  - Research: `thoughts/taras/research/2026-10-27-babysit-pr-goal-loop.md`
  - Gist: https://gist.github.com/tomasdev/8c950704330abbf34077b3b2039d27ff
  - https://code.claude.com/docs/en/goal.md, https://code.claude.com/docs/en/hooks.md

---

## Manual E2E

Run against a real PR. These steps post comments and request reviews, so Taras confirms first.

1. Load the branch build of the plugin in a fresh session in the PR's checkout:
   `claude --plugin-dir /Users/taras/Documents/code/ai-toolbox/cc-plugin/base`
2. Dogfood on the PR for this feature:
   `gh pr create --draft --title "feat(cc-desplega): babysit-pr skill (v2.8.0)" --body-file /tmp/babysit-pr-body.md`
   (or reuse the open PR), then in the session: `/desplega:babysit-pr <PR#>`.
3. Observe round 1: `snapshot` output, reviewer classification, trigger comments posted (for
   desplega-ai: `@desplega-bot ...` and `@codex review`, discovered, not hardcoded), and a
   background
   `bun ${CLAUDE_PLUGIN_ROOT}/skills/babysit-pr/scripts/pr-state.ts wait --since <head-oid> --round 1/6`
   task. Check it with `bun cc-plugin/base/skills/babysit-pr/scripts/pr-state.ts snapshot --pr <PR#> | jq .gates`.
4. Keep chatting in the session while `wait` runs. Confirm the next round starts by itself when a
   reviewer posts (`review-activity` event).
5. Confirm a round fixes or declines each finding with a reply, pushes once, and re-triggers.
6. Confirm the loop ends with a final report and a `PushNotification` when the gates and reviewers
   are clean, and that it does not merge (no `--merge`).
7. CI-failure path: in a desplega-ai/agent-swarm checkout,
   `git switch -c qa/babysit-ci-fail && <break one test> && git commit -am "qa: break a test" && git push -u origin qa/babysit-ci-fail && gh pr create --draft --fill`,
   then run
   `/desplega:babysit-pr <PR#> --max-rounds 2`, and confirm it reads the logs, fixes, and pushes.
   Close it afterwards: `gh pr close <PR#> --delete-branch`.
8. Codex harness smoke test (optional): in `codex`, ask it to babysit the same PR and confirm it
   runs `wait` in the foreground and loops.
9. Clean up: `rm -rf /tmp/babysit-build /tmp/babysit-qa-*.json /tmp/babysit-pr-body.md`.
