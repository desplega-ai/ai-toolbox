---
date: 2026-03-17
researcher: claude
topic: questioning-skill
tags: [cc-plugin, skill, question, one-shot]
status: complete
git_branch: main
---

# Research: `/desplega:question` (`/questioning`) Skill

## Research Question

How should we add a new `/desplega:question` skill to `cc-plugin/base/` that provides one-shot answers using the research process, without generating a document, and offers follow-up handoff to brainstorm or research?

## Summary

The base plugin follows a consistent two-layer pattern: a **command wrapper** (`commands/<name>.md`) and a **skill definition** (`skills/<name>/SKILL.md`). The new skill fits naturally into this structure but is unique in that it produces no persistent document — it answers inline and hands off.

## Detailed Findings

### 1. Plugin Structure Pattern

Every skill in `cc-plugin/base/` follows this structure:

| Layer | Path | Purpose |
|-------|------|---------|
| Command (thin wrapper) | `commands/<name>.md` | Parses flags, invokes skill |
| Skill definition | `skills/<name>/SKILL.md` | Full process instructions |
| Template (optional) | `skills/<name>/template.md` | Document template for output |

**Files to create for `/question`:**
- `cc-plugin/base/commands/question.md` — thin wrapper
- `cc-plugin/base/skills/questioning/SKILL.md` — full skill definition
- No `template.md` needed (no document output)

### 2. Command Wrapper Pattern

All command wrappers share the same structure (`commands/research.md:1-41`, `commands/brainstorm.md:1-33`, `commands/qa.md:1-33`):

```yaml
---
description: <one-line description>
model: inherit
argument-hint: [--flags] [query]
allowed-tools: <optional tool restrictions>
---
```

Followed by:
1. Parse flags from arguments
2. ALWAYS invoke the corresponding skill
3. Handle "no input provided" case

**Key observation**: `allowed-tools` is only present in `research.md` (`Read, Grep, Glob`). Other commands don't restrict tools. The question command likely doesn't need tool restrictions since it delegates to the skill.

### 3. Research Process (What to Reuse)

The researching skill (`skills/researching/SKILL.md:75-108`) defines the core investigation process:

1. Read any directly mentioned files first
2. Analyze and decompose the question
3. Spawn parallel sub-agents:
   - **codebase-locator** — find WHERE files/components live
   - **codebase-analyzer** — understand HOW specific code works
   - **codebase-pattern-finder** — find examples of existing patterns
   - **context7 MCP** — fetch library/framework docs
   - **web-search-researcher** — external documentation (only if needed)
4. Wait for all sub-agents and synthesize findings

**For the question skill**: Steps 1-4 apply, but step 5 (generate document) is replaced with "present answer inline."

### 4. Critical Constraints from Research Skill

From `skills/researching/SKILL.md:55-61`:
- DO NOT suggest improvements or changes unless explicitly asked
- DO NOT perform root cause analysis unless explicitly asked
- ONLY describe what exists, where it exists, how it works

**For the question skill**: These constraints may be relaxed. A one-shot question like "why does X happen?" might legitimately need root cause analysis. The question skill should answer directly and completely, adapting to the question's nature.

### 5. Handoff Pattern

All skills end with a handoff using `AskUserQuestion`. The question skill's handoff is unique:

| Existing skills | Question skill |
|-----------------|---------------|
| Produce document → offer review/next-step | Produce inline answer → offer deeper exploration |

Proposed handoff options:
1. **Ask another question** — stay in questioning mode (loop)
2. **Save this answer** — persist to `thoughts/<user>/questions/YYYY-MM-DD-<topic>.md` (optional)
3. **Start a brainstorm** from this topic (→ `/brainstorm`)
4. **Start research** from this topic (→ `/research`)
5. **Done** — no further action

**Optional persistence**: By default, no document is created. But when the user selects "Save this answer," the Q&A is persisted to `thoughts/<user>/questions/` for future reference. This keeps the skill lightweight while allowing valuable answers to be saved.

### 6. Key Differentiators from Research

| Aspect | `/research` | `/question` |
|--------|------------|-------------|
| Output | Markdown document in `thoughts/` | Inline text answer (optionally saved to `thoughts/.../questions/`) |
| Depth | Comprehensive, multi-section | Focused, concise |
| Sub-agents | Always spawn multiple | Spawn as needed (may be zero for simple questions) |
| Autonomy | Configurable | Always autopilot-like (one-shot) |
| Follow-up | Append to document | Ask another question or hand off |
| Working Agreement | Full preferences setup | None (lightweight) |
| File Review | Optional | N/A (no file to review) |

### 7. Autonomy Considerations

Since this is a one-shot skill, traditional autonomy modes don't apply well:
- No document to review
- No multi-step process to check in on
- The answer is the deliverable

**Recommendation**: Skip the autonomy prompt entirely. The skill always runs in a "just answer it" mode. If the user wants more depth, they hand off to `/research`.

### 8. Plugin Version

Current plugin version: `1.6.0` (`cc-plugin/base/.claude-plugin/plugin.json:4`). Adding a new skill is a minor feature → bump to `1.7.0`.

## Code References

| File | Relevance |
|------|-----------|
| `cc-plugin/base/.claude-plugin/plugin.json` | Plugin metadata, version to bump |
| `cc-plugin/base/commands/research.md` | Command wrapper pattern to follow |
| `cc-plugin/base/commands/brainstorm.md` | Simpler command wrapper pattern |
| `cc-plugin/base/skills/researching/SKILL.md` | Research process to reuse |
| `cc-plugin/base/skills/brainstorming/SKILL.md` | Brainstorm handoff target |

## Decisions (Resolved)

1. **Autonomy flags**: No. It’s a question — just answer it.
2. **Web search**: Yes, same as research. Both codebase and web, adapting to the question’s nature.
3. **Persistence**: Optional. Default is inline-only, but offer to save to `thoughts/<user>/questions/` after answering.
4. **Naming**: Command = `question` (`commands/question.md`), Skill = `questioning` (`skills/questioning/SKILL.md`). Follows the existing noun→gerund pattern (`research`/`researching`, `brainstorm`/`brainstorming`). `/question` is intuitive for the general public — people naturally say "I have a question about X."
