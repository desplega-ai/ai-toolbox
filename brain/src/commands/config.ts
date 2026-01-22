import chalk from "chalk";
import { Command } from "commander";
import { type BrainConfig, getConfigPath, loadConfig, saveConfig } from "../config/index.ts";
import { expandPath, formatPath } from "../utils/paths.ts";

export const configCommand = new Command("config").description(
  "View or update brain configuration",
);

configCommand
  .command("show")
  .description("Display current configuration")
  .action(async () => {
    const config = await loadConfig();

    if (!config) {
      console.log(chalk.yellow("Brain not initialized. Run 'brain init' first."));
      return;
    }

    console.log(chalk.bold("Brain Configuration"));
    console.log(chalk.dim(`File: ${formatPath(getConfigPath())}\n`));

    console.log(`  path:                ${formatPath(config.path)}`);
    console.log(`  editor:              ${config.editor ?? "(default: $EDITOR or vim)"}`);
    console.log(`  embeddingModel:      ${config.embeddingModel ?? "text-embedding-3-small"}`);
    console.log(`  embeddingDimensions: ${config.embeddingDimensions ?? 1536}`);
  });

configCommand
  .command("set")
  .description("Update a configuration value")
  .argument("<key>", "Configuration key (path, editor, embeddingModel, embeddingDimensions)")
  .argument("<value>", "New value")
  .action(async (key: string, value: string) => {
    const config = await loadConfig();

    if (!config) {
      console.error(chalk.red("Error: Brain not initialized. Run 'brain init' first."));
      process.exit(1);
    }

    const validKeys = ["path", "editor", "embeddingModel", "embeddingDimensions"];
    if (!validKeys.includes(key)) {
      console.error(chalk.red(`Error: Invalid key '${key}'`));
      console.error(chalk.dim(`Valid keys: ${validKeys.join(", ")}`));
      process.exit(1);
    }

    // Handle type conversion and validation
    let newValue: string | number = value;

    if (key === "path") {
      newValue = expandPath(value);
    } else if (key === "embeddingDimensions") {
      const num = parseInt(value, 10);
      if (Number.isNaN(num) || num <= 0) {
        console.error(chalk.red("Error: embeddingDimensions must be a positive number"));
        process.exit(1);
      }
      newValue = num;
    }

    // Update config
    const updatedConfig: BrainConfig = {
      ...config,
      [key]: newValue,
    };

    await saveConfig(updatedConfig);

    console.log(
      chalk.green(
        `✓ Set ${key} = ${typeof newValue === "string" ? formatPath(newValue) : newValue}`,
      ),
    );
  });

configCommand
  .command("unset")
  .description("Remove a configuration value (use default)")
  .argument("<key>", "Configuration key to remove")
  .action(async (key: string) => {
    const config = await loadConfig();

    if (!config) {
      console.error(chalk.red("Error: Brain not initialized. Run 'brain init' first."));
      process.exit(1);
    }

    // Can't unset path
    if (key === "path") {
      console.error(chalk.red("Error: Cannot unset 'path' - it is required"));
      process.exit(1);
    }

    const validKeys = ["editor", "embeddingModel", "embeddingDimensions"];
    if (!validKeys.includes(key)) {
      console.error(chalk.red(`Error: Invalid key '${key}'`));
      console.error(chalk.dim(`Valid keys: ${validKeys.join(", ")}`));
      process.exit(1);
    }

    // Remove the key
    const updatedConfig = { ...config };
    delete (updatedConfig as Record<string, unknown>)[key];

    await saveConfig(updatedConfig);

    console.log(chalk.green(`✓ Unset ${key} (will use default)`));
  });
