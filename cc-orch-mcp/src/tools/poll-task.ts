import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { addMinutes } from "date-fns";
import * as z from "zod";

const DEFAULT_POLL_INTERVAL_MS = 2000;
const MAX_POLL_DURATION_MS = 1 * 60 * 1000;

export const registerPollTaskTool = (server: McpServer) => {
  server.registerTool(
    "poll-task",
    {
      title: "Poll for a task",
      description:
        "Tool for an agent to poll for a new task assignment, to be used recursively until a task is assigned.",
      inputSchema: z.object({}),
      outputSchema: z.object({
        message: z.string(),
        task: z.string().describe("The task assigned to the agent.").optional(),
        waitedForSeconds: z.number().describe("Seconds waited before receiving the task."),
      }),
    },
    async (_input, meta) => {
      const now = new Date();
      const maxTime = addMinutes(now, MAX_POLL_DURATION_MS / 60000);

      // Simulate polling for a task
      while (new Date() < maxTime) {
        // In a real implementation, check a database or message queue for tasks
        const hasTask = Math.random() < 0.0001;

        if (hasTask) {
          const task = `Task assigned at ${new Date().toISOString()}`;
          const waitedFor = Math.round((Date.now() - now.getTime()) / 1000);

          return {
            content: [],
            structuredContent: {
              message: `New task assigned to agent.`,
              task,
              waitedForSeconds: waitedFor,
            },
            _meta: {
              serverTimestamp: Date.now(),
              usedSessionId: meta.sessionId,
            },
          };
        }

        await meta.sendNotification({
          method: "notifications/message",
          params: {
            level: "info",
            data: `Polling for task assignment...`,
          },
        });

        // Wait for a short period before polling again
        await new Promise((resolve) => setTimeout(resolve, DEFAULT_POLL_INTERVAL_MS));
      }

      const waitedForSeconds = Math.round((Date.now() - now.getTime()) / 1000);

      // If no task was found within the time limit
      return {
        content: [],
        structuredContent: {
          message: `No task assigned within the polling duration, please keep polling until a task is assigned.`,
          waitedForSeconds,
        },
        _meta: {
          serverTimestamp: Date.now(),
          usedSessionId: meta.sessionId,
        },
      };
    },
  );
};
