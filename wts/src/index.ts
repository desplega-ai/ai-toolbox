#!/usr/bin/env bun
import { Command } from "commander";
import pkg from "../package.json";
import { cdCommand } from "./commands/cd.ts";
import { cleanupCommand } from "./commands/cleanup.ts";
import { createCommand } from "./commands/create.ts";
import { deleteCommand } from "./commands/delete.ts";
import { initCommand } from "./commands/init.ts";
import { listCommand } from "./commands/list.ts";
import { mergeCommand } from "./commands/merge.ts";
import { prCommand } from "./commands/pr.ts";
import { setupCommand } from "./commands/setup.ts";
import { switchCommand } from "./commands/switch.ts";

const program = new Command();

program.name("wts").description(pkg.description).version(pkg.version);

program.addCommand(initCommand);
program.addCommand(listCommand);
program.addCommand(createCommand);
program.addCommand(deleteCommand);
program.addCommand(mergeCommand);
program.addCommand(cdCommand);
program.addCommand(switchCommand);
program.addCommand(prCommand);
program.addCommand(setupCommand);
program.addCommand(cleanupCommand);

program.parse();
