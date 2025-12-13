export type TabType = 'notebook' | 'dashboard';

// Message type that matches UIMessage from @ai-sdk/react
// We store messages in UIMessage format to avoid conversion issues
export interface Message {
  id: string;
  role: 'user' | 'assistant';
  parts: MessagePart[];
  createdAt?: Date | string;
}

export type MessagePart =
  | { type: 'text'; text: string }
  | { type: 'reasoning'; reasoning: string }
  | { type: 'dynamic-tool'; toolName: string; toolCallId: string; state: string; input?: unknown; output?: unknown; errorText?: string }
  | { type: 'tool-result'; toolName: string; result: unknown };

export interface QuerySqlToolOutput {
  success: boolean;
  error?: string;
  errorDetails?: string; // Detailed error info from the API
  blockId?: string;
  sql: string;
  expandedSql?: string; // SQL with CTEs if blocks were referenced
  columns?: string[];
  preview?: {
    rows: unknown[][];
    rowCount: number;
  };
  fullData?: {
    rows: unknown[][];
    rowCount: number;
  };
  timing?: {
    elapsed_seconds: number;
    elapsed_formatted: string;
  };
  isTruncated?: boolean;
}

// SQL block stored in tab state (without result data to keep localStorage small)
export interface StoredSqlBlock {
  id: string;
  name: string;
  sql: string;
  createdAt: number;
  afterMessageCount: number; // Position relative to messages
  readonly?: boolean; // AI-generated blocks are read-only
  fromToolCallId?: string; // Link to original tool call
}

export interface Tab {
  id: string;
  type: TabType;
  title: string;
  // For notebook tabs
  defaultModel?: string;
  messages?: Message[];
  sqlBlocks?: StoredSqlBlock[];
  // For dashboard tabs
  dashboardId?: string;
}

export interface TabsState {
  tabs: Tab[];
  activeTabId: string | null;
}
