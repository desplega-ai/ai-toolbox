#!/usr/bin/env bun
import { Command } from "commander";
import { cdCommand } from "./commands/cd.ts";
import { cleanupCommand } from "./commands/cleanup.ts";
import { createCommand } from "./commands/create.ts";
import { deleteCommand } from "./commands/delete.ts";
import { initCommand } from "./commands/init.ts";
import { listCommand } from "./commands/list.ts";
import { prCommand } from "./commands/pr.ts";
import { switchCommand } from "./commands/switch.ts";

const program = new Command();

program.name("wts").description("Git worktree manager with tmux integration").version("0.1.0");

program.addCommand(initCommand);
program.addCommand(listCommand);
program.addCommand(createCommand);
program.addCommand(deleteCommand);
program.addCommand(cdCommand);
program.addCommand(switchCommand);
program.addCommand(prCommand);
program.addCommand(cleanupCommand);

program.parse();
