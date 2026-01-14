---
date: 2026-01-14T12:00:00-08:00
researcher: Claude
git_commit: f6f0cf5ff4cb6aebebe9cb548e83264ed510d535
branch: main
repository: desplega-ai/ai-toolbox
topic: "Refactoring research, plan, implement commands into extensible skill wrappers"
tags: [research, skills, commands, plugin-architecture, superpowers]
status: complete
last_updated: 2026-01-14
last_updated_by: Claude
last_updated_note: "Converted open questions to design decisions based on user review"
---

# Research: Skill Wrapper Refactoring

**Date**: 2026-01-14T12:00:00-08:00
**Researcher**: Claude
**Git Commit**: f6f0cf5ff4cb6aebebe9cb548e83264ed510d535
**Branch**: main
**Repository**: desplega-ai/ai-toolbox

## Research Question

How to refactor research, plan, and implement commands into extensible skill wrappers following the superpowers pattern, with added autonomy controls and file-review integration hints.

## Summary

The current desplega plugin uses a **commands-based structure** while superpowers uses a **skills-based structure**. Both are discovered by Claude Code via directory conventions, but skills offer better extensibility through the `SKILL.md` pattern with YAML frontmatter.

**Proposed naming convention**:
- Commands (user-invocable): `/research`, `/create-plan`, `/implement-plan` (keep as-is)
- Skills (base/extensible): `researching`, `planning`, `implementing` (gerund form)

Key findings:
1. **Directory convention matters**: Skills use `skills/<skill-name>/SKILL.md`, commands use `commands/<name>.md`
2. **Skills are automatically loaded** as "always available" context; commands are user-invocable
3. **Superpowers uses `**REQUIRED SUB-SKILL:**` notation** for skill composition without force-loading
4. **Autonomy control** would be a new pattern to add at skill invocation time

## Detailed Findings

### Current Desplega Plugin Structure

**Location**: `cc-plugin/base/`

```
cc-plugin/base/
├── .claude-plugin/
│   └── plugin.json          # Metadata only (name, version, author)
├── commands/
│   ├── research.md          # User-invocable command
│   ├── create-plan.md       # User-invocable command
│   ├── implement-plan.md    # User-invocable command
│   └── ...
├── agents/
│   ├── codebase-locator.md  # Sub-agent definitions
│   └── ...
└── skills/
    └── .gitkeep             # Currently empty!
```

**Command Frontmatter Format** (`cc-plugin/base/commands/research.md:1-6`):
```yaml
---
description: Document codebase as-is with thoughts directory for historical context
model: opus
argument-hint: [query]
allowed-tools: Read, Grep, Glob
---
```

**Key Observations**:
- Commands are user-invocable via `/desplega:research`, `/desplega:create-plan`
- Commands have `model`, `argument-hint`, `allowed-tools` options
- The `skills/` directory exists but is empty (only `.gitkeep`)

### Superpowers Plugin Structure

**Location**: `skills/<skill-name>/`

```
skills/
├── writing-plans/
│   └── SKILL.md
├── executing-plans/
│   └── SKILL.md
├── test-driven-development/
│   └── SKILL.md
├── writing-skills/
│   └── SKILL.md
└── ... (14 total skill directories)
```

**Superpowers Naming Convention**:
- `writing-plans` - gerund + object
- `executing-plans` - gerund + object
- `brainstorming` - gerund
- `systematic-debugging` - adjective + gerund
- `verification-before-completion` - descriptive phrase

**Skill Composition Pattern**:
```markdown
**REQUIRED SUB-SKILL:** Use superpowers:test-driven-development
```

This notation:
- References another skill without force-loading
- Avoids the `@filename` syntax that consumes context immediately
- Allows lazy loading when needed

### File-Review Plugin Structure (Reference Implementation)

**Location**: `cc-plugin/file-review/`

```
cc-plugin/file-review/
├── .claude-plugin/
│   └── plugin.json
├── commands/
│   ├── file-review.md       # User invokes: /file-review:file-review
│   └── process-comments.md
└── skills/
    ├── process-review/
    │   └── SKILL.md         # Auto-triggered skill
    └── install/
        └── SKILL.md
```

**Skill Frontmatter Format** (`cc-plugin/file-review/skills/process-review/SKILL.md:1-4`):
```yaml
---
name: process-review
description: Process review comments in a file...
---
```

### Commands vs Skills - Key Differences

