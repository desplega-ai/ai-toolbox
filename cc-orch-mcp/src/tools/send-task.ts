import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod";
import { createTask, getAgentById, getDb } from "@/be/db";
import { createToolRegistrar } from "@/tools/utils";
import { AgentTaskSchema } from "@/types";

export const registerSendTaskTool = (server: McpServer) => {
  createToolRegistrar(server)(
    "send-task",
    {
      title: "Send a task",
      description: "Sends a task to a specific agent in the swarm.",
      inputSchema: z.object({
        agentId: z.uuid().describe("The ID of the agent to send the task to."),
        task: z.string().min(1).describe("The task description to send."),
      }),
      outputSchema: z.object({
        success: z.boolean(),
        message: z.string(),
        task: AgentTaskSchema.optional(),
      }),
    },
    async ({ agentId, task }, requestInfo, _meta) => {
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

      if (agentId === requestInfo.agentId) {
        return {
          content: [
            {
              type: "text",
              text: "Cannot send a task to yourself, are you drunk?",
            },
          ],
          structuredContent: {
            yourAgentId: requestInfo.agentId,
            success: false,
            message: "Cannot send a task to yourself, are you drunk?",
          },
        };
      }

      const txn = getDb().transaction(() => {
        const agent = getAgentById(agentId);

        if (!agent) {
          return {
            success: false,
            message: `Agent with ID "${agentId}" not found.`,
          };
        }

        if (agent.isLead) {
          return {
            success: false,
            message: `Cannot assign tasks to the lead agent "${agent.name}", wtf?`,
          };
        }

        if (agent.status !== "idle") {
          return {
            success: false,
            message: `Agent "${agent.name}" is not idle (status: ${agent.status}). Cannot assign task.`,
          };
        }

        const newTask = createTask(agentId, task);

        return {
          success: true,
          message: `Task "${newTask.id}" sent to agent "${agent.name}".`,
          task: newTask,
        };
      });

      const result = txn();

      return {
        content: [{ type: "text", text: result.message }],
        structuredContent: {
          yourAgentId: requestInfo.agentId,
          ...result,
        },
      };
    },
  );
};
