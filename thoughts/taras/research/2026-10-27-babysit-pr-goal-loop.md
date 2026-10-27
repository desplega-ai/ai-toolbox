---
date: 2026-10-27T11:46:54+01:00
researcher: Claude (with Taras)
git_commit: 9484fbdd18896f2c3d97841b4578486056dad980
branch: main
repository: desplega-ai/ai-toolbox
topic: "babysit-pr: turn tackle-gh-comments into a goal loop that runs until the PR is approved"
tags: [research, cc-plugin, base, tackle-gh-comments, babysit-pr, github, review-bots, hooks, monitor]
status: complete
autonomy: autopilot
last_updated: 2026-10-27
last_updated_by: Claude
---

# Research: babysit-pr goal loop

**Date**: 2026-10-27 11:46 BCN
**Researcher**: Claude (with Taras)
**Git Commit**: 9484fbd
**Branch**: main

## Research Question

Adapt `cc-plugin/base/skills/tackle-gh-comments/` and add a new skill `babysit-pr`, based on
https://gist.github.com/tomasdev/8c950704330abbf34077b3b2039d27ff. Today, "ask for re-review +
tackle comments" does one sweep and stops. It should be a goal-like process that keeps going
until the PR is approved. Research the existing skill, the gist, and the Claude Code
mechanisms for looping, then propose an approach.

## Summary

`tackle-gh-comments` is a single sweep by design. Its done state is "no unresolved threads and the
branch is pushed". It reads only review threads, so it cannot see CI, approval state, review
bodies, or bot summary comments. It treats bot re-reviews as a trap note, with no wait and no
stop rule. Nothing else in `cc-plugin/**` deals with PRs, CI, or waiting on external events. The
gist adds the missing parts as prose: CI and flake triage, act only on activity newer than the
latest push, rebase on `main`, scope guard, quiet when idle, and an explicit stop condition
(bots and required checks green on the latest commit, merge only on request).

Claude Code 2.1.311 has the parts for a real goal loop. `/goal` is a built-in prompt Stop hook,
but a skill cannot set it and its evaluator reads only the transcript. A command `Stop` hook in
skill frontmatter can check live GitHub state. This plugin already uses that pattern
(`plan_checkbox_stop.py`). Skill hooks stay registered for the rest of the session, so the hook
must gate itself on a state file. Waiting fits background Bash (the harness re-invokes Claude
when the command exits) or `Monitor` (max 30 minutes). `/loop` and `ScheduleWakeup` are denied
on this machine.

On desplega-ai PRs, the reviewers are `desplega-bot` (formal `APPROVED`, triggered by comment),
Codex (never approves, `@codex review`, machine-readable state marker), and Copilot (never
approves, re-request with `--add-reviewer @copilot`). None of the three re-reviews on push, so the
loop must re-trigger each one. `reviewDecision` is `null` on repos without a required-review rule.
So "done" must combine required checks, unresolved threads, and per-reviewer state on
`headRefOid`, not `reviewDecision` alone.

## Detailed Findings

### 1. Existing skill: `tackle-gh-comments`

- Skill file: `cc-plugin/base/skills/tackle-gh-comments/SKILL.md` (121 lines). Script:
  `cc-plugin/base/skills/tackle-gh-comments/scripts/gh-pr-comments.ts` (292 lines, Bun).
- Scope is review threads only. The loop is: fetch, verify each claim, fix, reply, resolve,
  verify, push (`SKILL.md:14-25`). "Push last. A thread that resolves before the fix is pushed
  reads as dismissed." (`SKILL.md:25`)
- The re-review case is a "Trap", not a loop step: "A bot re-reviews after each push and can
  open new threads. Re-run `list` after the push settles, and handle the new ones the same
  way." (`SKILL.md:111-112`). Nothing tells the agent how long to wait or when to stop
  waiting.
- Definition of done is single-sweep: "`bun $SKILL verify` exits 0, every thread has a
  substantive reply, the fixes are committed, and the branch is pushed." (`SKILL.md:118-121`).
  Approval state, CI state, and new bot activity after the push are outside the definition.
- Script commands: `list`, `json`, `reply`, `resolve`, `handle` (reply + resolve), `verify`
  (`gh-pr-comments.ts:9-14`, switch at `:243-292`).
