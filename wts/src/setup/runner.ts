import { access } from "node:fs/promises";
import { join } from "node:path";
import chalk from "chalk";

/**
 * Run a setup script in the worktree directory
 */
export async function runSetupScript(
  worktreePath: string,
  scriptPath: string,
  gitRoot: string,
): Promise<void> {
  // Resolve script path relative to git root
  const fullScriptPath = join(gitRoot, scriptPath);

  // Check if script exists
  try {
    await access(fullScriptPath);
  } catch {
    console.log(chalk.yellow(`Setup script not found: ${scriptPath}`));
    return;
  }

  // Determine how to run the script based on extension
  const ext = scriptPath.split(".").pop()?.toLowerCase();

  try {
    if (ext === "ts") {
      await Bun.$`bun ${fullScriptPath}`
        .cwd(worktreePath)
        .env({ ...process.env, WTS_WORKTREE_PATH: worktreePath });
    } else if (ext === "sh") {
      await Bun.$`bash ${fullScriptPath}`
        .cwd(worktreePath)
        .env({ ...process.env, WTS_WORKTREE_PATH: worktreePath });
    } else if (ext === "js" || ext === "mjs") {
      await Bun.$`bun ${fullScriptPath}`
        .cwd(worktreePath)
        .env({ ...process.env, WTS_WORKTREE_PATH: worktreePath });
    } else {
      // Try to execute directly (for scripts with shebang)
      await Bun.$`${fullScriptPath}`
        .cwd(worktreePath)
        .env({ ...process.env, WTS_WORKTREE_PATH: worktreePath });
    }
    console.log(chalk.green("Setup script completed"));
  } catch (error) {
    console.error(chalk.red("Setup script failed:"));
    console.error(error instanceof Error ? error.message : String(error));
  }
}

/**
 * Detect and run default setup scripts (.wts-setup.ts or .wts-setup.sh)
 */
export async function runDefaultSetupScript(worktreePath: string, gitRoot: string): Promise<void> {
  const tsScript = join(gitRoot, ".wts-setup.ts");
  const shScript = join(gitRoot, ".wts-setup.sh");

  // Try TypeScript first
  try {
    await access(tsScript);
    await runSetupScript(worktreePath, ".wts-setup.ts", gitRoot);
    return;
  } catch {
    // File doesn't exist
  }

  // Try shell script
  try {
    await access(shScript);
    await runSetupScript(worktreePath, ".wts-setup.sh", gitRoot);
    return;
  } catch {
    // File doesn't exist
  }
}
