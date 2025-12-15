---
date: 2025-12-14T21:27:24Z
researcher: Claude
git_commit: 51d3d876ba8db6861e119de29c3ed1964f588292
branch: main
repository: ai-toolbox
topic: "Markdown Comment Parsing & Persistence for Hive"
tags: [research, hive, markdown, parsing, comments, crdt, uuid]
status: complete
last_updated: 2025-12-14
last_updated_by: Claude
---

# Research: Markdown Comment Parsing & Persistence for Hive

**Date**: 2025-12-14T21:27:24Z
**Researcher**: Claude
**Git Commit**: 51d3d876ba8db6861e119de29c3ed1964f588292
**Branch**: main
**Repository**: ai-toolbox

## Research Question

What is the best approach for tracking inline comments in markdown files for the Hive application? This includes:
- Parser libraries (remark, unified, markdown-it)
- Preserving comment positions after file edits
- Conflict resolution if file is edited externally
- UUID generation and tracking strategy

## Summary

For Hive's markdown comment system, the **unified/remark ecosystem** is the recommended choice due to its robust AST support, excellent TypeScript integration, and ability to preserve source positions. For conflict resolution with external edits, a **hybrid approach** combining file watching with anchor-based position recovery is practical. **nanoid** is recommended for comment IDs due to its compact size and URL-safety.

## Detailed Findings

### 1. Markdown Parser Libraries

#### Comparison Overview

| Feature | remark (unified) | markdown-it |
|---------|------------------|-------------|
| Architecture | AST-first (mdast) | Token/renderer-first |
| Position tracking | Built-in (line, column, offset) | Limited |
| Round-trip fidelity | Excellent with remark-stringify | Requires custom work |
| HTML comment handling | Via rehype or custom plugin | Native support |
| TypeScript | Excellent | Good |
| Performance | Good | Faster |
| Plugin ecosystem | 200+ plugins | 100+ plugins |
| Benchmark score | N/A | 97.3 (Context7) |

#### Recommendation: **unified/remark**

**Why remark over markdown-it:**

1. **AST-first design**: remark produces a well-specified mdast (markdown abstract syntax tree) with position information on every node
2. **Round-trip support**: `remark-stringify` can serialize the AST back to markdown while preserving formatting
3. **Position tracking**: Every node includes `position: { start: { line, column, offset }, end: { line, column, offset } }`
4. **Ecosystem**: Part of the unified collective with rehype (HTML), retext (natural language), and more

**Core packages needed:**

```typescript
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkStringify from 'remark-stringify'
import remarkFrontmatter from 'remark-frontmatter'
import { visit } from 'unist-util-visit'
```

**Example: Parse and traverse with positions:**

```typescript
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import { visit } from 'unist-util-visit'

const processor = unified().use(remarkParse)

const tree = processor.parse(`# Hello World

<!-- hive-comment(abc123): Review this section -->
Some content here
<!-- hive-comment(abc123) -->
`)

visit(tree, 'html', (node) => {
  console.log('HTML node:', node.value)
  console.log('Position:', node.position)
  // Position: { start: { line: 3, column: 1, offset: 15 }, end: { line: 3, column: 52, offset: 66 } }
})
```

**Example: Custom plugin for Hive comments:**

```typescript
import type { Root, Html } from 'mdast'
import { visit } from 'unist-util-visit'

interface HiveComment {
  id: string
  content: string
  startLine: number
  endLine: number
}

function remarkHiveComments() {
  return (tree: Root): HiveComment[] => {
    const comments: HiveComment[] = []
    const openComments = new Map<string, { content: string; startLine: number }>()

    visit(tree, 'html', (node: Html) => {
      // Opening comment: <!-- hive-comment(uuid): content -->
      const openMatch = node.value.match(/<!--\s*hive-comment\(([^)]+)\):\s*(.+?)\s*-->/)
      if (openMatch) {
        const [, id, content] = openMatch
        openComments.set(id, {
          content,
          startLine: node.position?.start.line ?? 0
        })
        return
      }

      // Closing comment: <!-- hive-comment(uuid) -->
      const closeMatch = node.value.match(/<!--\s*hive-comment\(([^)]+)\)\s*-->/)
      if (closeMatch) {
        const [, id] = closeMatch
        const open = openComments.get(id)
        if (open) {
          comments.push({
            id,
            content: open.content,
            startLine: open.startLine,
            endLine: node.position?.end.line ?? 0
          })
          openComments.delete(id)
        }
      }
    })

    return comments
  }
}
```

#### markdown-it for HTML comments

markdown-it handles HTML comments natively and preserves them in output:

