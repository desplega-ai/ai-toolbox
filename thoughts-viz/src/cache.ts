import { mkdir, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { GraphData } from "./types.ts";

export const CACHE_DIR = join(homedir(), ".thoughts");

function slugifyPath(absolutePath: string): string {
  return absolutePath
    .replace(/^\//, "")
    .replace(/[/\\]/g, "-")
    .replace(/[^a-zA-Z0-9-]/g, "")
    .toLowerCase();
}

/** Stable 8-char ID derived from the absolute path */
export function cacheId(dir: string): string {
  const hasher = new Bun.CryptoHasher("md5");
  hasher.update(resolve(dir));
  return hasher.digest("hex").slice(0, 8);
}

function cachePath(dir: string): string {
  return join(CACHE_DIR, `${slugifyPath(resolve(dir))}.json`);
}

async function computeHash(dir: string): Promise<string> {
  const entries: string[] = [];

  async function walk(d: string) {
    const items = await readdir(d, { withFileTypes: true });
    for (const item of items) {
      const full = join(d, item.name);
      if (item.isDirectory()) {
        await walk(full);
      } else if (item.name.endsWith(".md")) {
        const s = await stat(full);
        entries.push(`${full}:${s.mtimeMs}`);
      }
    }
  }

  await walk(dir);
  entries.sort();

  const hasher = new Bun.CryptoHasher("md5");
  hasher.update(entries.join("\n"));
  return hasher.digest("hex");
}

interface CacheEntry {
  hash: string;
  data: GraphData;
}

export async function loadCache(dir: string): Promise<GraphData | null> {
  const file = Bun.file(cachePath(dir));
  if (!(await file.exists())) return null;

  const entry: CacheEntry = await file.json();
  const currentHash = await computeHash(resolve(dir));

  if (entry.hash !== currentHash) return null;
  return entry.data;
}

export async function saveCache(dir: string, data: GraphData): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true });
  const hash = await computeHash(resolve(dir));
  const entry: CacheEntry = { hash, data };
  await Bun.write(cachePath(dir), JSON.stringify(entry));
}

export interface CachedIndex {
  id: string;
  path: string;
  sourceDir: string;
  fileCount: number;
  edgeCount: number;
  indexedAt: string;
  version: string;
  stale: boolean;
}

export async function listCaches(): Promise<CachedIndex[]> {
  await mkdir(CACHE_DIR, { recursive: true });
  const files = await readdir(CACHE_DIR);
  const results: CachedIndex[] = [];

  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const full = join(CACHE_DIR, file);
    const raw = (await Bun.file(full).json()) as CacheEntry;
    const dir = raw.data.metadata.sourceDir;

    let stale = true;
    try {
      const currentHash = await computeHash(dir);
      stale = currentHash !== raw.hash;
    } catch {
      stale = true;
    }

    results.push({
      id: cacheId(dir),
      path: full,
      sourceDir: dir,
      fileCount: raw.data.nodes.length,
      edgeCount: raw.data.edges.length,
      indexedAt: raw.data.metadata.indexedAt,
      version: raw.data.metadata.version,
      stale,
    });
  }

  return results;
}

/**
 * Resolve a path-or-id argument to an absolute directory path.
 * If `input` looks like an 8-char hex ID, look it up in cached indexes.
 * Otherwise treat it as a file path.
 */
export async function resolvePathOrId(input: string): Promise<string> {
  if (/^[0-9a-f]{8}$/.test(input)) {
    const caches = await listCaches();
    const match = caches.find((c) => c.id === input);
    if (match) return match.sourceDir;
    throw new Error(`No cached index with id "${input}". Run 'thoughts-viz list' to see IDs.`);
  }
  return resolve(input);
}
