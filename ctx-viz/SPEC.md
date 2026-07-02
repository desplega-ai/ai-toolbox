# ctx-viz — Claude Code session context visualizer

A small CLI that serves a local SPA to **replay Claude Code sessions**: which files were read / searched / grepped / created over time, what fraction of the codebase was touched, and how many (estimated) tokens of context that exploration consumed.

This document is the single source of truth. Backend and frontend are built independently against the **API contract** below — do not deviate from field names or shapes without updating this file.

## Non-negotiables

- Runtime: **Bun** (>= 1.0). **Zero runtime npm dependencies.** (`@types/bun` devDependency only.)
- Frontend: static files under `public/` — vanilla JS ES modules, **no build step, no CDN, no external fonts**. Must work fully offline.
- Server binds `127.0.0.1` only.
- Transcript content is untrusted: render **only** via `textContent` / `createElement` — never interpolate data into `innerHTML`.
- All `git` invocations use argv arrays (`Bun.spawnSync(["git", ...])`) — never shell strings. Validate `before` (ISO date) and `branch` (`/^[A-Za-z0-9._\/-]+$/`, must not start with `-`) before passing.
- Static file serving and the `path` query param must resolve inside their allowed roots (`public/`, `~/.claude/projects/`) — reject traversal with 403.
- Parse defensively everywhere: `try/catch` per JSONL line, optional chaining on every transcript field. A malformed line must never fail a request.

## File layout & ownership

```
ctx-viz/
  SPEC.md            (this file)
  package.json       (exists — do not modify)
  tsconfig.json      (exists — do not modify)
  README.md          (owned by the INTEGRATION agent)
  src/               (owned by the BACKEND agent)
    cli.ts           shebang #!/usr/bin/env bun; arg parsing; starts server; opens browser
    server.ts        Bun.serve: API routes + static serving from public/
    transcript.ts    session listing + full transcript parsing
    stats.ts         per-session read-stats: background queue + persistent cache
    tree.ts          file tree of a cwd at a point in time (git or fs walk)
    pricing.ts       model pricing table + cost estimation
  public/            (owned by the FRONTEND agent)
    index.html
    style.css
    app.js
```

Serve `public/` relative to the source file (`path.join(import.meta.dir, "..", "public")`), not relative to `process.cwd()`.

## CLI

`ctx-viz [options]`

| Flag | Default | Meaning |
|---|---|---|
| `-p, --port <n>` | `7433` | port to listen on |
| `--claude-dir <path>` | `~/.claude` | Claude home; transcripts under `<dir>/projects` |
| `--limit <n>` | `500` | max sessions to deep-scan for the list endpoint |
| `--no-open` | — | do not open the browser |
| `-h, --help` | — | usage |

On start print `ctx-viz serving http://127.0.0.1:<port>` and open the URL (`open` on darwin, `xdg-open` on linux) unless `--no-open`.

## Data source — Claude Code transcripts

Sessions live at `~/.claude/projects/<munged-cwd>/<session-uuid>.jsonl`, one JSON object per line. Real-world scale: ~650 project dirs, ~10,000 jsonl files, individual files up to ~50 MB.

**Include only** files whose basename matches `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jsonl$/` and whose size ≥ 1024 bytes. (Excludes `agent-*.jsonl` subagent files, `journal.jsonl`, `skill-injections.jsonl`, etc.)

### Line types (Claude Code 2.1.x, observed on real data)

`user`, `assistant`, `attachment`, `system`, `summary`, `ai-title`, `last-prompt`, `permission-mode`, `mode`, `queue-operation`, `bridge-session`, `file-history-snapshot`. Ignore types you don't handle.

Common top-level fields: `type`, `uuid`, `parentUuid`, `sessionId`, `timestamp` (ISO), `cwd`, `gitBranch`, `version`, `isSidechain` (bool), `userType`, `message`, `toolUseResult`, `aiTitle` (on `ai-title` lines), `lastPrompt` (on `last-prompt` lines), `summary` + `leafUuid` (on `summary` lines).

### `assistant` entries

