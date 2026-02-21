import chalk from "chalk";
import { Command } from "commander";
import type { CommandDef } from "../spec/parser.ts";

type ExecuteCall = (
  def: CommandDef,
  args: Record<string, unknown>,
  globalOpts?: { server?: string; json?: boolean },
) => Promise<void>;

export function registerDynamicCommands(
  program: Command,
  commands: CommandDef[],
  executeCall: ExecuteCall,
): void {
  const groups = new Map<string, CommandDef[]>();
  for (const cmd of commands) {
    const existing = groups.get(cmd.tag) || [];
    existing.push(cmd);
    groups.set(cmd.tag, existing);
  }

  for (const [tag, defs] of groups) {
    const tagCmd = new Command(tag).description(`${tag} operations (${defs.length} commands)`);

    for (const def of defs) {
      const subCmd = tagCmd
        .command(def.operation)
        .description(def.description || `${def.tag}.${def.operation}`);

      for (const param of def.parameters) {
        const flag = param.required
          ? `--${param.name} <${param.name}>`
          : `--${param.name} [${param.name}]`;
        subCmd.option(flag, param.description || param.name);
      }

      subCmd.action(async (options: Record<string, unknown>) => {
        for (const param of def.parameters) {
          if (param.required && options[param.name] === undefined) {
            console.error(chalk.red(`Missing required option: --${param.name}`));
            process.exit(1);
          }
        }

        const root = program.opts() as {
          server?: string;
          json?: boolean;
        };
        await executeCall(def, options, root);
      });
    }

    program.addCommand(tagCmd);
  }
}
