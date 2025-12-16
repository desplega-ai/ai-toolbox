import React from 'react';
import { CheckCheck, Terminal, Loader2, Brain, Wrench, Code, Eye, StopCircle, Clock, Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Markdown } from '@/components/ui/markdown';
import { groupMessages, type GroupedMessage } from '@/lib/message-grouping';
import { ToolGroupBlock } from './ToolGroupBlock';
import type { SDKMessage, SDKAssistantMessage, SDKUsage, PermissionRequest } from '../../../shared/sdk-types';

// Helper to extract raw content from a grouped message item
function getItemRawContent(item: GroupedMessage): string {
  if (item.type === 'tool_group') {
    const group = item.group;
    let content = `Tool: ${group.toolName}\n`;
    content += `Input:\n${JSON.stringify(group.toolInput, null, 2)}`;
    if (group.result) {
      content += `\n\nResult:\n${typeof group.result.content === 'string' ? group.result.content : JSON.stringify(group.result.content, null, 2)}`;
    }
    return content;
  }

  // Regular message
  const msg = item.message;
  if (msg.type === 'assistant') {
    const assistantMsg = msg as SDKAssistantMessage;
    return assistantMsg.message.content
      .filter(c => c.type === 'text')
      .map(c => {
        const text = c.text;
        if (typeof text === 'string') return text;
        if (text && typeof text === 'object' && 'text' in text) return String((text as { text: unknown }).text);
        return '';
      })
      .join('\n');
  }

  if (msg.type === 'user') {
    const userMsg = msg as { message?: { content?: unknown } };
    const content = userMsg.message?.content;
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content
        .filter(c => c.type === 'text')
        .map(c => c.text || '')
        .join('\n');
    }
  }

  return '';
}

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function formatTimestamp(timestamp?: string): string {
  if (!timestamp) return '';
  try {
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();

    if (isToday) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
           ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function formatModelName(model?: string): string {
  if (!model) return '';
  // Shorten common model names
  if (model.includes('opus')) return 'Opus';
  if (model.includes('sonnet')) return 'Sonnet';
  if (model.includes('haiku')) return 'Haiku';
  return model;
}

function UsageStats({ usage }: { usage: SDKUsage }) {
  const totalInput = (usage.input_tokens || 0) +
    (usage.cache_creation_input_tokens || 0) +
    (usage.cache_read_input_tokens || 0);
  const output = usage.output_tokens || 0;

  const details = [
    usage.input_tokens ? `Input: ${formatTokens(usage.input_tokens)}` : null,
    usage.cache_read_input_tokens ? `Cache read: ${formatTokens(usage.cache_read_input_tokens)}` : null,
    usage.cache_creation_input_tokens ? `Cache write: ${formatTokens(usage.cache_creation_input_tokens)}` : null,
    usage.output_tokens ? `Output: ${formatTokens(usage.output_tokens)}` : null,
  ].filter(Boolean);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="text-xs text-[var(--foreground-muted)] font-mono cursor-help">
          {formatTokens(totalInput)}↓ {formatTokens(output)}↑
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <div className="space-y-0.5">
          {details.map((detail, i) => (
            <div key={i}>{detail}</div>
          ))}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

type Activity = 'idle' | 'connecting' | 'thinking' | 'streaming' | 'tool_use';

interface MessageListProps {
  messages: SDKMessage[];
  streamingText: string;
  pendingApprovals: PermissionRequest[];
  onApprove: (request: PermissionRequest) => void;
  onApproveAll: () => void;
  onDeny: (request: PermissionRequest, message?: string) => void;
  isLoadingHistory?: boolean;
  activity?: Activity;
  onFocusInput?: () => void;
}

export function MessageList({
  messages,
  streamingText,
  pendingApprovals,
  onApprove,
  onApproveAll,
  onDeny,
  isLoadingHistory = false,
  activity = 'idle',
  onFocusInput,
}: MessageListProps) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [selectedIndex, setSelectedIndex] = React.useState<number | null>(null);
  const [copiedIndex, setCopiedIndex] = React.useState<number | null>(null);
  const [expandedOverrides, setExpandedOverrides] = React.useState<Record<string, boolean>>({});
  const itemRefs = React.useRef<(HTMLDivElement | null)[]>([]);

  // Create a map of toolUseId -> pending approval for quick lookup
  const pendingByToolUseId = React.useMemo(() => {
    const map = new Map<string, PermissionRequest>();
    for (const approval of pendingApprovals) {
      map.set(approval.toolUseId, approval);
    }
    return map;
  }, [pendingApprovals]);

  // Group messages by tool invocation
  const groupedMessages = React.useMemo(
    () => groupMessages(messages),
    [messages]
  );

  // Helper to check if an item is selectable (not a divider/result/system message)
  const isSelectableItem = React.useCallback((item: GroupedMessage): boolean => {
    if (item.type === 'tool_group') return true;
    const msg = item.message;
    // Skip result messages (dividers) and system messages
    if (msg.type === 'result' || msg.type === 'system') return false;
    // Skip user messages that are only tool results
    if (msg.type === 'user') {
      const userMsg = msg as { message?: { content?: unknown } };
      const content = userMsg.message?.content;
      if (Array.isArray(content) && content.every(c => c.type === 'tool_result')) {
        return false;
      }
    }
    return true;
  }, []);

  // Get indices of selectable items
  const selectableIndices = React.useMemo(() => {
    return groupedMessages.items
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => isSelectableItem(item))
      .map(({ index }) => index);
  }, [groupedMessages.items, isSelectableItem]);

  // Find next/prev selectable index
  const findNextSelectable = React.useCallback((current: number | null, direction: 1 | -1): number | null => {
    if (selectableIndices.length === 0) return null;
    if (current === null) {
      return direction === 1 ? selectableIndices[0] : selectableIndices[selectableIndices.length - 1];
    }
    const currentPos = selectableIndices.indexOf(current);
    if (currentPos === -1) {
      // Current is not selectable, find nearest
      const nearestIdx = selectableIndices.findIndex(i => i > current);
      if (direction === 1) {
        return nearestIdx !== -1 ? selectableIndices[nearestIdx] : selectableIndices[selectableIndices.length - 1];
      } else {
        return nearestIdx > 0 ? selectableIndices[nearestIdx - 1] : selectableIndices[0];
      }
    }
    const nextPos = currentPos + direction;
    if (nextPos < 0) return selectableIndices[0];
    if (nextPos >= selectableIndices.length) return selectableIndices[selectableIndices.length - 1];
    return selectableIndices[nextPos];
  }, [selectableIndices]);

  // Keyboard navigation handler
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if focus is in input or textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (selectableIndices.length === 0) return;

      switch (e.key) {
        case 'j':
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex(prev => {
            const next = findNextSelectable(prev, 1);
            if (next !== null) {
              setTimeout(() => {
                itemRefs.current[next]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
              }, 0);
            }
            return next;
          });
          break;
        case 'k':
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(prev => {
            const next = findNextSelectable(prev, -1);
            if (next !== null) {
              setTimeout(() => {
                itemRefs.current[next]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
              }, 0);
            }
            return next;
          });
          break;
        case 'c':
          if (selectedIndex !== null && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            const item = groupedMessages.items[selectedIndex];
            const content = getItemRawContent(item);
            navigator.clipboard.writeText(content);
            setCopiedIndex(selectedIndex);
            setTimeout(() => setCopiedIndex(null), 2000);
          }
          break;
        case 'l':
        case 'ArrowRight':
        case 'Enter':
          // Expand tool group
          if (selectedIndex !== null) {
            e.preventDefault();
            const item = groupedMessages.items[selectedIndex];
            if (item.type === 'tool_group') {
              const id = item.group.id;
              const currentExpanded = expandedOverrides[id];
              // Only expand if not already expanded (or use toggle for Enter)
              if (e.key === 'Enter') {
                setExpandedOverrides(prev => ({
                  ...prev,
                  [id]: prev[id] === undefined ? false : !prev[id],
                }));
              } else {
                // l/ArrowRight = expand
                if (currentExpanded === false || currentExpanded === undefined) {
                  setExpandedOverrides(prev => ({ ...prev, [id]: true }));
                }
              }
            }
          }
          break;
        case 'h':
        case 'ArrowLeft':
          // Collapse tool group
          if (selectedIndex !== null) {
            e.preventDefault();
            const item = groupedMessages.items[selectedIndex];
            if (item.type === 'tool_group') {
              const id = item.group.id;
              setExpandedOverrides(prev => ({ ...prev, [id]: false }));
            }
          }
          break;
        case 'Escape':
          setSelectedIndex(null);
          onFocusInput?.();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [groupedMessages.items, selectedIndex, selectableIndices, findNextSelectable, expandedOverrides, onFocusInput]);

  // Toggle expansion handler for tool groups
  const handleToggleExpand = React.useCallback((id: string) => {
    setExpandedOverrides(prev => ({
      ...prev,
      [id]: prev[id] === undefined ? false : !prev[id],
    }));
  }, []);

  // Copy handler for individual items
  const handleCopyItem = React.useCallback((index: number) => {
    const item = groupedMessages.items[index];
    const content = getItemRawContent(item);
    navigator.clipboard.writeText(content);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  }, [groupedMessages.items]);

  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingText, pendingApprovals]);

  return (
    <div ref={scrollRef} className="flex-1 overflow-auto p-4 space-y-4">
      {isLoadingHistory && (
        <div className="text-center text-xs text-[var(--foreground-muted)] py-4">
          Loading session history...
        </div>
      )}
      {groupedMessages.items.map((item, index) => (
        <div
          key={item.type === 'tool_group' ? `tool-${item.group.id}` : `msg-${item.index}`}
          ref={el => { itemRefs.current[index] = el; }}
          className={cn(
            'relative group',
            selectedIndex === index && 'ring-2 ring-blue-500 ring-offset-2 ring-offset-[var(--background)] rounded-lg'
          )}
          onClick={() => setSelectedIndex(index)}
        >
          {/* Copy button - visible on hover or when selected */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleCopyItem(index);
                }}
                className={cn(
                  'absolute -top-2 -right-2 z-10 p-1 rounded',
                  'bg-[var(--background)] border border-[var(--border)] shadow-sm',
                  'opacity-0 group-hover:opacity-100 transition-opacity',
                  selectedIndex === index && 'opacity-100',
                  'hover:bg-[var(--secondary)]'
                )}
              >
                {copiedIndex === index ? (
                  <Check className="h-3 w-3 text-[var(--success)]" />
                ) : (
                  <Copy className="h-3 w-3 text-[var(--foreground-muted)]" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="left">
              <span>{copiedIndex === index ? 'Copied!' : 'Copy (⌘C)'}</span>
            </TooltipContent>
          </Tooltip>
          {item.type === 'tool_group' ? (
            <ToolGroupBlock
              group={item.group}
              pendingApproval={pendingByToolUseId.get(item.group.id)}
              onApprove={onApprove}
              onDeny={onDeny}
              isSelected={selectedIndex === index}
              expandedOverride={expandedOverrides[item.group.id]}
              onToggleExpand={() => handleToggleExpand(item.group.id)}
            />
          ) : (
            <MessageItem
              message={item.message}
              pendingByToolUseId={pendingByToolUseId}
              onApprove={onApprove}
              onDeny={onDeny}
              isSelected={selectedIndex === index}
            />
          )}
        </div>
      ))}
      {/* Activity indicator - shown when not streaming text */}
      {!streamingText && activity !== 'idle' && (
        <ActivityIndicator activity={activity} />
      )}
      {/* Streaming text with cursor */}
      {streamingText && (
        <div className="bg-[var(--secondary)] rounded-lg p-3">
          <div className="text-xs text-[var(--foreground-muted)] mb-1">Claude</div>
          <div className="whitespace-pre-wrap font-mono text-sm">{streamingText}</div>
          <span className="inline-block w-2 h-4 bg-[var(--primary)] animate-pulse ml-0.5" />
        </div>
      )}
      {/* Show "Approve All" button when multiple pending approvals */}
      {pendingApprovals.length > 1 && (
        <div className="flex justify-center">
          <Button size="sm" onClick={onApproveAll}>
            <CheckCheck className="h-3 w-3 mr-1" />
            Approve All ({pendingApprovals.length})
          </Button>
        </div>
      )}
    </div>
  );
}

