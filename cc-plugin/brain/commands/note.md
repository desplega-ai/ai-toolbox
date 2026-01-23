---
description: Quickly capture a note to your brain
argument-hint: "<note text>" [--file path.md] [--ref /path/to/file]
allowed-tools: Bash
---

# Quick Note Capture

Capture a note to your brain using the `brain add` command.

## Usage

When invoked with text, immediately run:

```bash
brain add "<note text>"
```

## Options

- **Default**: Appends to today's daily file (`YYYY/MM/DD.md`)
- **`--file path.md`**: Append to a specific file within your brain
- **`--ref /path/to/file`**: Add note with reference to an external file

## Examples

```bash
# Simple note to today's file
brain add "Meeting notes: discussed API redesign"

# Note to specific file
brain add --file projects/acme.md "Decided to use PostgreSQL"

# Note referencing code
brain add --ref ./src/auth.ts "This needs refactoring for OAuth2 support"
```

## After Capture

Confirm the note was added by showing the tail of the target file if the user wants verification.