- Data source is GraphQL only, authenticated with `gh auth token` (`gh-pr-comments.ts:59-83`).
  `THREADS_QUERY` reads `reviewThreads` with `id isResolved isOutdated path line` and
  comments `id author{login} body createdAt url` (`gh-pr-comments.ts:105-124`).
- The script does NOT read: review states (`reviews`, `latestReviews`, `reviewDecision`),
  issue comments (top-level PR conversation, where many bots post summaries), check runs /
  `statusCheckRollup`, head commit oid/date, `mergeStateStatus`, or `reviewRequests`. It has
  no "re-request review" command.
- `reply` uses `addPullRequestReviewThreadReply` (`:186-195`). `resolve` uses
  `resolveReviewThread` (`:197-206`).
- Repo/PR inferred from checkout via `gh repo view` / `gh pr view`, overridable with `--repo`
  and `--pr` (`gh-pr-comments.ts:86-103`).

### 2. The gist: "Theo's Babysit PR Skill"

Source: https://gist.github.com/tomasdev/8c950704330abbf34077b3b2039d27ff (one file,
`SKILL.md`, 1658 bytes). It is prose only, no scripts. Key rules, verbatim:

- Trigger: "Monitor a pull request through review and CI. Use when the user asks to monitor,
  watch, or babysit a PR."
- Waiting: "If your harness offers tools to monitor a PR, use them so you can respond when
  comments arrive. Otherwise, poll the PR for new comments and checks."
- Freshness: "Only act on checks and comments newer than the latest push."
- Verification: "Verify every bot finding against the source before changing code. Fix real
  findings and CI failures, distinguish repository failures from infrastructure flakes, and
  reply with a written reason when dismissing false positives."
- Base branch: "Keep an eye on changes to `main` and rebase when needed. If an overlapping PR
  makes this one obsolete, stop monitoring, report it to the user, and ask before closing the
  PR unless closure was explicitly authorized."
- Scope: "Do not let review feedback expand the PR beyond the user's original goal."
- Noise: "If nothing has changed, stay quiet rather than posting filler comments."
- Stop condition: "Stop when the review bots and required checks are green on the latest
  commit. Merge only when the user explicitly requested it; otherwise report that the PR is
  ready."
- It references two skills we do not have under those names: `leaving-pr-comments` and
  `file-upload`. Our equivalents: `tackle-gh-comments` (reply/resolve) and agent-fs
  screenshot uploads (global CLAUDE.md browser/screenshot rule).
- Metadata: `harness: [claude, codex]`, `scope: fleet`.

Overlap with `tackle-gh-comments`: verify-before-fix, reply-on-decline, resolve. New in the
gist: CI failures + flake triage, freshness against latest push, rebase on `main`,
obsolescence check, scope guard, quiet-when-idle, explicit stop condition, merge gating.

### 3. Claude Code loop mechanisms

Installed version: Claude Code `2.1.311`. `~/.claude/settings.json` has no `disableAllHooks` and
no goal or stop-hook env overrides. Sources fetched 2026-10-27.

**`/goal` (built in).** https://code.claude.com/docs/en/goal.md

- "The `/goal` command sets a completion condition and Claude keeps working toward it without
  you prompting each step. After each turn, a model checks whether the condition holds."
- "`/goal` is a wrapper around a session-scoped prompt-based Stop hook. Each time Claude
  finishes a turn, Claude Code sends the condition and the conversation so far to your
  configured small fast model." Verdicts: not yet met, met, impossible.
- "It doesn't run commands or read files independently, so write the condition as something
  Claude's own output can demonstrate."
- "One goal can be active per session." Syntax: `/goal <condition>`, `/goal`, `/goal clear`.
  Max condition length 4,000 characters (sub-agent report).
- "If Claude keeps answering the evaluator without making progress (no tool use for several
  turns in a row), Claude Code stops the loop, prints a warning, and returns control to you
  with the goal still set."
- Waiting: evaluation is skipped while a background shell or sub-agent runs. "Once background
  work has kept the goal waiting for 30 minutes, a check-in is due ... Claude Code waits twice
  as long before each later check-in, up to four times the first interval."