function AssistantMessage({ message }: { message: SDKAssistantMessage }) {
  const [showRaw, setShowRaw] = React.useState(false);

  const textContent = message.message.content
    .filter((block) => block.type === 'text')
    .map((block) => {
      // Handle both string and object text values
      const text = block.text;
      if (typeof text === 'string') return text;
      if (text && typeof text === 'object' && 'text' in text) return String((text as { text: unknown }).text);
      return '';
    })
    .join('');

  const usage = message.message.usage;
  const model = message.message.model;
  const timestamp = message.timestamp;

  // Don't render if there's no text content (tools are handled separately by ToolGroupBlock)
  if (!textContent) return null;

  const formattedTime = formatTimestamp(timestamp);
  const modelName = formatModelName(model);

  return (
    <div className="bg-[var(--secondary)] rounded-lg p-3">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2 text-xs text-[var(--foreground-muted)]">
          <span>Claude</span>
          {modelName && (
            <span className="px-1.5 py-0.5 rounded bg-[var(--background)] font-medium">
              {modelName}
            </span>
          )}
          {formattedTime && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formattedTime}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setShowRaw(!showRaw)}
                className="p-1 rounded hover:bg-[var(--background)] text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors"
              >
                {showRaw ? <Eye className="h-3 w-3" /> : <Code className="h-3 w-3" />}
              </button>
            </TooltipTrigger>
            <TooltipContent>
              {showRaw ? 'Show formatted' : 'Show raw'}
            </TooltipContent>
          </Tooltip>
          {usage && <UsageStats usage={usage} />}
        </div>
      </div>
      {showRaw ? (
        <pre className="whitespace-pre-wrap font-mono text-sm overflow-auto">{textContent}</pre>
      ) : (
        <Markdown>{textContent}</Markdown>
      )}
    </div>
  );
}

