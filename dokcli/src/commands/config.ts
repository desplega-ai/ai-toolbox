import chalk from "chalk";
import { Command } from "commander";
import { loadConfig, saveConfig } from "../config/index.ts";

export const configCommand = new Command("config").description("View or update CLI configuration");

configCommand
  .command("show")
  .description("Show current configuration")
  .action(() => {
    const config = loadConfig();
    console.log(chalk.bold("Current configuration:"));
    console.log(`  Server URL: ${config.serverUrl}`);
    console.log(
      `  API Key:    ${config.apiKey ? `${config.apiKey.slice(0, 8)}...` : chalk.dim("(not set)")}`,
    );
  });

configCommand
  .command("set")
  .argument("<key>", "Config key (server, key)")
  .argument("<value>", "Config value")
  .action((key: string, value: string) => {
    const keyMap: Record<string, string> = {
      server: "serverUrl",
      key: "apiKey",
      serverUrl: "serverUrl",
      apiKey: "apiKey",
    };
    const mapped = keyMap[key];
    if (!mapped) {
      console.error(chalk.red(`Unknown config key: ${key}. Use "server" or "key".`));
      process.exit(1);
    }
    saveConfig({ [mapped]: value });
    console.log(
      chalk.green(`Set ${key} = ${mapped === "apiKey" ? `${value.slice(0, 8)}...` : value}`),
    );
  });

configCommand
  .command("unset")
  .argument("<key>", "Config key to remove")
  .action((key: string) => {
    const keyMap: Record<string, string> = {
      server: "serverUrl",
      key: "apiKey",
      serverUrl: "serverUrl",
      apiKey: "apiKey",
    };
    const mapped = keyMap[key];
    if (!mapped) {
      console.error(chalk.red(`Unknown config key: ${key}. Use "server" or "key".`));
      process.exit(1);
    }
    saveConfig({ [mapped]: "" });
    console.log(chalk.green(`Unset ${key}`));
  });
