// Session listing (fast scan) + full transcript parsing.
// All parsing is defensive: try/catch per JSONL line, optional chaining on
// every transcript field. A malformed line must never fail a request.

import { readdir, stat } from "node:fs/promises";
import { join, basename } from "node:path";
import { estimateCostUSD, type Usage } from "./pricing.ts";

const SESSION_FILE_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jsonl$/;

const MIN_SIZE_BYTES = 1024;
const HEAD_BYTES = 256 * 1024;
const TAIL_BYTES = 64 * 1024;

// ---------- types ----------

export interface ReadStats {
  filesRead: number;
  linesRead: number;
  ctxTokens: number;
  filesReadInTree: number | null;
  treeFiles: number | null;
}

export interface SessionListItem {
  id: string;
  path: string;
  project: string;
  cwd: string | null;
  gitBranch: string | null;
  title: string;
  preview: string | null;
  startedAt: string | null;
  modifiedAt: string;
  sizeBytes: number;
  stats: ReadStats | null;
}

export interface SessionList {
  total: number;
  scanned: number;
  sessions: SessionListItem[];
}

export type SessionEvent =
  | { ts: string; kind: "prompt"; text: string; sidechain?: true; error?: true }
  | { ts: string; kind: "read"; file: string; lines: number; totalLines: number; offset: number; tokens: number; sidechain?: true; error?: true }
  | { ts: string; kind: "grep"; pattern: string; path: string | null; files: string[]; tokens: number; sidechain?: true; error?: true }
  | { ts: string; kind: "glob"; pattern: string; path: string | null; files: string[]; tokens: number; sidechain?: true; error?: true }
  | { ts: string; kind: "edit"; file: string; tokens: number; sidechain?: true; error?: true }
  | { ts: string; kind: "write"; file: string; lines: number; tokens: number; sidechain?: true; error?: true }
  | { ts: string; kind: "context"; contextTokens: number; outputTokens: number; model: string; sidechain?: true; error?: true };

export interface SessionMeta {
  id: string;
  path: string;
  cwd: string | null;
  gitBranch: string | null;
  version: string | null;
  title: string;
  startedAt: string | null;
  endedAt: string | null;
  elapsedMs: number;
  models: string[];
  turns: { user: number; assistant: number };
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheCreationTokens: number };
  finalContextTokens: number;
  costUSD: number;
  counts: { prompt: number; read: number; grep: number; glob: number; edit: number; write: number };
}

export interface SessionDetail {
  meta: SessionMeta;
  events: SessionEvent[];
}

// ---------- fast session listing ----------

export async function listSessions(
  claudeDir: string,
  limit: number,
  statsLookup?: (path: string, mtimeMs: number, sizeBytes: number) => ReadStats | null,
): Promise<SessionList> {
  const projectsDir = join(claudeDir, "projects");
  const candidates: Array<{ path: string; project: string; id: string; sizeBytes: number; mtimeMs: number }> = [];

  let projectDirs: string[] = [];
  try {
    const entries = await readdir(projectsDir, { withFileTypes: true });
    projectDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return { total: 0, scanned: 0, sessions: [] };
  }

  // Gather candidate files (readdir per project dir, then stat with bounded concurrency).
  const fileRefs: Array<{ project: string; name: string; path: string }> = [];
  await mapPool(projectDirs, 64, async (project) => {
    try {
      const names = await readdir(join(projectsDir, project));
      for (const name of names) {
        if (SESSION_FILE_RE.test(name)) {
          fileRefs.push({ project, name, path: join(projectsDir, project, name) });
        }
      }
    } catch {
      // unreadable project dir — skip
    }
  });

  await mapPool(fileRefs, 128, async (ref) => {
    try {
      const st = await stat(ref.path);
      if (!st.isFile() || st.size < MIN_SIZE_BYTES) return;
      candidates.push({
        path: ref.path,
        project: ref.project,
        id: ref.name.slice(0, -".jsonl".length),
        sizeBytes: st.size,
        mtimeMs: st.mtimeMs,
      });
    } catch {
      // stat race — skip
    }
  });

  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  const toScan = candidates.slice(0, Math.max(0, limit));

  const sessions: SessionListItem[] = new Array(toScan.length);
  await mapPool(
    toScan.map((c, i) => ({ c, i })),
    32,
    async ({ c, i }) => {
      const scanned = await deepScan(c.path, c.sizeBytes);
      sessions[i] = {
        id: c.id,
        path: c.path,
        project: c.project,
        cwd: scanned.cwd,
        gitBranch: scanned.gitBranch,
        title: scanned.aiTitle || scanned.preview || scanned.lastPrompt || c.id.slice(0, 8),
        preview: scanned.preview,
        startedAt: scanned.startedAt,
        modifiedAt: new Date(c.mtimeMs).toISOString(),
        sizeBytes: c.sizeBytes,
        stats: statsLookup ? statsLookup(c.path, c.mtimeMs, c.sizeBytes) : null,
      };
    },
  );

  return { total: candidates.length, scanned: toScan.length, sessions: sessions.filter(Boolean) };
}

