import chalk from "chalk";
import { Command } from "commander";
import { getServerUrl, saveConfig } from "../config/index.ts";

export const loginCommand = new Command("login")
  .description("Configure server URL and API key")
  .option("-s, --server <url>", "Dokploy server URL")
  .option("-k, --key <apiKey>", "API key")
  .action(async (options: { server?: string; key?: string }) => {
    if (!options.server && !options.key) {
      console.error(chalk.red("Provide at least --server or --key"));
      process.exit(1);
    }

    const updates: Record<string, string> = {};
    if (options.server) updates.serverUrl = options.server;
    if (options.key) updates.apiKey = options.key;

    saveConfig(updates);

    const serverUrl = options.server || getServerUrl();
    console.log(chalk.green("Configuration saved."));
    console.log(`  Server: ${serverUrl}`);
    if (options.key) console.log(`  API Key: ${options.key.slice(0, 8)}...`);

    // Verify connection
    try {
      const res = await fetch(`${serverUrl}/api/settings.getDokployVersion`, {
        headers: { "x-api-key": options.key || "" },
      });
      if (res.ok) {
        const version = await res.json();
        console.log(chalk.green(`  Connected! Dokploy version: ${JSON.stringify(version)}`));
      } else {
        console.log(chalk.yellow(`  Warning: Could not verify connection (HTTP ${res.status})`));
      }
    } catch {
      console.log(chalk.yellow("  Warning: Could not reach server to verify connection"));
    }
  });
