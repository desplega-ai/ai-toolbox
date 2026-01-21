---
date: 2026-01-21T00:15:22Z
researcher: Claude
git_commit: e6e6062d106a192e1f67ed3e9ed8d5cd6e6bb3d3
branch: main
repository: ai-toolbox
topic: "Adding /deep-review command - pattern analysis"
tags: [research, cc-plugin, commands, skills, deep-review]
status: complete
autonomy: critical
last_updated: 2026-01-21
last_updated_by: Claude
---

# Research: Adding /deep-review Command - Pattern Analysis

**Date**: 2026-01-21T00:15:22Z
**Researcher**: Claude
**Git Commit**: e6e6062d106a192e1f67ed3e9ed8d5cd6e6bb3d3
**Branch**: main

## Research Question

How to add a new `/deep-review` command that performs deep review of research/plan/topic/general files, following existing cc-plugin patterns.

## Summary

The cc-plugin uses a two-layer architecture: **commands** (thin wrappers that parse arguments/autonomy and delegate) and **skills** (detailed execution workflows). To add `/deep-review`, we need:

1. A command file at `cc-plugin/base/commands/deep-review.md`
2. A skill at `cc-plugin/base/skills/deep-reviewing/SKILL.md`
3. A template at `cc-plugin/base/skills/deep-reviewing/template.md`

The pattern is consistent across all existing commands: commands handle argument parsing and autonomy mode, then invoke skills that contain the actual workflow logic.

## Detailed Findings

### Command Pattern (`cc-plugin/base/commands/*.md`)

Commands are thin wrappers with this structure:

```yaml
---
description: [One-line description]
model: opus  # or inherit
argument-hint: [--autonomy=MODE] [parameters]
allowed-tools: [optional tool restrictions]
---
```

Key characteristics:
- Parse `--autonomy=autopilot|critical|verbose` flag
- Check document frontmatter for `autonomy:` field as default
- Ask user via AskUserQuestion if not specified
- Delegate to a skill with `**ALWAYS invoke the `desplega:<skillname>` skill**`
- Handle "no input" case gracefully

**Example**: `research.md` (lines 1-41) parses autonomy, then invokes `desplega:researching` skill.

### Skill Pattern (`cc-plugin/base/skills/{name}/SKILL.md`)

Skills contain detailed workflows with this structure:

```yaml
---
name: [skill-name]
description: [One-sentence description]
---
```

Key sections:
1. **Working Agreement** - Communication principles, AskUserQuestion as primary tool
2. **User Preferences** - Questions asked upfront (file-review, commits, etc.)
3. **Autonomy Mode** - Table defining behavior per mode (Autopilot/Critical/Verbose)
4. **When to Use** - Activation conditions
5. **Process Steps** - Numbered, detailed workflow
6. **Review Integration** - How to use file-review plugin
7. **Important Guidelines** - Best practices

### Template Pattern (`cc-plugin/base/skills/{name}/template.md`)

Templates define output document structure:
- YAML frontmatter with metadata (date, author, git info, tags, status)
- Standardized sections for the document type
- Placeholders indicated with `[brackets]`

### Existing Agents for Review Tasks

The codebase has agents that could support deep-review:
- `codebase-analyzer.md` - Analyzes implementation details
- `codebase-pattern-finder.md` - Finds similar patterns
- `codebase-locator.md` - Locates files

Note: These agents are configured to NOT suggest improvements (documentarian mode). For deep-review, we'd want agents that DO provide critical analysis.

## Code References

| File | Line | Description |
|------|------|-------------|
| `cc-plugin/base/commands/research.md` | 1-41 | Command pattern example with autonomy parsing |
| `cc-plugin/base/commands/create-plan.md` | 1-41 | Another command pattern example |
| `cc-plugin/base/skills/researching/SKILL.md` | 1-149 | Skill pattern with full workflow |
| `cc-plugin/base/skills/planning/SKILL.md` | 1-250 | Most comprehensive skill example |
| `cc-plugin/base/skills/researching/template.md` | 1-59 | Template pattern for research documents |
| `cc-plugin/base/skills/planning/template.md` | 1-91 | Template pattern for plan documents |
| `cc-plugin/base/agents/codebase-analyzer.md` | 1-144 | Agent pattern (documentarian mode) |

