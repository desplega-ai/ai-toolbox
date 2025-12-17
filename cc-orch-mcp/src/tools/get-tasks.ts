import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod";
import { getAllTasks } from "@/be/db";
import { AgentTaskStatusSchema } from "@/types";

const TaskSummarySchema = z.object({
	id: z.string(),
	task: z.string(),
	status: AgentTaskStatusSchema,
	createdAt: z.string(),
	lastUpdatedAt: z.string(),
	finishedAt: z.string().optional(),
	progress: z.string().optional(),
});

export const registerGetTasksTool = (server: McpServer) => {
	server.registerTool(
		"get-tasks",
		{
			title: "Get tasks",
			description:
				"Returns a list of tasks in the swarm, filtered by status and sorted by lastUpdatedAt desc. Defaults to in_progress tasks only. Does not return output or failure reason.",
			inputSchema: z.object({
				status: AgentTaskStatusSchema.optional().describe(
					"Filter by task status. Defaults to 'in_progress'.",
				),
			}),
			outputSchema: z.object({
				tasks: z.array(TaskSummarySchema),
			}),
		},
		async ({ status }) => {
			const filterStatus = status ?? "in_progress";
			const tasks = getAllTasks(filterStatus);

			const taskSummaries = tasks.map((t) => ({
				id: t.id,
				task: t.task,
				status: t.status,
				createdAt: t.createdAt,
				lastUpdatedAt: t.lastUpdatedAt,
				finishedAt: t.finishedAt,
				progress: t.progress,
			}));

			return {
				content: [
					{
						type: "text",
						text: `Found ${taskSummaries.length} task(s) with status '${filterStatus}'.`,
					},
				],
				structuredContent: {
					tasks: taskSummaries,
				},
			};
		},
	);
};