interface DeepScanResult {
  cwd: string | null;
  gitBranch: string | null;
  startedAt: string | null;
  aiTitle: string | null;
  lastPrompt: string | null;
  preview: string | null;
}

async function deepScan(path: string, sizeBytes: number): Promise<DeepScanResult> {
  const out: DeepScanResult = { cwd: null, gitBranch: null, startedAt: null, aiTitle: null, lastPrompt: null, preview: null };
  try {
    const file = Bun.file(path);
    const headText = await file.slice(0, Math.min(HEAD_BYTES, sizeBytes)).text();
    const headLines = headText.split("\n");
    if (sizeBytes > HEAD_BYTES) headLines.pop(); // last head line may be partial

    let tailLines: string[] = [];
    if (sizeBytes > HEAD_BYTES) {
      const tailStart = Math.max(HEAD_BYTES, sizeBytes - TAIL_BYTES);
      const tailText = await file.slice(tailStart, sizeBytes).text();
      tailLines = tailText.split("\n");
      tailLines.shift(); // drop first partial line of the tail chunk
    }

    for (const line of [...headLines, ...tailLines]) {
      if (!line) continue;
      let obj: any;
      try {
        obj = JSON.parse(line);
      } catch {
        continue;
      }
      if (!obj || typeof obj !== "object") continue;
      if (out.cwd === null && typeof obj.cwd === "string") out.cwd = obj.cwd;
      if (out.gitBranch === null && typeof obj.gitBranch === "string" && obj.gitBranch) out.gitBranch = obj.gitBranch;
      if (typeof obj.timestamp === "string" && (out.startedAt === null || obj.timestamp < out.startedAt)) {
        out.startedAt = obj.timestamp;
      }
      if (obj.type === "ai-title" && typeof obj.aiTitle === "string" && obj.aiTitle) out.aiTitle = obj.aiTitle;
      if (obj.type === "last-prompt" && typeof obj.lastPrompt === "string" && obj.lastPrompt) out.lastPrompt = obj.lastPrompt;
      if (out.preview === null && obj.type === "user") {
        const content = obj.message?.content;
        if (typeof content === "string" && content.length > 0 && !content.startsWith("<")) {
          out.preview = content.slice(0, 200);
        }
      }
    }
  } catch {
    // unreadable file — return whatever we have
  }
  return out;
}

// ---------- full transcript parse ----------

interface CacheEntry {
  mtimeMs: number;
  detail: SessionDetail;
}

const parseCache = new Map<string, CacheEntry>();
const PARSE_CACHE_MAX = 8;

export async function getSession(path: string): Promise<SessionDetail> {
  const st = await stat(path);
  const cached = parseCache.get(path);
  if (cached && cached.mtimeMs === st.mtimeMs) {
    // refresh LRU position
    parseCache.delete(path);
    parseCache.set(path, cached);
    return cached.detail;
  }
  const detail = await parseSession(path);
  parseCache.delete(path);
  parseCache.set(path, { mtimeMs: st.mtimeMs, detail });
  while (parseCache.size > PARSE_CACHE_MAX) {
    const oldest = parseCache.keys().next().value;
    if (oldest === undefined) break;
    parseCache.delete(oldest);
  }
  return detail;
}

/**
 * Read-stats from a full parse. Deliberately bypasses the detail LRU cache:
 * bulk background computation must not pollute or evict cached details.
 * filesRead = distinct file paths across read events; linesRead = Σ lines
 * over all read events (re-reads count); ctxTokens = meta.finalContextTokens.
 * treeFilesFor resolves the session workspace's file set (current tip — a
 * list-level approximation); when it yields null (cwd missing / unresolvable)
 * treeFiles and filesReadInTree are null.
 */
