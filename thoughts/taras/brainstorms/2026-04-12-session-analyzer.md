---
date: 2026-04-12T00:30:00Z
author: Taras & Claude
topic: "Rozum — Background Session Analyzer for Claude Code"
tags: [brainstorm, session-analysis, meta-tooling, continuous-improvement, hooks]
status: synthesized
exploration_type: idea
last_updated: 2026-04-12
last_updated_by: Claude
---

# Rozum (Розум) — Background Session Analyzer for Claude Code — Brainstorm

## Context

We just completed a manual analysis of 8 Claude Code sessions from the Argus Frontend UI work (~18MB of JSONL, ~2,217 agent turns). The analysis identified 8 "Outcome Learnings" (OL-1 through OL-8) covering patterns like dead sessions from auth failures, context exhaustion, unrequested work, TS errors committed without checks, excessive AskUserQuestion usage, etc.

Each learning was classified by severity, cost, and improvement type (deterministic via hooks/tools vs prompting via CLAUDE.md).

The manual process took ~20 agent turns and produced a useful document at `/tmp/2026-04-12-argus-fe-session-analysis.md`.

**The question:** Can we automate this so it happens continuously — a tool running in the background that analyzes sessions as they happen and proposes/applies improvements?

### Known constraints
- Claude Code sessions are stored as JSONL files in `~/.claude/projects/<encoded-path>/<session-id>.jsonl`
- Sessions can be large (up to 7.3MB observed)
- The analysis we did manually required understanding intent, detecting patterns, and classifying improvements
- We have existing infrastructure: hooks (SessionStart, PreCommit, PostToolUse), skills, CLAUDE.md, memory system

## Exploration

