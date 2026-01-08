import chalk from "chalk";
import { Command } from "commander";
import { resolveConfig } from "../config/local.ts";
import type { Worktree } from "../config/types.ts";
import { isFzfAvailable, selectWorktree } from "../integrations/fzf.ts";
import { createWorktreeWindow, isInsideTmux, resolveWindowName } from "../integrations/tmux.ts";
import { findWorktreeByAlias, getGitRoot, listWorktrees } from "../utils/git.ts";
import { select } from "../utils/prompts.ts";

interface SwitchOptions {
  tmux?: boolean;
  claude?: boolean;
}

export const switchCommand = new Command("switch")
  .description("Switch to a worktree (interactive or by alias)")
  .argument("[alias]", "Worktree alias to switch to")
  .option("--tmux", "Open in a new tmux window")
  .option("--claude", "Launch Claude Code in the tmux window")
  .action(async (alias: string | undefined, options: SwitchOptions) => {
    const gitRoot = await getGitRoot();

    if (!gitRoot) {
      console.error(chalk.red("Error: Not in a git repository"));
      process.exit(1);
    }

    const config = await resolveConfig(gitRoot);
    const worktrees = await listWorktrees(gitRoot, config.projectName);

    // Filter to non-main worktrees for selection
    const nonMainWorktrees = worktrees.filter((wt) => !wt.isMain);

    if (nonMainWorktrees.length === 0) {
      console.error(chalk.yellow("No worktrees found (excluding main)"));
      console.error(chalk.dim("Create one with: wts create <alias>"));
      process.exit(1);
    }

    let selectedWorktree: Worktree | undefined;

    if (alias) {
      // Direct lookup by alias
      selectedWorktree = await findWorktreeByAlias(alias, gitRoot);
      if (!selectedWorktree) {
        console.error(chalk.red(`Error: Worktree "${alias}" not found`));
        process.exit(1);
      }
    } else {
      // Interactive selection
      const hasFzf = await isFzfAvailable();

      if (hasFzf) {
        selectedWorktree = await selectWorktree(worktrees, {
          prompt: "Switch to > ",
          excludeMain: true,
        });
      } else {
        // Fallback to basic prompt
        console.log(chalk.dim("(fzf not found, using basic selection)"));

        const worktreeOptions = nonMainWorktrees.map((wt) => ({
          value: wt.alias ?? wt.branch,
          label: `${wt.alias ?? wt.branch} (${wt.branch}) - ${wt.path}`,
        }));

        const selected = await select(
          "Select worktree:",
          worktreeOptions,
          worktreeOptions[0]?.value,
        );

        selectedWorktree = nonMainWorktrees.find((wt) => (wt.alias ?? wt.branch) === selected);
      }

      if (!selectedWorktree) {
        // User cancelled
        process.exit(0);
      }
    }

    // Determine if we should use tmux
    const useTmux = options.tmux ?? config.autoTmux;
    const launchClaude = options.claude ?? config.autoClaude;

    if (useTmux && isInsideTmux()) {
      // Open in tmux window
      const windowName = resolveWindowName(
        config.tmuxWindowTemplate,
        config.projectName,
        selectedWorktree.alias ?? selectedWorktree.branch,
      );

      console.log(chalk.dim(`Opening tmux window "${windowName}"...`));

      const success = await createWorktreeWindow({
        windowName,
        worktreePath: selectedWorktree.path,
        launchClaude,
      });

      if (success) {
        console.log(chalk.green(`Switched to "${windowName}"`));
      } else {
        console.error(chalk.red("Failed to create/switch tmux window"));
        process.exit(1);
      }
    } else {
      // Just print the path for shell integration
      // User can use: cd $(wts switch <alias>)
      console.log(selectedWorktree.path);

      if (useTmux && !isInsideTmux()) {
        console.error(chalk.dim("\n(Note: --tmux specified but not inside tmux session)"));
      }
    }
  });
