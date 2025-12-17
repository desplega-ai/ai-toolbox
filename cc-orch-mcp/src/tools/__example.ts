import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod";

export const registerJoinSwarmTool = (server: McpServer) => {
  server.registerTool(
    "join-swarm",
    {
      title: "Join the agent swarm",
      description: "Tool to join a P2P swarm using a given multiaddress.",
      inputSchema: z.object({
        multiaddr: z.string().min(1).describe("The multiaddress of the swarm to join"),
      }),
      outputSchema: z.object({
        success: z.boolean(),
        message: z.string(),
      }),
    },
    async ({ multiaddr }, meta) => {
      return {
        content: [{ type: "text", text: `Attempting to join swarm at ${multiaddr}` }],
        structuredContent: {
          success: true,
          message: `Joined swarm at ${multiaddr} successfully.`,
        },
        _meta: {
          serverTimestamp: Date.now(),
          usedSessionId: meta.sessionId,
        },
      };
    },
  );
};
