import type { Worktree } from "../config/types.ts";
import { formatPath } from "../utils/paths.ts";

/**
 * Check if fzf is available on the system
 */
export async function isFzfAvailable(): Promise<boolean> {
  try {
    await Bun.$`which fzf`.quiet();
    return true;
  } catch {
    return false;
  }
}

/**
 * Generic fzf selection interface
 */
export interface FzfOptions {
  /** Prompt string shown in fzf */
  prompt?: string;
  /** Header text shown above results */
  header?: string;
  /** Preview command (receives selection on stdin) */
  preview?: string;
  /** Allow multiple selections */
  multi?: boolean;
  /** Height of the fzf window (e.g., "50%", "20") */
  height?: string;
}

/**
 * Run fzf with provided items and return selected item(s)
 * Returns undefined if user cancels (Ctrl-C or Escape)
 */
export async function fzfSelect(
  items: string[],
  options: FzfOptions = {},
): Promise<string[] | undefined> {
  const args: string[] = [];

  if (options.prompt) {
    args.push("--prompt", options.prompt);
  }
  if (options.header) {
    args.push("--header", options.header);
  }
  if (options.preview) {
    args.push("--preview", options.preview);
  }
  if (options.multi) {
    args.push("--multi");
  }
  if (options.height) {
    args.push("--height", options.height);
  }

  // Add some nice defaults
  args.push("--border", "--reverse");

  try {
    const input = items.join("\n");
    const proc = Bun.spawn(["fzf", ...args], {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "inherit",
    });

    // Write items to stdin
    proc.stdin.write(input);
    proc.stdin.end();

    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      // User cancelled
      return undefined;
    }

    return output
      .trim()
      .split("\n")
      .filter((s) => s.length > 0);
  } catch {
    return undefined;
  }
}

/**
 * Format worktree for display in fzf
 */
function formatWorktreeForFzf(wt: Worktree): string {
  const alias = wt.alias ?? wt.branch;
  const path = formatPath(wt.path);
  return `${alias}\t${wt.branch}\t${path}`;
}

/**
 * Parse fzf selection back to alias
 */
function parseWorktreeFromFzf(selection: string): string {
  // Selection format: "alias\tbranch\tpath"
  const parts = selection.split("\t");
  return parts[0] ?? selection;
}

/**
 * Interactive worktree selection using fzf
 */
export async function selectWorktree(
  worktrees: Worktree[],
  options: { prompt?: string; excludeMain?: boolean } = {},
): Promise<Worktree | undefined> {
  // Filter out main worktree if requested
  const filteredWorktrees = options.excludeMain ? worktrees.filter((wt) => !wt.isMain) : worktrees;

  if (filteredWorktrees.length === 0) {
    return undefined;
  }

  // Format items for display
  const items = filteredWorktrees.map(formatWorktreeForFzf);

  const result = await fzfSelect(items, {
    prompt: options.prompt ?? "Select worktree > ",
    header: "ALIAS\tBRANCH\tPATH",
    preview: "ls -la {3} 2>/dev/null || echo 'Directory not found'",
    height: "50%",
  });

  if (!result || result.length === 0) {
    return undefined;
  }

  const firstResult = result[0];
  if (!firstResult) {
    return undefined;
  }

  const selectedAlias = parseWorktreeFromFzf(firstResult);
  return filteredWorktrees.find((wt) => (wt.alias ?? wt.branch) === selectedAlias);
}

/**
 * Interactive branch selection using fzf
 */
export async function selectBranch(
  branches: string[],
  options: { prompt?: string; gitRoot?: string } = {},
): Promise<string | undefined> {
  if (branches.length === 0) {
    return undefined;
  }

  // Build preview command for git log
  const gitRoot = options.gitRoot ?? process.cwd();
  const preview = `git -C "${gitRoot}" log --oneline -10 {} 2>/dev/null || echo 'Branch not found'`;

  const result = await fzfSelect(branches, {
    prompt: options.prompt ?? "Select branch > ",
    preview,
    height: "50%",
  });

  if (!result || result.length === 0) {
    return undefined;
  }

  return result[0];
}
