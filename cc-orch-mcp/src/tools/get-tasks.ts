import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod";
import { getAllTasks } from "@/be/db";
import { createToolRegistrar } from "@/tools/utils";
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
  createToolRegistrar(server)(
    "get-tasks",
    {
      title: "Get tasks",
      description:
        "Returns a list of tasks in the swarm, filtered by status and sorted by lastUpdatedAt desc. Defaults to in_progress tasks only. Does not return output or failure reason.",
      inputSchema: z.object({
        status: AgentTaskStatusSchema.optional().describe(
          "Filter by task status. Defaults to 'in_progress'.",
        ),
        mineOnly: z
          .boolean()
          .optional()
          .describe(
            "If true, only return tasks assigned to your agent. Requires X-Agent-ID header.",
          ),
      }),
      outputSchema: z.object({
        tasks: z.array(TaskSummarySchema),
      }),
    },
    async ({ status, mineOnly }, requestInfo, _meta) => {
      const filterStatus = status ?? "in_progress";
      let tasks = getAllTasks({ status: filterStatus });

      // Filter to only tasks assigned to this agent if mineOnly is true
      if (mineOnly) {
        if (!requestInfo.agentId) {
          // No agent ID set, return empty list
          tasks = [];
        } else {
          tasks = tasks.filter((t) => t.agentId === requestInfo.agentId);
        }
      }

      const taskSummaries = tasks.map((t) => ({
        id: t.id,
        task: t.task,
        status: t.status,
        createdAt: t.createdAt,
        lastUpdatedAt: t.lastUpdatedAt,
        finishedAt: t.finishedAt,
        progress: t.progress,
      }));

      const mineOnlyMsg = mineOnly ? " (mine only)" : "";
      return {
        content: [
          {
            type: "text",
            text: `Found ${taskSummaries.length} task(s) with status '${filterStatus}'${mineOnlyMsg}.`,
          },
        ],
        structuredContent: {
          yourAgentId: requestInfo.agentId,
          tasks: taskSummaries,
        },
      };
    },
  );
};
