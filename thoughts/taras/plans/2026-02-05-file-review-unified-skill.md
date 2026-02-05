---
date: 2026-02-05T12:00:00Z
topic: "Unified file-review Skill"
status: draft
autonomy: critical
---

# Plan: Unified file-review Skill

## Goal

Create a single unified `file-review` skill (`SKILL.md`) that acts as an intelligent router for all file-review functionality. The existing commands in `commands/` remain as backward-compatible shortcuts, but the skill is the canonical entry point that understands natural language intents.

## Context

### Current Structure
```
cc-plugin/file-review/
├── commands/
│   ├── file-review.md      ← launches GUI
│   └── process-comments.md ← processes review markers
└── skills/
    ├── install/SKILL.md     ← installation guide
    └── process-review/SKILL.md ← interactive comment processing
```

### Problem
- There's no single skill that ties the whole plugin together
- Users say things like "file-review this file" or "I left comments" and there's no unified handler
- The two commands are fine as shortcuts but the skill layer should be the smart router

## Plan

### Phase 1: Create unified skill file (single file)

**File:** `cc-plugin/file-review/skills/file-review/SKILL.md`

This replaces the need to know which command or sub-skill to invoke. It's a single SKILL.md that:

1. **Documents itself** — explains that `commands/` are backward-compatible shortcuts
2. **Routes by intent** — matches user input to one of three actions:
   - **Install** → installation workflow (brew + manual)
   - **Review a file** → GUI launch workflow
   - **Process comments** → interactive comment processing workflow
3. **Keeps it KISS** — single file, no abstractions, just clear sections with intent matching at the top

### Skill Structure (outline)

```markdown
---
name: file-review
description: File review tool — launch GUI, process comments, or install.
  Use when user mentions file-review, reviewing files, or processing review comments.
---

# File Review

## Intent Router
- "install file-review" / "set up file-review" → Jump to Install
- "review <file>" / "file-review <path>" / "open for review" → Jump to Review File
- "I left comments" / "process comments" / "done reviewing" → Jump to Process Comments

## Install
(Condensed from install/SKILL.md — brew tap + manual fallback)

## Review a File
(Condensed from commands/file-review.md — launch GUI, show shortcuts, capture output)

## Process Comments
(Condensed from skills/process-review/SKILL.md — regex patterns, interactive workflow)

## Note on Commands
The /file-review and /process-comments commands are shortcuts that trigger
the Review and Process workflows above. They exist for backward compatibility.
```

### Phase 2: Verify no conflicts

- Ensure the new skill name `file-review` doesn't conflict with the existing command `file-review` (commands and skills live in different namespaces: `/file-review` vs `file-review:file-review`)
- The existing sub-skills (`install`, `process-review`) can stay — they won't conflict and provide granular access if needed

### What stays unchanged
- `commands/file-review.md` — stays as-is (backward compat shortcut)
- `commands/process-comments.md` — stays as-is (backward compat shortcut)
- `skills/install/SKILL.md` — stays as-is (granular access)
- `skills/process-review/SKILL.md` — stays as-is (granular access)

### What gets created
- `skills/file-review/SKILL.md` — **new unified skill** (1 file)

## Verification

- [x] Skill file created with proper frontmatter
- [x] All three intents (install, review, process) covered
- [x] Commands documented as backward-compatible shortcuts
- [x] Content is self-contained (doesn't just reference other skills — includes the actual instructions)
- [x] KISS — single file, no over-engineering

## Risks

- **Duplication**: The unified skill will duplicate content from the sub-skills. This is intentional — the skill needs to be self-contained so the LLM doesn't need to chain-load other files. The sub-skills remain as the "source of truth" for granular access.
- **Naming**: `file-review:file-review` looks redundant. This is fine — it's the convention (plugin:skill) and matches how other plugins work.
