import chalk from "chalk";
import { Command } from "commander";
import { resolveConfig } from "../config/local.ts";
import type { Worktree } from "../config/types.ts";
import {
  deleteBranch,
  getGitRoot,
  isBranchMerged,
  listWorktrees,
  pruneWorktrees,
  removeWorktree,
} from "../utils/git.ts";
import { formatPath } from "../utils/paths.ts";
import { confirm } from "../utils/prompts.ts";

interface CleanupOptions {
  dryRun?: boolean;
  force?: boolean;
  olderThan?: string;
  unmerged?: boolean;
  deleteBranches?: boolean;
}

/**
 * Parse a date string from worktree directory name (YYYY-MM-DD format)
 */
function parseWorktreeDate(dirName: string): Date | undefined {
  const match = dirName.match(/^(\d{4}-\d{2}-\d{2})-/);
  if (!match?.[1]) {
    return undefined;
  }
  const date = new Date(match[1]);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/**
 * Check if a worktree is older than the specified number of days
 */
function isOlderThan(worktreePath: string, days: number): boolean {
  const dirName = worktreePath.split("/").pop() ?? "";
  const date = parseWorktreeDate(dirName);

  if (!date) {
    return false; // Can't determine age, don't include
  }

  const now = new Date();
  const ageMs = now.getTime() - date.getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);

  return ageDays > days;
}

/**
 * Categorize worktrees for cleanup
 */
async function categorizeWorktrees(
  worktrees: Worktree[],
  gitRoot: string,
  options: { olderThanDays?: number; includeUnmerged?: boolean },
): Promise<{
  merged: Worktree[];
  unmerged: Worktree[];
  stale: Worktree[];
  active: Worktree[];
}> {
  const merged: Worktree[] = [];
  const unmerged: Worktree[] = [];
  const stale: Worktree[] = [];
  const active: Worktree[] = [];

  for (const wt of worktrees) {
    // Skip main worktree
    if (wt.isMain) {
      continue;
    }

    // Check if branch is merged
    const isMerged = await isBranchMerged(wt.branch, gitRoot);
    if (isMerged) {
      merged.push(wt);
      continue;
    }

    // Check if older than threshold
    if (options.olderThanDays !== undefined && isOlderThan(wt.path, options.olderThanDays)) {
      stale.push(wt);
      continue;
    }

    // Include unmerged if flag is set
    if (options.includeUnmerged) {
      unmerged.push(wt);
      continue;
    }

    active.push(wt);
  }

  return { merged, unmerged, stale, active };
}

export const cleanupCommand = new Command("cleanup")
  .description("Remove merged or stale worktrees")
  .option("--dry-run", "Show what would be removed without removing")
  .option("-f, --force", "Force removal without confirmation")
  .option("--older-than <days>", "Include worktrees older than N days")
  .option("--unmerged", "Include all unmerged worktrees")
  .option("--delete-branches", "Also delete the associated branches")
  .action(async (options: CleanupOptions) => {
    const gitRoot = await getGitRoot();

    if (!gitRoot) {
      console.error(chalk.red("Error: Not in a git repository"));
      process.exit(1);
    }

    const config = await resolveConfig(gitRoot);
    const worktrees = await listWorktrees(gitRoot, config.projectName);

    // Parse older-than option
    let olderThanDays: number | undefined;
    if (options.olderThan) {
      olderThanDays = Number.parseInt(options.olderThan, 10);
      if (Number.isNaN(olderThanDays) || olderThanDays < 0) {
        console.error(chalk.red("Error: --older-than must be a positive number"));
        process.exit(1);
      }
    }

    // Prune any stale worktree entries first
    await pruneWorktrees(gitRoot);

    // Categorize worktrees
    const { merged, unmerged, stale, active } = await categorizeWorktrees(worktrees, gitRoot, {
      olderThanDays,
      includeUnmerged: options.unmerged,
    });

    const toRemove = [...merged, ...unmerged, ...stale];

    if (toRemove.length === 0) {
      console.log(chalk.green("No worktrees to clean up"));
      if (active.length > 0) {
        console.log(chalk.dim(`${active.length} active worktree(s) remain`));
      }
      return;
    }

    // Display what will be removed
    console.log(chalk.bold("Worktrees to remove:\n"));

    if (merged.length > 0) {
      console.log(chalk.yellow("Merged branches:"));
      for (const wt of merged) {
        console.log(`  ${wt.alias ?? wt.branch} ${chalk.dim(`(${formatPath(wt.path)})`)}`);
      }
      console.log();
    }

    if (unmerged.length > 0) {
      console.log(chalk.yellow("Unmerged branches:"));
      for (const wt of unmerged) {
        console.log(`  ${wt.alias ?? wt.branch} ${chalk.dim(`(${formatPath(wt.path)})`)}`);
      }
      console.log();
    }

    if (stale.length > 0) {
      console.log(chalk.yellow(`Older than ${olderThanDays} days:`));
      for (const wt of stale) {
        console.log(`  ${wt.alias ?? wt.branch} ${chalk.dim(`(${formatPath(wt.path)})`)}`);
      }
      console.log();
    }

    if (options.deleteBranches) {
      console.log(chalk.dim("(branches will also be deleted)"));
    }

    if (options.dryRun) {
      console.log(chalk.dim("(dry run - no changes made)"));
      return;
    }

    // Confirm removal
    if (!options.force) {
      const message = options.deleteBranches
        ? `Remove ${toRemove.length} worktree(s) and their branches?`
        : `Remove ${toRemove.length} worktree(s)?`;
      const shouldProceed = await confirm(message, false);
      if (!shouldProceed) {
        console.log(chalk.dim("Cancelled"));
        return;
      }
    }

    // Remove worktrees
    let removedWorktrees = 0;
    let removedBranches = 0;
    let failed = 0;

    for (const wt of toRemove) {
      try {
        console.log(chalk.dim(`Removing ${wt.alias ?? wt.branch}...`));
        await removeWorktree(wt.path, true, gitRoot);
        removedWorktrees++;

        // Delete branch if requested
        if (options.deleteBranches && wt.branch && wt.branch !== "detached") {
          try {
            await deleteBranch(wt.branch, true, gitRoot);
            removedBranches++;
          } catch (error) {
            console.error(chalk.yellow(`  Warning: Could not delete branch ${wt.branch}:`));
            console.error(chalk.dim(`  ${error instanceof Error ? error.message : String(error)}`));
          }
        }
      } catch (error) {
        console.error(chalk.red(`  Failed to remove ${wt.alias ?? wt.branch}:`));
        console.error(chalk.dim(`  ${error instanceof Error ? error.message : String(error)}`));
        failed++;
      }
    }

    // Summary
    console.log();
    if (removedWorktrees > 0) {
      console.log(chalk.green(`Removed ${removedWorktrees} worktree(s)`));
    }
    if (removedBranches > 0) {
      console.log(chalk.green(`Deleted ${removedBranches} branch(es)`));
    }
    if (failed > 0) {
      console.log(chalk.red(`Failed to remove ${failed} worktree(s)`));
    }
    if (active.length > 0) {
      console.log(chalk.dim(`${active.length} active worktree(s) remain`));
    }
  });