interface MessageItemProps {
  message: SDKMessage;
  pendingByToolUseId: Map<string, PermissionRequest>;
  onApprove: (request: PermissionRequest) => void;
  onDeny: (request: PermissionRequest, message?: string) => void;
  isSelected?: boolean;
}

function MessageItem({ message }: MessageItemProps) {
  if (message.type === 'assistant') {
    return <AssistantMessage message={message as SDKAssistantMessage} />;
  }

  // Hide system init messages
  if (message.type === 'system' && (message as { subtype?: string }).subtype === 'init') {
    return null;
  }

  // Show result with stats
  if (message.type === 'result') {
    const resultMsg = message as {
      subtype?: string;
      timestamp?: string;
      duration_ms?: number;
      duration_api_ms?: number;
      total_cost_usd?: number;
      num_turns?: number;
      usage?: SDKUsage;
    };

    // Show interrupted message
    if (resultMsg.subtype === 'interrupted') {
      return (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--warning)]/10 text-[var(--warning)] border border-[var(--warning)]/20">
          <StopCircle className="h-4 w-4" />
          <span className="text-sm font-medium">Session interrupted</span>
        </div>
      );
    }

    const hasSomeStats = resultMsg.duration_ms || resultMsg.total_cost_usd;
    if (!hasSomeStats) {
      return <div className="border-t border-[var(--border)] my-2" />;
    }

    const durationDetails = [
      resultMsg.duration_ms ? `Total: ${(resultMsg.duration_ms / 1000).toFixed(1)}s` : null,
      resultMsg.duration_api_ms ? `API: ${(resultMsg.duration_api_ms / 1000).toFixed(1)}s` : null,
    ].filter(Boolean);

    const usage = resultMsg.usage;
    const totalTokens = usage
      ? (usage.input_tokens || 0) + (usage.output_tokens || 0) +
        (usage.cache_creation_input_tokens || 0) + (usage.cache_read_input_tokens || 0)
      : 0;

    const tokenDetails = usage ? [
      usage.input_tokens ? `Input: ${formatTokens(usage.input_tokens)}` : null,
      usage.cache_read_input_tokens ? `Cache read: ${formatTokens(usage.cache_read_input_tokens)}` : null,
      usage.cache_creation_input_tokens ? `Cache write: ${formatTokens(usage.cache_creation_input_tokens)}` : null,
      usage.output_tokens ? `Output: ${formatTokens(usage.output_tokens)}` : null,
    ].filter(Boolean) : [];

    const formattedTime = formatTimestamp(resultMsg.timestamp);

    return (
      <div className="flex items-center gap-4 text-xs text-[var(--foreground-muted)] py-1 border-t border-[var(--border)]">
        {resultMsg.duration_ms && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="cursor-help font-medium">
                {(resultMsg.duration_ms / 1000).toFixed(1)}s elapsed
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <div className="space-y-0.5">
                {durationDetails.map((detail, i) => (
                  <div key={i}>{detail}</div>
                ))}
              </div>
            </TooltipContent>
          </Tooltip>
        )}
        {resultMsg.total_cost_usd !== undefined && (
          <span>${resultMsg.total_cost_usd.toFixed(4)}</span>
        )}
        {totalTokens > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="cursor-help">
                {formatTokens(totalTokens)} tokens
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <div className="space-y-0.5">
                {tokenDetails.map((detail, i) => (
                  <div key={i}>{detail}</div>
                ))}
              </div>
            </TooltipContent>
          </Tooltip>
        )}
        {resultMsg.num_turns && resultMsg.num_turns > 1 && (
          <span>{resultMsg.num_turns} turns</span>
        )}
        {formattedTime && (
          <span className="ml-auto flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formattedTime}
          </span>
        )}
      </div>
    );
  }

  // Handle user messages - could be text, tool results, local command output, or slash commands
  if (message.type === 'user') {
    const userMsg = message as { message?: { role?: string; content?: unknown }; timestamp?: string };
    const rawContent = userMsg.message?.content;
    const timestamp = userMsg.timestamp;

    // Content could be a string or an array of content blocks
    if (typeof rawContent === 'string') {
      return <UserMessageContent content={rawContent} timestamp={timestamp} />;
    }

    const content: Array<{ type?: string; text?: string; tool_use_id?: string; content?: string; is_error?: boolean }> =
      Array.isArray(rawContent) ? rawContent : [];

    // Tool results are now handled by ToolGroupBlock, skip them here
    const hasOnlyToolResults = content.every(c => c.type === 'tool_result');
    if (hasOnlyToolResults) return null;

    // Regular text message
    const textBlock = content.find(c => c.type === 'text');
    let text = '';
    if (textBlock?.text) {
      // Handle both string and object text values
      text = typeof textBlock.text === 'string'
        ? textBlock.text
        : (textBlock.text && typeof textBlock.text === 'object' && 'text' in textBlock.text)
          ? String((textBlock.text as { text: unknown }).text)
          : '';
    }
    if (!text) return null;

    return <UserMessageContent content={text} timestamp={timestamp} />;
  }

  return null;
}