### Q: What's the primary output form?
In-session nudges + post-session reports + a command interface (like context-mode's `ctx stats`, `ctx doctor`, etc.).

**Insights:** Three output channels means the tool needs both real-time hooks (for nudges) and batch processing (for reports). The command interface gives the user on-demand control. context-mode is the reference architecture — it uses: hooks (SessionStart, PostToolUse) for injection, MCP server for tools, SQLite+FTS5 for storage, skills for the command interface.

### Q: When should in-session nudges fire?
Both: pre-load general learnings at session start + detect active patterns mid-session.

**Insights:** This maps to two hooks:
- **SessionStart:** inject learnings from recent sessions as additional context ("Based on your last 5 sessions, watch out for X")
- **PostToolUse:** monitor the active session in real-time, detect patterns (e.g., 5th Read of same file, high AskUserQuestion rate), and inject nudges when thresholds are crossed

### Q: Where should the intelligence live for analysis?
Full LLM analysis via `claude -p --model haiku` with structured output. Not heuristic-only — the value is in nuanced insights like "agent misinterpreted 'autopilot' as 'write tests'." Haiku keeps cost low while maintaining quality.

**Insights:** Using `claude -p` means the analyzer is a CLI that shells out to Claude. Structured output (JSON schema) makes the results machine-parseable. The cost per analysis is ~$0.01-0.05 for a Haiku call with a session summary.

### Q: How often should post-session analysis run?
On-demand for now. A CLI command like `rozum analyze <session-id>`. Could add a hook-triggered auto-run later.

**Insights:** Starting on-demand is pragmatic — validates analysis quality before automating. A CLI also means it can be used outside Claude Code (e.g., CI, scripts). Adding a `SessionEnd` hook later to auto-trigger is straightforward.

### Q: Where to store learnings?
SQLite database. Structured, queryable, can track recurrence over time.

**Insights:** Mirrors context-mode's approach. SQLite at `~/.rozum/patterns.db` (global) + project-scoped DBs. Schema needs: pattern_id, pattern_type, severity, first_seen, last_seen, recurrence_count, suggestion, improvement_type, status (open/addressed/dismissed).

### Q: Scope — per-project or global?
Global + per-project. Two tiers mirroring CLAUDE.md hierarchy.

**Insights:** Global patterns like "reduce Read loops" apply everywhere. Project patterns like "run tsc before commit" are scoped. The analyzer needs to classify each learning as global or project-specific. Storage: global DB at `~/.rozum/global.db`, project DBs at `~/.rozum/projects/<encoded-path>.db`.

### Q: Form factor?
Standalone CLI + Claude Code plugin bridge. Core analysis engine is a standalone CLI. A thin CC plugin wraps it for hooks and nudges.

**Insights:** This gives maximum flexibility. The CLI can be `rozum` (npm package, like `wts` or `brain`). The plugin provides: SessionStart hook (load learnings), PostToolUse hook (real-time detection), skills (`/rozum analyze`, `/rozum stats`). The CLI does the heavy lifting; the plugin is a thin bridge.

### Q: Output schema?
Fixed schema with structured output. Define an `OutcomeLearning` JSON schema enforced via Claude's structured output.

**Insights:** Schema roughly:
```json
{
  "pattern": "string",
  "severity": "high|medium|low",
  "cost_description": "string",
  "improvement_type": "deterministic|prompting|mixed",
  "suggestion": "string",
  "affected_scope": "global|project",
  "recurrence_potential": "high|medium|low"
}
```

### Q: What's the MVP?
CLI + full hook integration. Not just CLI — the hooks are essential for real-time value.

**Insights:** MVP = `rozum analyze` CLI + SessionStart hook (inject learnings) + PostToolUse hook (live pattern detection). This is ambitious but the hook integration is where the differentiation lives.

### Q: What live patterns to detect?
Goal: common failures, context bloat reduction, and generating suggestions for deterministic toolsets (hooks, tools) + CLAUDE.md patches.

**Insights:** The PostToolUse hook should track:
- File re-read frequency (same path Read >3x)
- Tool error rate (errors / total calls in sliding window)
- Context consumption estimate (cumulative tool result sizes)
- AskUserQuestion rate (questions / turns)
- User interruptions (pattern: user message is "[Request interrupted]")
Each detector is a simple counter/set — no LLM needed in real-time.

### Q: Should it generate artifacts directly?
Generate spec/suggestion, not the artifact itself. A human or Claude session then implements.

**Insights:** This is the right MVP scope. The analyzer says "Pattern: tsc errors committed. Suggestion: add PreCommit hook running `tsc --noEmit`." The user or a Claude session acts on it. Artifact generation could be a later feature where the analyzer produces actual hook code, but that's a v2 concern.

## Synthesis

### Key Decisions

1. **Architecture:** Standalone CLI (`rozum`) + thin Claude Code plugin bridge. CLI owns analysis logic; plugin provides hooks and skill commands.

2. **Analysis engine:** Full LLM via `claude -p --model haiku` with fixed JSON schema (structured output). Not heuristic-only — the value is in nuanced pattern recognition.

3. **Output:** Three channels:
   - **In-session nudges** via SessionStart hook (pre-loaded learnings) + PostToolUse hook (real-time pattern detection)
   - **Post-session reports** on-demand via CLI command
   - **Command interface** via skills (`/rozum analyze`, `/rozum stats`, etc.)

4. **Storage:** SQLite — global DB + per-project DBs. Mirrors CLAUDE.md global/project hierarchy.

5. **Scope:** Global + per-project learnings. Analyzer classifies each finding.

6. **Output format:** Fixed `OutcomeLearning` JSON schema: pattern, severity, cost, improvement_type (deterministic vs prompting), suggestion, scope (global vs project).

7. **Action level:** Generate specs/suggestions, not artifacts. User or Claude implements.

8. **MVP scope:** CLI + full hook integration (SessionStart + PostToolUse). On-demand analysis, not auto-triggered.

### Open Questions

1. **Session summarization strategy** — An 18MB JSONL file is too large to send to Haiku in one shot. How do we summarize/compress? Options: (a) heuristic pre-processor that extracts signals (tool counts, user messages, errors, timestamps) into a compact summary; (b) chunked analysis with sliding window; (c) sample-based: analyze every Nth message.

2. **Learning deduplication** — How to detect that a new OL is the same pattern as an existing one? Semantic similarity? Pattern type + affected files?

3. **Nudge delivery mechanism** — How exactly does a PostToolUse hook inject a nudge into the session? context-mode uses `additional_context` in hook responses. Need to verify this works for arbitrary messages.

4. **Cross-project learning transfer** — When a global learning is discovered in project A, how does it get injected into project B's sessions?

5. **Feedback loop** — How does the user tell the analyzer "this learning was useful" vs "this was noise"? Affects future analysis quality.

6. **Privacy/sensitivity** — Session JSONL may contain secrets, API keys, internal URLs. The analyzer needs to handle this safely, especially if using external API (even Haiku).

### Constraints Identified

1. **Cost:** Each Haiku analysis call costs ~$0.01-0.05 depending on session size. At 10 sessions/day, that's $0.10-0.50/day — acceptable.

2. **Latency:** `claude -p` with Haiku takes ~5-15 seconds. Fine for on-demand CLI; needs to be async for hook-triggered.

3. **Session JSONL size:** Up to 7.3MB observed. Must pre-process/summarize before sending to LLM.

4. **Hook execution time:** PostToolUse hooks must be fast (<500ms). Real-time pattern detection must be pure heuristic (counters, not LLM).

5. **Existing infrastructure:** Can leverage context-mode patterns (SQLite, hook lifecycle, skill-based commands).

### Core Requirements

1. **CLI: `rozum analyze`** — Takes a session ID or path. Pre-processes JSONL into a compact summary. Calls Haiku with structured output schema. Stores OLs in SQLite. Prints human-readable report.

2. **CLI: `rozum stats`** — Shows aggregate stats: total sessions analyzed, top patterns, recurrence trends, suggestions applied vs open.

3. **CLI: `rozum list`** — Lists recent learnings, filterable by severity, scope, status.

4. **Hook: SessionStart** — Queries SQLite for top-N active learnings relevant to the current project. Injects them as `additional_context`.

5. **Hook: PostToolUse** — Lightweight heuristic detectors:
   - File re-read counter (same path >3x → nudge)
   - Tool error rate (>30% in last 10 calls → nudge)
   - Context consumption estimate (warn at 60%, 80%)
   - User interrupt counter (pattern detection)
   
6. **Plugin: Skills** — `/rozum analyze [session-id]`, `/rozum stats`, `/rozum list`, `/rozum dismiss <learning-id>`.

7. **Schema: OutcomeLearning** — Fixed JSON schema for LLM structured output:
   ```
   pattern, severity, cost_description, improvement_type,
   suggestion, affected_scope, recurrence_potential
   ```

8. **Storage: SQLite** — Two tiers:
   - `~/.rozum/global.db` — cross-project learnings
   - `~/.rozum/projects/<encoded-path>.db` — project-specific
   - Tables: learnings, sessions_analyzed, nudge_log

### Architecture Sketch

```
┌─────────────────────────────────────────────────┐
│  Claude Code Plugin (thin bridge)               │
│  ┌──────────────┐  ┌──────────────────────────┐ │
│  │ SessionStart │  │ PostToolUse              │ │
│  │ hook         │  │ hook (heuristic counters) │ │
│  │ → inject     │  │ → file re-reads          │ │
│  │   learnings  │  │ → error rate             │ │
│  │              │  │ → context usage          │ │
│  └──────┬───────┘  └──────────┬───────────────┘ │
│         │                     │                  │
│  ┌──────┴─────────────────────┴───────────────┐ │
│  │ Skills: /rozum analyze, /rozum stats, /rozum list   │ │
│  └──────────────────┬─────────────────────────┘ │
└─────────────────────┼───────────────────────────┘
                      │ shells out to
┌─────────────────────┼───────────────────────────┐
│  rozum CLI                           │
│  ┌──────────────────┴─────────────────────────┐ │
│  │ analyze: JSONL → summarize → claude -p     │ │
│  │          → structured OLs → SQLite         │ │
│  ├────────────────────────────────────────────┤ │
│  │ stats: SQLite → aggregate → report         │ │
│  ├────────────────────────────────────────────┤ │
│  │ list: SQLite → filter → display            │ │
│  ├────────────────────────────────────────────┤ │
│  │ query: SQLite → learnings for project      │ │
│  │        (used by SessionStart hook)         │ │
│  └────────────────────────────────────────────┘ │
│                                                 │
│  ┌────────────────────────────────────────────┐ │
│  │ SQLite: global.db + projects/*.db          │ │
│  │ Tables: learnings, sessions, nudge_log     │ │
│  └────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

## Next Steps

- **Recommended next:** `/desplega:research` to investigate implementation details:
  - How `claude -p --model haiku` works with structured output
  - Session JSONL summarization strategies (what to extract, how to compress)
  - PostToolUse hook response format for injecting nudges
  - context-mode's SQLite schema as reference
- Then: `/desplega:create-plan` for the MVP implementation
