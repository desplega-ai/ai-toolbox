import chalk from "chalk";
import { Command } from "commander";
import { findWorktreeByAlias, getCurrentBranch, getGitRoot, listWorktrees } from "../utils/git.ts";
import { parseWorktreeAlias } from "../utils/paths.ts";

interface PrOptions {
  draft?: boolean;
  web?: boolean;
  title?: string;
  body?: string;
}

/**
 * Check if gh CLI is available
 */
async function isGhAvailable(): Promise<boolean> {
  try {
    await Bun.$`which gh`.quiet();
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if gh is authenticated
 */
async function isGhAuthenticated(): Promise<boolean> {
  try {
    await Bun.$`gh auth status`.quiet();
    return true;
  } catch {
    return false;
  }
}

/**
 * Detect if we're currently inside a worktree and return its alias
 */
async function detectCurrentWorktreeAlias(gitRoot: string): Promise<string | undefined> {
  const cwd = process.cwd();
  const worktrees = await listWorktrees(gitRoot);

  // Find worktree that matches current directory
  for (const wt of worktrees) {
    if (cwd === wt.path || cwd.startsWith(`${wt.path}/`)) {
      return wt.alias;
    }
  }

  // Maybe we're in the worktree directory itself - check by path pattern
  const dirName = cwd.split("/").pop() ?? "";
  const alias = parseWorktreeAlias(dirName);
  if (alias) {
    return alias;
  }

  return undefined;
}

export const prCommand = new Command("pr")
  .description("Create a pull request from a worktree branch")
  .argument("[alias]", "Worktree alias (auto-detected if in worktree)")
  .option("--draft", "Create as draft PR")
  .option("--web", "Open PR in browser after creation")
  .option("-t, --title <title>", "PR title")
  .option("-b, --body <body>", "PR body/description")
  .action(async (alias: string | undefined, options: PrOptions) => {
    // Check for gh CLI
    const hasGh = await isGhAvailable();
    if (!hasGh) {
      console.error(chalk.red("Error: GitHub CLI (gh) is required but not installed"));
      console.error(chalk.dim("Install it from: https://cli.github.com/"));
      process.exit(1);
    }

    // Check gh authentication
    const isAuthed = await isGhAuthenticated();
    if (!isAuthed) {
      console.error(chalk.red("Error: GitHub CLI is not authenticated"));
      console.error(chalk.dim("Run: gh auth login"));
      process.exit(1);
    }

    const gitRoot = await getGitRoot();
    if (!gitRoot) {
      console.error(chalk.red("Error: Not in a git repository"));
      process.exit(1);
    }

    // Determine which worktree/branch to create PR for
    let targetAlias = alias;
    let targetPath: string;
    let targetBranch: string;

    if (!targetAlias) {
      // Try to auto-detect from current directory
      targetAlias = await detectCurrentWorktreeAlias(gitRoot);
    }

    if (targetAlias) {
      // Look up the worktree
      const worktree = await findWorktreeByAlias(targetAlias, gitRoot);
      if (!worktree) {
        console.error(chalk.red(`Error: Worktree "${targetAlias}" not found`));
        process.exit(1);
      }
      targetPath = worktree.path;
      targetBranch = worktree.branch;
    } else {
      // Use current directory/branch
      targetPath = process.cwd();
      targetBranch = await getCurrentBranch(targetPath);
    }

    // Ensure we're not on main/master
    if (targetBranch === "main" || targetBranch === "master") {
      console.error(chalk.red("Error: Cannot create PR from main/master branch"));
      process.exit(1);
    }

    console.log(chalk.dim(`Creating PR for branch: ${targetBranch}`));

    // Build gh pr create command
    const args: string[] = ["pr", "create"];

    if (options.draft) {
      args.push("--draft");
    }

    if (options.web) {
      args.push("--web");
    }

    if (options.title) {
      args.push("--title", options.title);
    }

    if (options.body) {
      args.push("--body", options.body);
    }

    // If no title provided, gh will prompt interactively
    if (!options.title && !options.web) {
      args.push("--fill");
    }

    try {
      // First, push the branch if needed
      console.log(chalk.dim("Pushing branch to remote..."));
      await Bun.$`git push -u origin ${targetBranch}`.cwd(targetPath);

      console.log(chalk.dim("Creating pull request..."));
      const result = await Bun.$`gh ${args}`.cwd(targetPath);
      const output = result.stdout.toString().trim();

      if (output) {
        console.log(chalk.green("Pull request created:"));
        console.log(output);
      }
    } catch (error) {
      console.error(chalk.red("Error creating pull request:"));
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });
