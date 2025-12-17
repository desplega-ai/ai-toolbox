import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod";
import { createAgent, getAllAgents, getDb } from "@/be/db";
import { createToolRegistrar } from "@/tools/utils";
import { AgentSchema } from "@/types";

export const registerJoinSwarmTool = (server: McpServer) => {
  createToolRegistrar(server)(
    "join-swarm",
    {
      title: "Join the agent swarm",
      description: "Tool for an agent to join the swarm of agents.",
      inputSchema: z.object({
        lead: z.boolean().default(false).describe("Whether this agent should be the lead."),
        name: z.string().min(1).describe("The name of the agent joining the swarm."),
      }),
      outputSchema: z.object({
        success: z.boolean(),
        message: z.string(),
        agent: AgentSchema.optional(),
      }),
    },
    async ({ lead, name }, requestInfo, _meta) => {
      // Check if agent ID is set
      if (!requestInfo.agentId) {
        return {
          content: [
            {
              type: "text",
              text: 'Agent ID not found. The MCP client should define the "X-Agent-ID" header.',
            },
          ],
          structuredContent: {
            yourAgentId: requestInfo.agentId,
            success: false,
            message: 'Agent ID not found. The MCP client should define the "X-Agent-ID" header.',
          },
        };
      }

      const agentId = requestInfo.agentId;

      try {
        const agentTx = getDb().transaction(() => {
          const agents = getAllAgents();

          const existingAgent = agents.find((agent) => agent.name === name);
          const existingLead = agents.find((agent) => agent.isLead);

          if (existingAgent) {
            throw new Error(`Agent with name "${name}" already exists.`);
          }

          // If lead is true, demote e
          if (lead && existingLead) {
            throw new Error(
              `Lead agent "${existingLead.name}" already exists. Only one lead agent is allowed.`,
            );
          }

          return createAgent({
            id: agentId,
            name,
            isLead: lead,
            status: "idle",
          });
        });

        const agent = agentTx();

        return {
          content: [
            {
              type: "text",
              text: `Successfully joined swarm as agent "${agent.name}" (ID: ${agent.id}).`,
            },
          ],
          structuredContent: {
            yourAgentId: requestInfo.agentId,
            success: true,
            message: `Successfully joined swarm as agent "${agent.name}" (ID: ${agent.id}).`,
            agent,
          },
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Failed to join swarm: ${(error as Error).message}`,
            },
          ],
          structuredContent: {
            yourAgentId: requestInfo.agentId,
            success: false,
            message: `Failed to join swarm: ${(error as Error).message}`,
          },
        };
      }
    },
  );
};
