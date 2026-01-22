import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import chalk from "chalk";
import { Command } from "commander";
import { getBrainPath } from "../config/index.ts";
import { isFzfAvailable, selectFile } from "../utils/fzf.ts";
import { autoCommit } from "../utils/git.ts";
import { ensureParentDir, getTimestamp, getTodayPath } from "../utils/paths.ts";

/**
 * Recursively get all .md files in a directory
 */
async function getMdFiles(dir: string, base: string = dir): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith(".")) {
      files.push(...(await getMdFiles(fullPath, base)));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(relative(base, fullPath));
    }
  }

  return files;
}

export const addCommand = new Command("add")
  .alias("a")
  .description("Add a timestamped entry to the brain")
  .argument("<text>", "Text content to add")
  .option("-f, --file <path>", "Target file path (relative to brain)")
  .option("-w, --where", "Interactive file picker (requires fzf)")
  .option("--ref <path>", "Reference an external file")
  .action(async (text: string, options: { file?: string; where?: boolean; ref?: string }) => {
    const brainPath = await getBrainPath();
    if (!brainPath) {
      console.error(chalk.red("Error: Brain not initialized. Run 'brain init' first."));
      process.exit(1);
    }

    // Determine target file
    let targetPath: string;

    if (options.where) {
      // Interactive file picker
      const hasFzf = await isFzfAvailable();
      if (!hasFzf) {
        console.error(chalk.red("Error: fzf is required for --where option"));
        console.error(chalk.dim("Install fzf: brew install fzf"));
        process.exit(1);
      }

      const files = await getMdFiles(brainPath);
      if (files.length === 0) {
        console.log(chalk.yellow("No files found. Creating today's file."));
        targetPath = getTodayPath();
      } else {
        const selected = await selectFile(files, {
          prompt: "Add to file > ",
          brainPath,
        });
        if (!selected) {
          console.log(chalk.yellow("Cancelled"));
          return;
        }
        targetPath = selected;
      }
    } else if (options.file) {
      // Explicit file path
      targetPath = options.file;
      if (!targetPath.endsWith(".md")) {
        targetPath += ".md";
      }
    } else {
      // Default: today's file
      targetPath = getTodayPath();
    }

    const fullPath = join(brainPath, targetPath);
    await ensureParentDir(fullPath);

    // Build entry content
    const timestamp = getTimestamp();
    let content = `[${timestamp}]`;

    if (options.ref) {
      content += ` ref:${options.ref}`;
    }

    content += `\n${text}\n\n`;

    // Append to file
    const file = Bun.file(fullPath);
    const existing = (await file.exists()) ? await file.text() : "";
    await Bun.write(fullPath, existing + content);

    // Auto-commit
    await autoCommit([targetPath], `Add entry to ${targetPath}`, brainPath);

    console.log(chalk.green(`✓ Added to ${targetPath}`));
    console.log(chalk.dim(`[${timestamp}]`));
    if (options.ref) {
      console.log(chalk.dim(`ref:${options.ref}`));
    }
  });
