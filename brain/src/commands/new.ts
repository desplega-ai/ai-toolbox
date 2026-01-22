import { join } from "node:path";
import chalk from "chalk";
import { Command } from "commander";
import { getBrainPath } from "../config/index.ts";
import { openInEditor } from "../utils/editor.ts";
import { autoCommit, hasChanges } from "../utils/git.ts";
import {
  ensureParentDir,
  isValidEntryPath,
  normalizeEntryPath,
  titleFromPath,
} from "../utils/paths.ts";

export const newCommand = new Command("new")
  .description("Create a new named entry")
  .argument("<path>", "S3-style path for the entry (e.g., notes/ideas)")
  .action(async (pathArg: string) => {
    const brainPath = await getBrainPath();
    if (!brainPath) {
      console.error(chalk.red("Error: Brain not initialized. Run 'brain init' first."));
      process.exit(1);
    }

    // Validate path
    const cleanPath = pathArg.replace(/\.md$/, ""); // Remove .md for validation
    if (!isValidEntryPath(cleanPath)) {
      console.error(
        chalk.red("Error: Invalid path. Use only alphanumeric characters, -, _, and /"),
      );
      console.error(chalk.dim("Example: brain new notes/project-ideas"));
      process.exit(1);
    }

    const targetPath = normalizeEntryPath(pathArg);
    const fullPath = join(brainPath, targetPath);

    // Check if file already exists
    const file = Bun.file(fullPath);
    const exists = await file.exists();

    if (exists) {
      console.log(chalk.yellow(`File already exists: ${targetPath}`));
      console.log(chalk.dim("Opening in editor..."));
    } else {
      // Create file with title header
      await ensureParentDir(fullPath);
      const title = titleFromPath(pathArg);
      await Bun.write(fullPath, `# ${title}\n\n`);
      console.log(chalk.dim(`Created ${targetPath}`));
    }

    // Open in editor
    await openInEditor(fullPath);

    // Auto-commit if there are changes
    if (await hasChanges(targetPath, brainPath)) {
      await autoCommit(
        [targetPath],
        exists ? `Update ${targetPath}` : `Create ${targetPath}`,
        brainPath,
      );
      console.log(chalk.green(`✓ Saved ${targetPath}`));
    } else {
      console.log(chalk.dim("No changes to save"));
    }
  });
