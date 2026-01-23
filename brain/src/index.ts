#!/usr/bin/env bun
import { Command } from "commander";
import pkg from "../package.json";
import { addCommand } from "./commands/add.ts";
import { configCommand } from "./commands/config.ts";
import { editCommand } from "./commands/edit.ts";
import { initCommand } from "./commands/init.ts";
import { listCommand } from "./commands/list.ts";
import { newCommand } from "./commands/new.ts";
import { searchCommand } from "./commands/search.ts";
import { showCommand } from "./commands/show.ts";
import { syncCommand } from "./commands/sync.ts";
import { todoCommand } from "./commands/todo.ts";

const program = new Command();

program.name("brain").description(pkg.description).version(pkg.version);

// Core commands
program.addCommand(initCommand);
program.addCommand(addCommand);
program.addCommand(newCommand);
program.addCommand(listCommand);
program.addCommand(showCommand);
program.addCommand(editCommand);
program.addCommand(configCommand);

// Search and sync
program.addCommand(syncCommand);
program.addCommand(searchCommand);

// Todo management
program.addCommand(todoCommand);

program.parse();
