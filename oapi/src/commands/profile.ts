import chalk from "chalk";
import { Command } from "commander";
import { loadConfig, saveConfig } from "../config/index.ts";
import type { Profile } from "../config/types.ts";
import { printError, printSuccess } from "../output/index.ts";

/**
 * Mask a secret value for display: show first 3 chars + "***"
 * e.g., "sk-test123" → "sk-***"
 */
function maskValue(value: string): string {
  if (value.length <= 3) return "***";
  return `${value.slice(0, 3)}***`;
}

// ─── Subcommands ──────────────────────────────────────────────────────────────

const addCommand = new Command("add")
  .description("Add an auth profile")
  .requiredOption("-n, --name <name>", "Profile name")
  .requiredOption("-t, --type <type>", "Auth type: header, bearer, basic, query")
  .option("--header-name <name>", "Header name (for type: header)")
  .option("--query-param <name>", "Query parameter name (for type: query)")
  .requiredOption("-v, --value <value>", "Auth value (token, key, user:pass)")
  .action(
    (options: {
      name: string;
      type: string;
      headerName?: string;
      queryParam?: string;
      value: string;
    }) => {
      const validTypes = ["header", "bearer", "basic", "query"];
      if (!validTypes.includes(options.type)) {
        printError(`Invalid auth type '${options.type}'. Must be one of: ${validTypes.join(", ")}`);
        process.exit(2);
      }

      const profile: Profile = {
        type: options.type as Profile["type"],
        value: options.value,
      };

      if (options.type === "header") {
        profile.headerName = options.headerName || "Authorization";
      }

      if (options.type === "query") {
        if (!options.queryParam) {
          printError("--query-param is required for type: query");
          process.exit(2);
        }
        profile.queryParam = options.queryParam;
      }

      const config = loadConfig();
      config.profiles[options.name] = profile;
      saveConfig(config);

      const masked = maskValue(options.value);
      printSuccess(`Added profile '${options.name}' (${options.type}, value: ${masked})`);
    },
  );

const listProfileCommand = new Command("list").description("List auth profiles").action(() => {
  const config = loadConfig();
  const profileNames = Object.keys(config.profiles);

  if (profileNames.length === 0) {
    console.log("No profiles configured. Use `oapi profile add` to create one.");
    return;
  }

  // Build reverse mapping: profile name → which APIs use it as default
  const defaultFor: Record<string, string[]> = {};
  for (const [apiName, profileName] of Object.entries(config.defaults)) {
    if (!defaultFor[profileName]) {
      defaultFor[profileName] = [];
    }
    (defaultFor[profileName] as string[]).push(apiName);
  }

  // Collect rows
  const rows: Array<{
    name: string;
    type: string;
    headerParam: string;
    apiDefault: string;
  }> = [];

  for (const name of profileNames) {
    const profile = config.profiles[name];
    if (!profile) continue;

    let headerParam = "\u2014";
    if (profile.type === "header" && profile.headerName) {
      headerParam = profile.headerName;
    } else if (profile.type === "bearer") {
      headerParam = "Authorization";
    } else if (profile.type === "basic") {
      headerParam = "Authorization";
    } else if (profile.type === "query" && profile.queryParam) {
      headerParam = profile.queryParam;
    }

    const apis = defaultFor[name];
    const apiDefault = apis ? apis.join(", ") : "\u2014";

    rows.push({
      name,
      type: profile.type,
      headerParam,
      apiDefault,
    });
  }

  // Calculate column widths
  const headers = {
    name: "Name",
    type: "Type",
    headerParam: "Header/Param",
    apiDefault: "API Default",
  };
  const cols = {
    name: Math.max(headers.name.length, ...rows.map((r) => r.name.length)),
    type: Math.max(headers.type.length, ...rows.map((r) => r.type.length)),
    headerParam: Math.max(headers.headerParam.length, ...rows.map((r) => r.headerParam.length)),
    apiDefault: Math.max(headers.apiDefault.length, ...rows.map((r) => r.apiDefault.length)),
  };

  // Print header
  const headerLine = [
    chalk.bold(headers.name.padEnd(cols.name)),
    chalk.bold(headers.type.padEnd(cols.type)),
    chalk.bold(headers.headerParam.padEnd(cols.headerParam)),
    chalk.bold(headers.apiDefault.padEnd(cols.apiDefault)),
  ].join("  ");
  console.log(headerLine);

  // Print rows
  for (const row of rows) {
    const line = [
      chalk.cyan(row.name.padEnd(cols.name)),
      row.type.padEnd(cols.type),
      row.headerParam.padEnd(cols.headerParam),
      row.apiDefault.padEnd(cols.apiDefault),
    ].join("  ");
    console.log(line);
  }
});

const rmCommand = new Command("rm")
  .description("Remove an auth profile")
  .argument("<name>", "Profile name to remove")
  .action((name: string) => {
    const config = loadConfig();

    if (!config.profiles[name]) {
      printError(`Profile '${name}' does not exist`);
      process.exit(1);
    }

    // Remove from profiles
    delete config.profiles[name];

    // Clear any default mappings that reference this profile
    for (const [apiName, profileName] of Object.entries(config.defaults)) {
      if (profileName === name) {
        delete config.defaults[apiName];
      }
    }

    saveConfig(config);
    printSuccess(`Removed profile '${name}'`);
  });

const setDefaultCommand = new Command("set-default")
  .description("Set the default auth profile for an API")
  .argument("<api-name>", "Registered API name")
  .argument("<profile-name>", "Profile name to use as default")
  .action((apiName: string, profileName: string) => {
    const config = loadConfig();

    // Validate API exists
    if (!config.apis[apiName]) {
      printError(`API '${apiName}' is not registered`);
      process.exit(1);
    }

    // Validate profile exists
    if (!config.profiles[profileName]) {
      printError(`Profile '${profileName}' does not exist`);
      process.exit(1);
    }

    config.defaults[apiName] = profileName;
    saveConfig(config);

    printSuccess(`Set '${profileName}' as default profile for '${apiName}'`);
  });

// ─── Parent Command ───────────────────────────────────────────────────────────

export const profileCommand = new Command("profile").description("Manage auth profiles");

profileCommand.addCommand(addCommand);
profileCommand.addCommand(listProfileCommand);
profileCommand.addCommand(rmCommand);
profileCommand.addCommand(setDefaultCommand);