```javascript
import markdownit from 'markdown-it'

const md = markdownit({ html: true })
const html = md.render(`
<!-- hive-comment(abc): feedback -->
Some content
<!-- hive-comment(abc) -->
`)
// Comments are preserved in output
```

However, markdown-it lacks built-in position tracking, making it harder to map comments back to source locations.

### 2. Position Tracking Strategies

#### Challenge

When a file is edited (by Claude or manually), line numbers shift. A comment at line 45 might move to line 48 after edits above it.

#### Strategy A: Anchor-based tracking (Recommended)

Store contextual anchors alongside positions:

```typescript
interface CommentAnchor {
  id: string
  // Primary: exact position (may become stale)
  line: number
  column: number

  // Fallback: contextual anchors for recovery
  precedingText: string    // ~50 chars before comment
  followingText: string    // ~50 chars after comment
  nearestHeading: string   // e.g., "## Installation"
  relativeToHeading: number // lines after heading
}
```

**Recovery algorithm:**
1. Try exact line/column first
2. If content doesn't match, search for `precedingText` + comment pattern
3. If still not found, find `nearestHeading` and look `relativeToHeading` lines down
4. If all fail, mark comment as "orphaned" for user review

#### Strategy B: Content-addressable positions

Use a hash of surrounding content:

```typescript
interface ContentAnchor {
  id: string
  contentHash: string  // SHA-256 of ~200 chars around comment
  searchPattern: string // Regex to find the comment
}
```

#### Strategy C: AST-based tracking

Track position relative to AST structure:

```typescript
interface AstAnchor {
  id: string
  path: string[]  // ['root', 'heading:2', 'paragraph:1']
  offset: number  // Character offset within the node
}
```

**Recommendation:** Use Strategy A (anchor-based) as primary, with Strategy C (AST-based) as enhancement. This provides resilience without complexity.

### 3. Conflict Resolution

#### File Watching with chokidar

```typescript
import { watch } from 'chokidar'

const watcher = watch('thoughts/**/*.md', {
  persistent: true,
  ignoreInitial: true,
  awaitWriteFinish: {
    stabilityThreshold: 300,
    pollInterval: 100
  }
})

watcher.on('change', async (path) => {
  const diskContent = await fs.readFile(path, 'utf-8')
  const memoryContent = getInMemoryContent(path)

  if (diskContent !== memoryContent) {
    await reconcileChanges(path, diskContent, memoryContent)
  }
})
```

#### Reconciliation Strategies

**Option 1: Last-write-wins (Simple)**
- When external change detected, reload from disk
- Re-parse comments and update positions
- Notify user of any orphaned comments

**Option 2: Three-way merge (Complex)**
- Keep a "base" version (last known sync point)
- Compute diff between base→disk and base→memory
- Merge non-conflicting changes
- Flag conflicts for user resolution

**Option 3: CRDT-based (Advanced)**

Using Yjs for collaborative comment state:

```typescript
import * as Y from 'yjs'

const doc = new Y.Doc()
const comments = doc.getMap('comments')

// Each comment is a Y.Map
const comment = new Y.Map()
comment.set('id', 'abc123')
comment.set('content', 'Review this')
comment.set('anchor', JSON.stringify(anchor))

comments.set('abc123', comment)

// Sync between instances
doc.on('update', (update) => {
  // Broadcast to other Hive windows/instances
  broadcastUpdate(update)
})
```

**Recommendation:** Start with Option 1 (last-write-wins) for simplicity. The file on disk is the source of truth. Hive re-parses on external changes and attempts to recover comment positions using anchors.

### 4. UUID/ID Generation Strategy

#### Comparison

| Library | Size | Format | Sortable | Collision-safe |
|---------|------|--------|----------|----------------|
| UUID v4 | 36 chars | `8-4-4-4-12` hex | No | Yes |
| UUID v7 | 36 chars | `8-4-4-4-12` hex | Yes (time) | Yes |
| nanoid | 21 chars | URL-safe base64 | No | Yes |
| ULID | 26 chars | Base32 | Yes (time) | Yes |
| cuid2 | 24 chars | Alphanumeric | No | Yes (anti-guess) |

#### Recommendation: **nanoid**

**Why nanoid for Hive comments:**

1. **Compact**: 21 chars vs 36 for UUID (fits better in markdown)
2. **URL-safe**: Uses `A-Za-z0-9_-` (no escaping needed in comments)
3. **Fast**: 3.7M ops/sec
4. **Secure**: Uses `crypto.getRandomValues()`
5. **Zero dependencies**: 130 bytes minified

**Usage:**

```typescript
import { nanoid } from 'nanoid'

// Default: 21 characters
const commentId = nanoid()  // "V1StGXR8_Z5jdHi6B-myT"

// Custom length (shorter for readability)
const shortId = nanoid(10)  // "IRFa-VaY2b"

// Custom alphabet (if needed)
import { customAlphabet } from 'nanoid'
const nanoidLowercase = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 12)
const readableId = nanoidLowercase()  // "f7k2m9x3p1q8"
```

