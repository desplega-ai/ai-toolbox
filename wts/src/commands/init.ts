import chalk from "chalk";
import { Command } from "commander";
import { isProjectRegistered, registerProject } from "../config/global.ts";
import { loadLocalConfig, saveLocalConfig } from "../config/local.ts";
import type { LocalConfig } from "../config/types.ts";
import { getGitRoot } from "../utils/git.ts";
import { getProjectName } from "../utils/paths.ts";
import { confirm, prompt } from "../utils/prompts.ts";

export const initCommand = new Command("init")
  .description("Register current project for worktree management")
  .option("-y, --yes", "Skip prompts and use defaults")
  .action(async (options: { yes?: boolean }) => {
    const gitRoot = await getGitRoot();

    if (!gitRoot) {
      console.error(chalk.red("Error: Not in a git repository"));
      process.exit(1);
    }

    const projectName = getProjectName(gitRoot);
    const alreadyRegistered = await isProjectRegistered(projectName);
    const existingLocal = await loadLocalConfig(gitRoot);

    if (alreadyRegistered && existingLocal) {
      console.log(chalk.yellow(`Project "${projectName}" is already initialized`));
      const reconfigure = options.yes ? false : await confirm("Reconfigure?", false);
      if (!reconfigure) {
        return;
      }
    }

    console.log(chalk.bold(`\nInitializing wts for ${chalk.cyan(projectName)}\n`));

    // Register in global config if not already
    if (!alreadyRegistered) {
      await registerProject(projectName, gitRoot);
      console.log(chalk.dim(`Registered in ~/.wts.json`));
    }

    // Interactive configuration
    if (options.yes) {
      // Use defaults, create minimal local config
      await saveLocalConfig(gitRoot, {});
      console.log(chalk.dim(`Created .wts-config.json with defaults`));
    } else {
      const localConfig = await promptForConfig(existingLocal);
      await saveLocalConfig(gitRoot, localConfig);
      console.log(chalk.dim(`Created .wts-config.json`));
    }

    console.log(chalk.green(`\n✓ Project "${projectName}" initialized`));
    console.log(chalk.dim(`\nNext steps:`));
    console.log(chalk.dim(`  wts create <alias>  - Create a new worktree`));
    console.log(chalk.dim(`  wts list            - List worktrees`));
  });

async function promptForConfig(existing?: LocalConfig): Promise<LocalConfig> {
  const config: LocalConfig = {};

  // Worktree directory
  const worktreeDir = await prompt("Worktree directory", existing?.worktreeDir ?? ".worktrees");
  if (worktreeDir !== ".worktrees") {
    config.worktreeDir = worktreeDir;
  }

  // Auto tmux
  const autoTmux = await confirm("Auto-open tmux window on create?", existing?.autoTmux ?? false);
  if (autoTmux) {
    config.autoTmux = true;

    // tmux window template
    const tmuxTemplate = await prompt(
      "Tmux window name template",
      existing?.tmuxWindowTemplate ?? "{project}-{alias}",
    );
    if (tmuxTemplate !== "{project}-{alias}") {
      config.tmuxWindowTemplate = tmuxTemplate;
    }
  }

  // Auto Claude
  const autoClaude = await confirm(
    "Auto-launch Claude Code on create?",
    existing?.autoClaude ?? false,
  );
  if (autoClaude) {
    config.autoClaude = true;
  }

  // Setup script
  const hasSetup = await confirm("Configure a setup script?", !!existing?.setupScript);
  if (hasSetup) {
    const setupScript = await prompt(
      "Setup script path (relative to repo root)",
      existing?.setupScript ?? ".wts-setup.sh",
    );
    config.setupScript = setupScript;
  }

  return config;
}
