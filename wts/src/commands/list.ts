import chalk from "chalk";
import { Command } from "commander";
import { getTrackedProjects } from "../config/global.ts";
import { resolveConfig } from "../config/local.ts";
import type { Worktree } from "../config/types.ts";
import { getGitRoot, listWorktrees } from "../utils/git.ts";
import { formatPath } from "../utils/paths.ts";

interface ListOptions {
  all?: boolean;
  json?: boolean;
}

export const listCommand = new Command("list")
  .alias("ls")
  .description("List worktrees")
  .option("-a, --all", "List worktrees across all tracked projects")
  .option("--json", "Output as JSON")
  .action(async (options: ListOptions) => {
    if (options.all) {
      await listAllProjects(options.json);
    } else {
      await listCurrentProject(options.json);
    }
  });

async function listCurrentProject(jsonOutput?: boolean): Promise<void> {
  const gitRoot = await getGitRoot();

  if (!gitRoot) {
    console.error(chalk.red("Error: Not in a git repository"));
    process.exit(1);
  }

  const config = await resolveConfig(gitRoot);
  const worktrees = await listWorktrees(gitRoot, config.projectName);

  if (jsonOutput) {
    console.log(JSON.stringify(worktrees, null, 2));
    return;
  }

  printWorktreeTable(worktrees, config.projectName);
}

async function listAllProjects(jsonOutput?: boolean): Promise<void> {
  const projects = await getTrackedProjects();
  const projectNames = Object.keys(projects);

  if (projectNames.length === 0) {
    console.log(chalk.yellow("No projects registered. Run 'wts init' in a git repository."));
    return;
  }

  const allWorktrees: Worktree[] = [];

  for (const projectName of projectNames) {
    const project = projects[projectName];
    if (!project) continue;

    try {
      const worktrees = await listWorktrees(project.path, projectName);
      allWorktrees.push(...worktrees);
    } catch {
      console.error(chalk.yellow(`Warning: Could not list worktrees for ${projectName}`));
    }
  }

  if (jsonOutput) {
    console.log(JSON.stringify(allWorktrees, null, 2));
    return;
  }

  for (const projectName of projectNames) {
    const projectWorktrees = allWorktrees.filter((wt) => wt.projectName === projectName);
    if (projectWorktrees.length > 0) {
      console.log();
      printWorktreeTable(projectWorktrees, projectName);
    }
  }
}

function printWorktreeTable(worktrees: Worktree[], projectName: string): void {
  console.log(chalk.bold.blue(`${projectName}`));
  console.log(chalk.dim("─".repeat(60)));

  if (worktrees.length === 0) {
    console.log(chalk.dim("  No worktrees"));
    return;
  }

  // Calculate column widths
  const aliasWidth = Math.max(
    8,
    ...worktrees.map((wt) => (wt.alias ?? (wt.isMain ? "(main)" : "")).length),
  );
  const branchWidth = Math.max(8, ...worktrees.map((wt) => wt.branch.length));

  // Print header
  console.log(chalk.dim(`  ${"Alias".padEnd(aliasWidth)}  ${"Branch".padEnd(branchWidth)}  Path`));

  // Print worktrees
  for (const wt of worktrees) {
    const aliasStr = wt.isMain ? "(main)" : (wt.alias ?? "-");
    const path = formatPath(wt.path);

    console.log(
      `  ${aliasStr.padEnd(aliasWidth)}  ${wt.branch.padEnd(branchWidth)}  ${chalk.dim(path)}`,
    );
  }
}
