export interface QueryRequest {
  sql: string;
  limit?: number;
}

export interface QueryResponse {
  columns: string[];
  rows: unknown[][];
  row_count: number;
  truncated: boolean;
  timing: {
    elapsed_seconds: number;
    elapsed_formatted: string;
  };
}

export interface QueryError {
  error: string;
  detail?: string;
}

export interface SchemaColumn {
  name: string;
  type: string;
  nullable: boolean;
  description: string;
}

export interface SchemaTable {
  name: string;
  columns: SchemaColumn[];
}

export interface SchemaResponse {
  tables: SchemaTable[];
  keywords: string[];
  functions: string[];
}

export interface StatsTypesResponse {
  types: Array<{ type: string; count: number }>;
}

export interface StatsUsersResponse {
  users: Array<{ by: string; count: number }>;
}

// Chat types

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  model?: string;
  toolCalls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  toolName: string;
  input: unknown;
  output?: unknown;
  blockId?: string;
}

export interface QuerySqlToolResult {
  success: boolean;
  error?: string;
  blockId?: string;
  sql: string;
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

export interface Model {
  id: string;
  name: string;
  description?: string;
  provider: string;
}
