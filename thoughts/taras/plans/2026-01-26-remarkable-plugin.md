---
date: 2026-01-26
planner: Claude
status: draft
autonomy: autopilot
topic: "Claude Code Plugin for reMarkable Tablet"
---

# reMarkable Plugin Implementation Plan

## Overview

Create a super simple Claude Code plugin (`remarkable`) that provides two core capabilities:
1. **Download** files with annotations from reMarkable (for retrieving handwritten content)
2. **Upload** files to reMarkable with automatic markdown-to-PDF conversion via pandoc

## Current State Analysis

- **rmapi** is installed at `/tmp/rmapi` and authenticated
- **pandoc** is installed (`/opt/homebrew/bin/pandoc`)
- Existing plugin structure in `cc-plugin/` follows consistent patterns:
  - `.claude-plugin/plugin.json` - manifest
  - `skills/<name>/SKILL.md` - skill definition
  - `commands/<cmd>.md` - slash commands

### Key rmapi Commands:
| Command | Purpose |
|---------|---------|
| `rmapi ls [path]` | List files/folders |
| `rmapi get <path>` | Download file (raw) |
| `rmapi geta <path>` | Download with annotations as PDF |
| `rmapi put <local> [remote]` | Upload file |
| `rmapi mkdir <path>` | Create folder |

### Key Discoveries:
- `rmapi geta` is critical - it exports files with handwritten annotations as PDF
- pandoc supports `md → pdf` via `pandoc input.md -o output.pdf`
- Plugin pattern: thin command → expert skill → CLI wrapper

## Desired End State

A working plugin at `cc-plugin/remarkable/` with:
- `/remarkable:get <path>` - Download file with annotations
- `/remarkable:put <file> [folder]` - Upload file (converting md → pdf first)
- `/remarkable:ls [path]` - List files/folders
- `remarkable:remarkable-expert` skill for ad-hoc questions

Verification:
- `ls cc-plugin/remarkable/` shows expected structure
- `/remarkable:ls` lists tablet files
- `/remarkable:put test.md` converts and uploads
- `/remarkable:get "file.pdf"` downloads with annotations

## What We're NOT Doing

- No folder management beyond basic `mkdir`
- No sync functionality
- No batch operations (mget/mput)
- No USB web interface support (rmapi covers our needs)
- No rmapi installation/auth flow (already done manually)

## Implementation Approach

Keep it minimal - 4 files total:
1. `plugin.json` - manifest
2. `skills/remarkable-expert/SKILL.md` - expert skill with CLI reference
3. `commands/get.md` - download command
4. `commands/put.md` - upload command with pandoc conversion
5. `commands/ls.md` - list command

---

## Phase 1: Plugin Scaffold

### Overview
Create the basic plugin structure and manifest.

### Changes Required:

#### 1. Plugin Manifest
**File**: `cc-plugin/remarkable/.claude-plugin/plugin.json`
**Changes**: Create plugin manifest

```json
{
  "name": "remarkable",
  "description": "Push and pull files from reMarkable tablet via rmapi",
  "version": "1.0.0",
  "author": {
    "name": "desplega.ai"
  }
}
```

#### 2. Directory Structure
**Files**: Create directories
```
cc-plugin/remarkable/
├── .claude-plugin/
│   └── plugin.json
├── skills/
│   └── remarkable-expert/
│       └── SKILL.md
└── commands/
    ├── get.md
    ├── put.md
    └── ls.md
```

### Success Criteria:

#### Automated Verification:
- [ ] Directory exists: `ls -la cc-plugin/remarkable/.claude-plugin/plugin.json`
- [ ] Valid JSON: `cat cc-plugin/remarkable/.claude-plugin/plugin.json | jq .`

#### Manual Verification:
- [ ] Plugin structure matches other plugins in cc-plugin/

**Implementation Note**: After completing this phase, pause for manual confirmation.

---

## Phase 2: Expert Skill

### Overview
Create the remarkable-expert skill with CLI reference documentation.

### Changes Required:

#### 1. Expert Skill
**File**: `cc-plugin/remarkable/skills/remarkable-expert/SKILL.md`
**Changes**: Create skill with rmapi quick reference

```markdown
---
name: remarkable-expert
description: reMarkable tablet expert. Use when users want to list, download, or upload files to their reMarkable tablet.
---

# reMarkable Expert

You are an expert on managing files on a reMarkable tablet using `rmapi`.

## Prerequisites

- `rmapi` must be installed and authenticated
- For uploads: `pandoc` is required for markdown conversion

## Quick Reference

| Command | Description |
|---------|-------------|
| `rmapi ls [path]` | List files in folder (default: root) |
| `rmapi get <path>` | Download file (raw format) |
| `rmapi geta <path>` | Download with annotations as PDF |
| `rmapi put <local> [remote]` | Upload file to tablet |
| `rmapi mkdir <path>` | Create folder |
| `rmapi find <dir> [pattern]` | Find files recursively |

## Common Workflows

### List Files
```bash
rmapi ls           # Root folder
rmapi ls Books     # Specific folder
```

### Download with Annotations
Use `geta` to get PDFs with handwritten annotations:
```bash
rmapi geta "Books/My Notes.pdf"
# Downloads to current directory as "My Notes.pdf" with annotations
```

### Upload Markdown as PDF
Convert markdown to PDF first, then upload:
```bash
pandoc document.md -o /tmp/document.pdf
rmapi put /tmp/document.pdf "Documents/"
```

### Upload PDF Directly
```bash
rmapi put report.pdf "Work/"
```

## File Types

| Extension | Supported | Notes |
|-----------|-----------|-------|
| `.pdf` | ✅ | Native format |
| `.epub` | ✅ | Converted internally |
| `.md` | ❌ | Convert to PDF first |

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Unauthorized" | Re-authenticate: `rmapi` (get new code from my.remarkable.com) |
| File not found | Use `rmapi ls` to check exact path and name |
| Upload fails | Check file size (<100MB for cloud) |
```