## Architecture Documentation

### Two-Layer Architecture

```
User invokes command
       │
       ▼
┌─────────────────────┐
│ Command (thin)      │
│ - Parse args        │
│ - Determine autonomy│
│ - Delegate to skill │
└─────────────────────┘
       │
       ▼
┌─────────────────────┐
│ Skill (detailed)    │
│ - Working agreement │
│ - User preferences  │
│ - Process steps     │
│ - Spawn sub-agents  │
│ - Write output doc  │
│ - Review integration│
└─────────────────────┘
       │
       ▼
Output document in thoughts/
```

### File Locations

| Type | Path Pattern |
|------|--------------|
| Commands | `cc-plugin/base/commands/{name}.md` |
| Skills | `cc-plugin/base/skills/{name}/SKILL.md` |
| Templates | `cc-plugin/base/skills/{name}/template.md` |
| Agents | `cc-plugin/base/agents/{name}.md` |
| Output | `thoughts/{user}/research\|plans/YYYY-MM-DD-{topic}.md` |

## Design Considerations for `/deep-review`

### Key Differences from Research/Planning

Unlike research (which documents as-is) and planning (which creates implementation plans), deep-review should:

1. **Critically analyze** - Identify issues, gaps, inconsistencies
2. **Evaluate quality** - Assess completeness, clarity, accuracy
3. **Suggest improvements** - Provide actionable recommendations
4. **Cross-reference** - Validate against codebase reality

### Suggested Approach

1. **Input types**: Research files, plan files, topic files, general markdown
2. **Review dimensions**:
   - Completeness - Are all aspects covered?
   - Accuracy - Do claims match codebase reality?
   - Clarity - Is it well-organized and understandable?
   - Actionability - Are next steps clear?
   - Consistency - Internal and external consistency
3. **Output**: Review document with findings and recommendations

### Questions to Consider

1. Should deep-review write to `thoughts/.../reviews/` or inline annotate the file?
2. Should it spawn agents to verify claims against codebase?
3. Should it have a different output format (e.g., structured feedback vs narrative)?
4. Should it integrate with file-review for inline comments?

## Design Decisions (Confirmed with User)

### Core Integration: file-review Tool
**Decision**: Heavy use of file-review for inline commenting

The deep-review workflow should center around file-review:
1. Claude analyzes the document and identifies issues/feedback
2. Claude inserts inline HTML comments at specific locations in the file
3. Opens file-review GUI for user to see annotated document
4. User can respond to comments, dismiss them, or request changes
5. Claude processes feedback via `file-review:process-comments`

This approach is more actionable than a separate review document because:
- Comments are contextual (right where the issue is)
- Interactive back-and-forth review process
- User can selectively address or dismiss feedback
- Follows existing file-review workflow patterns

### Output Format
**Decision**: Hybrid approach

1. **Primary**: Inline comments via file-review in the original document
2. **Secondary**: Summary review file in `thoughts/{user}/reviews/YYYY-MM-DD-{topic}.md` with:
   - High-level findings summary
   - Cross-references to codebase (for accuracy checks)
   - Record of what was reviewed and when

### Review Approach
**Decision**: Two-fold mode - autonomous OR user-guided

1. **Autonomous mode**: Comprehensive review across all dimensions (completeness, accuracy, clarity, actionability, consistency)
2. **Guided mode**: User specifies focus areas (e.g., "focus on accuracy" or "check if the plan is implementable")

This maps to the existing autonomy pattern but with a twist:
- `--autonomy=autopilot` → Full autonomous comprehensive review, then open file-review
- `--autonomy=critical` → Ask for focus areas first, then review and open file-review
- `--autonomy=verbose` → Guided mode, check in at each review dimension before adding comments

### Workflow Integration

```
User: /deep-review path/to/document.md

1. Claude reads and analyzes document
2. Claude spawns sub-agents to verify claims against codebase
3. Claude identifies issues across review dimensions
4. Claude inserts HTML comments into document at specific locations
5. Claude invokes file-review:file-review to open GUI
6. User reviews comments, responds, dismisses
7. User closes file-review
8. Claude processes comments via file-review:process-comments
9. Claude addresses feedback or updates document
10. Optionally: Write summary to thoughts/{user}/reviews/
```

## Related Research

- None yet - this is the first research on deep-review command