function UserMessageContent({ content, timestamp }: { content: string; timestamp?: string }) {
  if (!content) return null;

  const formattedTime = formatTimestamp(timestamp);

  // Check for local command output (e.g., /cost, /context results)
  const localCommandMatch = content.match(/<local-command-stdout>([\s\S]*?)<\/local-command-stdout>/);
  if (localCommandMatch) {
    return (
      <div className="rounded-lg border border-[var(--border)] bg-[var(--background)] overflow-hidden">
        <div className="px-3 py-1.5 bg-[var(--secondary)] border-b border-[var(--border)] flex items-center justify-between">
          <span className="text-xs text-[var(--foreground-muted)]">System</span>
          {formattedTime && (
            <span className="text-xs text-[var(--foreground-muted)] flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formattedTime}
            </span>
          )}
        </div>
        <div className="p-3 overflow-auto max-h-80">
          <Markdown>{localCommandMatch[1].trim()}</Markdown>
        </div>
      </div>
    );
  }

  // Check for slash command invocation (e.g., /context, /cost)
  const commandMatch = content.match(/<command-name>(.*?)<\/command-name>/);
  if (commandMatch) {
    const commandName = commandMatch[1];
    return (
      <div className="flex items-center gap-2 text-sm text-[var(--foreground-muted)]">
        <Terminal className="h-3 w-3" />
        <code className="bg-[var(--secondary)] px-2 py-0.5 rounded font-mono">{commandName}</code>
        {formattedTime && (
          <span className="flex items-center gap-1 ml-auto">
            <Clock className="h-3 w-3" />
            {formattedTime}
          </span>
        )}
      </div>
    );
  }

  // Regular user message
  return (
    <div className="bg-[var(--primary)]/10 rounded-lg p-3 ml-8">
      <div className="flex items-center justify-between text-xs text-[var(--foreground-muted)] mb-1">
        <span>You</span>
        {formattedTime && (
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formattedTime}
          </span>
        )}
      </div>
      <div className="whitespace-pre-wrap font-mono text-sm">{content}</div>
    </div>
  );
}

