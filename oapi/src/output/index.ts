import chalk from "chalk";

/**
 * Print JSON data to stdout.
 * By default pretty-prints with 2-space indent.
 * With `raw: true`, outputs compact JSON (jq-compatible).
 */
export function printJson(data: unknown, options?: { raw?: boolean }): void {
  if (options?.raw) {
    console.log(JSON.stringify(data));
  } else {
    console.log(JSON.stringify(data, null, 2));
  }
}

/**
 * Print an error message to stderr.
 */
export function printError(message: string, details?: unknown): void {
  console.error(chalk.red(`Error: ${message}`));
  if (details !== undefined && details !== null) {
    if (typeof details === "object") {
      const body = details as Record<string, unknown>;
      // Handle common API error formats
      if (Array.isArray(body.issues)) {
        for (const issue of body.issues) {
          console.error(
            chalk.yellow(`  - ${typeof issue === "string" ? issue : JSON.stringify(issue)}`),
          );
        }
      } else if (body.message) {
        console.error(chalk.yellow(`  ${body.message}`));
      } else if (body.error) {
        console.error(chalk.yellow(`  ${body.error}`));
      } else {
        console.error(chalk.yellow(`  ${JSON.stringify(details, null, 2)}`));
      }
    } else {
      console.error(chalk.yellow(`  ${details}`));
    }
  }
}

/**
 * Print a success message to stderr (so it doesn't interfere with piped JSON output).
 */
export function printSuccess(message: string): void {
  console.error(chalk.green(message));
}

/**
 * Print an info/warning message to stderr.
 */
export function printInfo(message: string): void {
  console.error(chalk.cyan(message));
}