export async function computeSessionStats(
  path: string,
  treeFilesFor?: (cwd: string, gitBranch: string | null) => Set<string> | null,
): Promise<ReadStats> {
  const { meta, events } = await parseSession(path);
  const files = new Set<string>();
  let linesRead = 0;
  for (const ev of events) {
    if (ev.kind === "read") {
      files.add(ev.file);
      linesRead += ev.lines;
    }
  }
  let treeFiles: number | null = null;
  let filesReadInTree: number | null = null;
  const treeSet = meta.cwd && treeFilesFor ? treeFilesFor(meta.cwd, meta.gitBranch) : null;
  if (treeSet) {
    treeFiles = treeSet.size;
    let inTree = 0;
    for (const f of files) if (treeSet.has(f)) inTree += 1;
    filesReadInTree = inTree;
  }
  return { filesRead: files.size, linesRead, ctxTokens: meta.finalContextTokens, filesReadInTree, treeFiles };
}

interface PendingToolUse {
  name: string;
  input: any;
  ts: string;
  sidechain: boolean;
}

async function parseSession(path: string): Promise<SessionDetail> {
  const text = await Bun.file(path).text();
  const lines = text.split("\n");

  const events: SessionEvent[] = [];
  const pending = new Map<string, PendingToolUse>();
  const seenMsgIds = new Set<string>();

  let cwd: string | null = null;
  let gitBranch: string | null = null;
  let version: string | null = null;
  let aiTitle: string | null = null;
  let lastPrompt: string | null = null;
  let preview: string | null = null;
  let startedAt: string | null = null;
  let endedAt: string | null = null;
  const models = new Set<string>();
  let userTurns = 0;
  let assistantTurns = 0;
  const usageTotals = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 };
  let finalContextTokens = 0;
  let costUSD = 0;

  for (const line of lines) {
    if (!line) continue;
    let obj: any;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    if (!obj || typeof obj !== "object") continue;

    try {
      const ts = typeof obj.timestamp === "string" ? obj.timestamp : null;
      if (ts) {
        if (startedAt === null || ts < startedAt) startedAt = ts;
        if (endedAt === null || ts > endedAt) endedAt = ts;
      }
      if (cwd === null && typeof obj.cwd === "string") cwd = obj.cwd;
      if (gitBranch === null && typeof obj.gitBranch === "string" && obj.gitBranch) gitBranch = obj.gitBranch;
      if (version === null && typeof obj.version === "string") version = obj.version;
      if (obj.type === "ai-title" && typeof obj.aiTitle === "string" && obj.aiTitle) aiTitle = obj.aiTitle;
      if (obj.type === "last-prompt" && typeof obj.lastPrompt === "string" && obj.lastPrompt) lastPrompt = obj.lastPrompt;

      const sidechain = obj.isSidechain === true;

      if (obj.type === "assistant") {
        const msg = obj.message;
        if (!msg || typeof msg !== "object") continue;
        const model: string | undefined = typeof msg.model === "string" ? msg.model : undefined;
        const usage: Usage | undefined = msg.usage && typeof msg.usage === "object" ? msg.usage : undefined;
        const msgId: string = typeof msg.id === "string" && msg.id ? msg.id : `line-${obj.uuid ?? Math.random()}`;

        // register tool_use blocks (every line of a multi-line message carries one block)
        const content = Array.isArray(msg.content) ? msg.content : [];
        for (const block of content) {
          if (block?.type === "tool_use" && typeof block.id === "string") {
            pending.set(block.id, {
              name: typeof block.name === "string" ? block.name : "",
              input: block.input ?? {},
              ts: ts ?? startedAt ?? "",
              sidechain,
            });
          }
        }

        // dedupe by message.id: aggregate usage/cost/turns once per API response
        if (!seenMsgIds.has(msgId)) {
          seenMsgIds.add(msgId);
          const isSynthetic = model === "<synthetic>";
          if (usage) {
            usageTotals.inputTokens += num(usage.input_tokens);
            usageTotals.outputTokens += num(usage.output_tokens);
            usageTotals.cacheReadTokens += num(usage.cache_read_input_tokens);
            usageTotals.cacheCreationTokens += num(usage.cache_creation_input_tokens);
          }
          if (!isSynthetic) costUSD += estimateCostUSD(model, usage);
          if (!sidechain) {
            assistantTurns += 1;
            if (model && !isSynthetic) models.add(model);
            const contextTokens =
              num(usage?.input_tokens) + num(usage?.cache_read_input_tokens) + num(usage?.cache_creation_input_tokens);
            if (!isSynthetic) {
              finalContextTokens = contextTokens;
              events.push({
                ts: ts ?? "",
                kind: "context",
                contextTokens,
                outputTokens: num(usage?.output_tokens),
                model: model ?? "",
              });
            }
          }
        }
      } else if (obj.type === "user") {
        const msg = obj.message;
        const content = msg?.content;
        const toolUseResult = obj.toolUseResult;

        if (typeof content === "string") {
          // human prompt
          if (!sidechain) userTurns += 1;
          if (preview === null && content.length > 0 && !content.startsWith("<")) preview = content.slice(0, 200);
          const ev: SessionEvent = { ts: ts ?? "", kind: "prompt", text: content.slice(0, 280) };
          if (sidechain) ev.sidechain = true;
          events.push(ev);
        } else if (Array.isArray(content)) {
          const hasToolResult = content.some((b: any) => b?.type === "tool_result");
          if (!hasToolResult) {
            // array-form human prompt (text blocks, no tool_result)
            const textBlocks = content.filter((b: any) => b?.type === "text" && typeof b.text === "string");
            if (textBlocks.length > 0) {
              if (!sidechain) userTurns += 1;
              const joined = textBlocks.map((b: any) => b.text).join("\n");
              if (preview === null && joined.length > 0 && !joined.startsWith("<")) preview = joined.slice(0, 200);
              const ev: SessionEvent = { ts: ts ?? "", kind: "prompt", text: joined.slice(0, 280) };
              if (sidechain) ev.sidechain = true;
              events.push(ev);
            }
          } else {
            for (const block of content) {
              if (block?.type !== "tool_result" || typeof block.tool_use_id !== "string") continue;
              const pend = pending.get(block.tool_use_id);
              if (!pend) continue;
              pending.delete(block.tool_use_id);
              const ev = buildToolEvent(pend, block, toolUseResult, cwd);
              if (ev) {
                if (block.is_error === true) ev.error = true;
                events.push(ev);
              }
            }
          }
        }
      }
    } catch {
      // defensive: never let one line fail the parse
    }
  }

  // tool_use blocks that never received a result (interrupted) — emit with tokens 0
  for (const pend of pending.values()) {
    const ev = buildToolEvent(pend, null, null, cwd);
    if (ev) events.push(ev);
  }

  // chronological order (ISO timestamps compare lexicographically); stable sort
  events.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));

  const counts = { prompt: 0, read: 0, grep: 0, glob: 0, edit: 0, write: 0 };
  for (const ev of events) {
    if (ev.kind in counts) (counts as any)[ev.kind] += 1;
  }

  const id = basename(path).replace(/\.jsonl$/, "");
  const elapsedMs =
    startedAt && endedAt ? Math.max(0, new Date(endedAt).getTime() - new Date(startedAt).getTime()) : 0;

  const meta: SessionMeta = {
    id,
    path,
    cwd,
    gitBranch,
    version,
    title: aiTitle || preview || lastPrompt || id.slice(0, 8),
    startedAt,
    endedAt,
    elapsedMs,
    models: [...models],
    turns: { user: userTurns, assistant: assistantTurns },
    usage: usageTotals,
    finalContextTokens,
    costUSD: Math.round(costUSD * 100) / 100,
    counts,
  };

  return { meta, events };
}

