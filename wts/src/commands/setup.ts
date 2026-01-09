import { access, chmod } from "node:fs/promises";
import { join } from "node:path";
import chalk from "chalk";
import { Command } from "commander";
import { loadLocalConfig, saveLocalConfig } from "../config/local.ts";
import { getGitRoot } from "../utils/git.ts";
import { confirm, select } from "../utils/prompts.ts";

const SHELL_TEMPLATE = `#!/bin/bash
# wts setup script - runs after worktree creation
#
# Environment variables:
#   WTS_WORKTREE_PATH - path to the new worktree (also the working directory)
#   WTS_GIT_ROOT      - path to the main repository root
#
# Example: copy .env from main repo to worktree
#   cp "$WTS_GIT_ROOT/.env" "$WTS_WORKTREE_PATH/.env"

set -e

echo "Setting up worktree..."

# Install dependencies
# npm install
# bun install

# Copy files from main repo
# cp "$WTS_GIT_ROOT/.env" .env
# cp -r "$WTS_GIT_ROOT/node_modules" .

echo "Setup complete!"
`;

const TS_TEMPLATE = `#!/usr/bin/env bun
// wts setup script - runs after worktree creation
//
// Environment variables:
//   WTS_WORKTREE_PATH - path to the new worktree (also the working directory)
//   WTS_GIT_ROOT      - path to the main repository root

const worktreePath = process.env.WTS_WORKTREE_PATH!;
const gitRoot = process.env.WTS_GIT_ROOT!;

console.log("Setting up worktree...");

// Install dependencies
// await Bun.$\`npm install\`;
// await Bun.$\`bun install\`;

// Copy files from main repo
// await Bun.$\`cp \${gitRoot}/.env .env\`;
// await Bun.$\`cp -r \${gitRoot}/node_modules .\`;

console.log("Setup complete!");
`;

type ScriptType = "sh" | "ts";

interface SetupOptions {
  sh?: boolean;
  ts?: boolean;
  config: boolean; // commander's --no-config sets this to false
}

export const setupCommand = new Command("setup")
  .description("Generate a setup script template for worktree initialization")
  .option("--sh", "Generate a shell script (.wts-setup.sh)")
  .option("--ts", "Generate a TypeScript script (.wts-setup.ts)")
  .option("--no-config", "Don't update .wts-config.json")
  .action(async (options: SetupOptions) => {
    const gitRoot = await getGitRoot();

    if (!gitRoot) {
      console.error(chalk.red("Error: Not in a git repository"));
      process.exit(1);
    }

    // Determine script type
    let scriptType: ScriptType;

    if (options.sh && options.ts) {
      console.error(chalk.red("Error: Cannot specify both --sh and --ts"));
      process.exit(1);
    } else if (options.sh) {
      scriptType = "sh";
    } else if (options.ts) {
      scriptType = "ts";
    } else {
      // Interactive selection
      scriptType = await select<ScriptType>(
        "Which type of setup script would you like?",
        [
          { value: "sh", label: "Shell script (.wts-setup.sh)" },
          { value: "ts", label: "TypeScript (.wts-setup.ts) - requires bun" },
        ],
        "sh",
      );
    }

    const filename = `.wts-setup.${scriptType}`;
    const filepath = join(gitRoot, filename);

    // Check if file already exists
    try {
      await access(filepath);
      const overwrite = await confirm(`${filename} already exists. Overwrite?`, false);
      if (!overwrite) {
        console.log(chalk.dim("Cancelled"));
        return;
      }
    } catch {
      // File doesn't exist, continue
    }

    // Write the template
    const template = scriptType === "sh" ? SHELL_TEMPLATE : TS_TEMPLATE;
    await Bun.write(filepath, template);

    // Make shell scripts executable
    if (scriptType === "sh") {
      await chmod(filepath, 0o755);
    }

    console.log(chalk.green(`Created ${filename}`));

    // Update config unless --no-config is set
    if (options.config !== false) {
      const localConfig = (await loadLocalConfig(gitRoot)) ?? {};
      localConfig.setupScript = filename;
      await saveLocalConfig(gitRoot, localConfig);
      console.log(chalk.dim(`Updated .wts-config.json with setupScript: "${filename}"`));
    }

    // Show next steps
    console.log(chalk.dim("\nNext steps:"));
    console.log(chalk.dim(`  1. Edit ${filename} to add your setup commands`));
    console.log(chalk.dim(`  2. Run 'wts create <alias>' - setup script will run automatically`));
    console.log(chalk.dim(`  3. Use '--no-setup' flag to skip the script when needed`));
  });
