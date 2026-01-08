import { homedir } from "node:os";
import { basename } from "node:path";

/**
 * Extract project name from git root path
 */
export function getProjectName(gitRoot: string): string {
  return basename(gitRoot);
}

/**
 * Format path by replacing $HOME with ~
 */
export function formatPath(path: string): string {
  const home = homedir();
  if (path.startsWith(home)) {
    return `~${path.slice(home.length)}`;
  }
  return path;
}

/**
 * Get today's date in YYYY-MM-DD format
 */
export function getTodayDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Generate date-prefixed directory name for worktree
 */
export function generateWorktreeDirName(alias: string): string {
  return `${getTodayDate()}-${alias}`;
}

/**
 * Parse alias from a date-prefixed worktree path
 * Returns the alias portion after the YYYY-MM-DD- prefix
 */
export function parseWorktreeAlias(dirName: string): string | undefined {
  // Match YYYY-MM-DD-<alias> pattern
  const match = dirName.match(/^\d{4}-\d{2}-\d{2}-(.+)$/);
  return match?.[1];
}
