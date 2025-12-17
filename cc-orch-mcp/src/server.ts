import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { initDb } from "./be/db";
import { registerGetSwarmTool } from "./tools/get-swarm";
import { registerGetTaskDetailsTool } from "./tools/get-task-details";
import { registerGetTasksTool } from "./tools/get-tasks";
import { registerJoinSwarmTool } from "./tools/join-swarm";
import { registerMyAgentInfoTool } from "./tools/my-agent-info";
import { registerPollTaskTool } from "./tools/poll-task";
import { registerSendTaskTool } from "./tools/send-task";
import { registerStoreProgressTool } from "./tools/store-progress";
import pkg from "../package.json";


export function createServer() {
  // Initialize database with WAL mode
  initDb();

  const server = new McpServer(
    {
      name: pkg.name,
      version: pkg.version,
      description: pkg.description,
    },
    {
      capabilities: {
        logging: {},
      },
    },
  );

  registerJoinSwarmTool(server);
  registerPollTaskTool(server);
  registerGetSwarmTool(server);
  registerGetTasksTool(server);
  registerSendTaskTool(server);
  registerGetTaskDetailsTool(server);
  registerStoreProgressTool(server);
  registerMyAgentInfoTool(server);

  return server;
}
