import { Command } from "commander";
import { findWorktreeByAlias, getGitRoot } from "../utils/git.ts";

export const cdCommand = new Command("cd")
  .description("Print worktree path for shell integration")
  .argument("<alias>", "Alias of the worktree")
  .action(async (alias: string) => {
    const gitRoot = await getGitRoot();

    if (!gitRoot) {
      process.exit(1);
    }

    const worktree = await findWorktreeByAlias(alias, gitRoot);

    if (!worktree) {
      process.exit(1);
    }

    // Output just the path - designed for shell integration like:
    // wcd() { cd "$(wts cd "$1")" }
    console.log(worktree.path);
  });