```json
{"type":"assistant","message":{"id":"msg_01...","model":"claude-opus-4-8","role":"assistant",
  "content":[{"type":"text","text":"..."} | {"type":"tool_use","id":"toolu_01...","name":"Read","input":{...}} | {"type":"thinking",...}],
  "usage":{"input_tokens":18379,"cache_creation_input_tokens":10762,"cache_read_input_tokens":15750,"output_tokens":13831,
           "cache_creation":{"ephemeral_1h_input_tokens":10762,"ephemeral_5m_input_tokens":0}}},
 "timestamp":"...","isSidechain":false,"cwd":"...","gitBranch":"main","version":"2.1.195"}
```

**CRITICAL:** one API response is written as **multiple consecutive lines** (one per content block), all sharing `message.id` and carrying **identical** `usage`. Verified on real data: up to 5 lines per `message.id`. **Always dedupe by `message.id`** when aggregating usage, cost, context, or counting assistant turns. `model` may be `"<synthetic>"` on injected messages — exclude those from the models list and cost.

Tool inputs we care about (`content[].name` → `input`):

| name | input fields used |
|---|---|
| `Read` | `file_path`, `offset?`, `limit?` |
| `Grep` | `pattern`, `path?`, `output_mode?`, `glob?` |
| `Glob` | `pattern`, `path?` |
| `Edit` / `MultiEdit` / `NotebookEdit` | `file_path` (MultiEdit also `edits[]`) |
| `Write` | `file_path`, `content` |

### `user` entries (human prompts and tool results)

`message.content` is either a **string** (human prompt) or an array of blocks. Tool results come as `{"type":"tool_result","tool_use_id":"toolu_01...","content": <string | [{type:"text",text}...]>, "is_error"?:true}` blocks, and the same line carries a top-level `toolUseResult` with rich data.

`toolUseResult` **may be a plain string** on errors/trivia (e.g. `"Structured output provided successfully"`) — always `typeof` guard. Object shapes (verified on real data where noted; code defensively with optional chaining):

| tool | shape |
|---|---|
| Read (text) ✅verified | `{type:"text", file:{filePath, content, numLines, startLine, totalLines}}` |
| Read (image) ✅verified | `{type:"image", file:{...}}` — count as a read; lines 0; tokens 0 |
| Grep | `{mode:"content"\|"files_with_matches"\|"count", numFiles?, filenames?:[...], content?:string, numLines?}` |
| Glob | `{filenames:[...], numFiles?, durationMs?, truncated?}` |
| Write | `{type:"create"\|"update", filePath, content, structuredPatch?}` |
| Edit ✅verified | `{filePath, oldString, newString, originalFile, replaceAll, structuredPatch, userModified}` |

Match `tool_use` → result via a pending map keyed by the tool_use block `id` == `tool_result.tool_use_id`. If a tool_use never receives a result (interrupted), still emit its event at the tool_use timestamp with `tokens: 0`.

### Path normalization

Server-side, for every file path in events and trees: if the absolute path starts with `cwd + "/"`, emit it **relative to cwd**; if equal to cwd emit `"."`; otherwise keep it absolute. The frontend groups absolute (outside-cwd) paths under a synthetic top node `⋯ outside cwd`.

### Token estimation

`tokens = Math.ceil(chars / 4)` of the relevant payload — a deliberate estimate, UI shows `~` prefix:

- **read**: `file.content.length` (fallback: total text length of the `tool_result` content block)
- **grep**: `content.length` (content mode) or `filenames.join("\n").length`
- **glob**: `filenames.join("\n").length`
- **write / edit**: length of `input.content` / `input.new_string`

### Cost estimation

No `costUSD` field exists in current transcripts — estimate from usage. Prices per **MTok** (match on substring of `message.model`, first match wins, in this order):

| model substring | input | output |
|---|---|---|
| `fable-5`, `mythos-5` | 10 | 50 |
| `opus-4-5`, `opus-4-6`, `opus-4-7`, `opus-4-8` | 5 | 25 |
| `opus` (older 4.0/4.1/3) | 15 | 75 |
| `sonnet` | 3 | 15 |
| `haiku-4` | 1 | 5 |
| `haiku-3-5` | 0.8 | 4 |
| `haiku` | 0.25 | 1.25 |
| *(no match)* | 3 | 15 |

Cache read = `0.1 × input price`. Cache write: when `usage.cache_creation` exists, `e5m × 1.25 × in + e1h × 2 × in`; else `cache_creation_input_tokens × 1.25 × in`.