// ---------- tool event construction ----------

const FILES_CAP = 50;

function buildToolEvent(
  pend: PendingToolUse,
  resultBlock: any | null,
  toolUseResult: unknown,
  cwd: string | null,
): SessionEvent | null {
  const input = pend.input ?? {};
  const ts = pend.ts;
  const tur: any = toolUseResult && typeof toolUseResult === "object" ? toolUseResult : null;
  let ev: SessionEvent | null = null;

  switch (pend.name) {
    case "Read": {
      const file = relativize(str(input.file_path) ?? "", cwd) ?? "";
      const f = tur?.file;
      const isImage = tur?.type === "image";
      let tokens = 0;
      if (!isImage) {
        if (typeof f?.content === "string") tokens = Math.ceil(f.content.length / 4);
        else tokens = Math.ceil(toolResultTextLength(resultBlock) / 4);
      }
      ev = {
        ts,
        kind: "read",
        file,
        lines: isImage ? 0 : num(f?.numLines),
        totalLines: num(f?.totalLines),
        offset: num(input.offset) || num(f?.startLine) || 1,
        tokens: resultBlock === null && !tur ? 0 : tokens,
      };
      break;
    }
    case "Grep": {
      let files: string[] = [];
      let tokens = 0;
      if (Array.isArray(tur?.filenames) && tur.filenames.length > 0) {
        files = tur.filenames.filter((x: unknown) => typeof x === "string");
        tokens = Math.ceil(files.join("\n").length / 4);
      }
      if (tur?.mode === "content" && typeof tur?.content === "string") {
        tokens = Math.ceil(tur.content.length / 4);
        if (files.length === 0) files = grepFilesFromContent(tur.content);
      }
      ev = {
        ts,
        kind: "grep",
        pattern: str(input.pattern) ?? "",
        path: relativize(str(input.path), cwd),
        files: files.slice(0, FILES_CAP).map((p) => relativize(p, cwd) ?? p),
        tokens,
      };
      break;
    }
    case "Glob": {
      const filenames: string[] = Array.isArray(tur?.filenames)
        ? tur.filenames.filter((x: unknown) => typeof x === "string")
        : [];
      ev = {
        ts,
        kind: "glob",
        pattern: str(input.pattern) ?? "",
        path: relativize(str(input.path), cwd),
        files: filenames.slice(0, FILES_CAP).map((p) => relativize(p, cwd) ?? p),
        tokens: Math.ceil(filenames.join("\n").length / 4),
      };
      break;
    }
    case "Edit":
    case "MultiEdit":
    case "NotebookEdit": {
      let payloadLen = 0;
      if (typeof input.new_string === "string") payloadLen = input.new_string.length;
      else if (Array.isArray(input.edits)) {
        for (const e of input.edits) {
          if (typeof e?.new_string === "string") payloadLen += e.new_string.length;
        }
      } else if (typeof input.new_source === "string") payloadLen = input.new_source.length;
      ev = {
        ts,
        kind: "edit",
        file: relativize(str(input.file_path) ?? str(input.notebook_path) ?? "", cwd) ?? "",
        tokens: Math.ceil(payloadLen / 4),
      };
      break;
    }
    case "Write": {
      const content = typeof input.content === "string" ? input.content : "";
      ev = {
        ts,
        kind: "write",
        file: relativize(str(input.file_path) ?? "", cwd) ?? "",
        lines: content.length === 0 ? 0 : content.split("\n").length,
        tokens: Math.ceil(content.length / 4),
      };
      break;
    }
    default:
      return null;
  }

  if (pend.sidechain) ev.sidechain = true;
  return ev;
}

