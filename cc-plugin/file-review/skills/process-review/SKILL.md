---
name: process-review
description: Process review comments in a file after user finishes reviewing in file-review GUI. Extracts HTML comment markers, guides Claude through addressing each comment interactively, and removes resolved markers.
---

# Process Review Comments

Process review comments embedded in a file, apply feedback interactively, and clean up markers.

## When to Use

This skill activates when:
- User says "I'm done reviewing" after using the file-review GUI
- User asks to process or address review comments
- A file contains `<!-- review-start -->` or `<!-- review-line-start -->` markers

## Comment Format Reference

The file-review tool embeds comments as HTML markers:

**Inline comments** (for selected text):
```html
<!-- review-start(ID) -->highlighted text<!-- review-end(ID): reviewer feedback -->
```

**Line comments** (for entire lines/blocks):
```html
<!-- review-line-start(ID) -->
content spanning
multiple lines
<!-- review-line-end(ID): reviewer feedback -->
```

Where `ID` is an 8-character alphanumeric identifier (e.g., `a1b2c3d4`).

## Extraction Patterns

Use these regex patterns to extract comments:

```javascript
// Inline comments - captures: [full, id, highlighted, feedback]
/<!--\s*review-start\(([a-zA-Z0-9-]+)\)\s*-->([\s\S]*?)<!--\s*review-end\(\1\):\s*([\s\S]*?)\s*-->/g

// Line comments - captures: [full, id, highlighted, feedback]
/<!--\s*review-line-start\(([a-zA-Z0-9-]+)\)\s*-->\n?([\s\S]*?)\n?<!--\s*review-line-end\(\1\):\s*([\s\S]*?)\s*-->/g
```

For each match, extract:
- `id`: Comment identifier (capture group 1)
- `highlighted`: The marked text (capture group 2)
- `feedback`: Reviewer's comment (capture group 3)

## Interactive Workflow

### Step 1: Read and Parse

Read the file and extract all review comments. Present a summary:

```
Found 3 review comments in <filename>:

1. [inline] "implement caching" → "Consider using Redis"
2. [line] "function fetchData()..." → "Add error handling"
3. [inline] "TODO" → "Please complete this"

I'll process these one at a time.
```

### Step 2: Process Each Comment

For each comment, display the context and use the **AskUserQuestion tool** to get user input:

```
Comment 1 of 3 [inline]

Highlighted text:
> implement caching

Reviewer feedback:
> Consider using Redis instead of in-memory cache
```

Then use AskUserQuestion with options:
- **Apply edit** - Propose changes to address this feedback
- **Acknowledge** - Remove markers only (for FYI/praise comments)
- **Skip** - Keep markers for now

**For "Apply edit":**
- Analyze the feedback and propose specific changes
- Show the proposed edit to user for confirmation
- Apply the edit
- Remove the comment markers from around the edited text

**For "Acknowledge":**
- Remove only the comment markers, preserve the content
- Use for: praise, FYI notes, already-addressed items

**For "Skip":**
- Leave everything as-is
- Move to next comment

### Step 3: Remove Markers

To remove markers while preserving content:

**Inline comments:**
Replace `<!-- review-start(ID) -->text<!-- review-end(ID): feedback -->` with just `text`

**Line comments:**
Replace the full block with just the content lines (no surrounding markers)

### Step 4: Final Summary

After processing all comments:

```
Processing complete!

- Applied edits: 2
- Acknowledged: 1
- Skipped: 0

File saved.
```

## Handling Special Cases

### FYI/Praise Comments
For comments like "LGTM", "Nice work", or observations needing no action, recommend "Acknowledge" as the default option in AskUserQuestion.

### Empty Feedback
If feedback is empty or whitespace only, ask if user wants to remove the markers.

### Unclear Feedback
If you can't determine what change is needed, use AskUserQuestion to clarify what the reviewer meant.

## Example Session

```
User: I'm done reviewing the plan

Claude: Let me check the file for review comments...

Found 2 review comments in api-design.md:

1. [inline] "REST endpoints" → "Consider GraphQL for flexible queries"
2. [line] "Authentication flow..." → "LGTM, nice implementation"

Comment 1 of 2 [inline]

Highlighted text:
> REST endpoints

Reviewer feedback:
> Consider GraphQL for flexible queries

[Uses AskUserQuestion tool with options: Apply edit, Acknowledge, Skip]

User: Apply edit

Claude: I'll expand this to mention both REST and GraphQL...
[Shows proposed edit, applies it, removes markers]

Comment 2 of 2 [line]

Highlighted text:
> Authentication flow using JWT tokens...

Reviewer feedback:
> LGTM, nice implementation

This is positive feedback. Recommending Acknowledge.

[Uses AskUserQuestion tool with Acknowledge as recommended option]

User: Acknowledge

Claude: Done!

Processing complete:
- Applied edits: 1
- Acknowledged: 1

File saved.
```
