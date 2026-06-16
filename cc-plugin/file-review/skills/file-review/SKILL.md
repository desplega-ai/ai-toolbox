---
name: file-review
description: "File review tool \u2014 launch GUI, process comments, or install. Use when user mentions file-review, reviewing files, leaving comments, or processing review comments."
---

# File Review

Unified skill for the file-review plugin. Routes to the correct workflow based on user intent.

> **Note:** The `/file-review` and `/process-comments` commands are simple shortcuts for backward compatibility. They trigger the Review and Process workflows below. This skill is the canonical entry point.

## Intent Router

Match the user's request to one of three workflows:

| Intent signals | Workflow |
|----------------|----------|
| "install file-review", "set up file-review", "file-review not found" | **Install** |
| "review this file", "file-review `<path>`", "open for review", "let's review" | **Review a File** |
| "I left comments", "process comments", "done reviewing", "address feedback" | **Process Comments** |

If the intent is ambiguous, use AskUserQuestion:

| Question | Options |
|----------|---------|
| "What would you like to do with file-review?" | 1. Review a file (open GUI), 2. Process existing review comments, 3. Install file-review |

---

## Install

### Quick Install (Homebrew)

```bash
brew tap desplega-ai/tap
brew install file-review
```

Verify: `which file-review`

### Manual Install (from source)

Prerequisites: **bun**, **Rust**

```bash
git clone https://github.com/desplega-ai/ai-toolbox.git
cd ai-toolbox/file-review
bun install
bun run install:app
```

This symlinks to `~/.local/bin/file-review`. Ensure that's in PATH.

### Troubleshooting

- **Command not found**: Ensure `~/.local/bin` in PATH, restart terminal
- **Rust not found**: Restart terminal after installing Rust
- **Build fails on macOS**: `xcode-select --install`

### Uninstall

```bash
cd ai-toolbox/file-review && bun run uninstall:app
```

---

## Review a File

### If no path provided

Check for recently created or modified files in the current session:
- Plan files in `thoughts/<username|shared>/plans/`
- Research documents in `thoughts/<username|shared>/research/`
- Any markdown files created or updated during the conversation

Propose candidates to the user via AskUserQuestion.

**Review batches (v1 live marker scan):** In addition (or "also check/use these too"), discover files that still contain *active `review-*` markers* — these are "pending review batches/sessions" from prior file-review invocations (markers written on save/close and only stripped by later Process Comments).

