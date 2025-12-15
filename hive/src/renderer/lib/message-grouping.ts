import type { SDKMessage, SDKAssistantMessage, SDKUserMessage } from '../../shared/sdk-types';

// A tool group contains the tool invocation and all related messages
export interface ToolGroup {
  id: string;                    // The tool_use id (e.g., "toolu_01X...")
  toolName: string;              // e.g., "Bash", "Write", "Task"
  toolInput: unknown;            // The tool input parameters
  startIndex: number;            // Original position in flat message array
  isSubagent: boolean;           // True for Task tool
  subagentMessages: SDKMessage[]; // Messages within subagent conversation
  result?: {
    content: unknown;
    isError: boolean;
  };
}

// A grouped message is either a regular message or a tool group
export type GroupedMessage =
  | { type: 'message'; message: SDKMessage; index: number }
  | { type: 'tool_group'; group: ToolGroup };

// The complete grouped structure for a session
export interface GroupedConversation {
  items: GroupedMessage[];
  toolGroups: Map<string, ToolGroup>;
}

/**
 * Groups flat SDK messages into a hierarchical structure.
 * Tool invocations are grouped with their results.
 * Subagent (Task) tools include all nested messages.
 */
export function groupMessages(messages: SDKMessage[]): GroupedConversation {
  const items: GroupedMessage[] = [];
  const toolGroups = new Map<string, ToolGroup>();
  const pendingTools = new Map<string, ToolGroup>();

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

    // Case 1: Assistant message
    if (msg.type === 'assistant') {
      const assistantMsg = msg as SDKAssistantMessage;

      // Check if this is a subagent message (has parent_tool_use_id)
      if (assistantMsg.parent_tool_use_id) {
        const parentGroup = toolGroups.get(assistantMsg.parent_tool_use_id);
        if (parentGroup && parentGroup.isSubagent) {
          parentGroup.subagentMessages.push(msg);
        }
        continue; // Don't add as top-level item
      }

      // Process tool_use blocks
      const toolUses = assistantMsg.message.content.filter(c => c.type === 'tool_use');

      if (toolUses.length === 0) {
        // Regular assistant message (no tools)
        items.push({ type: 'message', message: msg, index: i });
      } else {
        // Assistant message with text + tools
        // First add any text as a regular message part
        const textContent = assistantMsg.message.content.filter(c => c.type === 'text');
        if (textContent.some(c => c.text && c.text.trim())) {
          const textOnlyMsg: SDKAssistantMessage = {
            ...assistantMsg,
            message: { ...assistantMsg.message, content: textContent }
          };
          items.push({ type: 'message', message: textOnlyMsg, index: i });
        }

        // Create groups for each tool use
        for (const tool of toolUses) {
          if (!tool.id || !tool.name) continue;

          const group: ToolGroup = {
            id: tool.id,
            toolName: tool.name,
            toolInput: tool.input,
            startIndex: i,
            isSubagent: tool.name === 'Task',
            subagentMessages: [],
            result: undefined,
          };

          toolGroups.set(tool.id, group);
          pendingTools.set(tool.id, group);
          items.push({ type: 'tool_group', group });
        }
      }
      continue;
    }

    // Case 2: User message (might be tool_result or subagent message)
    if (msg.type === 'user') {
      const userMsg = msg as SDKUserMessage;

      // Check if this is a subagent input (has parent_tool_use_id)
      if (userMsg.parent_tool_use_id) {
        const parentGroup = toolGroups.get(userMsg.parent_tool_use_id);
        if (parentGroup && parentGroup.isSubagent) {
          parentGroup.subagentMessages.push(msg);
        }
        continue; // Don't add as top-level item
      }

      // Check for tool_result in content
      const content = userMsg.message?.content;
      let hasToolResult = false;
      let hasNonToolResult = false;

      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'tool_result' && block.tool_use_id) {
            hasToolResult = true;
            const group = pendingTools.get(block.tool_use_id);
            if (group) {
              group.result = {
                content: block.content,
                isError: !!block.is_error,
              };
              pendingTools.delete(block.tool_use_id);
            }
          } else if (block.type === 'text') {
            hasNonToolResult = true;
          }
        }

        // If message only contains tool_results, don't add as separate item
        if (hasToolResult && !hasNonToolResult) {
          continue;
        }
      }

      // Regular user message (or mixed content)
      items.push({ type: 'message', message: msg, index: i });
      continue;
    }

    // Case 3: Other messages (system, result, stream_event)
    // Skip stream_event messages - they're for real-time streaming only
    if (msg.type === 'stream_event') {
      continue;
    }

    items.push({ type: 'message', message: msg, index: i });
  }

  return { items, toolGroups };
}

/**
 * Check if a tool group is still in progress (no result yet)
 */
export function isToolInProgress(group: ToolGroup): boolean {
  return !group.result;
}

/**
 * Get a summary of what the tool is doing
 */
export function getToolSummary(toolName: string, input: unknown): string {
  const inp = input as Record<string, unknown>;
  switch (toolName) {
    case 'Write':
    case 'Read':
    case 'Edit':
      return String(inp.file_path || '');
    case 'Bash':
      const cmd = String(inp.command || '');
      return cmd.length > 50 ? cmd.slice(0, 50) + '...' : cmd;
    case 'Glob':
      return String(inp.pattern || '');
    case 'Grep':
      return `"${String(inp.pattern || '')}"`;
    case 'Task':
      return String(inp.description || inp.subagent_type || '');
    default:
      return '';
  }
}
