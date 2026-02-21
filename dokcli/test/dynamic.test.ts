import { describe, expect, test } from "bun:test";
import { Command } from "commander";
import { registerDynamicCommands } from "../src/dynamic/index.ts";
import type { CommandDef } from "../src/spec/parser.ts";

describe("registerDynamicCommands", () => {
  test("creates tag groups and subcommands", () => {
    const program = new Command();
    const commands: CommandDef[] = [
      {
        tag: "project",
        operation: "all",
        method: "GET",
        path: "/project.all",
        description: "List all projects",
        parameters: [],
      },
      {
        tag: "project",
        operation: "create",
        method: "POST",
        path: "/project.create",
        description: "Create a project",
        parameters: [
          { name: "name", type: "string", required: true, description: "Project name", in: "body" },
        ],
      },
      {
        tag: "settings",
        operation: "getDokployVersion",
        method: "GET",
        path: "/settings.getDokployVersion",
        description: "Get version",
        parameters: [],
      },
    ];

    const mockExecute = async () => {};
    registerDynamicCommands(program, commands, mockExecute);

    // Check tag groups exist
    const commandNames = program.commands.map((c) => c.name());
    expect(commandNames).toContain("project");
    expect(commandNames).toContain("settings");

    // Check subcommands
    const projectCmd = program.commands.find((c) => c.name() === "project")!;
    const subNames = projectCmd.commands.map((c) => c.name());
    expect(subNames).toContain("all");
    expect(subNames).toContain("create");
  });

  test("adds options for parameters", () => {
    const program = new Command();
    const commands: CommandDef[] = [
      {
        tag: "app",
        operation: "create",
        method: "POST",
        path: "/app.create",
        description: "Create app",
        parameters: [
          { name: "name", type: "string", required: true, description: "App name", in: "body" },
          { name: "env", type: "string", required: false, description: "Environment", in: "body" },
        ],
      },
    ];

    registerDynamicCommands(program, commands, async () => {});

    const appCmd = program.commands.find((c) => c.name() === "app")!;
    const createCmd = appCmd.commands.find((c) => c.name() === "create")!;
    const optionNames = createCmd.options.map((o) => o.long);
    expect(optionNames).toContain("--name");
    expect(optionNames).toContain("--env");
  });
});
