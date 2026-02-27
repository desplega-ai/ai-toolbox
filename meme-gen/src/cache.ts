/**
 * Template cache — stores imgflip templates locally to avoid hitting
 * the API on every command. Default TTL: 24 hours.
 */

import { existsSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { MemeTemplate } from "./imgflip.js";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CacheData {
  fetchedAt: number;
  templates: MemeTemplate[];
}

function getCacheDir(): string {
  const dir = join(homedir(), ".cache", "meme-gen");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function getCachePath(): string {
  return join(getCacheDir(), "templates.json");
}

export async function readCache(): Promise<CacheData | null> {
  const path = getCachePath();
  try {
    const file = Bun.file(path);
    if (!(await file.exists())) return null;

    const data: CacheData = await file.json();
    const age = Date.now() - data.fetchedAt;

    if (age > CACHE_TTL_MS) return null; // expired
    return data;
  } catch {
    return null;
  }
}

export async function writeCache(templates: MemeTemplate[]): Promise<void> {
  const data: CacheData = {
    fetchedAt: Date.now(),
    templates,
  };
  await Bun.write(getCachePath(), JSON.stringify(data, null, 2));
}

export async function clearCache(): Promise<void> {
  const path = getCachePath();
  try {
    const { unlinkSync } = await import("fs");
    if (existsSync(path)) unlinkSync(path);
  } catch {
    // ignore
  }
}