`costUSD = Σ over unique message.id (sidechains INCLUDED) of (input_tokens×Pin + output_tokens×Pout + cache_read×0.1×Pin + cacheWrite) / 1e6`.

---

## HTTP API contract

All API responses `Content-Type: application/json`. Errors: status 4xx/5xx with body `{"error": "message"}`.

### `GET /api/sessions`

Query: `limit` (optional, overrides CLI default).

Fast listing — **never read whole files**: `stat` all candidate files, sort by mtime desc, deep-scan only the newest `limit`. Deep scan reads the **first 256 KB** and **last 64 KB** of the file (drop the first partial line of the tail chunk), parsing lines to extract: `cwd`, `gitBranch`, first `timestamp`, `aiTitle` (from any `ai-title` line), `lastPrompt` (from any `last-prompt` line), and the first human prompt (first `user` entry whose `message.content` is a string that does not start with `<` — command/meta XML — truncated to 200 chars).

```json
{
  "total": 9812,
  "scanned": 500,
  "sessions": [
    {
      "id": "7b92dfa0-b6d2-4838-8a18-c7cc68f99908",
      "path": "/Users/x/.claude/projects/-Users-x-code-foo/7b92dfa0-....jsonl",
      "project": "-Users-x-code-foo",
      "cwd": "/Users/x/code/foo",
      "gitBranch": "main",
      "title": "Fix flaky CI on main",
      "preview": "why is CI flaky on main?",
      "startedAt": "2026-06-29T17:11:10.694Z",
      "modifiedAt": "2026-06-29T18:03:44.000Z",
      "sizeBytes": 37812345,
      "stats": { "filesRead": 34, "linesRead": 4231, "ctxTokens": 142337, "filesReadInTree": 30, "treeFiles": 512 }
    }
  ]
}
```

`title` = `aiTitle || preview || lastPrompt || id.slice(0,8)`. Sorted by `modifiedAt` desc. Nullable fields (`cwd`, `gitBranch`, `startedAt`, `preview`) are `null` when unknown.

`stats` is `{"filesRead": n, "linesRead": n, "ctxTokens": n, "filesReadInTree": n|null, "treeFiles": n|null} | null` — per-session read-stats from a **full parse** of the transcript:

- `filesRead` = distinct file paths across `read` events; `linesRead` = Σ `lines` over all read events (re-reads count).
- `ctxTokens` = `meta.finalContextTokens` from the same parse.
- `treeFiles` / `filesReadInTree`: the session's workspace tree is resolved with the same logic as `/api/tree` for `meta.cwd` (branch = `meta.gitBranch`, **no `before`** — the current tip is an acceptable approximation for a list-level indicator). `treeFiles` = tree file count; `filesReadInTree` = distinct read-event files present in that tree. When `cwd` is missing on disk or unresolvable, both are `null` (the other fields are kept). Tree file-sets are memoized in memory per `(cwd, branch)` for the duration of a backfill — many sessions share a cwd.

Full parses are too slow to do inline for 500 sessions, so stats are **computed lazily in the background** and served from a persistent cache at `~/.cache/ctx-viz/stats.json` — `{"version": 2, "entries": {<abs jsonl path>: {mtimeMs, sizeBytes, filesRead, linesRead, ctxTokens, filesReadInTree, treeFiles}}}`. An entry is valid only if both `mtimeMs` and `sizeBytes` match the file's current stat; a `version` mismatch discards the whole file (entries recompute in the background). Atomic write via temp file + rename, debounced ~1s; survives restarts. The list response includes stats from valid cache entries and `null` otherwise; **after** responding, every scanned item with missing/stale stats is enqueued for background computation (async queue, concurrency 4, deduped by path; per-file errors are logged to stderr and skipped). Bulk stats computation bypasses the 8-entry detail LRU cache — it must never pollute or evict it. Poll `GET /api/stats` to pick up results.

### `GET /api/stats`

Snapshot of the background read-stats state (see `stats` under `/api/sessions`):

```json
{
  "ready": {
    "/Users/x/.claude/projects/-Users-x-code-foo/7b92dfa0-....jsonl": { "filesRead": 34, "linesRead": 4231, "ctxTokens": 142337, "filesReadInTree": 30, "treeFiles": 512 }
  },
  "pending": 12
}
```

