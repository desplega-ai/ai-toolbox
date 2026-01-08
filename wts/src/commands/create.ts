import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import chalk from "chalk";
import { Command } from "commander";
import { getWorktreeBaseDir, resolveConfig } from "../config/local.ts";
import { isFzfAvailable, selectBranch } from "../integrations/fzf.ts";
import { createWorktreeWindow, isInsideTmux, resolveWindowName } from "../integrations/tmux.ts";
import { runSetupScript } from "../setup/runner.ts";
import {
  branchExists,
  createWorktree,
  findWorktreeByAlias,
  generateWorktreePath,
  getDefaultBranch,
  getGitRoot,
  listBranches,
  listRemoteBranches,
} from "../utils/git.ts";
import { select } from "../utils/prompts.ts";

interface CreateOptions {
  branch?: string;
  newBranch?: boolean;
  base?: string;
  noSetup?: boolean;
  tmux?: boolean;
  noTmux?: boolean;
  claude?: boolean;
}

export const createCommand = new Command("create")
  .description("Create a new worktree")
  .argument("<alias>", "Short name for the worktree")
  .option("-b, --branch <branch>", "Use existing branch (interactive if not specified)")
  .option("-n, --new-branch", "Create a new branch with the alias name")
  .option("--base <branch>", "Base branch for new branch (defaults to main/master)")
  .option("--no-setup", "Skip running setup script")
  .option("--tmux", "Open in a new tmux window after creation")
  .option("--no-tmux", "Do not open tmux window (overrides config)")
  .option("--claude", "Launch Claude Code in the tmux window")
  .action(async (alias: string, options: CreateOptions) => {
    const gitRoot = await getGitRoot();

    if (!gitRoot) {
      console.error(chalk.red("Error: Not in a git repository"));
      process.exit(1);
    }

    // Check if alias already exists
    const existing = await findWorktreeByAlias(alias, gitRoot);
    if (existing) {
      console.error(chalk.red(`Error: Worktree with alias "${alias}" already exists`));
      console.error(chalk.dim(`  Path: ${existing.path}`));
      process.exit(1);
    }

    const config = await resolveConfig(gitRoot);
    const baseDir = getWorktreeBaseDir(config);
    const worktreePath = generateWorktreePath(baseDir, alias);

    // Ensure base directory exists
    await mkdir(dirname(worktreePath), { recursive: true });

    // Determine branch configuration
    let branchConfig: { branch?: string; newBranch?: string; baseBranch?: string } = {};

    if (options.branch) {
      // Use existing branch - check if it's a request for interactive selection
      const exists = await branchExists(options.branch, gitRoot);
      if (!exists) {
        console.error(chalk.red(`Error: Branch "${options.branch}" does not exist`));
        process.exit(1);
      }
      branchConfig = { branch: options.branch };
    } else if (options.newBranch) {
      // Create new branch with alias as name
      const baseBranch = options.base ?? (await getDefaultBranch(gitRoot));
      branchConfig = { newBranch: alias, baseBranch };
    } else {
      // Default: create new branch with alias as name
      const baseBranch = options.base ?? (await getDefaultBranch(gitRoot));
      branchConfig = { newBranch: alias, baseBranch };
    }

    console.log(chalk.dim(`Creating worktree at ${worktreePath}...`));

    try {
      await createWorktree(worktreePath, branchConfig, gitRoot);
    } catch (error) {
      console.error(chalk.red("Error creating worktree:"));
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }

    console.log(chalk.green(`Created worktree "${alias}"`));
    console.log(chalk.dim(`  Path: ${worktreePath}`));
    console.log(chalk.dim(`  Branch: ${branchConfig.newBranch ?? branchConfig.branch}`));

    // Run setup script if configured and not disabled
    if (options.noSetup !== true && config.setupScript) {
      console.log(chalk.dim("\nRunning setup script..."));
      await runSetupScript(worktreePath, config.setupScript, gitRoot);
    }

    // Handle tmux integration
    // --no-tmux takes precedence, then --tmux, then config.autoTmux
    const useTmux = options.noTmux === true ? false : (options.tmux ?? config.autoTmux);
    const launchClaude = options.claude ?? config.autoClaude;

    if (useTmux) {
      if (!isInsideTmux()) {
        console.log(chalk.dim("\n(Note: tmux requested but not inside tmux session)"));
      } else {
        const windowName = resolveWindowName(config.tmuxWindowTemplate, config.projectName, alias);

        console.log(chalk.dim(`\nOpening tmux window "${windowName}"...`));

        const success = await createWorktreeWindow({
          windowName,
          worktreePath,
          launchClaude,
        });

        if (success) {
          console.log(chalk.green(`Opened in tmux window "${windowName}"`));
        } else {
          console.error(chalk.yellow("Warning: Failed to create tmux window"));
        }
      }
    }
  });

/**
 * Interactive branch selection (for future use with -b flag without value)
 */
export async function interactiveSelectBranch(gitRoot: string): Promise<string | undefined> {
  const localBranches = await listBranches(gitRoot);
  const remoteBranches = await listRemoteBranches(gitRoot);

  // Combine and dedupe branches
  const allBranches = [...new Set([...localBranches, ...remoteBranches])].sort();

  if (allBranches.length === 0) {
    return undefined;
  }

  const hasFzf = await isFzfAvailable();

  if (hasFzf) {
    return selectBranch(allBranches, { gitRoot });
  }

  // Fallback to basic prompt
  console.log(chalk.dim("(fzf not found, using basic selection)"));

  const branchOptions = allBranches.map((b) => ({
    value: b,
    label: b,
  }));

  return select("Select branch:", branchOptions, branchOptions[0]?.value);
}
