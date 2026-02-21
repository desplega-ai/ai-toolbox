import chalk from "chalk";
import { Command } from "commander";
import WebSocket from "ws";
import { ensureAuth } from "../config/index.ts";

function buildWsUrl(
  serverUrl: string,
  path: string,
  params: URLSearchParams,
): string {
  const wsProtocol = serverUrl.startsWith("https") ? "wss" : "ws";
  const host = serverUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  return `${wsProtocol}://${host}${path}?${params.toString()}`;
}

function connectAndStream(
  wsUrl: string,
  apiKey: string,
  label: string,
): void {
  const ws = new WebSocket(wsUrl, {
    headers: { "x-api-key": apiKey },
  });

  let connected = false;

  ws.on("open", () => {
    connected = true;
    console.error(chalk.dim(`Connected to ${label} stream. Press Ctrl+C to stop.`));
  });

  ws.on("message", (data) => {
    process.stdout.write(data.toString());
  });

  ws.on("close", (code, reason) => {
    if (code === 4000) {
      console.error(chalk.red(`\nError: ${reason.toString()}`));
      process.exit(1);
    }
    if (!connected) {
      console.error(chalk.red("Connection closed before establishing. Check auth and server URL."));
      process.exit(1);
    }
    process.exit(0);
  });

  ws.on("error", (err) => {
    if (!connected) {
      console.error(chalk.red(`Failed to connect: ${err.message}`));
    } else {
      console.error(chalk.red(`WebSocket error: ${err.message}`));
    }
    process.exit(1);
  });

  const shutdown = () => {
    console.error(chalk.dim("\nDisconnecting..."));
    ws.close();
    // Force exit after 2 seconds if close doesn't complete
    setTimeout(() => process.exit(0), 2000).unref();
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

const containerCommand = new Command("container")
  .description("Stream container logs")
  .argument("<containerId>", "Container ID or service name")
  .option("-n, --tail <lines>", "Number of tail lines", "100")
  .option("-s, --since <duration>", 'Time filter: "all", "5s", "10m", "1h", "2d"', "all")
  .option("--search <text>", "Filter log text")
  .option("--swarm", "Use Docker Swarm service logs")
  .option("--server-id <id>", "Remote server ID")
  .action(async (containerId: string, opts) => {
    try {
      const { apiKey, serverUrl } = ensureAuth();
      const program = containerCommand.parent?.parent;
      const globalOpts = program?.opts() || {};
      const server = globalOpts.server || serverUrl;

      const params = new URLSearchParams({
        containerId,
        tail: opts.tail,
        since: opts.since,
        search: opts.search || "",
        runType: opts.swarm ? "swarm" : "docker",
      });

      if (opts.serverId) {
        params.set("serverId", opts.serverId);
      }

      const wsUrl = buildWsUrl(server, "/docker-container-logs", params);
      connectAndStream(wsUrl, apiKey, "container logs");
    } catch (err) {
      console.error(chalk.red(`Error: ${(err as Error).message}`));
      process.exit(1);
    }
  });

const deploymentCommand = new Command("deployment")
  .description("Stream deployment build logs")
  .argument("<logPath>", "Server-side log file path")
  .option("--server-id <id>", "Remote server ID")
  .action(async (logPath: string, opts) => {
    try {
      const { apiKey, serverUrl } = ensureAuth();
      const program = deploymentCommand.parent?.parent;
      const globalOpts = program?.opts() || {};
      const server = globalOpts.server || serverUrl;

      const params = new URLSearchParams({ logPath });

      if (opts.serverId) {
        params.set("serverId", opts.serverId);
      }

      const wsUrl = buildWsUrl(server, "/listen-deployment", params);
      connectAndStream(wsUrl, apiKey, "deployment logs");
    } catch (err) {
      console.error(chalk.red(`Error: ${(err as Error).message}`));
      process.exit(1);
    }
  });

export const logsCommand = new Command("logs")
  .description("Stream logs via WebSocket")
  .addCommand(containerCommand)
  .addCommand(deploymentCommand);
