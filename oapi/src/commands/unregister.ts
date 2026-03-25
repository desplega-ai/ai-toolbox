import { Command } from "commander";
import { deleteSpec, loadConfig, saveConfig } from "../config/index.ts";
import { printError, printSuccess } from "../output/index.ts";

export const unregisterCommand = new Command("unregister")
  .description("Remove a registered API")
  .argument("<name>", "Name of the API to remove")
  .action((name: string) => {
    const config = loadConfig();

    if (!config.apis[name]) {
      printError(`API '${name}' is not registered`);
      process.exit(1);
    }

    // Remove from config
    delete config.apis[name];

    // Remove default profile mapping
    delete config.defaults[name];

    saveConfig(config);

    // Delete cached spec
    deleteSpec(name);

    printSuccess(`Unregistered '${name}'`);
  });