**Comment format with nanoid:**

```markdown
<!-- hive-comment(V1StGXR8_Z5): This section needs clarification -->
Some markdown content here that Claude should review.
<!-- hive-comment(V1StGXR8_Z5) -->
```

**Alternative: ULID for time-ordering**

If you need to sort comments by creation time:

```typescript
import { ulid } from 'ulid'

const commentId = ulid()  // "01ARZ3NDEKTSV4RRFFQ69G5FAV"
// First 10 chars encode timestamp, remaining 16 are random
```

### 5. Recommended Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Hive Application                      │
├─────────────────────────────────────────────────────────┤
│  CommentManager                                          │
│  ├── parseComments(markdown) → Comment[]                │
│  ├── insertComment(file, line, content) → Comment       │
│  ├── removeComment(id) → void                           │
│  └── reconcileWithDisk(file) → ReconcileResult          │
├─────────────────────────────────────────────────────────┤
│  MarkdownParser (unified/remark)                         │
│  ├── parse(content) → AST with positions                │
│  ├── findHiveComments(ast) → HiveComment[]              │
│  └── stringify(ast) → markdown                          │
├─────────────────────────────────────────────────────────┤
│  AnchorTracker                                           │
│  ├── createAnchor(comment, ast) → Anchor                │
│  ├── resolveAnchor(anchor, newContent) → Position?      │
│  └── updateAnchors(comments, changes) → void            │
├─────────────────────────────────────────────────────────┤
│  FileWatcher (chokidar)                                  │
│  ├── watch(paths) → void                                │
│  ├── onExternalChange(callback) → void                  │
│  └── ignoreNext(path) → void  // For our own writes     │
└─────────────────────────────────────────────────────────┘
```

**Data flow:**

1. User opens file → Parse with remark → Extract comments → Create anchors
2. User adds comment → Generate nanoid → Insert HTML comments → Save file
3. External edit detected → Re-parse file → Resolve anchors → Update UI
4. "Send to Claude" → Gather comments by anchor positions → Generate prompt

## Code References

- Main Hive research: `thoughts/shared/research/2025-12-14-hive-macos-app-research.md`
- Proposed comment syntax: Section 7 "Hive Comment Syntax" in main research

## External Resources

**Parser Libraries:**
- [unified ecosystem](https://unifiedjs.com/) - Official documentation
- [remark](https://github.com/remarkjs/remark) - Markdown processor
- [mdast](https://github.com/syntax-tree/mdast) - Markdown AST specification
- [markdown-it](https://github.com/markdown-it/markdown-it) - Alternative parser
- [npm-compare: markdown-it vs remark](https://npm-compare.com/markdown-it,marked,remark,remark-parse,unified) - Comparison

**ID Generation:**
- [nanoid](https://github.com/ai/nanoid) - Recommended ID generator
- [Comparing UUID, CUID, and Nanoid](https://dev.to/turck/comparing-uuid-cuid-and-nanoid-a-developers-guide-50c)
- [UUID vs ULID vs NanoID](https://prabeshthapa.medium.com/optimizing-your-system-with-the-right-unique-id-uuid-ulid-or-nanoid-78bf8b7bf200)

**Conflict Resolution:**
- [Yjs CRDT](https://github.com/yjs/yjs) - For advanced collaborative editing
- [chokidar](https://github.com/paulmillr/chokidar) - File watching
- [VS Code File Watcher Issues](https://github.com/microsoft/vscode/wiki/File-Watcher-Issues) - Platform considerations

## Decisions Made

1. **Parser**: unified/remark ecosystem for AST support and position tracking
2. **ID format**: nanoid (21 chars, URL-safe) for comment identifiers
3. **Position tracking**: Anchor-based with contextual fallbacks
4. **Conflict resolution**: Last-write-wins with anchor recovery (start simple)
5. **Comment syntax**: `<!-- hive-comment(nanoid): content -->` confirmed

## Open Questions

1. **Comment persistence**: Store anchors in SQLite or derive from file on each parse?
2. **Multi-file comments**: Should a comment be able to span/reference multiple files?
3. **Comment threading**: Support replies to comments (like GitHub PR reviews)?
4. **Offline sync**: How to handle comments when file is edited while Hive is closed?

## Related Research

- [Hive - macOS App for Managing AI CLI Agents](./2025-12-14-hive-macos-app-research.md) - Parent research document
- [Claude Agent SDK Session Lifecycle](./2025-12-14-claude-agent-sdk-session-lifecycle.md) - Session management details
