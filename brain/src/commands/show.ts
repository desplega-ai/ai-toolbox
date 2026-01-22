import { join } from "node:path";
import chalk from "chalk";
import { Command } from "commander";
import { getBrainPath } from "../config/index.ts";
import { normalizeEntryPath } from "../utils/paths.ts";

export const showCommand = new Command("show")
  .description("Display an entry's content")
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
      process.exit(1);
    }

    const content = await file.text();

    // Print with simple syntax highlighting
    console.log(chalk.dim(`--- ${targetPath} ---\n`));

    for (const line of content.split("\n")) {
      if (line.startsWith("# ")) {
        console.log(chalk.bold.cyan(line));
      } else if (line.startsWith("## ")) {
        console.log(chalk.bold.blue(line));
      } else if (line.startsWith("### ")) {
        console.log(chalk.bold(line));
      } else if (line.match(/^\[[\d-]+\]$/)) {
        // Timestamp line
        console.log(chalk.yellow(line));
      } else if (line.startsWith("ref:")) {
        // Reference line
        console.log(chalk.magenta(line));
      } else if (line.startsWith("- ") || line.match(/^\d+\. /)) {
        // List items
        console.log(chalk.white(line));
      } else {
        console.log(line);
      }
    }
  });
