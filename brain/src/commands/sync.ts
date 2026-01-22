import chalk from "chalk";
import { Command } from "commander";
import { getBrainPath } from "../config/index.ts";
import { isDbInitialized } from "../db/client.ts";
import { syncBrain } from "../sync/index.ts";

export const syncCommand = new Command("sync")
  .description("Sync files to the database and generate embeddings")
  .option("-f, --force", "Re-embed everything regardless of changes")
  .option("-q, --quiet", "Minimal output (for automation)")
  .action(async (options: { force?: boolean; quiet?: boolean }) => {
    const brainPath = await getBrainPath();
    if (!brainPath) {
      console.error(chalk.red("Error: Brain not initialized. Run 'brain init' first."));
      process.exit(1);
    }

    // Check if database is initialized
    const dbReady = await isDbInitialized();
    if (!dbReady) {
      console.error(chalk.red("Error: Database not initialized."));
      console.error(chalk.dim("Re-run 'brain init' to create the database."));
      process.exit(1);
    }

    if (!options.quiet) {
      console.log(chalk.bold("Syncing brain...\n"));
      if (options.force) {
        console.log(chalk.dim("Force mode: re-embedding all content\n"));
      }
    }

    const result = await syncBrain(brainPath, {
      force: options.force,
      quiet: options.quiet,
    });

    // Print summary
    if (!options.quiet) {
      console.log();
      console.log(chalk.bold("Summary:"));
      console.log(`  Files scanned:    ${result.filesScanned}`);
      console.log(`  Entries updated:  ${result.entriesUpdated}`);
      console.log(`  Chunks embedded:  ${result.chunksEmbedded}`);

      if (result.errors.length > 0) {
        console.log(chalk.red(`  Errors:           ${result.errors.length}`));
        for (const error of result.errors) {
          console.log(chalk.red(`    - ${error}`));
        }
      }

      console.log();
      console.log(chalk.green("✓ Sync complete"));
    }
  });
