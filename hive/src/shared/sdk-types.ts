// Re-export relevant types from SDK and define our own
export interface SDKInitMessage {
  type: 'system';
  subtype: 'init';
  session_id: string;
  model: string;
  tools: string[];
  apiKeySource: string;
  slash_commands?: string[];
  agents?: string[];
  skills?: string[];
  plugins?: { name: string; path: string }[];
  mcp_servers?: { name: string; status: string }[];
}

export interface SDKUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation?: {
    ephemeral_5m_input_tokens?: number;
    ephemeral_1h_input_tokens?: number;
  };
  service_tier?: string;
}

// Model usage from SDK result messages (includes context window)
export interface SDKModelUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  webSearchRequests: number;
  costUSD: number;
  contextWindow: number;
}

export interface SDKAssistantMessage {
  type: 'assistant';
  uuid: string;
  session_id: string;
  timestamp?: string; // ISO timestamp when message was created
  parent_tool_use_id?: string; // Present when this is a subagent message
  message: {
    model?: string;
    role: 'assistant';
    content: Array<{
      type: 'text' | 'tool_use';
      text?: string;
      id?: string;
      name?: string;
      input?: unknown;
    }>;
    usage?: SDKUsage;
  };
}

export interface SDKUserMessage {
  type: 'user';
  session_id: string;
  uuid?: string;
  timestamp?: string; // ISO timestamp when message was created
  parent_tool_use_id?: string; // Present when this is sent to a subagent
  message?: {
    role?: 'user';
    content?: Array<{
      type: 'text' | 'tool_result';
      text?: string;
      tool_use_id?: string;
      content?: unknown;
      is_error?: boolean;
    }>;
  };
}

export interface SDKResultMessage {
  type: 'result';
  subtype: 'success' | 'error_max_turns' | 'error_during_execution' | 'error_max_budget_usd' | 'interrupted';
  session_id: string;
  timestamp?: string; // ISO timestamp when result was created
  result?: string;
  total_cost_usd?: number;
  duration_ms?: number;
  duration_api_ms?: number;
  num_turns?: number;
  usage?: SDKUsage & {
    server_tool_use?: {
      web_search_requests?: number;
      web_fetch_requests?: number;
    };
  };
  // Per-model usage stats including context window
  modelUsage?: { [modelName: string]: SDKModelUsage };
}

export interface SDKStreamEvent {
  type: 'stream_event';
  event: {
    type: 'content_block_start' | 'content_block_delta' | 'content_block_stop';
    content_block?: { type: string };
    delta?: { type: string; text?: string };
  };
  session_id: string;
  uuid: string;
}

export type SDKMessage = SDKInitMessage | SDKAssistantMessage | SDKUserMessage | SDKResultMessage | SDKStreamEvent | { type: string; [key: string]: unknown };

// Permission request from renderer
export interface PermissionRequest {
  id: string;
  sessionId: string;
  toolUseId: string;
  toolName: string;
  input: unknown;
  timestamp: number;
  // Deterministic hash for matching on resume
  hash?: string;
  // SDK-provided suggestions for "always allow" functionality
  permissionSuggestions?: unknown[];
}

export interface PermissionResponse {
  id: string;
  approved: boolean;
  updatedInput?: unknown;
  remember?: boolean;
  message?: string;
}

// Events sent to renderer
export interface SessionOutputEvent {
  sessionId: string;
  message: SDKMessage;
}

export interface SessionStatusEvent {
  sessionId: string;
  status: 'pending' | 'running' | 'waiting' | 'idle' | 'error' | 'finished' | 'archived';
}

// AskUserQuestion types for Claude's question UI
export interface AskUserQuestionOption {
  label: string;
  description?: string;
}

export interface AskUserQuestion {
  question: string;
  header?: string;
  options: AskUserQuestionOption[];
  multiSelect?: boolean;
}

export interface AskUserQuestionRequest {
  id: string;
  sessionId: string;
  toolCallId: string;
  questions: AskUserQuestion[];
}
