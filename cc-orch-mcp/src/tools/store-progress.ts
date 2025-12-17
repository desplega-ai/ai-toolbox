import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod";
import {
	completeTask,
	failTask,
	getDb,
	getTaskById,
	updateAgentStatus,
	updateTaskProgress,
} from "@/be/db";
import { AgentTaskSchema } from "@/types";

export const registerStoreProgressTool = (server: McpServer) => {
	server.registerTool(
		"store-progress",
		{
			title: "Store task progress",
			description:
				"Stores the progress of a specific task. Can also mark task as completed or failed, which will set the agent back to idle.",
			inputSchema: z.object({
				taskId: z.uuid().describe("The ID of the task to update progress for."),
				progress: z
					.string()
					.optional()
					.describe("The progress update to store."),
				status: z
					.enum(["completed", "failed"])
					.optional()
					.describe("Set to 'completed' or 'failed' to finish the task."),
				output: z
					.string()
					.optional()
					.describe("The output of the task (used when completing)."),
				failureReason: z
					.string()
					.optional()
					.describe("The reason for failure (used when failing)."),
			}),
			outputSchema: z.object({
				success: z.boolean(),
				message: z.string(),
				task: AgentTaskSchema.optional(),
			}),
		},
		async ({ taskId, progress, status, output, failureReason }) => {
			const txn = getDb().transaction(() => {
				const existingTask = getTaskById(taskId);

				if (!existingTask) {
					return {
						success: false,
						message: `Task with ID "${taskId}" not found.`,
					};
				}

				let updatedTask = existingTask;

				// Update progress if provided
				if (progress) {
					const result = updateTaskProgress(taskId, progress);
					if (result) updatedTask = result;
				}

				// Handle status change
				if (status === "completed") {
					const result = completeTask(taskId, output);
					if (result) {
						updatedTask = result;
						updateAgentStatus(existingTask.agentId, "idle");
					}
				} else if (status === "failed") {
					const result = failTask(taskId, failureReason ?? "Unknown failure");
					if (result) {
						updatedTask = result;
						updateAgentStatus(existingTask.agentId, "idle");
					}
				}

				return {
					success: true,
					message: status
						? `Task "${taskId}" marked as ${status}.`
						: `Progress stored for task "${taskId}".`,
					task: updatedTask,
				};
			});

			const result = txn();

			return {
				content: [{ type: "text", text: result.message }],
				structuredContent: result,
			};
		},
	);
};
