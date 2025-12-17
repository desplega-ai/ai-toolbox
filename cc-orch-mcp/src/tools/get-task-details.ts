import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod";
import { getTaskById } from "@/be/db";
import { AgentTaskSchema } from "@/types";

export const registerGetTaskDetailsTool = (server: McpServer) => {
  server.registerTool(
    "get-task-details",
    {
      title: "Get task details",
      description:
        "Returns detailed information about a specific task, including output and failure reason.",
      inputSchema: z.object({
        taskId: z.uuid().describe("The ID of the task to get details for."),
      }),
      outputSchema: z.object({
        success: z.boolean(),
        message: z.string(),
        task: AgentTaskSchema.optional(),
      }),
    },
    async ({ taskId }) => {
      const task = getTaskById(taskId);

      if (!task) {
        return {
          content: [{ type: "text", text: `Task with ID "${taskId}" not found.` }],
          structuredContent: {
            success: false,
            message: `Task with ID "${taskId}" not found.`,
          },
        };
      }

      return {
        content: [{ type: "text", text: `Task "${taskId}" details retrieved.` }],
        structuredContent: {
          success: true,
          message: `Task "${taskId}" details retrieved.`,
          task,
        },
      };
    },
  );
};
