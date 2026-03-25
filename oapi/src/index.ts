#!/usr/bin/env node
import { Command } from "commander";
import pkg from "../package.json";
import { docsCommand } from "./commands/docs.ts";
import { executeCommand } from "./commands/execute.ts";
import { listCommand } from "./commands/list.ts";
import { profileCommand } from "./commands/profile.ts";
import { refreshCommand } from "./commands/refresh.ts";
import { registerCommand } from "./commands/register.ts";
import { unregisterCommand } from "./commands/unregister.ts";

const program = new Command();
program.name("oapi").description(pkg.description).version(pkg.version);

program.addCommand(registerCommand);
program.addCommand(unregisterCommand);
program.addCommand(listCommand);
program.addCommand(refreshCommand);
program.addCommand(profileCommand);
program.addCommand(docsCommand);
program.addCommand(executeCommand);

program.parse();
