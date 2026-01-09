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

interface MergeOptions {
  cleanup?: boolean;
  force?: boolean;
}

export const mergeCommand = new Command("merge")
  .description("Merge a worktree branch into main")
  .argument("[alias]", "Alias of the worktree to merge")
  .option("--no-cleanup", "Skip cleanup prompt")
  .option("-f, --force", "Skip confirmations (except cleanup)")
  .action(async (alias: string | undefined, options: MergeOptions) => {
    const gitRoot = await getGitRoot();
    if (!gitRoot) {
      console.error(chalk.red("Error: Not in a git repository"));
      process.exit(1);
    }

    const config = await resolveConfig(gitRoot);
    const worktrees = await listWorktrees(gitRoot, config.projectName);

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
    await Bun.$`git checkout ${defaultBranch}`.cwd(gitRoot);

    // Step 2: Pull latest
    if (!options.force) {
      const proceed = await confirm(`Pull latest ${defaultBranch}?`, true);
      if (!proceed) {
        console.log(chalk.dim("Cancelled"));
        return;
      }
    }
    console.log(chalk.dim(`Pulling latest...`));
    await Bun.$`git pull`.cwd(gitRoot);

    // Step 3: Merge
    if (!options.force) {
      const proceed = await confirm(`Merge ${branchToMerge}?`, true);
      if (!proceed) {
        console.log(chalk.dim("Cancelled"));
        return;
      }
    }
    console.log(chalk.dim(`Merging ${branchToMerge}...`));
    await Bun.$`git merge ${branchToMerge}`.cwd(gitRoot);

    // Step 4: Push
    if (!options.force) {
      const proceed = await confirm(`Push to origin?`, true);
      if (!proceed) {
        console.log(chalk.dim("Skipped push"));
      } else {
        console.log(chalk.dim(`Pushing...`));
        await Bun.$`git push`.cwd(gitRoot);
      }
    } else {
      console.log(chalk.dim(`Pushing...`));
      await Bun.$`git push`.cwd(gitRoot);
    }

    console.log(chalk.green(`\n✓ Merged ${branchToMerge} into ${defaultBranch}`));

    // Step 5: Cleanup (--no-cleanup sets options.cleanup to false)
    if (options.cleanup !== false) {
      const cleanup = await confirm(`\nClean up worktree and branch?`, false);
      if (cleanup) {
        console.log(chalk.dim(`Removing worktree...`));
        await removeWorktree(worktree.path, true, gitRoot);
        console.log(chalk.dim(`Deleting branch ${branchToMerge}...`));
        await deleteBranch(branchToMerge, true, gitRoot);
        console.log(chalk.green(`✓ Cleaned up`));
      }
    }
  });
