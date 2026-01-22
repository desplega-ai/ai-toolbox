import { join } from "node:path";
import chalk from "chalk";
import { Command } from "commander";
import { getConfigPath, loadConfig, saveConfig } from "../config/index.ts";
import { initDb } from "../db/client.ts";
import { initGitRepo, isGitRepo } from "../utils/git.ts";
import { ensureDir, expandPath, formatPath } from "../utils/paths.ts";
import { confirm, prompt } from "../utils/prompts.ts";

const DEFAULT_BRAIN_PATH = "~/Documents/brain";

export const initCommand = new Command("init")
  .description("Initialize a new brain directory")
  .argument("[path]", "Path for the brain directory", DEFAULT_BRAIN_PATH)
  .option("-y, --yes", "Skip prompts and use defaults")
  .action(async (pathArg: string, options: { yes?: boolean }) => {
    const existingConfig = await loadConfig();

    if (existingConfig) {
      console.log(chalk.yellow(`Brain already initialized at ${formatPath(existingConfig.path)}`));
      if (!options.yes) {
        const reconfigure = await confirm("Reconfigure?", false);
        if (!reconfigure) {
          return;
        }
      } else {
        console.log(chalk.dim("Use --yes with a new path to reconfigure, or edit ~/.brain.json"));
        return;
      }
    }

    console.log(chalk.bold("\nInitializing brain\n"));

    // Get brain path
    let brainPath: string;
    if (options.yes) {
      brainPath = expandPath(pathArg);
    } else {
      const inputPath = await prompt("Brain directory", pathArg);
      brainPath = expandPath(inputPath);
    }

    // Get editor preference
    let editor: string | undefined;
    if (!options.yes) {
      const defaultEditor = process.env.EDITOR ?? "vim";
      const inputEditor = await prompt("Editor", defaultEditor);
      if (inputEditor !== defaultEditor) {
        editor = inputEditor;
      }
    }

    // Create brain directory
    await ensureDir(brainPath);
    console.log(chalk.dim(`Created ${formatPath(brainPath)}`));

    // Create .gitignore
    const gitignorePath = join(brainPath, ".gitignore");
    const gitignoreFile = Bun.file(gitignorePath);
    if (!(await gitignoreFile.exists())) {
      await Bun.write(gitignorePath, ".brain.db\n.brain.db-*\n");
      console.log(chalk.dim("Created .gitignore"));
    }

    // Initialize git repo
    const alreadyGit = await isGitRepo(brainPath);
    if (!alreadyGit) {
      let shouldInitGit = true;
      if (!options.yes) {
        shouldInitGit = await confirm("Initialize git repository?", true);
      }
      if (shouldInitGit) {
        await initGitRepo(brainPath);
        console.log(chalk.dim("Initialized git repository"));
      }
    }

    // Initialize database
    const dbPath = join(brainPath, ".brain.db");
    await initDb(dbPath);
    console.log(chalk.dim("Initialized database"));

    // Save config
    await saveConfig({
      path: brainPath,
      ...(editor && { editor }),
    });
    console.log(chalk.dim(`Saved config to ${formatPath(getConfigPath())}`));

    console.log(chalk.green(`\n✓ Brain initialized at ${formatPath(brainPath)}`));
    console.log(chalk.dim("\nNext steps:"));
    console.log(chalk.dim('  brain add "Your first thought"  - Add an entry'));
    console.log(chalk.dim('  brain new "ideas/project"       - Create a named file'));
    console.log(chalk.dim("  brain list                      - List entries"));
  });
