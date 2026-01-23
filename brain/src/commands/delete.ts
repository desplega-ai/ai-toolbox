import { Command } from "commander";
import chalk from "chalk";
import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "../config/index.ts";
import { deleteEntry, getEntry } from "../db/entries.ts";
import { normalizeEntryPath } from "../utils/paths.ts";
import { autoCommit } from "../utils/git.ts";
import { confirm } from "../utils/prompts.ts";

export const deleteCommand = new Command("delete")
  .alias("rm")
  .description("Delete an entry from brain")
  .argument("<path>", "Entry path (e.g., 2026/01/22 or notes/project)")
  .option("-f, --force", "Skip confirmation prompt")
  .option("--db-only", "Only remove from database, keep file on disk")
  .action(async (pathArg: string, options: { force?: boolean; dbOnly?: boolean }) => {
    const config = await loadConfig();
    const brainPath = config?.path;

    if (!brainPath) {
      console.error(chalk.red("Brain not initialized. Run: brain init"));
      process.exit(1);
    }

    const normalizedPath = normalizeEntryPath(pathArg);
    const fullPath = join(brainPath, normalizedPath);

    // Check existence
    const fileExists = existsSync(fullPath);
    const dbEntry = await getEntry(normalizedPath);

    if (!fileExists && !dbEntry) {
      console.error(chalk.red(`Entry not found: ${normalizedPath}`));
      process.exit(1);
    }

    // Show what will be deleted
    console.log(chalk.dim("Entry to delete:"));
    console.log(`  Path: ${chalk.cyan(normalizedPath)}`);
    console.log(`  File: ${fileExists ? chalk.green("exists") : chalk.dim("not on disk")}`);
    console.log(`  DB:   ${dbEntry ? chalk.green("indexed") : chalk.dim("not indexed")}`);
    console.log();

    // Confirm unless --force
    if (!options.force) {
      const confirmed = await confirm("Delete this entry?");
      if (!confirmed) {
        console.log(chalk.dim("Cancelled."));
        return;
      }
    }

    // Delete file (unless --db-only)
    let fileDeleted = false;
    if (fileExists && !options.dbOnly) {
      unlinkSync(fullPath);
      fileDeleted = true;
    }

    // Delete from DB
    const dbDeleted = await deleteEntry(normalizedPath);

    // Auto-commit if file was deleted
    if (fileDeleted) {
      await autoCommit(
        [normalizedPath],
        `brain: delete ${normalizedPath}`,
        brainPath
      );
    }

    // Output result
    if (fileDeleted && dbDeleted) {
      console.log(chalk.green(`✓ Deleted ${normalizedPath} (file + database)`));
    } else if (fileDeleted) {
      console.log(chalk.green(`✓ Deleted file: ${normalizedPath}`));
      console.log(chalk.dim("  (was not in database)"));
    } else if (dbDeleted) {
      console.log(chalk.green(`✓ Removed from database: ${normalizedPath}`));
      if (options.dbOnly) {
        console.log(chalk.dim("  (file kept on disk)"));
      } else {
        console.log(chalk.dim("  (file was already missing)"));
      }
    }
  });
