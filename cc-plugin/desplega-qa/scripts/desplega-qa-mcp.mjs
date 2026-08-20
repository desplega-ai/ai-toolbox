#!/usr/bin/env node

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

const configPath = process.env.DESPLEGA_QA_CONFIG;

if (!configPath) {
  console.error(
    "desplega-qa plugin: DESPLEGA_QA_CONFIG was not supplied by mcp.json.",
  );
  process.exit(1);
}

let config;
try {
  config = JSON.parse(readFileSync(configPath, "utf8"));
} catch (error) {
  console.error(
    `desplega-qa plugin: could not read ${configPath}. Create it in the plugin data directory with an apiKey field. (${error.message})`,
  );
  process.exit(1);
}

const { apiKey } = config;
if (typeof apiKey !== "string" || !apiKey) {
  console.error(
    `desplega-qa plugin: ${configPath} must contain a non-empty apiKey string.`,
  );
  process.exit(1);
}

const optionalEnvByConfigKey = {
  apiUrl: "QA_USE_API_URL",
  appUrl: "QA_USE_APP_URL",
  region: "QA_USE_REGION",
};

const env = {
  ...process.env,
  QA_USE_API_KEY: apiKey,
};

for (const [configKey, envVar] of Object.entries(optionalEnvByConfigKey)) {
  const value = config[configKey];
  if (value === undefined) continue;
  if (typeof value !== "string" || !value) {
    console.error(
      `desplega-qa plugin: ${configKey} in ${configPath} must be a non-empty string if present.`,
    );
    process.exit(1);
  }
  env[envVar] = value;
}

const bridgeArgs = ["--yes", "@desplega.ai/qa-use-mcp@1.6.0"];

const isWindows = process.platform === "win32";
const executable = isWindows ? process.execPath : "npx";
const args = isWindows
  ? [join(dirname(process.execPath), "node_modules", "npm", "bin", "npx-cli.js"), ...bridgeArgs]
  : bridgeArgs;

const child = spawn(executable, args, { env, stdio: "inherit" });

const forwardSignal = (signal) => {
  if (!child.killed) child.kill(signal);
};
const forwardSigint = () => forwardSignal("SIGINT");
const forwardSigterm = () => forwardSignal("SIGTERM");

process.on("SIGINT", forwardSigint);
process.on("SIGTERM", forwardSigterm);

child.on("error", (error) => {
  console.error(`desplega-qa plugin: could not start npx: ${error.message}`);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  process.removeListener("SIGINT", forwardSigint);
  process.removeListener("SIGTERM", forwardSigterm);

  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});