| Aspect | Commands | Skills |
|--------|----------|--------|
| Invocation | Explicit `/command` | Automatic trigger or `**REQUIRED SUB-SKILL:**` |
| Directory | `commands/<name>.md` | `skills/<name>/SKILL.md` |
| Frontmatter | `description`, `model`, `argument-hint`, `allowed-tools` | `name`, `description` |
| Context loading | On invocation | Based on trigger conditions |
| Extensibility | Override whole file | Compose via sub-skill references |
| Naming | Imperative verbs | Gerunds (activities) |

## Proposed Structure

### Naming Convention

| Type | Current Name | New Skill Name | Rationale |
|------|--------------|----------------|-----------|
| Command | `/research` | - | Keep as-is (user-invocable) |
| Command | `/create-plan` | - | Keep as-is (user-invocable) |
| Command | `/implement-plan` | - | Keep as-is (user-invocable) |
| Skill | (none) | `researching` | Gerund form, base skill |
| Skill | (none) | `planning` | Gerund form, base skill |
| Skill | (none) | `implementing` | Gerund form, base skill |

### Proposed Directory Structure

```
cc-plugin/base/
├── skills/
│   ├── researching/
│   │   └── SKILL.md           # Base research skill (extensible)
│   ├── planning/
│   │   └── SKILL.md           # Base planning skill (extensible)
│   └── implementing/
│       └── SKILL.md           # Base implementation skill (extensible)
├── commands/
│   ├── research.md            # Thin wrapper → invokes researching skill
│   ├── create-plan.md         # Thin wrapper → invokes planning skill
│   └── implement-plan.md      # Thin wrapper → invokes implementing skill
```

### Autonomy Control Pattern

Add to each base skill preamble:

```markdown
## Autonomy Mode

Before starting, use `AskUserQuestion` to determine interaction level:

**Question**: How much should I check in with you during this process?
- **Autopilot**: Work independently, only present final results
- **Critical questions** (Recommended): Ask only when blocked or for major decisions
- **Verbose**: Check in frequently, validate approach at each step

Adapt behavior based on selection:
- **Autopilot**: Minimize AskUserQuestion, summarize at end
- **Critical**: Use AskUserQuestion only for blockers and design decisions
- **Verbose**: Use AskUserQuestion at each step, confirm before proceeding
```

### File-Review Integration Hint

Add conditional hint to `researching` and `planning` skills:

```markdown
## Review Integration (Optional)

If the `file-review` plugin is available:
- After creating documents, offer to open in file-review for inline feedback
- Suggest: "Would you like to review this in file-review for inline comments?"
- If yes, invoke `/file-review:file-review <path>`
- Process feedback with `file-review:process-review` skill
```

### Extension Pattern for Other Repos

Projects can extend base skills:

```
my-project/.claude/
└── skills/
    └── researching/
        └── SKILL.md    # Project-specific additions
```

With content like:
```markdown
---
name: researching
description: Extended research skill for my-project
---

**REQUIRED SUB-SKILL:** Use desplega:researching

## Project-Specific Context

When researching this codebase:
- Always check the `docs/architecture/` directory first
- Our API follows OpenAPI 3.0 spec in `api/openapi.yaml`
- ...
```

## Code References

- Current research command: [`cc-plugin/base/commands/research.md:1-213`](https://github.com/desplega-ai/ai-toolbox/blob/f6f0cf5/cc-plugin/base/commands/research.md)
- Current plan command: [`cc-plugin/base/commands/create-plan.md:1-433`](https://github.com/desplega-ai/ai-toolbox/blob/f6f0cf5/cc-plugin/base/commands/create-plan.md)
- File-review skill example: [`cc-plugin/file-review/skills/process-review/SKILL.md:1-186`](https://github.com/desplega-ai/ai-toolbox/blob/f6f0cf5/cc-plugin/file-review/skills/process-review/SKILL.md)
- WTS skill example: [`cc-plugin/wts/skills/wts-expert/SKILL.md:1-152`](https://github.com/desplega-ai/ai-toolbox/blob/f6f0cf5/cc-plugin/wts/skills/wts-expert/SKILL.md)

## Superpowers References

- Skills directory: https://github.com/obra/superpowers/tree/main/skills
- Writing-plans skill: https://github.com/obra/superpowers/blob/main/skills/writing-plans/SKILL.md
- Writing-skills skill: https://github.com/obra/superpowers/blob/main/skills/writing-skills/SKILL.md

## Design Decisions

1. **Command wrapper approach**: Commands become thin wrappers that invoke the skill + add autonomy prompt.

2. **Skill trigger conditions**: Commands always invoke their corresponding skills. No auto-triggering based on context.

3. **File-review detection**: Use skill presence check (no explicit feature flags).

4. **Autonomy persistence**: Per session, stored in document frontmatter for multi-session continuity. Background researches prompt for autonomy preference with autopilot as default.
