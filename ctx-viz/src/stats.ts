// Per-session read-stats: background computation queue + persistent cache.
// Cache lives at ~/.cache/ctx-viz/stats.json as {version, entries} where
// entries maps absolute jsonl path → { mtimeMs, sizeBytes, filesRead,
// linesRead, ctxTokens, filesReadInTree, treeFiles }. An entry is valid only
// when mtimeMs AND sizeBytes match the file's current stat. A version bump
// discards old entries (full recompute).

import { mkdir, rename, stat } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { computeSessionStats, mapPool, type ReadStats } from "./transcript.ts";
import { getTree } from "./tree.ts";

interface CacheEntry extends ReadStats {
  mtimeMs: number;
  sizeBytes: number;
}

const CACHE_DIR = join(homedir(), ".cache", "ctx-viz");
const CACHE_FILE = join(CACHE_DIR, "stats.json");
const CACHE_VERSION = 2;
const PERSIST_DEBOUNCE_MS = 1000;
const COMPUTE_CONCURRENCY = 4;

const cache = new Map<string, CacheEntry>();

// ---------- lazy load ----------

let loadPromise: Promise<void> | null = null;

/** Load the persistent cache lazily (first call wins; subsequent calls await it). */
export function ensureStatsLoaded(): Promise<void> {
  if (!loadPromise) loadPromise = loadCache();
  return loadPromise;
}

async function loadCache(): Promise<void> {
  try {
    const file = Bun.file(CACHE_FILE);
    if (!(await file.exists())) return;
    const data = await file.json();
    // Version mismatch (including the old flat-map format, which has no
    // version field) → ignore everything; entries recompute in the background.
    if (!data || typeof data !== "object" || data.version !== CACHE_VERSION) return;
    const entries = data.entries;
    if (!entries || typeof entries !== "object") return;
    for (const [path, v] of Object.entries(entries as Record<string, unknown>)) {
      const e = v as any;
      if (
        e &&
        typeof e === "object" &&
        isFiniteNum(e.mtimeMs) &&
        isFiniteNum(e.sizeBytes) &&
        isFiniteNum(e.filesRead) &&
        isFiniteNum(e.linesRead) &&
        isFiniteNum(e.ctxTokens) &&
        isFiniteNumOrNull(e.filesReadInTree) &&
        isFiniteNumOrNull(e.treeFiles)
      ) {
        cache.set(path, {
          mtimeMs: e.mtimeMs,
          sizeBytes: e.sizeBytes,
          filesRead: e.filesRead,
          linesRead: e.linesRead,
          ctxTokens: e.ctxTokens,
          filesReadInTree: e.filesReadInTree,
          treeFiles: e.treeFiles,
        });
      }
    }
  } catch (err) {
    console.error(`ctx-viz: failed to load stats cache: ${(err as Error)?.message ?? err}`);
  }
}

// ---------- synchronous lookup (requires ensureStatsLoaded() awaited) ----------

/** Valid cache entry for (path, mtimeMs, sizeBytes), or null when missing/stale. */
export function statsFromCache(path: string, mtimeMs: number, sizeBytes: number): ReadStats | null {
  const e = cache.get(path);
  if (!e || e.mtimeMs !== mtimeMs || e.sizeBytes !== sizeBytes) return null;
  return toStats(e);
}

// ---------- workspace tree file-sets (memoized per cwd+branch) ----------

// Many sessions share a cwd — resolve each workspace's file set once per
// backfill. Cleared when the queue drains so a later backfill sees fresh trees.
const treeMemo = new Map<string, Set<string> | null>();

function treeFilesFor(cwd: string, gitBranch: string | null): Set<string> | null {
  const key = `${cwd}\n${gitBranch ?? ""}`;
  if (treeMemo.has(key)) return treeMemo.get(key)!;
  let set: Set<string> | null = null;
  try {
    // No `before`: current tip is an acceptable approximation for a
    // list-level indicator.
    const tree = getTree(cwd, gitBranch, null);
    if (tree.source !== "missing") set = new Set(tree.files);
  } catch {
    set = null;
  }
  treeMemo.set(key, set);
  return set;
}

// ---------- background computation queue ----------

const queued: string[] = [];
const queuedSet = new Set<string>(); // queued + in-flight, dedupe key
let inFlight = 0;

/** Enqueue paths for background stats computation (deduped by path). */
export function enqueueStats(paths: string[]): void {
  for (const p of paths) {
    if (queuedSet.has(p)) continue;
    queuedSet.add(p);
    queued.push(p);
  }
  pump();
}

/** Queued + in-flight count. */
export function pendingCount(): number {
  return queued.length + inFlight;
}

function pump(): void {
  while (inFlight < COMPUTE_CONCURRENCY && queued.length > 0) {
    const path = queued.shift()!;
    inFlight += 1;
    computeOne(path)
      .catch((err) => {
        // computeOne swallows its own errors; this is a belt-and-braces guard
        console.error(`ctx-viz: stats worker error for ${path}: ${(err as Error)?.message ?? err}`);
      })
      .finally(() => {
        inFlight -= 1;
        queuedSet.delete(path);
        if (inFlight === 0 && queued.length === 0) treeMemo.clear();
        pump();
      });
  }
}

async function computeOne(path: string): Promise<void> {
  try {
    await ensureStatsLoaded();
    const st = await stat(path);
    const existing = cache.get(path);
    if (existing && existing.mtimeMs === st.mtimeMs && existing.sizeBytes === st.size) return;
    const stats = await computeSessionStats(path, treeFilesFor);
    cache.set(path, { mtimeMs: st.mtimeMs, sizeBytes: st.size, ...stats });
    schedulePersist();
  } catch (err) {
    console.error(`ctx-viz: stats failed for ${path}: ${(err as Error)?.message ?? err}`);
  }
}

// ---------- /api/stats support ----------

/** All currently valid cache entries, re-validated against each file's current stat. */
export async function getReadyStats(): Promise<Record<string, ReadStats>> {
  await ensureStatsLoaded();
  const ready: Record<string, ReadStats> = {};
  const entries = [...cache.entries()];
  await mapPool(entries, 64, async ([path, e]) => {
    try {
      const st = await stat(path);
      if (st.mtimeMs === e.mtimeMs && st.size === e.sizeBytes) {
        ready[path] = toStats(e);
      }
    } catch {
      // file gone — not ready
    }
  });
  return ready;
}

// ---------- debounced atomic persistence ----------

let persistTimer: ReturnType<typeof setTimeout> | null = null;
let persistChain: Promise<void> = Promise.resolve();

function schedulePersist(): void {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    persistChain = persistChain.then(persist); // serialize writes
  }, PERSIST_DEBOUNCE_MS);
}

async function persist(): Promise<void> {
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    const entries: Record<string, CacheEntry> = {};
    for (const [k, v] of cache) entries[k] = v;
    const tmp = `${CACHE_FILE}.tmp-${process.pid}`;
    await Bun.write(tmp, JSON.stringify({ version: CACHE_VERSION, entries }));
    await rename(tmp, CACHE_FILE);
  } catch (err) {
    console.error(`ctx-viz: failed to persist stats cache: ${(err as Error)?.message ?? err}`);
  }
}

function toStats(e: CacheEntry): ReadStats {
  return {
    filesRead: e.filesRead,
    linesRead: e.linesRead,
    ctxTokens: e.ctxTokens,
    filesReadInTree: e.filesReadInTree,
    treeFiles: e.treeFiles,
  };
}

function isFiniteNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function isFiniteNumOrNull(v: unknown): v is number | null {
  return v === null || isFiniteNum(v);
}