Run a tightly scoped discovery using grep -l on literal starts, then *re-filter in synthesis using the exact extraction regexes from the Process section below* so discovery emits ONLY files with currently-active parseable markers at proposal time (never includes e.g. this plan file which only quotes the pattern, or docs that don't fully match the capture groups).

Discovery command (auditable; used verbatim or as superset):
```bash
grep -rl '<!--\s*review-(start|line-start)' thoughts/taras/ thoughts/shared/ --include="*.md" 2>/dev/null | head -20
```
(Scope limited to `thoughts/taras/` + `thoughts/shared/` only; always combine with re-parse verification pass `node -e ' ... use the two /.../g regexes from 156-161; if ([...c.matchAll(re)].length >0 ) include'` or equiv bash+grep quick; | head -20; see also "Review batches v1" note later in this file.)

Present the pending-marker files (with count hints if feasible) alongside the recent plans list using multi-select AskUserQuestion ("use these too?" supported).

On selection (one or many), launch exactly as below: `file-review "abs-path1" "abs-path2" ...` under Bash `run_in_background: true` `timeout: 600000` (contract allows batch to the underlying binary which supports 0-N files) then immediately flow to **Process Comments** for the returned markers (per file or collected). Existing per-comment Apply/Ack/Skip/remove logic unchanged.

### If path provided

1. **Verify the file exists** and is readable.

2. **Check if file-review is installed:**
   ```bash
   which file-review
   ```
   If not found, jump to the **Install** section above.

3. **Launch the GUI:**
   ```bash
   file-review "<absolute_path>"
   ```
   - Use the Bash tool with `run_in_background: true` and `timeout: 600000` (max allowed — 10 minutes)
   - Do **NOT** append `&` to the command — the process must block until the user closes the GUI
   - Do **NOT** use `--bg` — let the Bash tool handle backgrounding
   - When the background task completes, Claude is automatically notified and receives stdout (review comments)

   Other CLI flags: `--silent` (no comment output), `--json` (JSON output).

4. **Inform the user:**
   ```
   I've opened file-review for <filename>.

   Shortcuts: Cmd+K (add comment), Cmd+S (save), Cmd+Q (quit), Cmd+/ (help)
   ```
   No need to ask the user to notify you when done — you will be automatically notified when the GUI closes.

5. **After the background task completes**, the notification includes stdout with review comments:
   ```
   === Review Comments (N) ===

   [abc123] Line 15 (inline):
       "highlighted code"
       -> Comment text here
   ```

   Present the output, then proceed to **Process Comments** below.

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Cmd+K | Add comment to selection |
| Cmd+S | Save file |
| Cmd+Q | Quit application |
| Cmd+/ | Show all shortcuts |
| Cmd+T | Toggle theme |
| Cmd+Shift+V | Toggle vim mode |
| Cmd+O | Open file |

---

## Review batches (v1)

This extension (Phase 2 live marker scan) delivers the user-requested "review batches" as the set of files that currently contain active `review-(start|line-start)` markers (written by GUI, consumed only by Process Comments).

- No sidecar, no new Rust, no marker syntax change, no index.
- Discovery is on-demand + scope-limited live scan (see "If no path provided" block for the exact command; it runs a recheck using Extraction Patterns:156-161 so never proposes non-active).
- Re-invoking file-review on any discovered batch file re-uses the existing Tab load/append/multi + export + Process behavior fully.
- Optional helper paths (future): a `process-pending` alias could collect all such discovered + auto start Process flow without GUI reopen, but for v1 selection + normal launch + Process is sufficient.

**Phase 4 note (final)**: The zero-path behavior ("includes pending review markers / batches") + the improved batch-aware richer-context Process Comments UX (with grouping, contextSnippets=5, unified-diff preview before Apply, per-file stats in summary) is now the canonical live realization of the 2026-06 research request. Discovery scan is intentionally limited-scope (thoughts/*/ + on-demand re-filter via util using exact inline+line regexes at skill:179-184; see parseAllMarkersWithContext at 193-227). The new capabilities are documented here, in cc-plugin commands, and file-review/README.md. The loop (no-arg discover, bg GUI file-review, notify stdout, Process apply with richer prompts + safe edits) was exercised directly against this plan itself + artifacts (markers cleaned via Acknowledge/Apply paths).

## Process Comments

### Comment Format

The file-review tool embeds comments as HTML markers:

**Inline comments:**
```html
<!-- review-start(ID) -->highlighted text<!-- review-end(ID): reviewer feedback -->
```

**Line comments:**
```html
<!-- review-line-start(ID) -->
content spanning
multiple lines
<!-- review-line-end(ID): reviewer feedback -->
```

`ID` is an 8-character alphanumeric identifier.

### Extraction Patterns

```javascript
// Inline - captures: [full, id, highlighted, feedback]
/<!--\s*review-start\(([a-zA-Z0-9-]+)\)\s*-->([\s\S]*?)<!--\s*review-end\(\1\):\s*([\s\S]*?)\s*-->/g

// Line - captures: [full, id, highlighted, feedback]
/<!--\s*review-line-start\(([a-zA-Z0-9-]+)\)\s*-->\n?([\s\S]*?)\n?<!--\s*review-line-end\(\1\):\s*([\s\S]*?)\s*-->/g
```

### Marker Parsing Utility (reusable, new in Phase 3)

> DRY helper + richer context for batch processing and discovery filtration. Use the EXACT two regexes above (copy or reference by comment). Call before any group presentation or Ask.

Documented reusable parse procedure (copyable to bash `node -e` harness or direct execution in agent flow):

```javascript
// parseAllMarkersWithContext(files: string[], contextLines?: number = 5)
// returns array of: { file: string, id: string, type: 'inline'|'line',
//   highlighted: string, feedback: string,
//   contextSnippet: string,   // +/- N lines around match (for Ask description)
//   fullMarker: string, startIdx: number, endIdx: number }
function parseAllMarkersWithContext(filePaths, contextLines = 5) {
  const inlineRe = /<!--\s*review-start\(([a-zA-Z0-9-]+)\)\s*-->([\s\S]*?)<!--\s*review-end\(\1\):\s*([\s\S]*?)\s*-->/g;
  const lineRe = /<!--\s*review-line-start\(([a-zA-Z0-9-]+)\)\s*-->\n?([\s\S]*?)\n?<!--\s*review-line-end\(\1\):\s*([\s\S]*?)\s*-->/g;
  const results = [];
  for (const file of filePaths) {
    const content = require('fs').readFileSync(file, 'utf8');
    let m;
    while ((m = inlineRe.exec(content)) !== null) {
      const [full, id, highlighted, feedback] = m;
      const ctx = extractContext(content, m.index, m.index + full.length, contextLines);
      results.push({ file, id, type: 'inline', highlighted, feedback, contextSnippet: ctx, fullMarker: full, startIdx: m.index, endIdx: m.index + full.length });
    }
    while ((m = lineRe.exec(content)) !== null) {
      const [full, id, highlighted, feedback] = m;
      const ctx = extractContext(content, m.index, m.index + full.length, contextLines);
      results.push({ file, id, type: 'line', highlighted, feedback, contextSnippet: ctx, fullMarker: full, startIdx: m.index, endIdx: m.index + full.length });
    }
  }
  return results;
  function extractContext(src, sIdx, eIdx, n) {
    // line-aware context around marked span; strip markers in snippet presentation if desired for preview
    const lines = src.split('\n');
    let pos = 0, startLine = 0;
    for (let i=0; i<lines.length; i++) { if (pos + lines[i].length +1 > sIdx) { startLine = i; break; } pos += lines[i].length +1; }
    const from = Math.max(0, startLine - n), to = Math.min(lines.length-1, startLine + n);
    return lines.slice(from, to+1).join('\n');
  }
}
```

(Used by Phase2 "if no path" re-filter + the Process collect below. Re-parse always verifies live active markers.)

### Workflow (batch-aware, Phase 3 polish)

Support single-file or multi-file batches from prior discovery/review launch (the chosen set from "use these too", multi `file-review p1 p2`, or per-file `process-comments` arg). 

**Collect comments across chosen files FIRST** (then present grouped). Even for single always include richer surroundings. Use the parsing utility above (contextLines=5 default, configurable for verbose when needed).

**Step 1: Determine chosen files + Read/Parse all**

- Chosen files = list from the review batch launch, or explicit path arg(s) to process-comments / the skill, or [most recent reviewed file(s)] from conversation context.
- Parse: `const markers = parseAllMarkersWithContext(chosenFilePaths, 5);`
- Group by file for presentation.
- Present a batch-aware summary example:

```
Found 5 review comments across 2 files (batch from review session at <close time>):

thoughts/taras/plans/2026-...plan.md (3 markers):
  1. [inline@L12] "def foo()..." -> "Add docs + handle None"
  2. [line@L45-52] "for x in xs..." -> "Use enumerate"
  3. ...
thoughts/taras/research/....md (2 markers):
  ...

"N markers from the same batch" hint visible in each prompt below when context from Phase2 discovery/launch has batch size.
```

Use utility to ensure only files with ACTIVE live markers (re-verifies on disk) are included.

**Step 2: Process Each Comment (grouped presentation + richer Ask + safe apply)**

Per-marker (in file-group order or flat with file prefix), include **more surrounding lines** (the captured contextSnippet ~5 lines pre/post the marked span) + original highlighted snippet + feedback in the description / full prompt text.

The AskUserQuestion *MUST* obey ask-user/SKILL.md conventions exactly: one-sentence question ending with ?, header chip (short axis name), options: 1-5 word labels (Recommended first if applicable), one-sentence descriptions.

Current per-comment decision shape (example):

```
Question: "How to handle comment 2/5 on thoughts/taras/plans/2026-06-16-....md (3 markers same batch)? feedback='Add docs + handle None' (original highlighted span follows context below)."

Header: "Action"

Options (use tool, not plain bullets):
  label: "Apply edit (Recommended)"
  description: "Draft target text for the span per feedback; preview exact unified diff before host-edit; always strips markers."
  label: "Acknowledge"
  description: "Safe for FYI/praise/LGTM. Removes markers, leaves content unchanged."
  label: "Skip"
  description: "Leave marker+content untouched for a later pass."
```

Provide context to actor inside description or as preceding text before calling tool: the contextSnippet + highlighted.

**Apply edit branch (safe + reviewable diff preview):**

- Using the marker's `highlighted` + feedback + contextSnippet, draft the exact remediation string (`proposed` — the intended replacement content for *that span*, no markers in it).
-  `oldSpan = marker.highlighted; newContent = proposed;`
- Compute the *unified diff*:
  ```
  --- a/<relative or file> (span id=xxx)
  +++ b/<file> (addressing feedback)
  @@ -Lxx,yy +Lxx,zz @@
  -<old span lines, verbatim from the captured>
  +<proposed lines, verbatim>
  ```
- If `oldSpan.trim() === newContent.trim()` || (length delta very small and only whitespace/line-end diffs): treat as trivial — proceed directly to host edit without extra Ask OK.
- Else (normal case): BEFORE any host edit call, show the unified diff in output, then make **explicit confirmation AskUserQuestion** using proper format:

  | Question | Options |
  |----------|---------|
  | "Apply this unified diff to remediate the marker comment?" | label "Yes Apply (Recommended)" description "Exact change matches feedback + reviewable diff. Safe."; label "No, cancel" description "Redraft proposed content or pick Acknowledge/Skip." |

  Header e.g. "Confirm Diff"

  Only on "Yes Apply (Recommended)" continue; otherwise abort back to per-marker decision for that item.

- Then (after confirmation or auto trivial), **perform the remediation with host edit tool**:
  Use the `edit` tool (precise match) to replace the marker's `fullMarker` (the entire `<!-- review-start... whole end -->`) in one shot with `newContent` (the proposed remediation span, *no* marker tags).
  This both applies the edit addressing the feedback and cleanly strips the markers at the site.

- After successful edit write, optionally re-verify no markers remain for that id via quick reparse.

**Acknowledge branch:**

- Directly use `edit` tool: replace the `fullMarker` entire block string with *just* `highlighted` (preserves original content, removes markers). No diff ask needed. Ideal default for praise (see special cases).

**Skip branch:**

- No edit. Record for final count. Marker stays on disk.

Track per-file stats: `applied[file]++, acked[file]++, skipped[file]++` as you go.

**Step 3: Remove Markers**

Integrated into Apply/Ack above (the targeted host `edit` replaces the tagged block). 
- Line comments: full block removal/replace leaves the inner `content lines` exactly (the `highlighted` in parse).
- Inline: same.
- Rust remove_comment command not used here (post-GUI agent drive uses direct edit for both change+strip).

**Step 4: Final Summary (enhanced, lists files + counts per file)**

Always produce after last marker:

```
Processing complete for review batch (2 files, N from prior sessions)!

thoughts/taras/plans/2026-06-16-file-review-....md:
  - Applied edits: 1
  - Acknowledged: 2
  - Skipped: 0

thoughts/shared/research/....md:
  - Applied edits: 0
  - Acknowledged: 1
  - Skipped: 0

Totals: Applied=1, Acknowledged=3, Skipped=0
All markers stripped from touched files; disk state clean.
File(s) saved via host edits.
```

(Adapt counts/labels to the marks that participated in this run. List every chosen file even if 0 markers at parse time.)

### Special Cases

- **FYI/Praise** ("LGTM", "Nice work", "ship it", empty/positive-only): Default to **Acknowledge (Recommended)** — show why in the initial per-marker Ask description.
- **Empty feedback**: After parse, present AskUserQuestion to decide remove (ack) vs clarify; do not auto-apply.
- **Unclear feedback**: Use AskUserQuestion "Clarify intent?" with labels "Apply default edit (Recommended)" + "Acknowledge anyway" + "Skip"; include rich contextSnippet.
- **Batch hints**: When markers were grouped from discovery or multi-launch, surface "X of the Y markers from same review session/batch" in question context (available via passed closure info if any, or file list len).
- **Trivial applies** (no-op ws, formatting same): auto-apply + log as such (no extra Ask for diff); still report in summary.
- **Multi-file simultaneous edits**: safe due to sequential Ask+edit+reparse-per-step; do no concurrent host writes.
- After apply or batch complete, optional re-run of parseAll utility should yield zero for the just-processed group (proves strip worked).

Ensure every process pass starts by reading latest from disk (never cached markers).

(End of revised Process Comments section for Phase 3)