- No documented way for a skill or for Claude to set a goal. It is a user slash command.
  (Built-in CLI commands are not invocable through the Skill tool.)
- Codex CLI also has `/goal <objective>` with `/goal edit|pause|resume|clear`
  (https://developers.openai.com/codex/cli/slash-commands, sub-agent report). How Codex checks
  the end condition: UNVERIFIED.

**Stop hooks (command type).** https://code.claude.com/docs/en/hooks.md

- `{"decision":"block","reason":"..."}`. "`reason` | Required when `decision` is `"block"`.
  Tells Claude why it should continue."
- Input has `stop_hook_active`, `last_assistant_message`, `background_tasks`.
- Block cap (sub-agent report, hooks-guide): "Claude Code overrides a Stop hook after it blocks
  eight times in a row with no tool call from Claude in between." Tunable with
  `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP`.
- A command hook can run `gh` itself, so unlike `/goal` it can judge real GitHub state instead
  of the transcript.

**Skill-frontmatter hooks** (verified in hooks.md "Hooks in skills and agents"):

- "Skill hooks: Claude Code registers them when you or Claude invoke the skill and keeps
  running them for the rest of the session, on turns after the skill's own turn as well. To
  have Claude Code remove a hook after its first successful run instead, set `once: true`."
- Consequence: a `Stop` hook declared by a `babysit-pr` skill stays registered after the PR is
  done. It must gate itself on a state file (same pattern as `plan_checkbox_stop.py`, which only
  blocks while an active plan has open items).
- Subagent-frontmatter hooks are scoped to the sub-agent run, and `Stop` becomes `SubagentStop`.

**Monitor tool.** https://code.claude.com/docs/en/tools-reference.md

- "Runs a command in the background and feeds each output line back to Claude, so it can react
  to log entries, file changes, or polled status mid-conversation." The docs list "Poll a PR or
  CI job and report when its status changes" as a use case.
- Deadline: "5 minutes by default, at most 30 minutes, and at most 10 minutes in a
  non-interactive run given a single prompt with `-p`." Claude gets one notice at the deadline
  and can restart the watch.

**Background Bash.** `run_in_background: true`. Local interactive sessions: no duration limit.
Unattended (`-p`, SDK, CI): 30 minutes default, max 2 hours. The harness re-invokes Claude when
the command exits (this session's Bash tool contract: "keeps running across turns and
re-invokes you when it exits").

**`/loop`, `ScheduleWakeup`, Cron.** Bare `/loop` runs a built-in maintenance prompt: "tend to
the current branch's pull request: review comments, failed CI runs, merge conflicts". Self-paced
loops use `ScheduleWakeup` (1 minute to 1 hour). Denied on Taras's machine (section 6).

**`/autofix-pr` (built in, cloud).** "Spawn a cloud session that watches the current branch's PR
and pushes fixes when CI fails or reviewers leave comments." Needs cloud sessions + the Claude
GitHub App. "It cannot react to merge conflicts", and it does not re-request review or wait for
approval (sub-agent report, https://code.claude.com/docs/en/claude-code-on-the-web.md).

**`PushNotification`.** "Sends a desktop notification, and a phone push when Remote Control is
connected". Kept enabled on this machine.

### 4. Repo patterns (hooks, PR-related skills, conventions)

- **History**: the skill landed in `2607264` (2026-08-01) "feat(cc-desplega): add
  tackle-gh-comments skill, sync delegate-work to Opus 5 (v2.2.0)". One commit, never changed.
- **Callers**: `implementing/SKILL.md:197` and `v-implementing/SKILL.md:167`: "If the work ships
  as a GitHub PR: once review comments land, address them with `desplega:tackle-gh-comments`".
  `cc-plugin/base/README.md:136` lists it.
- **No command wrapper**: there is no `commands/tackle-gh-comments.md`, although the skill
  description says "or invokes /tackle-gh-comments" (`SKILL.md:3`). Wrapper convention
  (`commands/question.md`): frontmatter `description`, `model: inherit`, `argument-hint`; body
  "ALWAYS invoke the `desplega:<skill>` skill"; `## Example Usage`.
- **Nothing else in `cc-plugin/**` handles PRs, CI, `gh run`, `reviewDecision`,
  `requestReviews`, or re-review.** No sleep loops, no `Monitor` usage anywhere.
- **Waiting today** is done with background sub-agents (`Agent` + `run_in_background: true`,
  `phase-running/SKILL.md:18`) and background Bash with `timeout: 600000`
  (`file-review/skills/file-review/SKILL.md:109`, `delegate-work/SKILL.md:87`).
- **Script paths**: skills use `${CLAUDE_PLUGIN_ROOT}/skills/<name>/scripts/...`
  (`tackle-gh-comments/SKILL.md:30`, `delegate-work/SKILL.md:75`). `${CLAUDE_SKILL_DIR}` is
  not used anywhere.
- **Plugin-level hooks** (`cc-plugin/base/.claude-plugin/plugin.json:18-50`): `PreToolUse`
  `validate-thoughts.py`, `UserPromptSubmit` `context_warn.py`, `Stop` `stop_confirm.py`.
- **`stop_confirm.py`**: blocks Stop only at severe context pressure so Claude confirms with
  the user. Exits 0 when `stop_hook_active` is set (`:31`). Throttles once per level via
  `stop_blocked_at` in session state (`:48-52`). Output:
  `{"decision":"block","reason": ...}` (`:54-64`).
- **Skill-scoped hooks already exist in this plugin.** `implementing`, `v-implementing`,
  `phase-running`, `step-running` declare `hooks:` in SKILL.md frontmatter
  (`implementing/SKILL.md:4-14`):

  ```yaml
  hooks:
    PostToolUse:
      - matcher: "Edit|Write"
        hooks:
          - type: command
            command: "${CLAUDE_PLUGIN_ROOT}/hooks/plan_checkbox_reminder.py"
    Stop:
      - hooks:
          - type: command
            command: "${CLAUDE_PLUGIN_ROOT}/hooks/plan_checkbox_stop.py"
  ```

  `plan_checkbox_stop.py` is the closest precedent for a goal gate: it checks
  `stop_hook_active` (`:41`), reads `session_id` and `cwd`, and blocks with "Cannot stop yet.
  The active plan has unchecked automated verification items in started phases." while items
  remain (`:82-91`).
- **thoughts/**: no prior research on PR review, babysitting, or goal loops. Related:
  `thoughts/taras/research/2026-03-11-claude-code-hooks-system.md`,
  `thoughts/taras/plans/2026-02-19-plan-checkbox-hook.md` ("Stop hooks use
  `decision: "block"` + `reason` and support `stop_hook_active` to prevent infinite loops").
- **Marketplace**: `.claude-plugin/marketplace.json:11-15`, `"name": "desplega"`,
  `"source": "./cc-plugin/base"`. No in-repo wiring that exposes base skills to Codex.

### 5. GitHub signals (review bots, re-request, done state)

Read-only sample: 30 recent PRs across ai-toolbox, agent-swarm, agent-fs, context-mode,
desplega.ai, agent-swarm-internal (plus `gh search prs --owner desplega-ai "commenter:app/<bot>"`).

**Review bots on desplega-ai PRs**

| Reviewer | Posts as | Approves? | Re-runs after push? | How to re-trigger | "Done on head" signal | Evidence |
|---|---|---|---|---|---|---|
| `desplega-bot` (swarm reviewer, a `User`, not a `Bot`) | Formal reviews, inline threads, issue comments | Yes, formal `APPROVED` | No, only when asked | Issue comment `@desplega-bot pls do a review round` | `APPROVED` review whose `commit.oid == headRefOid`. Ack comment "On it. Reviewer is running a review round..." while running | ai-toolbox#38 (`reviewDecision: APPROVED`, verified), agent-swarm#2339 |
| Codex (`chatgpt-codex-connector`) | `COMMENTED` review + inline threads + summary issue comment | No (👍 reaction when clean) | No: runs on open, draft-to-ready, or `@codex review` | Comment `@codex review` ("Use the exact trigger `@codex review`", developers.openai.com/codex/integrations/github) | Machine-readable marker `<!-- codex-review-state:v1 {"code_review":{"commit_sha":...,"has_unresolved_findings":...,"status":"completed"}} -->` | agent-swarm#2339, ai-toolbox#38 |
| Copilot (`copilot-pull-request-reviewer`) | `COMMENTED` review + inline threads | No | No, unless the ruleset has "review new pushes" | `gh pr edit N --add-reviewer "@copilot"` (verified in `gh pr edit --help`: "Add or re-request reviewers by their login. Use "@copilot" to request review from Copilot.") | Review on head with body "generated no new comments". Pending `reviewRequests` Bot entry while running | agent-swarm#1083 (re-requested 7 times, each review about 1 min later) |
| Superagent security | `COMMENTED` review + check runs | No | Yes, automatic | n/a | Check run conclusion | agent-swarm#2484 |
| `claude[bot]`, `cubic-dev-ai` | Issue comments / reviews | No formal approve | UNVERIFIED | UNVERIFIED | UNVERIFIED | Last seen Dec 2025 / May 2025 only |

No `coderabbitai` or `greptile-apps` activity in the org. Parsing trap: REST logins carry a
`[bot]` suffix, GraphQL logins do not (`__typename: Bot`).

**Re-request mechanics**

- Humans and Copilot: `gh pr edit N --add-reviewer <login|@copilot>`. REST re-request:
  `POST /repos/{o}/{r}/pulls/{n}/requested_reviewers/rerequest`.
- GraphQL `requestReviews(pullRequestId, userIds, botIds, teamIds, union)`. No `reRequest` field
  (introspected).
- Codex and `desplega-bot` never re-run on push. The loop must post their trigger comment.

**Done signals** (GraphQL on the PR)

- `reviewDecision`: `APPROVED | CHANGES_REQUESTED | REVIEW_REQUIRED`, and `null` when the repo
  has no required-review rule. So "wait for APPROVED" cannot be the only gate.
- `latestReviews { author state commit { oid } }`: per-reviewer latest state, compare with
  `headRefOid` for freshness.
- Checks: `statusCheckRollup.state` is `SUCCESS` only when ALL checks pass, including
  non-required ones (Vercel fails on fork PRs, not required). Required-only:
  `isRequired(pullRequestNumber: N)` per context, or `gh pr checks N --required` (verified: exit 1
  on a failing required check). Required checks seen in the org: `CI Gate`, `Merge Gate`, `ci`,
  `e2e`, `fuse-smoke`.
- `gh pr checks --watch` blocks until checks finish, `--fail-fast` exits on the first failure.
  Exit code 8 = checks pending. `--watch` exit code on failure: UNVERIFIED.
- Rebase need: `mergeStateStatus` `BEHIND` ("The head ref is out of date") or `DIRTY`, or
  `mergeable: CONFLICTING`. `UNKNOWN` means GitHub is still computing: poll again.
- Freshness: `pushedDate` is null (deprecated). Use `headRefOid`. Reviews are fresh when
  `commit.oid == headRefOid`. Issue comments have no oid: compare `createdAt` with the time the
  loop pushed, or parse the commit sha the bot states (Codex marker, desplega-bot "at `320c2fe`").
- Findings can live outside review threads: `desplega-bot` puts "Changes needed" in the review
  body, Codex puts a summary in an issue comment. `gh-pr-comments.ts` reads threads only.

### 6. Machine constraints

- `~/.claude/context-trim.md`: `ScheduleWakeup`, `CronCreate`, `CronDelete`, `CronList` are in
  `permissions.deny` since 2026-07-09. "The Cron/ScheduleWakeup group only backs `/loop` and
  `/schedule`, both bundled skills we just disabled." So `/loop` and timed wake-ups are not
  available in Taras's sessions unless that is rolled back.
- Kept: `PushNotification`, `SendMessage`, `Monitor` (deferred tool, present in this session),
  `Workflow` (re-enabled 2026-08-03).

## Code References

| File | Line | Description |
|------|------|-------------|
| `cc-plugin/base/skills/tackle-gh-comments/SKILL.md` | 14-25 | Single-sweep loop |
| `cc-plugin/base/skills/tackle-gh-comments/SKILL.md` | 111-112 | Re-review handled as a trap note |
| `cc-plugin/base/skills/tackle-gh-comments/SKILL.md` | 118-121 | Definition of done (threads only) |
| `cc-plugin/base/skills/tackle-gh-comments/scripts/gh-pr-comments.ts` | 105-124 | GraphQL threads query |
| `cc-plugin/base/skills/tackle-gh-comments/scripts/gh-pr-comments.ts` | 243-292 | CLI commands |
| `cc-plugin/base/skills/implementing/SKILL.md` | 4-14 | Skill-frontmatter `hooks:` syntax (PostToolUse + Stop) |
| `cc-plugin/base/hooks/plan_checkbox_stop.py` | 41, 82-91 | Gated Stop hook precedent: `stop_hook_active`, block reason |
| `cc-plugin/base/hooks/stop_confirm.py` | 31, 48-64 | Plugin Stop hook for context pressure, throttle state |
| `cc-plugin/base/.claude-plugin/plugin.json` | 4, 18-50 | Version 2.7.4, plugin-level hooks |
| `cc-plugin/base/skills/implementing/SKILL.md` | 197 | Caller: hands PR comments to tackle-gh-comments |

## Appendix

- **Historical context (from thoughts/)**:
  - `thoughts/taras/plans/2026-02-19-plan-checkbox-hook.md` — Stop hook with `decision: block` and `stop_hook_active`
  - `thoughts/taras/research/2026-03-11-claude-code-hooks-system.md` — hooks system research

## Proposal (requested by Taras)

### Decisions (Taras, 2026-10-27)

- **Loop driver: prose only.** No Stop hook, no state file. SKILL.md carries the loop contract.
  The waiting step (`wait` in background Bash) gives the re-invocation. `/goal` stays an optional
  extra that Taras can type.
- **Done: bots clean + required checks**, all on the head commit (definition below).
- **Reviewers: discover them, do not hardcode them.** Each company and repo has different
  reviewers. The skill finds the relevant reviewers and their triggers from evidence on the PR.
- **Two skills that link to each other.** `tackle-gh-comments` points to `babysit-pr` for the
  "keep going until approved" case. `babysit-pr` calls `tackle-gh-comments` for the thread work in
  each round.

### Shape

1. **`tackle-gh-comments` stays the single-sweep inner step.** Changes:
   - Script: `list` / `json` also return findings that live outside threads: review bodies on the
     head commit (for example "Changes needed" in a review body) and bot summary issue comments
     newer than the head. Today they are invisible.
   - SKILL.md: replace the "bot re-reviews after each push" trap with a link: "To keep going until
     the PR is approved, use `desplega:babysit-pr`."
   - Add `commands/tackle-gh-comments.md`. The skill description already promises
     `/tackle-gh-comments`, but no wrapper exists.
2. **New `babysit-pr` skill: the loop.** It owns waiting, re-triggering reviewers, CI, rebase, and
   the stop rule. It links to `desplega:tackle-gh-comments` for verify, fix, reply, resolve. Also
   add `commands/babysit-pr.md` (`/babysit-pr [PR] [--merge] [--max-rounds N]`).
3. Plugin bump: `cc-plugin/base/.claude-plugin/plugin.json` 2.7.4 → 2.8.0 (new skill = minor).
   `README.md` skill list gets the new entry.

### One round

```
snapshot ──► done? ──yes──► final report + PushNotification (merge only if --merge)
   │no
   ├─ BEHIND/DIRTY ──► rebase on base, re-run checks locally
   ├─ required check failed ──► read logs: real failure → fix; infra flake → `gh run rerun --failed` once
   ├─ fresh findings (threads, review bodies, bot comments on head) ──► tackle-gh-comments
   ├─ push once per round (push last, as today)
   ├─ re-trigger each relevant reviewer (see discovery)
   └─ start `wait` in the background, end the turn ──► harness re-invokes on the next event
```

**Loop contract (the prose enforcement).** A turn in a babysit run ends in exactly one of two
ways: a background `wait` is running, or the final report is written (done, or stop-and-ask).
Never end a turn with neither. When `wait` exits, start the next round. The `wait` output repeats
the instruction (`"next": "babysit-pr round 3/6 for desplega-ai/x#123"`), so the loop survives a
context compaction without a state file.

### Script: `babysit-pr/scripts/pr-state.ts` (Bun, GraphQL, same auth as today)

The script reports facts. The agent makes the judgment calls (relevance, triggers, "is this
finding addressed").

- `snapshot`: one compact JSON object. Head oid, `reviewDecision`, `mergeStateStatus`, required
  checks (pass / fail / pending), unresolved thread count, fresh findings, and a `reviewers` list
  (see discovery). Compact output keeps each round cheap on context.
- `wait --since <oid> --round N/M`: poll every 60 s. Exit with one JSON line on the first
  actionable change (check finished, new review / thread / comment, base moved) or after a
  timeout (default 45 min). Run with `run_in_background: true`, so Taras can keep chatting between
  events. Background Bash beats `Monitor` here: one exit is one event, and local runs have no
  30-minute deadline.
- `rerequest --reviewer <login>`: `gh pr edit --add-reviewer` for formally requested reviewers
  (humans, and Copilot as `@copilot`). Comment triggers are plain `gh pr comment`, no special
  command.
- Shared GraphQL and context helpers move to one module that both scripts import, so the two
  scripts do not duplicate auth code.

### Reviewer discovery (no hardcoded table)

`snapshot.reviewers` lists every account that reviewed or commented on the PR, with facts only:
login, `User` or `Bot`, how it posts (formal review state, threads, issue comment, check run),
whether it was formally requested (`reviewRequests`, `ReviewRequestedEvent`), the commit of its
latest activity vs head, and the comment that triggered its last run, if any (a comment that
mentions it, posted shortly before its activity).

The agent then classifies each one:

- **Not a reviewer**: deploy, CI, and dependency bots (deploy previews, CI timing tables,
  dependency updates). They matter only through their checks.
- **Runs on every push**: it already has activity on several heads with no trigger. Do nothing,
  wait for it.
- **Formally requested**: re-request with `rerequest`.
- **Comment-triggered**: reuse the exact trigger that worked earlier on this PR. If there is none,
  use the trigger the bot states in its own footer, then the repo docs (`CLAUDE.md`,
  `AGENTS.md`, `CONTRIBUTING.md`). If no trigger is found, ask Taras once and continue.

Observed on desplega-ai PRs (examples only, not code): `desplega-bot` (comment trigger,
formal `APPROVED`), Codex (`@codex review`, stated in its footer), Copilot (formal re-request).

### Definition of done

All on `headRefOid`:

- Required checks green (`isRequired`), not the full rollup (non-required checks such as fork
  deploy previews can fail).
- 0 unresolved threads, and no fresh unaddressed finding.
- Every relevant reviewer is clean on head: its latest activity is on head, and it either
  approved or left no new finding. The agent reads the body. Machine-readable markers (for
  example Codex's `codex-review-state` comment) are hints, not rules.
- `reviewDecision == APPROVED` when it is non-null.
- `mergeStateStatus` is not `BEHIND` or `DIRTY`.

### Guardrails (defaults)

- Max 6 rounds, then stop and report.
- Stop and ask Taras when: the same finding returns after a fix (bot ping-pong), a finding needs
  work outside the PR's goal (scope guard), the PR looks obsolete, a rebase conflict needs
  judgment, or a reviewer does not answer two triggers in a row.
- Never merge without `--merge`. Never close a PR without asking.
- Quiet when idle: no filler comments, one reply per thread, one trigger per reviewer per round.
- `PushNotification` on done and on every stop-and-ask.

### Where it runs

The session that opened the PR, in the PR's checkout or worktree. That session knows the
original goal, which the scope guard needs. `/autofix-pr` (cloud) and swarm tasks are later
options. `/autofix-pr` does not re-request review or wait for approval.

## Open Questions

- Prose-only risk: nothing hard-stops an early exit. The loop contract and the `next` field in
  the `wait` output are the mitigation. If early exits show up in practice, a gated Stop hook
  (modelled on `plan_checkbox_stop.py`) is the next step.
- `gh pr checks --watch` exit code on failure: UNVERIFIED (not needed, `wait` polls GraphQL).
- `claude[bot]` and `cubic-dev-ai` triggers: UNVERIFIED. Discovery handles them if they appear.
- Codex-side `/goal` end-condition semantics: UNVERIFIED.