/** Path normalization per SPEC: inside cwd → relative; equal to cwd → "."; else keep absolute. */
function relativize(p: string | null | undefined, cwd: string | null): string | null {
  if (typeof p !== "string" || p.length === 0) return null;
  if (!cwd) return p;
  if (p === cwd) return ".";
  if (p.startsWith(cwd + "/")) return p.slice(cwd.length + 1);
  return p;
}

/** Best-effort extraction of `path:line:` prefixes from grep content-mode output. */
function grepFilesFromContent(content: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of content.split("\n")) {
    if (!line) continue;
    // Only match lines look like `path:<linenum>:...`; -A/-B/-C context lines
    // use `path-<linenum>-...` and `--` separators — skip those entirely.
    const m = line.match(/^([^:\s][^:]*?):\d+:/);
    if (!m) continue;
    const prefix = m[1]!;
    // single-file grep emits `line:content` — a pure-number prefix is not a path
    if (/^\d+$/.test(prefix)) continue;
    // real match prefixes are paths — a prefix with whitespace is code text
    if (/\s/.test(prefix)) continue;
    if (seen.has(prefix)) continue;
    seen.add(prefix);
    out.push(prefix);
  }
  return out;
}

/** Total text length of a tool_result block's content (string or [{type:"text",text}]). */
function toolResultTextLength(block: any): number {
  const c = block?.content;
  if (typeof c === "string") return c.length;
  if (Array.isArray(c)) {
    let n = 0;
    for (const b of c) {
      if (typeof b?.text === "string") n += b.text.length;
    }
    return n;
  }
  return 0;
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

// ---------- small async pool ----------

export async function mapPool<T>(items: T[], concurrency: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  const workers = new Array(Math.min(concurrency, items.length)).fill(0).map(async () => {
    while (i < items.length) {
      const item = items[i++]!;
      await fn(item);
    }
  });
  await Promise.all(workers);
}
