import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/**
 * Expand ~ to home directory
 */
export function expandPath(path: string): string {
  if (path.startsWith("~/")) {
    return join(homedir(), path.slice(2));
  }
  if (path === "~") {
    return homedir();
  }
  return path;
}

/**
 * Replace home directory with ~ for display
 */
export function formatPath(path: string): string {
  const home = homedir();
  if (path.startsWith(home)) {
    return `~${path.slice(home.length)}`;
  }
  return path;
}

/**
 * Get today's date path: YYYY/MM/DD.md
 */
export function getTodayPath(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}/${month}/${day}.md`;
}

/**
 * Get timestamp string: YYYY-MM-DD-HHMMSS
 */
export function getTimestamp(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day}-${hours}${minutes}${seconds}`;
}

/**
 * Ensure directory exists, creating if necessary
 */
export async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

/**
 * Ensure parent directory of a file exists
 */
export async function ensureParentDir(filePath: string): Promise<void> {
  const parent = dirname(filePath);
  await ensureDir(parent);
}

/**
 * Validate a path for brain entries (S3-style)
 * Only allows alphanumeric, -, _, and /
 */
export function isValidEntryPath(path: string): boolean {
  return /^[a-zA-Z0-9_/-]+$/.test(path);
}

/**
 * Normalize entry path:
 * - Remove leading/trailing slashes
 * - Add .md extension if missing
 */
export function normalizeEntryPath(path: string): string {
  let normalized = path.replace(/^\/+|\/+$/g, "");
  if (!normalized.endsWith(".md")) {
    normalized += ".md";
  }
  return normalized;
}

/**
 * Extract title from path (last segment, capitalized)
 * e.g., "notes/my-idea" -> "My Idea"
 */
export function titleFromPath(path: string): string {
  const lastSegment = path.split("/").pop() ?? path;
  const withoutExt = lastSegment.replace(/\.md$/, "");
  return withoutExt
    .split(/[-_]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
