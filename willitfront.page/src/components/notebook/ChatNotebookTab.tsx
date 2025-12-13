import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useChat, type UIMessage } from '@ai-sdk/react';
import { DefaultChatTransport, isTextUIPart } from 'ai';
import { format } from 'sql-formatter';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import Editor from '@monaco-editor/react';
import { Button } from '@/components/ui/button';
import { ModelSelector } from '@/components/ModelSelector';
import { SqlEditor } from '@/components/editor/SqlEditor';
import { ResultsGrid } from '@/components/grid/ResultsGrid';
import { useSchema } from '@/hooks/useSchema';
import { useUserId } from '@/hooks/useUserId';
import { useQueryResultsCache } from '@/hooks/useQueryResultsCache';
import { useAvailableModels } from '@/hooks/useAvailableModels';
import { DEFAULT_MODEL, MAX_CONVERSATION_MESSAGES } from '@/lib/constants';
import { api } from '@/lib/api';
import {
  createBlock,
  buildQueryWithCTEs,
  generateBlockId,
  generateBlockName,
  type SqlBlock,
} from '@/lib/notebook';
import type { Tab, Message, QuerySqlToolOutput, StoredSqlBlock } from '@/types/tabs';
import {
  Send,
  Loader2,
  Database,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Plus,
  Play,
  Trash2,
  Wand2,
  Code,
  CheckCircle,
  XCircle,
  Clock,
  Copy,
  Sparkles,
  Lock,
  Eye,
  EyeOff,
  PlayCircle,
  ChevronsDownUp,
  ChevronsUpDown,
  Brain,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

interface ChatNotebookTabProps {
  tab: Tab;
  onUpdate: (updates: Partial<Tab>) => void;
}

// Type for tool parts (from AI SDK)
// The type can be 'dynamic-tool' or 'tool-{toolName}' format
interface ToolPart {
  type: string;
  toolName?: string;
  toolCallId: string;
  state?: string; // Made optional and flexible to handle various states
  input?: unknown;
  output?: unknown;
  errorText?: string;
}

function isToolPart(part: unknown): part is ToolPart {
  if (typeof part !== 'object' || part === null || !('type' in part)) return false;
  const p = part as { type: string; toolCallId?: string };
  // Check for both 'dynamic-tool' and 'tool-*' formats, and must have toolCallId
  return (p.type === 'dynamic-tool' || p.type.startsWith('tool-')) && !!p.toolCallId;
}

function getToolName(part: ToolPart): string {
  // If toolName is provided, use it
  if (part.toolName) return part.toolName;
  // Otherwise extract from type like 'tool-querySql' -> 'querySql'
  if (part.type.startsWith('tool-')) {
    return part.type.slice(5);
  }
  return 'unknown';
}

// Timeline item types for unified rendering
type TimelineItem =
  | { type: 'message'; data: UIMessage; timestamp: number }
  | { type: 'sql-block'; data: SqlBlock; index: number; timestamp: number };

// Track SQL block positions relative to messages
interface SqlBlockPosition {
  block: SqlBlock;
  afterMessageCount: number; // SQL block appears after this many messages
}

// Convert stored SQL blocks to runtime format
function loadSqlBlockPositions(stored: StoredSqlBlock[] | undefined): SqlBlockPosition[] {
  if (!stored) return [];
  return stored.map(s => ({
    block: {
      id: s.id,
      name: s.name,
      sql: s.sql,
      createdAt: s.createdAt,
      readonly: s.readonly,
      fromToolCallId: s.fromToolCallId,
    },
    afterMessageCount: s.afterMessageCount,
  }));
}

// Convert runtime SQL blocks to stored format (without results)
function saveSqlBlockPositions(positions: SqlBlockPosition[]): StoredSqlBlock[] {
  return positions.map(p => ({
    id: p.block.id,
    name: p.block.name,
    sql: p.block.sql,
    createdAt: p.block.createdAt,
    afterMessageCount: p.afterMessageCount,
    readonly: p.block.readonly,
    fromToolCallId: p.block.fromToolCallId,
  }));
}

// Component for grouping failed tool calls
interface FailedToolCallsGroupProps {
  failedParts: Array<{ part: ToolPart; idx: number }>;
}

function FailedToolCallsGroup({ failedParts }: FailedToolCallsGroupProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const count = failedParts.length;

  if (count === 0) return null;

  return (
    <div className="mt-3 border border-red-200 bg-red-50 rounded-lg overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 w-full px-3 py-2 bg-red-100 hover:bg-red-200 text-left"
      >
        {isExpanded ? <ChevronDown size={14} className="text-red-600" /> : <ChevronRight size={14} className="text-red-600" />}
        <XCircle size={14} className="text-red-600" />
        <span className="text-sm font-medium text-red-800">
          Failed {count} {count === 1 ? 'query' : 'queries'}
        </span>
      </button>
      {isExpanded && (
        <div className="divide-y divide-red-200">
          {failedParts.map(({ part, idx }) => {
            const result = part.output as QuerySqlToolOutput | undefined;
            const input = part.input as { sql?: string } | undefined;
            const errorMsg = result?.error || part.errorText || 'Unknown error';
            const errorDetails = result?.errorDetails;
            const sql = result?.sql || input?.sql || 'No SQL available';

            return (
              <div key={idx} className="p-3">
                <p className="text-sm text-red-700 mb-1">{errorMsg}</p>
                {errorDetails && (
                  <p className="text-xs text-red-600 mb-2 font-mono bg-red-100 p-2 rounded whitespace-pre-wrap">{errorDetails}</p>
                )}
                <pre className="text-xs text-red-900 bg-red-100/50 p-2 rounded overflow-x-auto">
                  {sql}
                </pre>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Component for displaying reasoning/thinking from models
interface ReasoningBlockProps {
  reasoning: string;
}

function ReasoningBlock({ reasoning }: ReasoningBlockProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!reasoning) return null;

  // Count approximate tokens (rough estimate: ~4 chars per token)
  const approxTokens = Math.round(reasoning.length / 4);

  return (
    <div className="mb-3 border border-purple-200 bg-purple-50 rounded-lg overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 w-full px-3 py-2 bg-purple-100 hover:bg-purple-200 text-left"
      >
        {isExpanded ? <ChevronDown size={14} className="text-purple-600" /> : <ChevronRight size={14} className="text-purple-600" />}
        <Brain size={14} className="text-purple-600" />
        <span className="text-sm font-medium text-purple-800">
          Reasoning
        </span>
        <span className="text-xs text-purple-500 ml-auto">
          ~{approxTokens.toLocaleString()} tokens
        </span>
      </button>
      {isExpanded && (
        <div className="p-3 max-h-96 overflow-y-auto">
          <pre className="text-xs text-purple-900 whitespace-pre-wrap font-mono leading-relaxed">
            {reasoning}
          </pre>
        </div>
      )}
    </div>
  );
}

// Collapsible text component for long AI messages
interface CollapsibleTextProps {
  children: React.ReactNode;
  maxLines?: number;
}

function CollapsibleText({ children, maxLines = 3 }: CollapsibleTextProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [needsCollapse, setNeedsCollapse] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  // Use ResizeObserver to detect content changes instead of depending on children
  // This avoids infinite loops since children is always a new reference
  useEffect(() => {
    const element = contentRef.current;
    if (!element) return;

    const checkCollapse = () => {
      const lineHeight = parseInt(getComputedStyle(element).lineHeight) || 24;
      const maxHeight = lineHeight * maxLines;
      setNeedsCollapse(element.scrollHeight > maxHeight + 10);
    };

    // Initial check
    checkCollapse();

    // Watch for size changes
    const observer = new ResizeObserver(checkCollapse);
    observer.observe(element);

    return () => observer.disconnect();
  }, [maxLines]);

  return (
    <div className="relative">
      <div
        ref={contentRef}
        className={!isExpanded && needsCollapse ? 'overflow-hidden' : ''}
        style={!isExpanded && needsCollapse ? { maxHeight: `${maxLines * 1.5}rem` } : undefined}
      >
        {children}
      </div>
      {needsCollapse && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="mt-2 text-sm text-[var(--hn-orange)] hover:underline flex items-center gap-1"
        >
          {isExpanded ? (
            <>
              <ChevronUp size={14} />
              Show less
            </>
          ) : (
            <>
              <ChevronDown size={14} />
              Show more
            </>
          )}
        </button>
      )}
    </div>
  );
}

export function ChatNotebookTab({ tab, onUpdate }: ChatNotebookTabProps) {
  const [chatInput, setChatInput] = useState('');
  const [sqlBlockPositions, setSqlBlockPositions] = useState<SqlBlockPosition[]>(() => loadSqlBlockPositions(tab.sqlBlocks));
  const [expandedBlocks, setExpandedBlocks] = useState<Set<string>>(new Set());
  const [showExpandedQuery, setShowExpandedQuery] = useState<Set<string>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<UIMessage[]>([]);
  const { schema, isLoading: schemaLoading } = useSchema();
  const userId = useUserId();
  const { cacheResult, getResult } = useQueryResultsCache();
  const { models: availableModels } = useAvailableModels();

  // Derive sqlBlocks array from positions for backward compatibility
  const sqlBlocks = useMemo(() => sqlBlockPositions.map(p => p.block), [sqlBlockPositions]);

  // Save SQL blocks to tab state when they change (use ref to avoid dependency on onUpdate)
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  const prevSqlBlocksRef = useRef<string>('');
  useEffect(() => {
    const stored = saveSqlBlockPositions(sqlBlockPositions);
    const serialized = JSON.stringify(stored);
    // Only update if actually changed to avoid infinite loops
    if (serialized !== prevSqlBlocksRef.current) {
      prevSqlBlocksRef.current = serialized;
      onUpdateRef.current({ sqlBlocks: stored });
    }
  }, [sqlBlockPositions]);

  // Validate stored model is still available, fall back to default if not
  const defaultModel = useMemo(() => {
    const storedModel = tab.defaultModel;
    if (!storedModel) return DEFAULT_MODEL;
    // If models haven't loaded yet, use stored model (will be validated on backend)
    if (availableModels.length === 0) return storedModel;
    // Check if stored model is in the available list
    const isAvailable = availableModels.some(m => m.id === storedModel);
    return isAvailable ? storedModel : DEFAULT_MODEL;
  }, [tab.defaultModel, availableModels]);

  // Build SQL blocks info for the backend (name and sql only)
  const sqlBlocksForBackend = useMemo(() =>
    sqlBlocks.map(b => ({ name: b.name, sql: b.sql })),
    [sqlBlocks]
  );

  // Create transport with custom body including SQL blocks for AI
  const transport = useMemo(() => new DefaultChatTransport({
    api: '/api/chat',
    body: {
      model: defaultModel,
      schema,
      userId,
      sqlBlocks: sqlBlocksForBackend, // Include SQL blocks for CTE expansion
    },
  }), [defaultModel, schema, userId, sqlBlocksForBackend]);

  // Track tool calls that have been converted to blocks
  // Initialize from stored blocks to prevent duplicates on reload
  const convertedToolCallsRef = useRef<Set<string>>(
    new Set(
      loadSqlBlockPositions(tab.sqlBlocks)
        .filter(pos => pos.block.fromToolCallId)
        .map(pos => pos.block.fromToolCallId!)
    )
  );

  const { messages, sendMessage, status, error: chatError } = useChat({
    id: tab.id,
    transport,
    messages: (tab.messages || []) as UIMessage[],
    onFinish: ({ message }) => {
      const newBlocks: SqlBlockPosition[] = [];
      const currentMessageCount = messagesRef.current.length;

      // Process tool calls and create read-only SQL blocks (only for successful queries)
      for (const part of message.parts) {
        if (isToolPart(part) && getToolName(part) === 'querySql' && (part.state === 'output-available' || part.output)) {
          const result = part.output as QuerySqlToolOutput;

          // Mark as converted (so it doesn't show in message)
          convertedToolCallsRef.current.add(part.toolCallId);

          // Only create SQL blocks for successful queries
          if (!result.success) continue;

          // Cache results
          if (result.blockId && result.fullData) {
            cacheResult(result.blockId, {
              columns: result.columns || [],
              rows: result.fullData.rows,
              sql: result.sql,
            });
          }

          // Get existing blocks to generate name
          const existingBlocks = sqlBlockPositions.map(p => p.block);
          const allBlocks = [...existingBlocks, ...newBlocks.map(p => p.block)];

          const newBlock: SqlBlock = {
            id: generateBlockId(),
            name: generateBlockName(allBlocks),
            sql: result.sql,
            createdAt: Date.now(),
            readonly: true,
            fromToolCallId: part.toolCallId,
            result: {
              columns: result.columns || [],
              rows: result.fullData?.rows || result.preview?.rows || [],
              row_count: result.fullData?.rowCount || result.preview?.rowCount || 0,
              timing: result.timing || { elapsed_seconds: 0, elapsed_formatted: '0ms' },
              truncated: result.isTruncated || false,
            },
          };

          newBlocks.push({
            block: newBlock,
            afterMessageCount: currentMessageCount,
          });
        }
      }

      // Add new blocks if any were created
      if (newBlocks.length > 0) {
        setSqlBlockPositions(prev => [...prev, ...newBlocks]);
      }

      // Save to tab state using ref (to avoid stale closure)
      // Use setTimeout to ensure state has been updated
      setTimeout(() => {
        const currentMessages = messagesRef.current;
        const messagesToSave = currentMessages.slice(-MAX_CONVERSATION_MESSAGES);
        onUpdate({ messages: messagesToSave as Message[] });
      }, 100);
    },
  });

  // Keep messages ref in sync
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Create unified timeline of messages and SQL blocks based on insertion order
  const timeline = useMemo(() => {
    const items: Array<{ type: 'message'; data: UIMessage } | { type: 'sql-block'; data: SqlBlock; index: number }> = [];

    // Track which SQL blocks we've added
    let sqlBlockIdx = 0;

    // Interleave messages and SQL blocks based on position tracking
    for (let msgIdx = 0; msgIdx <= messages.length; msgIdx++) {
      // Add any SQL blocks that should appear after this many messages
      while (sqlBlockIdx < sqlBlockPositions.length && sqlBlockPositions[sqlBlockIdx].afterMessageCount === msgIdx) {
        items.push({
          type: 'sql-block',
          data: sqlBlockPositions[sqlBlockIdx].block,
          index: sqlBlockIdx,
        });
        sqlBlockIdx++;
      }

      // Add the message if we're not past the end
      if (msgIdx < messages.length) {
        items.push({ type: 'message', data: messages[msgIdx] });
      }
    }

    // Add any remaining SQL blocks at the end
    while (sqlBlockIdx < sqlBlockPositions.length) {
      items.push({
        type: 'sql-block',
        data: sqlBlockPositions[sqlBlockIdx].block,
        index: sqlBlockIdx,
      });
      sqlBlockIdx++;
    }

    return items;
  }, [messages, sqlBlockPositions]);

  // Track message count for auto-scroll (only scroll on new messages, not SQL block updates)
  const prevMessageCountRef = useRef(messages.length);
  useEffect(() => {
    // Only scroll when message count increases (new message) or streaming
    if (messages.length > prevMessageCountRef.current || status === 'streaming') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    prevMessageCountRef.current = messages.length;
  }, [messages.length, status]);

  const handleChatSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || status === 'streaming' || schemaLoading) return;

    const message = chatInput.trim();
    setChatInput('');
    await sendMessage({ text: message });
  }, [chatInput, status, schemaLoading, sendMessage]);

  // Add a new SQL block at current position (after current messages)
  const addSqlBlock = useCallback(() => {
    const currentMessageCount = messagesRef.current.length;
    const existingBlocks = sqlBlockPositions.map(p => p.block);
    const newBlock = createBlock(existingBlocks);
    setSqlBlockPositions(prev => [...prev, { block: newBlock, afterMessageCount: currentMessageCount }]);
  }, [sqlBlockPositions]);

  // Update SQL in a block
  const updateSqlBlock = useCallback((blockId: string, sql: string) => {
    setSqlBlockPositions(prev => prev.map(p =>
      p.block.id === blockId ? { ...p, block: { ...p.block, sql } } : p
    ));
  }, []);

  // Format SQL in a block
  const formatSqlBlock = useCallback((blockId: string) => {
    setSqlBlockPositions(prev => prev.map(p => {
      if (p.block.id !== blockId || !p.block.sql.trim()) return p;
      try {
        const formatted = format(p.block.sql, { language: 'sql', keywordCase: 'upper' });
        return { ...p, block: { ...p.block, sql: formatted } };
      } catch {
        return p; // Keep original if formatting fails
      }
    }));
  }, []);

  // Execute a SQL block
  const executeSqlBlock = useCallback(async (blockId: string) => {
    const blockIndex = sqlBlocks.findIndex(b => b.id === blockId);
    const block = sqlBlocks[blockIndex];
    if (!block || !block.sql.trim()) return;

    setSqlBlockPositions(prev => prev.map(p =>
      p.block.id === blockId ? { ...p, block: { ...p.block, isLoading: true, error: undefined, result: undefined } } : p
    ));

    try {
      // Build query with CTEs for any referenced blocks
      const queryWithCTEs = buildQueryWithCTEs(blockIndex, sqlBlocks);
      const result = await api.query(queryWithCTEs);

      // Check if the result contains an error (API returns 200 with error/detail field for SQL errors)
      const errorResult = result as unknown as { error?: string; detail?: string };
      if (errorResult.error || errorResult.detail) {
        const errorMsg = errorResult.error && errorResult.detail
          ? `${errorResult.error}: ${errorResult.detail}`
          : errorResult.error || errorResult.detail || 'Query failed';
        setSqlBlockPositions(prev => prev.map(p =>
          p.block.id === blockId ? { ...p, block: { ...p.block, isLoading: false, error: errorMsg, result: undefined } } : p
        ));
        return;
      }

      setSqlBlockPositions(prev => prev.map(p =>
        p.block.id === blockId ? { ...p, block: { ...p.block, isLoading: false, result, error: undefined } } : p
      ));
    } catch (err) {
      setSqlBlockPositions(prev => prev.map(p =>
        p.block.id === blockId ? { ...p, block: { ...p.block, isLoading: false, error: err instanceof Error ? err.message : 'Query failed' } } : p
      ));
    }
  }, [sqlBlocks]);

  // Delete a SQL block
  const deleteSqlBlock = useCallback((blockId: string) => {
    setSqlBlockPositions(prev => prev.filter(p => p.block.id !== blockId));
  }, []);

  // Copy a read-only block to a new editable block
  const copyToEditable = useCallback((blockId: string) => {
    const position = sqlBlockPositions.find(p => p.block.id === blockId);
    if (!position) return;

    const currentMessageCount = messagesRef.current.length;
    const existingBlocks = sqlBlockPositions.map(p => p.block);
    const newBlock: SqlBlock = {
      id: generateBlockId(),
      name: generateBlockName(existingBlocks),
      sql: position.block.sql,
      createdAt: Date.now(),
    };
    setSqlBlockPositions(prev => [...prev, { block: newBlock, afterMessageCount: currentMessageCount }]);

    // Scroll to bottom after the new block is added
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  }, [sqlBlockPositions]);

  const toggleBlockExpanded = useCallback((blockId: string) => {
    setExpandedBlocks(prev => {
      const next = new Set(prev);
      if (next.has(blockId)) {
        next.delete(blockId);
      } else {
        next.add(blockId);
      }
      return next;
    });
  }, []);

  const toggleExpandedQuery = useCallback((blockId: string) => {
    setShowExpandedQuery(prev => {
      const next = new Set(prev);
      if (next.has(blockId)) {
        next.delete(blockId);
      } else {
        next.add(blockId);
      }
      return next;
    });
  }, []);

  // Re-run all SQL blocks
  const runAllBlocks = useCallback(async () => {
    for (const block of sqlBlocks) {
      if (block.sql.trim()) {
        await executeSqlBlock(block.id);
      }
    }
  }, [sqlBlocks, executeSqlBlock]);

  // Expand all block results
  const expandAll = useCallback(() => {
    setExpandedBlocks(new Set(sqlBlocks.map(b => b.id)));
  }, [sqlBlocks]);

  // Collapse all block results
  const collapseAll = useCallback(() => {
    setExpandedBlocks(new Set());
  }, []);

  const handleModelChange = useCallback((model: string) => {
    onUpdate({ defaultModel: model });
  }, [onUpdate]);

  // Preprocess text to handle escaped newlines and HTML
  const preprocessText = (text: string): string => {
    return text
      // Convert literal \n to actual newlines
      .replace(/\\n/g, '\n')
      // Convert <p> tags to double newlines
      .replace(/<p>/gi, '\n\n')
      .replace(/<\/p>/gi, '')
      // Convert <br> tags to newlines
      .replace(/<br\s*\/?>/gi, '\n')
      // Convert <a> tags to markdown links
      .replace(/<a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/gi, '[$2]($1)')
      // Decode common HTML entities
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'")
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ');
  };

  // Extract text content from message parts
  const getTextContent = (message: UIMessage): string => {
    const raw = message.parts
      .filter(isTextUIPart)
      .map(part => part.text)
      .join('\n');
    return preprocessText(raw);
  };

  // Get SQL blocks that appear before a given block (for CTE reference hints)
  const getPreviousBlocks = (blockIndex: number): SqlBlock[] => {
    return sqlBlocks.slice(0, blockIndex);
  };

  // Render a tool call with nice formatting
  const renderToolCall = (part: ToolPart, idx: number) => {
    const isExpanded = expandedBlocks.has(part.toolCallId);

    // Running state
    if (part.state === 'input-streaming' || part.state === 'input-available') {
      const input = part.input as { sql: string } | undefined;
      return (
        <div key={idx} className="mt-3 border border-blue-200 bg-blue-50 rounded-lg overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 bg-blue-100 border-b border-blue-200">
            <Clock size={14} className="text-blue-600" />
            <span className="text-sm font-medium text-blue-800">Running SQL Query</span>
            <Loader2 size={14} className="animate-spin text-blue-600 ml-auto" />
          </div>
          {input?.sql && (
            <div className="p-3">
              <pre className="text-xs text-blue-900 bg-blue-100/50 p-2 rounded overflow-x-auto">
                {input.sql}
              </pre>
            </div>
          )}
        </div>
      );
    }

    // Error state
    if (part.state === 'output-error') {
      const input = part.input as { sql: string } | undefined;
      return (
        <div key={idx} className="mt-3 border border-red-200 bg-red-50 rounded-lg overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 bg-red-100 border-b border-red-200">
            <XCircle size={14} className="text-red-600" />
            <span className="text-sm font-medium text-red-800">Query Failed</span>
          </div>
          <div className="p-3">
            <p className="text-sm text-red-700 mb-2">{part.errorText}</p>
            {input?.sql && (
              <pre className="text-xs text-red-900 bg-red-100/50 p-2 rounded overflow-x-auto">
                {input.sql}
              </pre>
            )}
          </div>
        </div>
      );
    }

    // Output available
    if (part.state === 'output-available') {
      const result = part.output as QuerySqlToolOutput;

      if (!result.success) {
        return (
          <div key={idx} className="mt-3 border border-red-200 bg-red-50 rounded-lg overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 bg-red-100 border-b border-red-200">
              <XCircle size={14} className="text-red-600" />
              <span className="text-sm font-medium text-red-800">Query Error</span>
            </div>
            <div className="p-3">
              <p className="text-sm text-red-700 mb-2">{result.error}</p>
              {result.errorDetails && (
                <p className="text-xs text-red-600 mb-2 font-mono bg-red-100 p-2 rounded">{result.errorDetails}</p>
              )}
              <pre className="text-xs text-red-900 bg-red-100/50 p-2 rounded overflow-x-auto">
                {result.sql}
              </pre>
            </div>
          </div>
        );
      }

      // Success state
      const cachedResult = result.blockId ? getResult(result.blockId) : null;
      const displayData = isExpanded && cachedResult
        ? { columns: cachedResult.columns, rows: cachedResult.rows }
        : { columns: result.columns || [], rows: result.preview?.rows || [] };

      return (
        <div key={idx} className="mt-3 border border-green-200 bg-green-50 rounded-lg overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-2 px-3 py-2 bg-green-100 border-b border-green-200">
            <CheckCircle size={14} className="text-green-600" />
            <span className="text-sm font-medium text-green-800">SQL Query</span>
            {result.timing && (
              <span className="text-xs text-green-600 ml-auto">
                {result.timing.elapsed_formatted}
              </span>
            )}
          </div>

          {/* SQL */}
          <div className="p-3 border-b border-green-200">
            <pre className="text-xs text-green-900 bg-green-100/50 p-2 rounded overflow-x-auto">
              {result.sql}
            </pre>
          </div>

          {/* Results toggle */}
          <button
            onClick={() => toggleBlockExpanded(part.toolCallId)}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-green-700 hover:bg-green-100"
          >
            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <span>
              {result.fullData?.rowCount || result.preview?.rowCount || 0} rows
              {result.isTruncated && !isExpanded && ' (click to expand)'}
            </span>
          </button>

          {/* Results grid */}
          {isExpanded && (
            <div className="h-64 border-t border-green-200">
              <ResultsGrid
                data={{
                  columns: displayData.columns,
                  rows: displayData.rows,
                  row_count: displayData.rows.length,
                  truncated: false,
                  timing: result.timing || { elapsed_seconds: 0, elapsed_formatted: '0ms' },
                }}
              />
            </div>
          )}
        </div>
      );
    }

    // Fallback for any other state - show the tool call with available info
    const input = part.input as { sql?: string } | undefined;
    const output = part.output as QuerySqlToolOutput | undefined;

    return (
      <div key={idx} className="mt-3 border border-gray-200 bg-gray-50 rounded-lg overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 bg-gray-100 border-b border-gray-200">
          <Database size={14} className="text-gray-600" />
          <span className="text-sm font-medium text-gray-700">SQL Query</span>
          <span className="text-xs text-gray-500 ml-auto">{part.state || 'unknown'}</span>
        </div>
        <div className="p-3">
          <pre className="text-xs text-gray-800 bg-gray-100/50 p-2 rounded overflow-x-auto">
            {output?.sql || input?.sql || 'No SQL available'}
          </pre>
          {output && (
            <div className="mt-2 text-xs text-gray-600">
              {output.success ? `${output.fullData?.rowCount || output.preview?.rowCount || 0} rows` : output.error}
            </div>
          )}
        </div>
      </div>
    );
  };

  // Render a chat message
  const renderMessage = (message: UIMessage) => {
    const textContent = getTextContent(message);
    const isUser = message.role === 'user';

    // Extract reasoning parts and combine them
    const reasoningParts = message.parts.filter(
      (part) => typeof part === 'object' && part !== null && 'type' in part && (part as { type: string }).type === 'reasoning'
    ) as unknown as Array<{ type: 'reasoning'; text: string }>;
    const combinedReasoning = reasoningParts.map(p => p.text).join('\n\n');

    // Separate tool calls into successful, failed, and running
    const toolParts = message.parts
      .map((part, idx) => ({ part, idx }))
      .filter(({ part }) => isToolPart(part) && getToolName(part as ToolPart) === 'querySql') as Array<{ part: ToolPart; idx: number }>;

    const runningParts = toolParts.filter(({ part }) =>
      part.state === 'input-streaming' || part.state === 'input-available'
    );
    const failedParts = toolParts.filter(({ part }) => {
      if (part.state === 'output-error') return true;
      if (part.state === 'output-available') {
        const result = part.output as QuerySqlToolOutput;
        return !result?.success;
      }
      return false;
    });
    const successParts = toolParts.filter(({ part }) => {
      if (part.state !== 'output-available') return false;
      const result = part.output as QuerySqlToolOutput;
      return result?.success;
    });

    // Get message timestamp for timing display (createdAt may exist at runtime)
    const createdAt = (message as unknown as { createdAt?: Date | string }).createdAt;
    const messageTime = createdAt ? new Date(createdAt) : null;
    const timeStr = messageTime ? messageTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null;

    return (
      <div
        key={message.id}
        className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
      >
        <div
          className={`w-full sm:w-[85%] md:w-[80%] rounded-lg ${isUser
            ? 'bg-[var(--hn-orange)] text-white p-3 sm:p-4'
            : 'bg-white border shadow-sm p-3 sm:p-4'
            }`}
        >
          {/* Timestamp for assistant messages */}
          {!isUser && timeStr && (
            <div className="flex items-center gap-1 text-xs text-gray-400 mb-2">
              <Clock size={10} />
              {timeStr}
            </div>
          )}

          {/* Reasoning block for thinking models */}
          {!isUser && combinedReasoning && (
            <ReasoningBlock reasoning={combinedReasoning} />
          )}

          {/* Text content with markdown for assistant */}
          {textContent && (
            isUser ? (
              <div className="whitespace-pre-wrap">{textContent}</div>
            ) : (
              <CollapsibleText maxLines={3}>
                <div className="prose prose-sm max-w-none [&>p]:mb-4 [&>ul]:mb-4 [&>ol]:mb-4 prose-pre:bg-transparent prose-pre:p-0 prose-pre:my-2 prose-code:text-orange-600 prose-code:before:content-none prose-code:after:content-none prose-table:my-0">
                  <Markdown
                    remarkPlugins={[remarkGfm, remarkBreaks]}
                    components={{
                      // Wrap tables in scrollable container
                      table: ({ children }) => (
                        <div className="overflow-x-auto -mx-4 px-4">
                          <table className="min-w-full">{children}</table>
                        </div>
                      ),
                      // Style table cells nicely
                      th: ({ children }) => (
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 bg-gray-50 border-b">{children}</th>
                      ),
                      td: ({ children }) => (
                        <td className="px-3 py-2 text-sm border-b border-gray-100 whitespace-nowrap">{children}</td>
                      ),
                      // Use Monaco for code blocks
                      code: (props) => {
                        const { className, children, node, ...rest } = props as { className?: string; children?: React.ReactNode; node?: unknown;[key: string]: unknown };
                        const match = /language-(\w+)/.exec(className || '');
                        const code = String(children).replace(/\n$/, '');

                        // If it's a code block with language or multiline, use Monaco
                        if (match || code.includes('\n')) {
                          const language = match?.[1] || 'plaintext';
                          const lineCount = code.split('\n').length;
                          const height = Math.min(Math.max(lineCount * 19 + 10, 40), 240);

                          return (
                            <div className="rounded overflow-hidden border not-prose my-2">
                              <Editor
                                height={`${height}px`}
                                language={language === 'sql' ? 'sql' : language}
                                value={code}
                                theme="vs"
                                options={{
                                  readOnly: true,
                                  minimap: { enabled: false },
                                  fontSize: 11,
                                  lineNumbers: 'off',
                                  scrollBeyondLastLine: false,
                                  wordWrap: 'on',
                                  automaticLayout: true,
                                  scrollbar: {
                                    vertical: 'hidden',
                                    horizontal: 'auto',
                                  },
                                  overviewRulerLanes: 0,
                                  hideCursorInOverviewRuler: true,
                                  overviewRulerBorder: false,
                                  renderLineHighlight: 'none',
                                  contextmenu: false,
                                  folding: true,
                                  lineDecorationsWidth: 0.1,
                                  lineNumbersMinChars: 3,
                                }}
                              />
                            </div>
                          );
                        }

                        // Inline code - don't spread unknown props
                        return (
                          <code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm font-mono text-orange-600">
                            {children}
                          </code>
                        );
                      },
                    }}
                  >
                    {textContent}
                  </Markdown>
                </div>
              </CollapsibleText>
            )
          )}

          {/* Running tool calls */}
          {runningParts.map(({ part, idx }) => renderToolCall(part, idx))}

          {/* Grouped failed tool calls */}
          {failedParts.length > 0 && <FailedToolCallsGroup failedParts={failedParts} />}

          {/* Successful tool calls (skip those converted to SQL blocks) */}
          {successParts.map(({ part, idx }) => {
            // Skip if this tool call was converted to a SQL block
            if (convertedToolCallsRef.current.has(part.toolCallId)) {
              return null;
            }
            return renderToolCall(part, idx);
          })}
        </div>
      </div>
    );
  };

  // Render a SQL block
  const renderSqlBlock = (block: SqlBlock, blockIndex: number) => {
    const previousBlocks = getPreviousBlocks(blockIndex);
    const isReadonly = block.readonly;

    // Compute expanded query with CTEs if block references other blocks
    const expandedQuery = buildQueryWithCTEs(blockIndex, sqlBlocks);
    const hasExpandedQuery = expandedQuery !== block.sql;
    const isShowingExpanded = showExpandedQuery.has(block.id);

    return (
      <div
        key={block.id}
        className={`border rounded-lg shadow-sm overflow-hidden ${isReadonly ? 'bg-purple-50/50 border-purple-200' : 'bg-white'
          }`}
      >
        {/* Block header */}
        <div className={`flex items-center gap-2 px-3 py-2 border-b ${isReadonly ? 'bg-purple-100/50 border-purple-200' : 'bg-gray-50'
          }`}>
          <span className={`text-xs font-medium font-mono px-2 py-0.5 rounded ${isReadonly ? 'text-purple-700 bg-purple-100' : 'text-blue-600 bg-blue-50'
            }`}>
            {block.name}
          </span>
          {isReadonly && (
            <span className="flex items-center gap-1 text-xs text-purple-600 bg-purple-100 px-2 py-0.5 rounded">
              <Sparkles size={10} />
              AI Generated
            </span>
          )}
          <span className="text-xs text-gray-400">SQL</span>
          {!isReadonly && previousBlocks.length > 0 && (
            <span className="text-xs text-gray-400">
              (can reference: {previousBlocks.map(b => b.name).join(', ')})
            </span>
          )}
          <div className="flex-1" />

          {/* Show expanded query button */}
          {hasExpandedQuery && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => toggleExpandedQuery(block.id)}
              className="h-7 px-2"
              title={isShowingExpanded ? 'Hide expanded query' : 'Show full query with CTEs'}
            >
              {isShowingExpanded ? <EyeOff size={14} /> : <Eye size={14} />}
              <span className="ml-1 text-xs">{isShowingExpanded ? 'Hide CTEs' : 'Show CTEs'}</span>
            </Button>
          )}

          {isReadonly ? (
            <>
              {/* Copy to editable button for read-only blocks */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copyToEditable(block.id)}
                className="h-7 px-2"
                title="Copy to new editable block"
              >
                <Copy size={14} className="mr-1" />
                <span className="text-xs">Copy to Edit</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => executeSqlBlock(block.id)}
                disabled={block.isLoading || !block.sql.trim()}
                className="h-7 px-2"
                title="Re-run query"
              >
                {block.isLoading ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Play size={14} />
                )}
                <span className="ml-1">Re-run</span>
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => formatSqlBlock(block.id)}
                disabled={!block.sql.trim()}
                className="h-7 px-2"
                title="Format SQL"
              >
                <Wand2 size={14} />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => executeSqlBlock(block.id)}
                disabled={block.isLoading || !block.sql.trim()}
                className="h-7 px-2"
              >
                {block.isLoading ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Play size={14} />
                )}
                <span className="ml-1">Run</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => deleteSqlBlock(block.id)}
                className="h-7 px-2 text-gray-400 hover:text-red-500"
              >
                <Trash2 size={14} />
              </Button>
            </>
          )}
        </div>

        {/* SQL content - Monaco Editor for editable, code block for read-only */}
        <div className="border-b">
          {isReadonly ? (
            <pre className="p-3 text-sm text-gray-800 bg-purple-50/30 overflow-x-auto font-mono whitespace-pre-wrap">
              {block.sql}
            </pre>
          ) : (
            <SqlEditor
              value={block.sql}
              onChange={(sql) => updateSqlBlock(block.id, sql)}
              onExecute={() => executeSqlBlock(block.id)}
              autoHeight
              minHeight={60}
              maxHeight={300}
            />
          )}
        </div>

        {/* Expanded query with CTEs */}
        {isShowingExpanded && hasExpandedQuery && (
          <div className="border-b bg-amber-50">
            <div className="px-3 py-1 bg-amber-100 text-xs text-amber-800 font-medium flex items-center gap-1">
              <Code size={12} />
              Full Query with CTEs
            </div>
            <pre className="p-3 text-xs text-amber-900 overflow-x-auto font-mono whitespace-pre-wrap">
              {expandedQuery}
            </pre>
          </div>
        )}

        {/* Results or Error */}
        {block.error && (
          <div className="p-3 bg-red-50 text-red-700 text-sm">
            {block.error}
          </div>
        )}
        {block.result && (
          <div className="flex flex-col">
            <button
              onClick={() => toggleBlockExpanded(block.id)}
              className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
            >
              {expandedBlocks.has(block.id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <span>
                {block.result.row_count} rows{block.result.timing?.elapsed_formatted ? ` in ${block.result.timing.elapsed_formatted}` : ''}
                {block.result.truncated && ' (truncated)'}
              </span>
            </button>
            {expandedBlocks.has(block.id) && (
              <div className="h-64 border-t">
                <ResultsGrid data={block.result} />
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-1 sm:gap-2 p-2 sm:p-3 border-b bg-gray-50 overflow-x-auto">
        <ModelSelector
          value={defaultModel}
          onChange={handleModelChange}
          disabled={status === 'streaming'}
        />

        <Button variant="outline" size="sm" onClick={addSqlBlock} className="shrink-0">
          <Plus size={16} className="sm:mr-1" />
          <span className="hidden sm:inline">Add SQL</span>
        </Button>

        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="shrink-0">
              <Database size={16} className="sm:mr-1" />
              <span className="hidden sm:inline">Schema</span>
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
            <DialogHeader>
              <DialogTitle>Database Schema</DialogTitle>
            </DialogHeader>
            {schema?.tables.map((table) => (
              <div key={table.name} className="mb-4">
                <h3 className="font-bold text-lg text-[var(--hn-orange)] mb-2">
                  {table.name}
                </h3>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-1 pr-4">Column</th>
                      <th className="text-left py-1 pr-4">Type</th>
                      <th className="text-left py-1">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {table.columns.map((col) => (
                      <tr key={col.name} className="border-b border-gray-100">
                        <td className="py-1 pr-4 font-mono">{col.name}</td>
                        <td className="py-1 pr-4 text-gray-500">
                          {col.type}{col.nullable ? '?' : ''}
                        </td>
                        <td className="py-1 text-gray-600">{col.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </DialogContent>
        </Dialog>

        {/* SQL block actions - only show when there are blocks */}
        {sqlBlocks.length > 0 && (
          <>
            <div className="hidden sm:block w-px h-6 bg-gray-300 mx-1" />
            <Button
              variant="ghost"
              size="sm"
              onClick={runAllBlocks}
              disabled={status === 'streaming'}
              title="Run all SQL blocks"
              className="shrink-0"
            >
              <PlayCircle size={16} className="sm:mr-1" />
              <span className="hidden sm:inline">Run All</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={expandAll}
              title="Expand all results"
              className="shrink-0"
            >
              <ChevronsUpDown size={16} className="sm:mr-1" />
              <span className="hidden sm:inline">Expand</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={collapseAll}
              title="Collapse all results"
              className="shrink-0"
            >
              <ChevronsDownUp size={16} className="sm:mr-1" />
              <span className="hidden sm:inline">Collapse</span>
            </Button>
          </>
        )}

        <span className="text-xs sm:text-sm text-gray-500 ml-auto whitespace-nowrap">
          {messages.length} msg{messages.length !== 1 ? 's' : ''}
          {sqlBlocks.length > 0 && ` · ${sqlBlocks.length} SQL`}
        </span>
      </div>

      {/* Content - Unified Timeline */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="max-w-4xl mx-auto p-2 sm:p-4 space-y-3 sm:space-y-4">
          {timeline.length === 0 && (
            <div className="text-center text-gray-500 py-12">
              <p className="text-lg mb-2">Start a conversation</p>
              <p className="text-sm mb-4">Ask questions about Hacker News data, or add SQL blocks to run queries directly.</p>
              <p className="text-xs text-gray-400 mb-4">
                Tip: SQL blocks can reference each other! Use <code className="bg-gray-100 px-1 rounded">q1</code>, <code className="bg-gray-100 px-1 rounded">q2</code>, etc. in your queries.
              </p>
              <Button variant="outline" onClick={addSqlBlock}>
                <Plus size={16} className="mr-2" />
                Add SQL Block
              </Button>
            </div>
          )}

          {/* Render timeline items in chronological order */}
          {timeline.map((item) => {
            if (item.type === 'message') {
              return renderMessage(item.data);
            } else {
              return renderSqlBlock(item.data, item.index);
            }
          })}

          {status === 'streaming' && (
            <div className="flex justify-start">
              <div className="bg-white border shadow-sm rounded-lg p-4">
                <Loader2 size={16} className="animate-spin text-gray-400" />
              </div>
            </div>
          )}

          {chatError && (
            <div className="bg-red-50 border border-red-200 rounded-lg overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 bg-red-100 border-b border-red-200">
                <XCircle size={14} className="text-red-600" />
                <span className="text-sm font-medium text-red-800">Error</span>
              </div>
              <div className="p-3">
                {(() => {
                  // Try to extract a clean error message
                  try {
                    const jsonMatch = chatError.message.match(/\{[\s\S]*\}/);
                    if (jsonMatch) {
                      const parsed = JSON.parse(jsonMatch[0]);
                      if (parsed.error) {
                        return <p className="text-sm text-red-700">{parsed.error}</p>;
                      }
                    }
                  } catch {
                    // Ignore parse errors
                  }
                  return <p className="text-sm text-red-700">{chatError.message}</p>;
                })()}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input area */}
      <div className="border-t bg-gray-50">
        <form onSubmit={handleChatSubmit} className="max-w-4xl mx-auto p-2 sm:p-4">
          <div className="flex gap-2 items-end">
            <div className="flex-1 relative">
              <textarea
                value={chatInput}
                onChange={(e) => {
                  setChatInput(e.target.value);
                  // Auto-resize textarea
                  e.target.style.height = 'auto';
                  e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'; // max ~5 lines
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (chatInput.trim() && status !== 'streaming' && !schemaLoading) {
                      handleChatSubmit(e);
                    }
                  }
                }}
                placeholder={schemaLoading ? 'Loading schema...' : 'Ask about HN data...'}
                disabled={status === 'streaming' || schemaLoading}
                rows={1}
                className="w-full px-3 sm:px-4 py-2 pb-6 sm:pb-6 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--hn-orange)] focus:border-transparent resize-none overflow-y-auto placeholder:text-gray-400 text-sm sm:text-base"
                style={{ minHeight: '42px', maxHeight: '120px' }}
              />
              <span className="absolute bottom-1.5 sm:bottom-2 right-2 sm:right-3 text-[9px] sm:text-[10px] text-gray-400 pointer-events-none hidden sm:block">
                Enter to send · Shift+Enter for new line
              </span>
            </div>
            <Button
              type="submit"
              disabled={!chatInput.trim() || status === 'streaming' || schemaLoading}
              className="shrink-0 h-[42px]"
            >
              {status === 'streaming' ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Send size={16} />
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={addSqlBlock}
              title="Add SQL block"
              className="shrink-0 h-[42px] hidden sm:flex"
            >
              <Database size={14} className="sm:mr-1" />
              <span className="hidden sm:inline text-xs">+ SQL</span>
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
