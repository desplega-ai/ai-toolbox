#!/usr/bin/env bun
import { Command } from "commander";
import pkg from "../package.json";
import { executeApiCall } from "./client/index.ts";
import { configCommand } from "./commands/config.ts";
import { loginCommand } from "./commands/login.ts";
import { logsCommand } from "./commands/logs.ts";
import { specCommand } from "./commands/spec.ts";
import { registerDynamicCommands } from "./dynamic/index.ts";
import { getSpec } from "./spec/index.ts";
import { parseSpec } from "./spec/parser.ts";

const program = new Command();
program.name("dokcli").description(pkg.description).version(pkg.version);

// Global options
program.option("--json", "Output raw JSON");
program.option("--server <url>", "Override server URL");

// Static commands
program.addCommand(loginCommand);
program.addCommand(configCommand);
program.addCommand(specCommand);
program.addCommand(logsCommand);

// Dynamic commands from spec
try {
  const spec = await getSpec();
  const commands = parseSpec(spec);
  registerDynamicCommands(program, commands, executeApiCall);
} catch (error) {
  console.error("Warning: Failed to load dynamic commands:", (error as Error).message);
}

program.parse();