`ready` = all currently **valid** cache entries (each re-validated against the file's current mtime + size). `pending` = queued + in-flight background computations. Stats are computed lazily in the background and cached across restarts; the frontend can poll this endpoint to fill in `null` stats from `/api/sessions`.

### `GET /api/session?path=<url-encoded absolute jsonl path>`

Validates `path` resolves under `<claude-dir>/projects` (403 otherwise; 404 if missing). Parses the full file (line-by-line; a 50 MB file must parse in a few seconds). Cache parsed results in-memory keyed by `path` + mtime (keep ≤ 8 entries, evict oldest).

```json
{
  "meta": {
    "id": "7b92dfa0-...",
    "path": "/abs/file.jsonl",
    "cwd": "/Users/x/code/foo",
    "gitBranch": "main",
    "version": "2.1.195",
    "title": "Fix flaky CI on main",
    "startedAt": "ISO", "endedAt": "ISO", "elapsedMs": 3154000,
    "models": ["claude-opus-4-8"],
    "turns": { "user": 12, "assistant": 87 },
    "usage": { "inputTokens": 0, "outputTokens": 0, "cacheReadTokens": 0, "cacheCreationTokens": 0 },
    "finalContextTokens": 142337,
    "costUSD": 4.18,
    "counts": { "prompt": 12, "read": 84, "grep": 21, "glob": 9, "edit": 30, "write": 6 }
  },
  "events": [ /* chronological, sorted by ts */ ]
}
```

- `startedAt`/`endedAt`: min/max `timestamp` over all lines that have one.
- `models`: distinct non-sidechain `message.model` values, excluding `<synthetic>`.
- `turns.user`: non-sidechain `user` entries that are human prompts (string content, or array containing a `text` block and no `tool_result` block). `turns.assistant`: unique non-sidechain `message.id` count.
- `usage`: sums over unique `message.id` (all chains).
- `finalContextTokens`: for the **last non-sidechain assistant** message: `input_tokens + cache_read_input_tokens + cache_creation_input_tokens`.

**Event objects** (discriminated by `kind`; `sidechain: true` present only when from a subagent; `error: true` when `tool_result.is_error`):

```jsonc
{ "ts": "ISO", "kind": "prompt",  "text": "first 280 chars of the human prompt" }
{ "ts": "ISO", "kind": "read",    "file": "src/cli.ts", "lines": 120, "totalLines": 240, "offset": 1, "tokens": 1412 }
{ "ts": "ISO", "kind": "grep",    "pattern": "foo.*bar", "path": "src", "files": ["src/a.ts"], "tokens": 220 }
{ "ts": "ISO", "kind": "glob",    "pattern": "**/*.ts",  "path": null,  "files": ["src/a.ts"], "tokens": 90 }
{ "ts": "ISO", "kind": "edit",    "file": "src/cli.ts", "tokens": 60 }
{ "ts": "ISO", "kind": "write",   "file": "src/new.ts", "lines": 88, "tokens": 700 }
{ "ts": "ISO", "kind": "context", "contextTokens": 87231, "outputTokens": 512, "model": "claude-opus-4-8" }
```

- `context` events: one per unique **non-sidechain** assistant `message.id`, at that message's first line timestamp. `contextTokens = input + cache_read + cache_creation`.
- `grep`/`glob` `files`: extracted from `filenames` when present; in grep `content` mode, best-effort parse of leading `path:` / `path:line:` prefixes from `content` lines, deduped. **Cap `files` at 50 entries** (tokens computed before capping).
- `write` lines = newline count of `input.content` + 1.

### `GET /api/tree?cwd=<abs>&branch=<name>&before=<ISO>`

File tree of `cwd` as close as possible to the session start:

1. `cwd` missing on disk → `{"root": cwd, "source": "missing", "files": [], "truncated": false}` (HTTP 200).
2. If a git work tree (`git -C cwd rev-parse --is-inside-work-tree` → `true`): `sha = git -C cwd rev-list --max-count=1 --before=<before> <branch>` (fallback to `HEAD` if branch invalid/empty result). If a sha was found: `files = git -C cwd ls-tree -r --name-only <sha>`, respond `source:"git"` and include `"sha"`. If no sha: `files = git -C cwd ls-files`, `source:"git"`, no sha.
3. Not a git repo → filesystem walk from `cwd`: skip `.git`, `node_modules`, `.venv`, `venv`, `__pycache__`, `dist`, `build`, `target`, `.next`, `.cache`; max depth 12; stop at 30,000 files and set `"truncated": true`. `source:"fs"`.

```json
{ "root": "/Users/x/code/foo", "source": "git", "sha": "94fb42f...", "files": ["src/a.ts", "README.md"], "truncated": false }
```

`files` are `/`-separated paths relative to root, no leading `./`.

### Static

`GET /` → `public/index.html`; `/app.js`, `/style.css` served with correct content types; unknown paths → 404.

---

## Frontend — SPA spec

Single page, split view. State: sessions list → select session → fetch `/api/session` and `/api/tree` **in parallel** (tree params from the detail's `meta.cwd`/`meta.gitBranch`/`meta.startedAt`; therefore fetch detail first, then tree — or take cwd from the list item and fetch both in parallel; either is fine as long as a missing tree never blocks the timeline).

### Layout (30 / 70)

```
┌──────────────┬──────────────────────────────────────────────┐
│ ctx-viz      │ header: stat chips (2 rows)                  │
│ [filter…]    ├──────────────────────────────────────────────┤
│ ┌──────────┐ │                                              │
│ │session   │ │   file tree (scrollable, fills space)        │
│ │cards     │ │                                              │
│ │…         │ ├──────────────────────────────────────────────┤
│ └──────────┘ │ current-event readout                        │
│              │ context sparkline (56px, SVG)                │
│              │ ⏮ ◀ ▶/⏸ ▶| [speed] [scrubber────] 482/1204 │
└──────────────┴──────────────────────────────────────────────┘
```

Left pane: 30% width (min 280px). Right pane: 70%. No session selected → centered empty state ("Select a session to replay its context usage").

### Session list (left)

- Filter input at top (matches title + cwd, case-insensitive, live).
- Card per session: **title** (1 line, ellipsis), dir (basename of `cwd`, fallback `project`), meta row: relative time ("2h ago") · human size ("38 MB") · branch. Selected card highlighted with accent border. Footer line: "showing 500 of 9,812 sessions".

### Header stat chips (right, on session load)

Static chips: `Started` (local datetime), `Elapsed` (e.g. `52m 34s`), `Model` (joined, shortened e.g. `opus-4-8`), `Cost ~$4.18`, `Final ctx 142.3k`, `cwd` (ellipsized middle, full on title/hover).
**Live chips** (accent-bordered; update during playback): `Files read 34/512 · 6.6%`, `Lines 4,231`, `~Read tok 52.9k`, `Ctx now 87.2k`.
When tree `source === "missing"`: Files chip shows `34 read · tree n/a` and a slim banner "workspace not found — showing touched files only".

### File tree

- Built from the union of `tree.files` and every file appearing in events (relative paths merge into the tree; absolute paths go under a synthetic root node `⋯ outside cwd`; files from events not present in `tree.files` are marked **new** when first created by a `write` event, or added as plain nodes if only read).
- Directories first, then files, both alphabetical. Root level expanded initially; everything else collapsed. Chevron toggles. Render children lazily (only when a dir is expanded) — trees can be 30k files.
- Per-node state marks (from cumulative playback state): colored dots per kind touched (read=cyan, grep=violet, glob=amber, edit=orange, write/new=green), read-count as opacity/intensity ramp, `+` badge on files created during the session. Collapsed directories show an aggregate dot if any descendant was touched, plus a small count of touched descendants.
- On the event at the playhead: auto-expand all ancestor dirs of the touched file(s), flash-highlight the node (~400ms glow in the kind color), `scrollIntoView({block:"nearest"})`.
- Scrubbing backwards fully recomputes cumulative state from event 0 (fast: plain loop; then re-render marks). Forward play applies events incrementally.

### Timeline / playback

- Auto-plays on load. Controls: restart ⏮, step back ◀, play/pause ▶/⏸, step forward ▶|, speed select `0.5× 1× 2× 4× 8×` (1× = 8 events/sec, interval = 125ms/speed), scrubber `<input type=range min=0 max=events.length>`, counter `482 / 1,204`.
- Keyboard: `Space` play/pause, `←`/`→` step, `Shift+←/→` ±10. Ignore keys when the filter input is focused.
- Current-event readout, monospace, e.g.: `READ src/cli.ts · 120 lines · ~1.4k tok`, `GREP "pattern" · 8 files`, `PROMPT "why is CI flaky…"`, `CTX → 87.2k`. Sidechain events prefixed `◈` and dimmed. Error events tinted red.
- At the end: pause; pressing play restarts from 0.
- Playback finished state shows a subtle "replay ✓" pill.

### Context sparkline

SVG area chart of `contextTokens` from `context` events, x = global event index, y = tokens (0-based). Decimate to ≤ 600 points if needed. Vertical playhead line synced with the scrubber. Max-value label top-right (`peak 142.3k`). Cyan stroke, translucent fill.

### Metrics semantics (client-side, cumulative at playhead)

- `filesRead` = set of distinct `read` event files **that exist in `tree.files`** → `%` = `filesRead.size / tree.files.length` (omit % when tree missing/empty).
- Additionally count distinct read files NOT in the tree (outside cwd / untracked) into the absolute number: display `34/512` where 34 = in-tree distinct reads; if out-of-tree reads exist append `(+3 outside)` on the chip title attribute.
- `lines` = Σ `lines` over all read events (re-reads count — it's cumulative context spend).
- `readTokens` = Σ `tokens` over read+grep+glob events.
- `ctxNow` = `contextTokens` of the latest `context` event ≤ playhead.
- Sidechain events count toward files/lines/tokens (subagents explore too) — legend notes "incl. subagents ◈".

### Legend

Fixed row under the tree or in the header: `● read  ● search  ● glob  ● edit  ● new  ◈ subagent`.

### Design language

Dark, "mission control" aesthetic. Elegant, dense but breathable. **No external assets.**

- Tokens: `--bg0:#0a0d13; --bg1:#10141c; --bg2:#161b26; --border:#232b3a; --text:#d7dfee; --dim:#8b94a9; --cyan:#4cc9f0; --violet:#b18cff; --amber:#ffb454; --orange:#ff9e64; --green:#9ece6a; --red:#f7768e;`
- Type: UI `-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`; data/paths/numbers `ui-monospace, "SF Mono", Menlo, monospace`, 12–13px.
- Chips: rounded 6px, `--bg2` fill, 1px `--border`; live chips get a 1px accent (cyan) border and a subtle inner glow.
- Tree rows 22px, hover `--bg2`, flash animation via a CSS class with `box-shadow`/`background` transition.
- Scrubber styled (webkit slider) with cyan thumb. Buttons: ghost style, hover lift.
- Loading: skeleton shimmer on list; centered spinner + "parsing session…" while detail loads (large files take seconds).
- Errors: non-blocking toast, red-tinted, auto-dismiss 6s.

---

## Verification (used by build + integration agents)

```bash
cd /Users/taras/Documents/code/ai-toolbox/ctx-viz
bun src/cli.ts --no-open --port 43117 &   # backend self-test uses 43117; integration uses 43119
curl -s localhost:43117/api/sessions | jq '.total, .scanned, .sessions[0]'
P=$(curl -s localhost:43117/api/sessions | jq -r '.sessions[0].path' | jq -sRr @uri)
curl -s "localhost:43117/api/session?path=$P" | jq '.meta, (.events | length), (.events | map(.kind) | group_by(.) | map({(.[0]): length}) | add)'
CWD=$(printf %s "/Users/taras/Documents/code/ai-toolbox" | jq -sRr @uri)
curl -s "localhost:43117/api/tree?cwd=$CWD&branch=main&before=2026-07-01T00:00:00Z" | jq '.source, .sha, (.files|length)'
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" localhost:43117/
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" localhost:43117/app.js
curl -s "localhost:43117/api/session?path=%2Fetc%2Fpasswd" | jq .   # → {"error": ...} with 403
node --check public/app.js
kill %1
```

Acceptance: sessions list returns in < 3s; a ~40 MB session parses in < 5s; all shapes match this contract; no endpoint ever returns HTML for `/api/*`.
