import chalk from "chalk";
import { ApiError } from "../client/index.ts";

export function formatOutput(data: unknown, options: { json?: boolean }): void {
  if (options.json) {
    console.log(JSON.stringify(data));
    return;
  }
  console.log(JSON.stringify(data, null, 2));
}

export function formatError(error: unknown): void {
  if (error instanceof ApiError) {
    console.error(chalk.red(`Error ${error.status}: ${error.message}`));
    if (error.body && typeof error.body === "object") {
      const body = error.body as Record<string, unknown>;
      if (Array.isArray(body.issues)) {
        for (const issue of body.issues) {
          console.error(chalk.yellow(`  - ${JSON.stringify(issue)}`));
        }
      }
    }
  } else if (error instanceof Error) {
    console.error(chalk.red(`Error: ${error.message}`));
  }
}