function ActivityIndicator({ activity }: { activity: Activity }) {
  const config: Record<Activity, { icon: typeof Loader2; text: string; color: string; spin: boolean }> = {
    connecting: {
      icon: Loader2,
      text: 'Connecting',
      color: 'text-[var(--foreground-muted)]',
      spin: true,
    },
    thinking: {
      icon: Brain,
      text: 'Thinking',
      color: 'text-[var(--primary)]',
      spin: false,
    },
    streaming: {
      icon: Loader2,
      text: 'Responding',
      color: 'text-[var(--primary)]',
      spin: true,
    },
    tool_use: {
      icon: Wrench,
      text: 'Using tools',
      color: 'text-[var(--warning)]',
      spin: false,
    },
    idle: {
      icon: Loader2,
      text: '',
      color: '',
      spin: false,
    },
  };

  const { icon: Icon, text, color, spin } = config[activity];

  if (activity === 'idle') return null;

  return (
    <div className={cn('flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--secondary)]/50', color)}>
      <Icon className={cn('h-4 w-4', spin ? 'animate-spin' : 'animate-pulse')} />
      <span className="text-sm">{text}</span>
      <span className="flex gap-0.5 ml-0.5">
        <span className="w-1 h-1 rounded-full bg-current animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="w-1 h-1 rounded-full bg-current animate-bounce" style={{ animationDelay: '150ms' }} />
        <span className="w-1 h-1 rounded-full bg-current animate-bounce" style={{ animationDelay: '300ms' }} />
      </span>
    </div>
  );
}
