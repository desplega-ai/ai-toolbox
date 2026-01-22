import { join } from "node:path";
import chalk from "chalk";
import { Command } from "commander";
import { getBrainPath } from "../config/index.ts";
import { openInEditor } from "../utils/editor.ts";
import { autoCommit, hasChanges } from "../utils/git.ts";
import { normalizeEntryPath } from "../utils/paths.ts";

export const editCommand = new Command("edit")
  .description("Open an entry in the editor")
  .argument("<path>", "Path to the entry (e.g., 2026/01/22 or ideas/startup)")
  .action(async (pathArg: string) => {
    const brainPath = await getBrainPath();
    if (!brainPath) {
      console.error(chalk.red("Error: Brain not initialized. Run 'brain init' first."));
      process.exit(1);
    }

    const targetPath = normalizeEntryPath(pathArg);
    const fullPath = join(brainPath, targetPath);

    const file = Bun.file(fullPath);
    if (!(await file.exists())) {
      console.error(chalk.red(`Error: Entry not found: ${targetPath}`));
      console.error(chalk.dim("Use 'brain new' to create a new entry"));
      process.exit(1);
    }

    console.log(chalk.dim(`Opening ${targetPath}...`));

    // Open in editor
    await openInEditor(fullPath);

    // Auto-commit if there are changes
    if (await hasChanges(targetPath, brainPath)) {
      await autoCommit([targetPath], `Update ${targetPath}`, brainPath);
      console.log(chalk.green(`✓ Saved ${targetPath}`));
    } else {
      console.log(chalk.dim("No changes to save"));
    }
  });
