import chalk from "chalk";
import { Command } from "commander";
import { CACHE_DIR, listCaches } from "../cache.ts";

export const listCommand = new Command("list")
  .description("List all cached thought directory indexes")
  .action(async () => {
    const caches = await listCaches();

    if (caches.length === 0) {
      console.log(chalk.yellow(`No cached indexes found in ${CACHE_DIR}`));
      console.log(chalk.dim("Run 'thoughts-viz index <path>' to index a directory."));
      return;
    }

    console.log(chalk.blue(`Cached indexes (${CACHE_DIR}):\n`));

    for (const c of caches) {
      const status = c.stale ? chalk.red("stale") : chalk.green("fresh");
      const date = new Date(c.indexedAt).toLocaleString();
      console.log(`  ${chalk.cyan(c.id)}  ${chalk.bold(c.sourceDir)}`);
      console.log(`    ${c.fileCount} files, ${c.edgeCount} edges | ${status} | indexed ${date}`);
      console.log();
    }

    console.log(chalk.dim("  Use the 8-char ID instead of the full path in any command."));
  });
