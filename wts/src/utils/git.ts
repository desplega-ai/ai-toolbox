import { join } from "node:path";
import type { Worktree } from "../config/types.ts";
import { generateWorktreeDirName, parseWorktreeAlias } from "./paths.ts";

/**
 * Get the git repository root from current or specified directory
 */
export async function getGitRoot(cwd?: string): Promise<string | undefined> {
  try {
    const result = await Bun.$`git rev-parse --show-toplevel`.cwd(cwd ?? process.cwd()).quiet();
    return result.stdout.toString().trim();
  } catch {
    return undefined;
  }
}

/**
 * Get current branch name
 */
export async function getCurrentBranch(cwd?: string): Promise<string> {
  const result = await Bun.$`git rev-parse --abbrev-ref HEAD`.cwd(cwd ?? process.cwd()).quiet();
  return result.stdout.toString().trim();
}

/**
 * Get default branch name (main or master)
 */
export async function getDefaultBranch(cwd?: string): Promise<string> {
  try {
    // Try to get the default branch from remote
    const result = await Bun.$`git symbolic-ref refs/remotes/origin/HEAD --short`
      .cwd(cwd ?? process.cwd())
      .quiet();
    const branch = result.stdout.toString().trim();
    // Remove "origin/" prefix
    return branch.replace(/^origin\//, "");
  } catch {
    // Fall back to checking if main or master exists
    const branches = await listBranches(cwd);
    if (branches.includes("main")) return "main";
    if (branches.includes("master")) return "master";
    return "main";
  }
}

/**
 * List local branches
 */
export async function listBranches(cwd?: string): Promise<string[]> {
  const result = await Bun.$`git branch --format='%(refname:short)'`
    .cwd(cwd ?? process.cwd())
    .quiet();
  return result.stdout
    .toString()
    .split("\n")
    .map((b) => b.trim())
    .filter(Boolean);
}

/**
 * List remote branches
 */
export async function listRemoteBranches(cwd?: string): Promise<string[]> {
  const result = await Bun.$`git branch -r --format='%(refname:short)'`
    .cwd(cwd ?? process.cwd())
    .quiet();
  return result.stdout
    .toString()
    .split("\n")
    .map((b) => b.trim().replace(/^origin\//, ""))
    .filter((b) => b && b !== "HEAD");
}

/**
 * Check if a branch exists locally
 */
export async function branchExists(branch: string, cwd?: string): Promise<boolean> {
  try {
    await Bun.$`git show-ref --verify --quiet refs/heads/${branch}`.cwd(cwd ?? process.cwd());
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a branch has been merged into the default branch
 */
export async function isBranchMerged(branch: string, cwd?: string): Promise<boolean> {
  try {
    const defaultBranch = await getDefaultBranch(cwd);
    const result = await Bun.$`git branch --merged ${defaultBranch} --format='%(refname:short)'`
      .cwd(cwd ?? process.cwd())
      .quiet();
    const mergedBranches = result.stdout
      .toString()
      .split("\n")
      .map((b) => b.trim());
    return mergedBranches.includes(branch);
  } catch {
    return false;
  }
}

/**
 * Parse git worktree list --porcelain output
 */
export function parseWorktreeListOutput(output: string, projectName?: string): Worktree[] {
  const worktrees: Worktree[] = [];
  const blocks = output.trim().split("\n\n");

  for (const block of blocks) {
    if (!block.trim()) continue;

    const lines = block.split("\n");
    let path = "";
    let head = "";
    let branch = "";
    let isMain = false;

    for (const line of lines) {
      if (line.startsWith("worktree ")) {
        path = line.slice(9);
      } else if (line.startsWith("HEAD ")) {
        head = line.slice(5);
      } else if (line.startsWith("branch ")) {
        branch = line.slice(7).replace("refs/heads/", "");
      } else if (line === "bare") {
        isMain = true;
      } else if (line === "detached") {
        branch = "detached";
      }
    }

    // First worktree is typically the main one
    if (worktrees.length === 0) {
      isMain = true;
    }

    // Try to parse alias from path
    const dirName = path.split("/").pop() ?? "";
    const alias = parseWorktreeAlias(dirName);

    worktrees.push({
      path,
      head,
      branch,
      isMain,
      alias,
      projectName,
    });
  }

  return worktrees;
}

/**
 * List worktrees for the current repository
 */
export async function listWorktrees(cwd?: string, projectName?: string): Promise<Worktree[]> {
  const result = await Bun.$`git worktree list --porcelain`.cwd(cwd ?? process.cwd()).quiet();
  return parseWorktreeListOutput(result.stdout.toString(), projectName);
}

/**
 * Create a new worktree
 */
export async function createWorktree(
  path: string,
  options: {
    branch?: string;
    newBranch?: string;
    baseBranch?: string;
  },
  cwd?: string,
): Promise<void> {
  const args: string[] = ["worktree", "add"];

  if (options.newBranch) {
    // Create new branch
    args.push("-b", options.newBranch);
    args.push(path);
    if (options.baseBranch) {
      args.push(options.baseBranch);
    }
  } else if (options.branch) {
    // Use existing branch
    args.push(path, options.branch);
  } else {
    // Detached HEAD at current commit
    args.push("--detach", path);
  }

  await Bun.$`git ${args}`.cwd(cwd ?? process.cwd());
}

/**
 * Remove a worktree
 */
export async function removeWorktree(path: string, force = false, cwd?: string): Promise<void> {
  const args: string[] = ["worktree", "remove"];
  if (force) {
    args.push("--force");
  }
  args.push(path);

  await Bun.$`git ${args}`.cwd(cwd ?? process.cwd());
}

/**
 * Prune stale worktree information
 */
export async function pruneWorktrees(cwd?: string): Promise<void> {
  await Bun.$`git worktree prune`.cwd(cwd ?? process.cwd());
}

/**
 * Generate the full path for a new worktree
 */
export function generateWorktreePath(baseDir: string, alias: string): string {
  const dirName = generateWorktreeDirName(alias);
  return join(baseDir, dirName);
}

/**
 * Find a worktree by alias
 */
export async function findWorktreeByAlias(
  alias: string,
  cwd?: string,
): Promise<Worktree | undefined> {
  const worktrees = await listWorktrees(cwd);
  return worktrees.find((wt) => wt.alias === alias);
}
