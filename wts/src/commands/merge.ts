import chalk from "chalk";
import { Command } from "commander";
import { resolveConfig } from "../config/local.ts";
import {
  deleteBranch,
  findWorktreeByAlias,
  getDefaultBranch,
  getGitRoot,
  listWorktrees,
  removeWorktree,
} from "../utils/git.ts";
import { selectWorktree } from "../integrations/fzf.ts";
import { confirm } from "../utils/prompts.ts";

/**
 * Get commits that would be merged from branch into baseBranch
 */
async function getCommitsToMerge(
  branch: string,
  baseBranch: string,
  cwd: string,
): Promise<string[]> {
  const result = await Bun.$`git log ${baseBranch}..${branch} --oneline`.cwd(cwd).quiet();
  return result.stdout
    .toString()
    .trim()
    .split("\n")
    .filter(Boolean);
}

interface MergeOptions {
  cleanup?: boolean;
  pull?: boolean;
  force?: boolean;
}

export const mergeCommand = new Command("merge")
  .description("Merge a worktree branch into main")
  .argument("[alias]", "Alias of the worktree to merge")
  .option("--no-cleanup", "Skip cleanup prompt")
  .option("--no-pull", "Skip pulling latest main")
  .option("-f, --force", "Skip confirmations (except cleanup)")
  .action(async (alias: string | undefined, options: MergeOptions) => {
    const gitRoot = await getGitRoot();
    if (!gitRoot) {
      console.error(chalk.red("Error: Not in a git repository"));
      process.exit(1);
    }

    const config = await resolveConfig(gitRoot);
    const worktrees = await listWorktrees(gitRoot, config.projectName);

    // Find the main worktree (where we'll do the merge)
    const mainWorktree = worktrees.find((wt) => wt.isMain);
    if (!mainWorktree) {
      console.error(chalk.red("Error: Could not find main worktree"));
      process.exit(1);
    }
    const mainPath = mainWorktree.path;

    // Find or select worktree
    let worktree;
    if (alias) {
      worktree = await findWorktreeByAlias(alias, gitRoot);
      if (!worktree) {
        console.error(chalk.red(`Error: No worktree found with alias "${alias}"`));
        process.exit(1);
      }
    } else {
      const nonMain = worktrees.filter((wt) => !wt.isMain);
      if (nonMain.length === 0) {
        console.error(chalk.yellow("No worktrees to merge"));
        process.exit(1);
      }
      worktree = await selectWorktree(worktrees, { excludeMain: true });
      if (!worktree) {
        console.log(chalk.dim("Cancelled"));
        return;
      }
    }

    if (worktree.isMain) {
      console.error(chalk.red("Error: Cannot merge the main worktree"));
      process.exit(1);
    }

    const defaultBranch = await getDefaultBranch(gitRoot);
    const branchToMerge = worktree.branch;

    console.log(chalk.bold(`\nMerging ${chalk.cyan(branchToMerge)} into ${chalk.cyan(defaultBranch)}\n`));

    // Step 1: Switch to default branch
    if (!options.force) {
      const proceed = await confirm(`Switch to ${defaultBranch}?`, true);
      if (!proceed) {
        console.log(chalk.dim("Cancelled"));
        return;
      }
    }
    console.log(chalk.dim(`Switching to ${defaultBranch}...`));
    await Bun.$`git checkout ${defaultBranch}`.cwd(mainPath);

    // Step 2: Pull latest (skip with --no-pull)
    if (options.pull !== false) {
      if (!options.force) {
        const proceed = await confirm(`Pull latest ${defaultBranch}?`, true);
        if (!proceed) {
          console.log(chalk.dim("Skipped pull"));
        } else {
          console.log(chalk.dim(`Pulling latest...`));
          await Bun.$`git pull`.cwd(mainPath);
        }
      } else {
        console.log(chalk.dim(`Pulling latest...`));
        await Bun.$`git pull`.cwd(mainPath);
      }
    }

    // Step 3: Check if there are commits to merge
    const commitsToMerge = await getCommitsToMerge(branchToMerge, defaultBranch, mainPath);
    if (commitsToMerge.length === 0) {
      console.log(
        chalk.yellow(
          `\nNo commits to merge - ${branchToMerge} has no new commits compared to ${defaultBranch}`,
        ),
      );
      console.log(chalk.dim("The branch may need to be rebased on latest main first."));
      console.log(chalk.dim("Aborting to prevent accidental data loss."));
      process.exit(1);
    }

    console.log(chalk.dim(`\nCommits to merge (${commitsToMerge.length}):`));
    for (const commit of commitsToMerge.slice(0, 5)) {
      console.log(chalk.dim(`  ${commit}`));
    }
    if (commitsToMerge.length > 5) {
      console.log(chalk.dim(`  ... and ${commitsToMerge.length - 5} more`));
    }

    // Step 4: Merge
    if (!options.force) {
      const proceed = await confirm(`Merge ${branchToMerge}?`, true);
      if (!proceed) {
        console.log(chalk.dim("Cancelled"));
        return;
      }
    }
    console.log(chalk.dim(`Merging ${branchToMerge}...`));
    const mergeResult = await Bun.$`git merge ${branchToMerge}`.cwd(mainPath).quiet();
    const mergeOutput = mergeResult.stdout.toString();
    console.log(chalk.dim(mergeOutput.trim()));

    // Safety check: verify merge actually did something
    if (mergeOutput.includes("Already up to date")) {
      console.log(chalk.yellow("\nMerge reported 'Already up to date' - no changes were made"));
      console.log(chalk.red("Aborting cleanup to prevent data loss"));
      process.exit(1);
    }

    // Step 5: Push
    if (!options.force) {
      const proceed = await confirm(`Push to origin?`, true);
      if (!proceed) {
        console.log(chalk.dim("Skipped push"));
      } else {
        console.log(chalk.dim(`Pushing...`));
        await Bun.$`git push`.cwd(mainPath);
      }
    } else {
      console.log(chalk.dim(`Pushing...`));
      await Bun.$`git push`.cwd(mainPath);
    }

    console.log(chalk.green(`\n✓ Merged ${branchToMerge} into ${defaultBranch}`));

    // Step 6: Cleanup (--no-cleanup sets options.cleanup to false)
    if (options.cleanup !== false) {
      const cleanup = await confirm(`\nClean up worktree and branch?`, false);
      if (cleanup) {
        console.log(chalk.dim(`Removing worktree...`));
        await removeWorktree(worktree.path, true, mainPath);
        console.log(chalk.dim(`Deleting branch ${branchToMerge}...`));
        // Use safe delete (-d) instead of force delete (-D)
        try {
          await deleteBranch(branchToMerge, false, mainPath);
        } catch {
          console.error(chalk.red("Branch not fully merged - keeping branch for safety"));
          console.log(chalk.dim("Use 'git branch -D <branch>' to force delete if intended"));
        }
        console.log(chalk.green(`✓ Cleaned up`));
      }
    }
  });
