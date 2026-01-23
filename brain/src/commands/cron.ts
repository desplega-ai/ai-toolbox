import chalk from "chalk";
import { Command } from "commander";

const MARKER = "# brain-autosync";

/**
 * Get the full path to the brain binary
 */
async function getBrainBinaryPath(): Promise<string | null> {
  const path = Bun.which("brain");
  return path;
}

/**
 * Get current crontab entries
 */
async function getCurrentCrontab(): Promise<string> {
  const proc = Bun.spawn(["crontab", "-l"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const output = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;

  // crontab -l returns exit code 1 if no crontab exists
  if (exitCode !== 0) {
    return "";
  }

  return output;
}

/**
 * Write new crontab
 */
async function writeCrontab(content: string): Promise<void> {
  const trimmed = content.trim();

  if (trimmed === "") {
    // Remove crontab entirely if empty
    const proc = Bun.spawn(["crontab", "-r"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    await proc.exited;
    return;
  }

  // Write via stdin using a Blob
  const proc = Bun.spawn(["crontab", "-"], {
    stdin: new Blob([`${trimmed}\n`]),
    stdout: "pipe",
    stderr: "pipe",
  });

  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`Failed to write crontab: ${stderr}`);
  }
}

/**
 * Parse interval from crontab line (extracts N from the pattern)
 */
function parseIntervalFromLine(line: string): number | null {
  const match = line.match(/^\*\/(\d+)\s+\*\s+\*\s+\*\s+\*/);
  if (match?.[1]) {
    return parseInt(match[1], 10);
  }
  return null;
}

export const cronCommand = new Command("cron").description("Manage automatic background sync");

// brain cron install [--interval/-i]
cronCommand
  .command("install")
  .description("Install cron job for automatic sync")
  .option("-i, --interval <minutes>", "Sync interval in minutes (1-60)", "5")
  .action(async (options: { interval: string }) => {
    try {
      // Validate interval
      const interval = parseInt(options.interval, 10);
      if (Number.isNaN(interval) || interval < 1 || interval > 60) {
        console.error(chalk.red("Error: Interval must be a number between 1 and 60"));
        process.exit(1);
      }

      // Get brain binary path
      const brainPath = await getBrainBinaryPath();
      if (!brainPath) {
        console.error(chalk.red("Error: 'brain' command not found in PATH"));
        console.error(chalk.dim("Run 'bun link' in the brain directory to install it"));
        process.exit(1);
      }

      // Build cron entry
      const cronEntry = `*/${interval} * * * * ${brainPath} sync --quiet 2>/dev/null ${MARKER}`;

      // Get current crontab
      const currentCrontab = await getCurrentCrontab();
      const lines = currentCrontab.split("\n").filter((line) => line.trim() !== "");

      // Check if brain-autosync entry already exists
      const existingIndex = lines.findIndex((line) => line.includes(MARKER));

      if (existingIndex !== -1) {
        // Update existing entry
        lines[existingIndex] = cronEntry;
        console.log(chalk.green(`✓ Updated cron job (every ${interval} minutes)`));
      } else {
        // Add new entry
        lines.push(cronEntry);
        console.log(chalk.green(`✓ Installed cron job (every ${interval} minutes)`));
      }

      // Write updated crontab
      await writeCrontab(lines.join("\n"));

      console.log(chalk.dim(`  ${brainPath} sync --quiet`));
    } catch (error) {
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  });

// brain cron status
cronCommand
  .command("status")
  .description("Check if automatic sync is active")
  .action(async () => {
    try {
      const currentCrontab = await getCurrentCrontab();
      const lines = currentCrontab.split("\n");

      const brainLine = lines.find((line) => line.includes(MARKER));

      if (brainLine) {
        const interval = parseIntervalFromLine(brainLine);
        if (interval) {
          console.log(chalk.green(`Active (every ${interval} minute${interval === 1 ? "" : "s"})`));
        } else {
          console.log(chalk.green("Active (custom schedule)"));
        }
        console.log(chalk.dim(`  ${brainLine.replace(` ${MARKER}`, "")}`));
      } else {
        console.log(chalk.dim("Not active"));
      }
    } catch (error) {
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  });

// brain cron remove
cronCommand
  .command("remove")
  .description("Remove automatic sync cron job")
  .action(async () => {
    try {
      const currentCrontab = await getCurrentCrontab();
      const lines = currentCrontab.split("\n").filter((line) => line.trim() !== "");

      // Filter out brain-autosync entry
      const filteredLines = lines.filter((line) => !line.includes(MARKER));

      if (filteredLines.length === lines.length) {
        console.log(chalk.dim("No cron job found"));
        return;
      }

      // Write updated crontab
      await writeCrontab(filteredLines.join("\n"));
      console.log(chalk.green("✓ Removed cron job"));
    } catch (error) {
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  });
