#!/usr/bin/env node

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

const configPath = process.env.AGENT_SWARM_CONFIG;

if (!configPath) {
  console.error(
    "agent-swarm plugin: AGENT_SWARM_CONFIG was not supplied by mcp.json.",
  );
  process.exit(1);
}

let config;
try {
  config = JSON.parse(readFileSync(configPath, "utf8"));
} catch (error) {
  console.error(
    `agent-swarm plugin: could not read ${configPath}. Create it in the plugin data directory with apiKey and agentId fields. (${error.message})`,
  );
  process.exit(1);
}

const { apiKey, agentId } = config;
if (
  typeof apiKey !== "string" ||
  !apiKey ||
  typeof agentId !== "string" ||
  !agentId
) {
  console.error(
    `agent-swarm plugin: ${configPath} must contain non-empty apiKey and agentId strings.`,
  );
  process.exit(1);
}

const mcpUrl = config.mcpUrl ?? "https://api.desplega.agent-swarm.dev/mcp";
if (typeof mcpUrl !== "string") {
  console.error(`agent-swarm plugin: mcpUrl in ${configPath} must be a string.`);
  process.exit(1);
}

try {
  const url = new URL(mcpUrl);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("URL must use http or https");
  }
} catch (error) {
  console.error(`agent-swarm plugin: invalid MCP URL "${mcpUrl}": ${error.message}`);
  process.exit(1);
}

const bridgeArgs = [
  "--yes",
  "mcp-remote@0.1.38",
  mcpUrl,
  "--header",
  "Authorization:${AGENT_SWARM_AUTH_HEADER}",
  "--header",
  "X-Agent-ID:${AGENT_SWARM_AGENT_HEADER}",
  "--transport",
  "http-only",
];

const isWindows = process.platform === "win32";
const executable = isWindows ? process.execPath : "npx";
const args = isWindows
  ? [join(dirname(process.execPath), "node_modules", "npm", "bin", "npx-cli.js"), ...bridgeArgs]
  : bridgeArgs;

const child = spawn(
  executable,
  args,
  {
    env: {
      ...process.env,
      AGENT_SWARM_AUTH_HEADER: `Bearer ${apiKey}`,
      AGENT_SWARM_AGENT_HEADER: agentId,
    },
    stdio: "inherit",
  },
);

const forwardSignal = (signal) => {
  if (!child.killed) child.kill(signal);
};
const forwardSigint = () => forwardSignal("SIGINT");
const forwardSigterm = () => forwardSignal("SIGTERM");

process.on("SIGINT", forwardSigint);
process.on("SIGTERM", forwardSigterm);

child.on("error", (error) => {
  console.error(`agent-swarm plugin: could not start npx: ${error.message}`);
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
