import React from 'react';
import { ChevronDown, ChevronRight, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Markdown } from '@/components/ui/markdown';
import { InlineFileLink } from '@/components/ui/file-link';
import type { SDKMessage, SDKAssistantMessage, SDKUserMessage } from '../../../shared/sdk-types';

interface SubagentConversationProps {
  messages: SDKMessage[];
}

export function SubagentConversation({ messages }: SubagentConversationProps) {
  const [expanded, setExpanded] = React.useState(true);

  if (messages.length === 0) return null;

  return (
    <div className="border border-[var(--border)] rounded bg-[var(--background)]">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 p-2 text-sm text-left hover:bg-[var(--secondary)] transition-colors cursor-pointer"
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-[var(--foreground-muted)]" />
        ) : (
          <ChevronRight className="h-4 w-4 text-[var(--foreground-muted)]" />
        )}
        <Users className="h-4 w-4 text-[var(--primary)]" />
        <span className="text-[var(--foreground-muted)]">
          Subagent Conversation ({messages.length} messages)
        </span>
      </button>

      {expanded && (
        <div className="border-t border-[var(--border)] p-2 space-y-2 max-h-[500px] overflow-auto">
          {messages.map((msg, i) => (
            <SubagentMessageItem key={i} message={msg} />
          ))}
        </div>
      )}
    </div>
  );
}

function SubagentMessageItem({ message }: { message: SDKMessage }) {
  if (message.type === 'assistant') {
    const assistantMsg = message as SDKAssistantMessage;
    const textContent = assistantMsg.message.content
      .filter(c => c.type === 'text')
      .map(c => {
        const text = c.text;
        if (typeof text === 'string') return text;
        if (text && typeof text === 'object' && 'text' in text) return String((text as { text: unknown }).text);
        return '';
      })
      .join('');

    const toolUses = assistantMsg.message.content.filter(c => c.type === 'tool_use');

    return (
      <div className="bg-[var(--secondary)] rounded p-2">
        <div className="text-xs text-[var(--foreground-muted)] mb-1">Subagent</div>
        {textContent && (
          <div className="text-sm">
            <Markdown>{textContent}</Markdown>
          </div>
        )}
        {toolUses.length > 0 && (
          <div className="mt-2 space-y-1">
            {toolUses.map((tool, i) => (
              <SubagentToolUse key={i} tool={tool} />
            ))}
          </div>
        )}
      </div>
    );
  }

  if (message.type === 'user') {
    const userMsg = message as SDKUserMessage;
    const content = userMsg.message?.content;

    if (!Array.isArray(content)) return null;

    // Check for tool results
    const toolResults = content.filter(c => c.type === 'tool_result');
    if (toolResults.length > 0) {
      return (
        <div className="space-y-1">
          {toolResults.map((result, i) => (
            <SubagentToolResult key={i} result={result} />
          ))}
        </div>
      );
    }

    // Regular text content
    const textContent = content
      .filter(c => c.type === 'text')
      .map(c => {
        const text = c.text;
        if (typeof text === 'string') return text;
        if (text && typeof text === 'object' && 'text' in text) return String((text as { text: unknown }).text);
        return '';
      })
      .join('');

    if (!textContent) return null;

    return (
      <div className="bg-[var(--primary)]/10 rounded p-2 ml-4">
        <div className="text-xs text-[var(--foreground-muted)] mb-1">Input</div>
        <div className="text-sm font-mono whitespace-pre-wrap">{textContent}</div>
      </div>
    );
  }

  return null;
}

function SubagentToolUse({ tool }: { tool: { id?: string; name?: string; input?: unknown } }) {
  const [expanded, setExpanded] = React.useState(false);
  const input = tool.input as Record<string, unknown>;

  // Check if this is a file-based tool
  const isFileTool = ['Read', 'Write', 'Edit'].includes(tool.name || '');
  const filePath = isFileTool ? String(input?.file_path || '') : '';

  // Get a brief summary for non-file tools
  let summary = '';
  if (!isFileTool) {
    switch (tool.name) {
      case 'Bash':
        const cmd = String(input?.command || '');
        summary = cmd.length > 40 ? cmd.slice(0, 40) + '...' : cmd;
        break;
      case 'Grep':
      case 'Glob':
        summary = String(input?.pattern || '');
        break;
      default:
        break;
    }
  }

  return (
    <div className="text-xs border border-[var(--border)] rounded p-1.5 bg-[var(--background)]">
      <div className="flex items-center gap-1.5 w-full">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 text-left cursor-pointer"
        >
          {expanded ? (
            <ChevronDown className="h-3 w-3 text-[var(--foreground-muted)]" />
          ) : (
            <ChevronRight className="h-3 w-3 text-[var(--foreground-muted)]" />
          )}
          <span className="text-[var(--primary)] font-medium">{tool.name}</span>
        </button>
        {isFileTool && filePath && (
          <InlineFileLink path={filePath} className="text-xs" />
        )}
        {!isFileTool && summary && (
          <span className="text-[var(--foreground-muted)] truncate">{summary}</span>
        )}
      </div>
      {expanded && (
        <pre className="mt-1.5 p-1.5 bg-[var(--secondary)] rounded overflow-auto max-h-32 font-mono">
          {JSON.stringify(input, null, 2)}
        </pre>
      )}
    </div>
  );
}

function SubagentToolResult({ result }: { result: { tool_use_id?: string; content?: unknown; is_error?: boolean } }) {
  const [expanded, setExpanded] = React.useState(false);

  let content = '';
  if (typeof result.content === 'string') {
    content = result.content;
  } else if (Array.isArray(result.content)) {
    content = result.content
      .map(block => {
        if (typeof block === 'string') return block;
        if (block && typeof block === 'object' && 'text' in block) {
          return String(block.text);
        }
        return JSON.stringify(block);
      })
      .join('\n');
  } else if (result.content) {
    content = JSON.stringify(result.content, null, 2);
  }

  // Hide permission pending results
  if (content.includes('PERMISSION_DENIED') || content === '<hive:permission-pending/>') {
    return null;
  }

  const isError = result.is_error;
  const truncated = content.length > 100;
  const preview = truncated ? content.slice(0, 100) + '...' : content;

  return (
    <div className={cn(
      "text-xs rounded p-1.5 ml-4",
      isError
        ? "bg-[var(--destructive)]/5 border border-[var(--destructive)]/20"
        : "bg-[var(--success)]/5 border border-[var(--success)]/20"
    )}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 w-full text-left cursor-pointer"
      >
        {truncated && (
          expanded ? (
            <ChevronDown className="h-3 w-3 text-[var(--foreground-muted)]" />
          ) : (
            <ChevronRight className="h-3 w-3 text-[var(--foreground-muted)]" />
          )
        )}
        <span className={cn(
          "font-medium",
          isError ? "text-[var(--destructive)]" : "text-[var(--success)]"
        )}>
          {isError ? 'Error' : 'Result'}
        </span>
      </button>
      <pre className={cn(
        "mt-1 font-mono whitespace-pre-wrap overflow-auto",
        expanded ? "max-h-64" : "max-h-16"
      )}>
        {expanded ? content : preview}
      </pre>
    </div>
  );
}
