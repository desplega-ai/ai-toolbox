#!/usr/bin/env bun

import pkg from "../../package.json";
import type { Agent } from "../types";

const SERVER_NAME = pkg.config?.name ?? "agent-swarm";

type McpServerConfig = {
  url: string;
  headers: {
    Authorization: string;
    "X-Agent-ID": string;
  };
};

interface HookMessage {
  hook_event_name: string;
  session_id?: string;
  transcript_path?: string;
  permission_mode?: string;
  cwd?: string;
  source?: string;
  trigger?: string;
  custom_instructions?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_response?: Record<string, unknown>;
  tool_use_id?: string;
  prompt?: string;
  stop_hook_active?: boolean;
}

/**
 * Main hook handler - processes Claude Code hook events
 */
export async function handleHook(): Promise<void> {
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();

  let mcpConfig: McpServerConfig | undefined;

  try {
    const mcpFile = Bun.file(`${projectDir}/.mcp.json`);
    if (await mcpFile.exists()) {
      const config = await mcpFile.json();
      mcpConfig = config?.mcpServers?.[SERVER_NAME] as McpServerConfig;
    }
  } catch {
    // No config found, proceed without MCP
  }

  let msg: HookMessage;
  try {
    msg = await Bun.stdin.json();
  } catch {
    // No stdin or invalid JSON - exit silently
    return;
  }

  const getBaseUrl = (): string => {
    if (!mcpConfig) return "";
    try {
      const url = new URL(mcpConfig.url);
      return url.origin;
    } catch {
      return "";
    }
  };

  const hasAgentIdHeader = (): boolean => {
    if (!mcpConfig) return false;
    return Boolean(mcpConfig.headers["X-Agent-ID"]);
  };

  const ping = async (): Promise<void> => {
    if (!mcpConfig) return;

    try {
      await fetch(`${getBaseUrl()}/ping`, {
        method: "POST",
        headers: mcpConfig.headers,
      });
    } catch {
      // Silently fail - server might not be running
    }
  };

  const close = async (): Promise<void> => {
    if (!mcpConfig) return;

    try {
      await fetch(`${getBaseUrl()}/close`, {
        method: "POST",
        headers: mcpConfig.headers,
      });
    } catch {
      // Silently fail
    }
  };

  const getAgentInfo = async (): Promise<Agent | undefined> => {
    if (!mcpConfig) return;

    try {
      const resp = await fetch(`${getBaseUrl()}/me`, {
        method: "GET",
        headers: mcpConfig.headers,
      });

      if ([400, 404].includes(resp.status)) {
        return;
      }

      return (await resp.json()) as Agent;
    } catch {
      // Silently fail
    }

    return;
  };

  // Ping the server to indicate activity
  await ping();

  // Get current agent info
  const agentInfo = await getAgentInfo();

  // Always output agent status
  if (agentInfo) {
    console.log(
      `You are registered as ${agentInfo.isLead ? "lead" : "worker"} agent "${agentInfo.name}" with ID: ${agentInfo.id} (status: ${agentInfo.status}) as of ${new Date().toISOString()}.`,
    );

    if (!agentInfo.isLead && agentInfo.status === "busy") {
      console.log(
        `Remember to call store-progress periodically to update the lead agent on your progress as you are currently marked as busy. The comments you leave will be helpful for the lead agent to monitor your work.`,
      );
    }
  } else {
    console.log(
      `You are not registered in the agent swarm yet. Use the join-swarm tool to register yourself, then check your status with my-agent-info.

If the ${SERVER_NAME} server is not running or disabled, disregard this message.

${hasAgentIdHeader() ? `You have a pre-defined agent ID via header: ${mcpConfig?.headers["X-Agent-ID"]}, it will be used automatically on join-swarm.` : "You do not have a pre-defined agent ID, you will receive one when you join the swarm, or optionally you can request one when calling join-swarm."}`,
    );
  }

  // Handle specific hook events
  switch (msg.hook_event_name) {
    case "SessionStart":
      if (!agentInfo) break;

      if (agentInfo.isLead) {
        console.log(
          `As the lead agent, you are responsible for coordinating the swarm to fulfill the user's request efficiently. Use the ${SERVER_NAME} tools to assign tasks to worker agents and monitor their progress.`,
        );
      } else {
        console.log(
          `As a worker agent, you should call the poll-task tool to wait for tasks assigned by the lead agent, unless specified otherwise.`,
        );
      }
      break;

    case "PreCompact":
      // Covered by SessionStart hook
      break;

    case "PreToolUse":
      // Nothing to do here for now
      break;

    case "PostToolUse":
      if (agentInfo) {
        if (agentInfo.isLead) {
          if (msg.tool_name?.endsWith("send-task")) {
            const maybeTaskId = (msg.tool_response as { task?: { id?: string } })?.task?.id;

            console.log(
              `Task sent successfully.${maybeTaskId ? ` Task ID: ${maybeTaskId}.` : ""} Monitor progress using the get-task-details tool periodically.`,
            );
          }
        } else {
          console.log(
            `Remember to call store-progress periodically to update the lead agent on your progress.`,
          );
        }
      }
      break;

    case "UserPromptSubmit":
      // Nothing specific for now
      break;

    case "Stop":
      // Mark the agent as offline
      await close();
      break;

    default:
      break;
  }
}

// Run directly when executed as a script
const isMainModule = import.meta.main;
if (isMainModule) {
  await handleHook();
  process.exit(0);
}
