# ctx-viz

Replay Claude Code sessions to visualize context usage. ctx-viz is a small local CLI that serves a single-page app: pick any session from `~/.claude/projects`, and watch it replay — which files were read, grepped, globbed, edited, and created over time, what fraction of the workspace was touched, how the context window filled up, and roughly what the session cost. Everything runs on 127.0.0.1 with zero runtime dependencies and no build step; your transcripts never leave your machine.

Dark + light themes, auto-detected from the OS, toggleable from the sidebar.

## Quick Start

From source (requires [Bun](https://bun.sh) >= 1.0):

```bash
cd ctx-viz
bun install
bun start            # serve on http://127.0.0.1:7433 and open the browser
```

Or as a global install:

```bash
bun install -g @desplega.ai/ctx-viz   # or: npm install -g @desplega.ai/ctx-viz
ctx-viz
ctx-viz -p 8080      # custom port
ctx-viz --no-open    # don't open the browser
```

Select a session in the left pane; playback starts automatically. `Space` play/pause, `←`/`→` step (`Shift` for ±10), or drag the scrubber.

## What you see

**Session list (left pane)** — the newest sessions across all projects, with AI-generated titles, project, branch, size, and per-session read-stats (`12 files · 3.4k lines · 4.2% · ctx 87k` — files read, lines read, % of the codebase touched, final context size). Filter by free text, and/or fuzzy-pick one or more directories to narrow the list.

**Replay (right pane)** —

- **Stat chips**: started, elapsed, model, estimated cost, final context size, plus live chips that update as the replay runs: files read `x/y (%)`, lines read, estimated read tokens, current context size, and `FILE CTX ~N%` — the share of the context window at that moment attributable to file reads/searches.
- **File tree**: by default shows only *touched* files, appearing live as the replay reaches them (reads flash cyan, searches violet, globs amber, edits orange, created files green with a `+` badge); toggle to the full workspace tree reconstructed at the session's start commit. Deep single-child directory ladders collapse to `first / … / last` rows (switch to "all edges" to see every level). Files outside the session's cwd group under `⋯ outside cwd`.
- **Timeline**: auto-playing with play/pause/step/restart, 0.5–8× speed, a scrubber, a monospace readout of the current event, and an SVG sparkline of context-window growth with a synced playhead.

## CLI Flags

| Flag | Default | Meaning |
|---|---|---|
| `-p, --port <n>` | `7433` | port to listen on |
| `--claude-dir <path>` | `~/.claude` | Claude home; transcripts under `<dir>/projects` |
| `--limit <n>` | `500` | max sessions to deep-scan for the list endpoint |
| `--no-open` | — | do not open the browser |
| `-h, --help` | — | usage |

## How It Works

Claude Code writes one JSONL transcript per session under `~/.claude/projects/<munged-cwd>/<session-uuid>.jsonl`. ctx-viz:

1. **Lists sessions** without reading whole files — it stats all candidates, sorts by mtime, and deep-scans only the newest `--limit` files (first 256 KB + last 64 KB) to extract title, cwd, branch, and a prompt preview.
2. **Parses the selected session** line by line (defensively — malformed lines are skipped) into a chronological event stream: prompts, reads, greps, globs, edits, writes, and per-assistant-turn context snapshots. Multi-line assistant messages are deduped by `message.id`. Parsed sessions are cached in memory keyed by path + mtime.
3. **Reconstructs the workspace** at session start via git (`rev-list --before` + `ls-tree`), falling back to `ls-files` or a filesystem walk for non-git directories, so the replay shows touched files against the full file tree.
4. **Computes list stats lazily**: per-session files/lines/context/% numbers require full parses, so they're computed by a background queue (concurrency 4) and cached persistently at `~/.cache/ctx-viz/stats.json` — the first launch backfills in ~20s for 500 sessions, after that it's instant. Entries auto-invalidate when a transcript changes.

**Estimates disclaimer:** token counts for reads/searches are estimated as `chars / 4` (shown with a `~` prefix), and cost is estimated from `usage` token counts and a static per-model price table — transcripts carry no authoritative cost field. The list-level `%` compares against the workspace tree at its *current* tip. Treat all of these as ballpark figures, not billing data.

## API Endpoints

The SPA is backed by a small JSON API (all responses `application/json`; errors are `{"error": "..."}` with 4xx/5xx):

| Endpoint | Query params | Returns |
|---|---|---|
| `GET /api/sessions` | `limit?` | `{ total, scanned, sessions: [{ id, path, project, cwd, gitBranch, title, preview, startedAt, modifiedAt, sizeBytes, stats }] }` — `stats` is `{ filesRead, linesRead, ctxTokens, filesReadInTree, treeFiles }` or `null` while computing |
| `GET /api/session` | `path` (abs jsonl path, must be under `<claude-dir>/projects`) | `{ meta, events }` — session stats (turns, usage, estimated cost, final context size) plus the chronological event stream |
| `GET /api/stats` | — | `{ ready: { <path>: stats }, pending }` — poll while the background stats queue drains |
| `GET /api/tree` | `cwd`, `branch?`, `before?` (ISO) | `{ root, source: "git"\|"fs"\|"missing", sha?, files, truncated }` |
| `GET /` | — | the SPA (`index.html`, `app.js`, `style.css`) |

The server binds `127.0.0.1` only and rejects foreign `Host` headers (DNS-rebinding guard). The `path` param is validated against the projects root (403 on traversal), and git is always invoked with argv arrays with validated `branch`/`before` values.

## Development

```bash
cd ctx-viz
bun install
bun run dev          # watch mode, no browser auto-open
bun run check        # typecheck (tsc --noEmit)
```

Layout: `src/cli.ts` (arg parsing, startup), `src/server.ts` (routes + static serving), `src/transcript.ts` (session listing + JSONL parsing), `src/stats.ts` (background stats queue + persistent cache), `src/tree.ts` (workspace tree via git/fs), `src/pricing.ts` (model price table), `public/` (vanilla-JS SPA, no build step). `SPEC.md` is the source of truth for the API contract — keep it in sync with any contract change.
