import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod";
import { getAllAgents } from "@/be/db";
import { AgentSchema } from "@/types";

export const registerGetSwarmTool = (server: McpServer) => {
	server.registerTool(
		"get-swarm",
		{
			title: "Get the agent swarm",
			description: "Returns a list of agents in the swarm without their tasks.",
			inputSchema: z.object({}),
			outputSchema: z.object({
				agents: z.array(AgentSchema),
			}),
		},
		async () => {
			const agents = getAllAgents();

			return {
				content: [
					{
						type: "text",
						text: `Found ${agents.length} agent(s) in the swarm.`,
					},
				],
				structuredContent: {
					agents,
				},
			};
		},
	);
};
