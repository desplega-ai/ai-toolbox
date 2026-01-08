import chalk from "chalk";
import { Command } from "commander";
import { findWorktreeByAlias, getGitRoot, removeWorktree } from "../utils/git.ts";

interface DeleteOptions {
  force?: boolean;
}

export const deleteCommand = new Command("delete")
  .alias("rm")
  .description("Remove a worktree")
  .argument("<alias>", "Alias of the worktree to remove")
  .option("-f, --force", "Force removal even with uncommitted changes")
  .action(async (alias: string, options: DeleteOptions) => {
    const gitRoot = await getGitRoot();

    if (!gitRoot) {
      console.error(chalk.red("Error: Not in a git repository"));
      process.exit(1);
    }

    const worktree = await findWorktreeByAlias(alias, gitRoot);

    if (!worktree) {
      console.error(chalk.red(`Error: No worktree found with alias "${alias}"`));
      process.exit(1);
    }

    if (worktree.isMain) {
      console.error(chalk.red("Error: Cannot delete the main worktree"));
      process.exit(1);
    }

    console.log(chalk.dim(`Removing worktree at ${worktree.path}...`));

    try {
      await removeWorktree(worktree.path, options.force, gitRoot);
      console.log(chalk.green(`Removed worktree "${alias}"`));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("contains modified or untracked files")) {
        console.error(chalk.red("Error: Worktree has uncommitted changes"));
        console.error(chalk.dim("Use --force to remove anyway"));
      } else {
        console.error(chalk.red("Error removing worktree:"));
        console.error(message);
      }
      process.exit(1);
    }
  });
