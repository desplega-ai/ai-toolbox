---
date: 2026-04-12
author: Taras & Claude
topic: "Rozum brainstorm × git-why — comparison & borrowable ideas"
tags: [brainstorm, comparison, git-why, session-analysis]
status: note
related:
  - thoughts/taras/brainstorms/2026-04-12-session-analyzer.md
  - https://github.com/hexapode/git-why
---

# Rozum × git-why — How they fit

## TL;DR

**git-why and Rozum are complementary, not competing.** They both consume the same raw input (Claude Code JSONL sessions in `~/.claude/projects/`), but produce different outputs for different audiences.

| Axis | git-why | Rozum |
|------|---------|-------|
| Question answered | "Why is *this code* here?" | "How can *the agent* do better next time?" |
| Audience | Human reviewers, future maintainers | The agent itself (via hooks/nudges) + user |
| Unit of output | Per-file reasoning entry, committed to repo | Per-session OutcomeLearning, stored in SQLite |
| Trigger | `pre-commit` hook | `SessionStart` + `PostToolUse` + on-demand CLI |
| Storage | `.why/<path>.md` (git-tracked, union-merge) | `~/.rozum/{global,projects/*}.db` (SQLite) |
| Scope | One commit → reasoning artifact | Many sessions → recurring patterns |
| Tool coverage | Multi-provider (Claude Code, Copilot, Codex, Cursor…) | Claude Code only (MVP) |

git-why is a **reasoning archive** (code context for humans). Rozum is a **pattern learner** (meta-improvement for agents). They answer different questions from the same raw material.

## What Rozum should borrow from git-why

1. **Session-extraction provider abstraction.** git-why already has a working plugin system that normalizes conversation data from Claude Code, Copilot, and Codex JSONL formats into a common shape. This directly addresses Rozum's **Open Question #1** (session summarization strategy) and de-risks the multi-tool future. Consider depending on or vendoring git-why's provider layer rather than re-implementing it.

2. **`.whyignore`-style privacy filter.** Directly addresses Rozum's **Open Question #6** (privacy/sensitivity before sending to Haiku). Pattern-based exclusion of files/paths/secrets from extracted session content.

3. **Per-commit artifact as a Rozum output channel.** Rozum's analyzer produces OutcomeLearnings for agent self-improvement, but the *same* pre-processed session could also emit a git-why trace entry. One extraction, two consumers: a learning row in SQLite + a `.why/<path>.md` entry for the commit. Could be a v2 integration — Rozum becomes a git-why provider that also learns.

4. **Union-merge markdown format over pure SQLite.** Rozum's SQLite choice is right for query/aggregation, but exporting top learnings to a git-trackable markdown file (à la `.why/`) would make them shareable across team members and survive machine migrations. Consider a hybrid: SQLite for fast reads + periodic export to `thoughts/rozum-learnings.md`.

## Where they diverge (and Rozum shouldn't copy)

- **Per-file granularity.** git-why binds reasoning to files because that's what humans blame. Rozum's patterns are session-level and cross-cutting ("AskUserQuestion overuse") — forcing them per-file would dilute the signal.
- **Commit-time sync.** git-why fires on `pre-commit` because that's when reasoning is freshest *for code*. Rozum's value is in *post-session* reflection and *next-session* nudges — different lifecycle.
- **Markdown-only storage.** git-why's union-merge markdown is elegant for per-file traces but poor for aggregate queries ("top 10 recurring patterns across 200 sessions"). Rozum needs SQLite.

## Recommendation

**Track git-why as an upstream dependency candidate for Rozum's extraction layer.** The JSONL-parsing work git-why already did (and will keep doing as new AI tools appear) is not Rozum's core value — pattern analysis is. If git-why's provider API is importable, use it; otherwise, align formats so a future merge is cheap.

**Also consider: can Rozum ship as a git-why provider extension?** i.e. Rozum runs its analysis, and when a commit happens, writes both (a) an OutcomeLearning to SQLite and (b) a git-why entry to `.why/`. This piggybacks on git-why's adoption curve and gives users one integration surface.

## Updates to Rozum's open questions

- **OQ #1 (session summarization):** partially answered — look at git-why's extraction & normalization step first.
- **OQ #6 (privacy):** answered — `.whyignore` pattern file.
- **New OQ:** should Rozum be a standalone tool, a git-why provider plugin, or both? Decide before building the extraction layer.