### Success Criteria:

#### Automated Verification:
- [ ] File exists: `test -f cc-plugin/remarkable/skills/remarkable-expert/SKILL.md`
- [ ] Has frontmatter: `head -5 cc-plugin/remarkable/skills/remarkable-expert/SKILL.md | grep -q "name: remarkable-expert"`

#### Manual Verification:
- [ ] Skill documentation is clear and complete

**Implementation Note**: After completing this phase, pause for manual confirmation.

---

## Phase 3: Commands

### Overview
Create the three slash commands: ls, get, put.

### Changes Required:

#### 1. List Command
**File**: `cc-plugin/remarkable/commands/ls.md`
**Changes**: Simple ls wrapper

```markdown
---
description: List files on reMarkable tablet
argument-hint: [path]
allowed-tools: Bash
---

# List reMarkable Files

List files and folders on the reMarkable tablet.

## Usage

```
/remarkable:ls              # List root folder
/remarkable:ls Books        # List specific folder
```

## Process

1. Run `rmapi ls` with optional path argument:
   ```bash
   rmapi ls [path]
   ```

2. Present results in a table:
   | Type | Name |
   |------|------|
   | 📁 | Folder name |
   | 📄 | File name |

   Where `[d]` = folder (📁) and `[f]` = file (📄)
```

#### 2. Get Command
**File**: `cc-plugin/remarkable/commands/get.md`
**Changes**: Download with annotations

```markdown
---
description: Download file from reMarkable with annotations
argument-hint: <path> [--raw]
allowed-tools: Bash
---

# Download from reMarkable

Download a file from the reMarkable tablet. By default, downloads with annotations (handwritten notes) included.

## Usage

```
/remarkable:get "Books/My Notes.pdf"        # With annotations
/remarkable:get "Books/My Notes.pdf" --raw  # Without annotations
```

## Process

1. Parse arguments:
   - `path`: Required - path to file on tablet
   - `--raw`: Optional - download without annotations

2. Download:
   ```bash
   # With annotations (default)
   rmapi geta "<path>"

   # Raw (without annotations)
   rmapi get "<path>"
   ```

3. Report result:
   ```
   Downloaded: <filename>
   Location: ./<filename>
   ```

## Notes

- Files download to the current working directory
- Use `geta` (default) to include your handwritten annotations
- Use `--raw` for the original file without annotations
```

#### 3. Put Command
**File**: `cc-plugin/remarkable/commands/put.md`
**Changes**: Upload with pandoc conversion

```markdown
---
description: Upload file to reMarkable (converts markdown to PDF)
argument-hint: <file> [folder]
allowed-tools: Bash
---

# Upload to reMarkable

Upload a file to the reMarkable tablet. Markdown files are automatically converted to PDF using pandoc.

## Usage

```
/remarkable:put document.pdf                    # Upload to root
/remarkable:put document.pdf "Books/"           # Upload to folder
/remarkable:put notes.md "Documents/"           # Convert md → pdf and upload
```

## Process

1. Parse arguments:
   - `file`: Required - local file path
   - `folder`: Optional - destination folder on tablet (default: root)

2. Check file extension:
   - If `.md`: Convert to PDF first using pandoc
   - If `.pdf` or `.epub`: Upload directly

3. For markdown conversion:
   ```bash
   # Convert to temp PDF
   pandoc "<file>" -o "/tmp/<basename>.pdf"

   # Upload the PDF
   rmapi put "/tmp/<basename>.pdf" "<folder>"
   ```

4. For direct upload:
   ```bash
   rmapi put "<file>" "<folder>"
   ```

5. Report result:
   ```
   Uploaded: <filename> → <folder>
   ```

## Supported Formats

| Extension | Action |
|-----------|--------|
| `.pdf` | Direct upload |
| `.epub` | Direct upload |
| `.md` | Convert to PDF via pandoc, then upload |

## Notes

- Markdown conversion uses pandoc's default PDF engine
- For better PDF styling, consider using a custom pandoc template
- Max file size: ~100MB via cloud API
```

### Success Criteria:

#### Automated Verification:
- [ ] ls command exists: `test -f cc-plugin/remarkable/commands/ls.md`
- [ ] get command exists: `test -f cc-plugin/remarkable/commands/get.md`
- [ ] put command exists: `test -f cc-plugin/remarkable/commands/put.md`
- [ ] All have frontmatter: `head -3 cc-plugin/remarkable/commands/*.md | grep -c "description:" | grep -q 3`

#### Manual Verification:
- [ ] `/remarkable:ls` lists files on tablet
- [ ] `/remarkable:put test.md` converts and uploads markdown
- [ ] `/remarkable:get "some-file.pdf"` downloads with annotations

**Implementation Note**: After completing this phase, pause for manual confirmation. Test with actual tablet interaction.

---

## Testing Strategy

### Automated
- File existence checks
- JSON/YAML syntax validation

### Manual Testing
1. List files: `/remarkable:ls`
2. Create test markdown: `echo "# Test" > /tmp/test.md`
3. Upload: `/remarkable:put /tmp/test.md`
4. Verify on tablet
5. Download: `/remarkable:get "test.pdf"`
6. Check downloaded file has expected content

## References

- Research: `thoughts/taras/research/2026-01-26-remarkable-cli-research.md`
- rmapi repo: https://github.com/ddvk/rmapi
- Plugin patterns: `cc-plugin/brain/`, `cc-plugin/wts/`
