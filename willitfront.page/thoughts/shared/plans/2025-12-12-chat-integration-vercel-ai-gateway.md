# Chat Integration with Vercel AI Gateway - Implementation Plan

## Overview

Implement a unified notebook/chat interface that combines AI chat with SQL query capabilities. This involves migrating from Vite to Bun.serve(), adding a backend to securely proxy AI Gateway requests, and replacing the current notebook UI with a chat-first interface that supports AI tool calls for SQL queries.

## Current State Analysis

### What Exists Now
- **Frontend**: Vite-based React app with Monaco editor, AG Grid, shadcn/ui
- **Notebook**: SQL blocks with chained query support (`q1`, `q2`, etc.)
- **API**: Direct frontend calls to `https://api.willitfront.page` (HN-SQL API)
- **State**: LocalStorage for tabs/notebooks via `useTabs` hook
- **Types**: `Tab`, `NotebookBlock`, `TabsState` in `src/types/tabs.ts`

### Key Files
- `vite.config.ts` - Vite configuration with proxy for `/api` to localhost:3123
- `src/App.tsx` - Main app with TabBar and tab rendering
- `src/components/notebook/NotebookQueryTab.tsx` - Current notebook implementation
- `src/components/notebook/NotebookBlock.tsx` - SQL block with execution
- `src/lib/api.ts` - API client for HN-SQL endpoints
- `src/hooks/useTabs.ts` - Tab state management
- `src/hooks/useSchema.ts` - Schema fetching (no caching)

### What's Missing
- Backend server for API key security
- AI chat functionality
- Model selection (per-notebook, per-block)
- Query result truncation and expansion
- User ID tracking

## Desired End State

After implementation:
1. Single Bun.serve() server handles both frontend and API routes
2. `/api/chat` endpoint streams AI responses with tool support
3. `/api/models` returns available AI models (cached on frontend)
4. `/api/schema` proxies HN-SQL schema (cached on frontend)
5. Unified notebook interface with:
   - Text input for chat messages
   - AI responses with tool call results
   - SQL blocks embedded in conversation
   - Per-block model override capability
   - Expandable query results (preview vs full)
6. Secure API key handling (server-side only)
7. Anonymous user ID for tracking

### Verification
- `bun run index.ts` starts single server serving frontend + API
- Chat messages stream responses from AI Gateway
- SQL queries execute via `querySql` tool and display in AG Grid
- Model selector shows dynamically fetched models
- LocalStorage persists conversations with full query results

## What We're NOT Doing

- Authentication/login system
- Multi-user collaboration
- Server-side conversation persistence
- Idea Tester feature (V3)
- Dashboard improvements
- Export functionality
- URL sharing

## Implementation Approach

Replace Vite with Bun.serve() using HTML imports for the React frontend. Add API routes that proxy to AI Gateway (keeping API keys server-side) and HN-SQL API. Transform the notebook UI from SQL-block-centric to chat-message-centric, with AI tool calls for SQL execution.

---

## Phase 1: Migrate from Vite to Bun.serve()

### Overview
Replace Vite dev server and build system with Bun.serve() using HTML imports. This creates a single server that serves both the frontend and API routes.

### Changes Required:

#### 1. Create Backend Entry Point
**File**: `index.ts` (new file at project root)

```typescript
import index from './index.html';

const HN_SQL_API = process.env.HN_SQL_API_URL || 'http://localhost:3123';

Bun.serve({
  port: process.env.PORT ? parseInt(process.env.PORT) : 3000,
  routes: {
    '/': index,

    // Proxy schema to HN-SQL API
    '/api/schema': {
      GET: async () => {
        const response = await fetch(`${HN_SQL_API}/schema`);
        return Response.json(await response.json());
      },
    },

    // Proxy query to HN-SQL API
    '/api/query': {
      POST: async (req) => {
        const body = await req.json();
        const response = await fetch(`${HN_SQL_API}/query`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        return Response.json(await response.json());
      },
    },

    // Health check
    '/api/health': {
      GET: () => Response.json({ status: 'ok' }),
    },
  },

  development: {
    hmr: true,
    console: true,
  },
});

console.log('Server running at http://localhost:3000');
```

#### 2. Update HTML Entry Point
**File**: `index.html`

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/x-icon" href="/favicon.ico" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Will it front page?</title>
    <link rel="stylesheet" href="./src/index.css" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./src/main.tsx"></script>
  </body>
</html>
```

#### 3. Update API Client
**File**: `src/lib/api.ts`

Change `API_BASE` to use relative paths (no more `import.meta.env`):

```typescript
import type { QueryRequest, QueryResponse, SchemaResponse } from '@/types/api';

// Use relative paths - same-origin requests
const API_BASE = '/api';

class ApiError extends Error {
  constructor(public status: number, public detail: string) {
    super(detail);
    this.name = 'ApiError';
  }
}

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new ApiError(response.status, error.error || error.detail || 'Request failed');
  }

  return response.json();
}

export const api = {
  query: (sql: string, limit?: number): Promise<QueryResponse> =>
    request<QueryResponse>('/query', {
      method: 'POST',
      body: JSON.stringify({ sql, limit } as QueryRequest),
    }),

  schema: (): Promise<SchemaResponse> =>
    request<SchemaResponse>('/schema'),

  health: (): Promise<{ status: string }> =>
    request<{ status: string }>('/health'),
};
```

#### 4. Update package.json Scripts
**File**: `package.json`

```json
{
  "scripts": {
    "dev": "bun --hot index.ts",
    "build": "bun run typecheck && bun build ./index.html --outdir=./dist --minify",
    "typecheck": "tsc --noEmit",
    "start": "bun index.ts"
  }
}
```

#### 5. Update TypeScript Config for Bun
**File**: `tsconfig.json`

Add Bun types and remove Vite-specific config:

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "useDefineForClassFields": true,
    "lib": ["DOM", "DOM.Iterable", "ESNext"],
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": false,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "types": ["bun-types"],
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src", "index.ts"]
}
```

#### 6. Remove Vite Files
Delete these files:
- `vite.config.ts`
- `src/vite-env.d.ts`

#### 7. Update Environment Variables
**File**: `.env`

```bash
# HN-SQL API (default: localhost for development)
HN_SQL_API_URL=http://localhost:3123

# AI Gateway API key (will be added in Phase 2)
# AI_GATEWAY_API_KEY=your_key_here

# Server port (optional, default 3000)
# PORT=3000
```

### Success Criteria:

#### Automated Verification:
- [x] TypeScript compiles: `bun run typecheck`
- [x] Server starts: `bun run dev` shows "Server running at http://localhost:5193" (changed from 3000)
- [x] Health check returns: `curl http://localhost:5193/api/health` returns `{"status":"ok"}`
- [x] Schema endpoint works: `curl http://localhost:5193/api/schema` returns schema JSON
- [x] Query endpoint works: `curl -X POST http://localhost:5193/api/query -H "Content-Type: application/json" -d '{"sql":"SELECT 1"}'` returns result

#### Manual Verification:
- [ ] Browser loads app at http://localhost:5193
- [ ] HMR works (edit a component, see live update)
- [ ] Existing notebook functionality works (create notebook, run SQL query)
- [ ] Results display correctly in AG Grid

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Backend Chat API with AI Gateway

### Overview
Add the AI chat endpoint using Vercel AI SDK. This includes the `querySql` tool for executing SQL queries with truncation, and endpoints for model listing.

### Changes Required:

#### 1. Install AI SDK Dependencies
```bash
bun add ai zod
```

#### 2. Create SQL Query Tool
**File**: `src/server/tools/querySql.ts` (new)

```typescript
import { tool } from 'ai';
import { z } from 'zod';

const MAX_PREVIEW_ROWS = 10;
const MAX_CELL_LENGTH = 100;

const HN_SQL_API = process.env.HN_SQL_API_URL || 'http://localhost:3123';

export const querySqlTool = tool({
  description: `Execute a SQL query against the Hacker News database.
Returns truncated preview in the response. Full results are included for the frontend to cache.
Remember to quote the "by" column in SQL queries as it's a reserved word.`,
  parameters: z.object({
    sql: z.string().describe('The SQL query to execute'),
    limit: z.number().optional().describe('Max rows to return (default 1000, max 10000)'),
  }),
  execute: async ({ sql, limit }) => {
    try {
      const response = await fetch(`${HN_SQL_API}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql, limit: limit || 1000 }),
      });

      if (!response.ok) {
        const error = await response.json();
        return { success: false, error: error.error || 'Query failed', sql };
      }

      const data = await response.json();
      const blockId = crypto.randomUUID();

      // Truncate for AI context (preview)
      const truncatedRows = data.rows.slice(0, MAX_PREVIEW_ROWS).map((row: unknown[]) =>
        row.map((cell: unknown) => {
          if (cell === null) return null;
          const str = String(cell);
          return str.length > MAX_CELL_LENGTH ? str.slice(0, MAX_CELL_LENGTH) + '...' : str;
        })
      );

      const isTruncated = data.rows.length > MAX_PREVIEW_ROWS ||
        data.rows.some((row: unknown[]) =>
          row.some((cell: unknown) => cell !== null && String(cell).length > MAX_CELL_LENGTH)
        );

      return {
        success: true,
        blockId,
        sql,
        columns: data.columns,
        preview: {
          rows: truncatedRows,
          rowCount: truncatedRows.length,
        },
        fullData: {
          rows: data.rows,
          rowCount: data.row_count,
        },
        timing: data.timing,
        isTruncated,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        sql,
      };
    }
  },
});
```

#### 3. Create System Prompt Builder
**File**: `src/server/buildSystemPrompt.ts` (new)

```typescript
import type { SchemaResponse } from '@/types/api';

export function buildSystemPrompt(schema: SchemaResponse): string {
  const tableDescriptions = schema.tables.map((table) => {
    const columns = table.columns.map((col) =>
      `  - ${col.name} (${col.type})${col.nullable ? ', nullable' : ''}${col.description ? `: ${col.description}` : ''}`
    ).join('\n');
    return `Table: ${table.name}\n${columns}`;
  }).join('\n\n');

  const functions = schema.functions?.join(', ') || 'COUNT, SUM, AVG, MIN, MAX, etc.';

  return `You are a helpful assistant for analyzing Hacker News data.
You have access to tools to query the database using SQL.

## Database Schema
${tableDescriptions}

## Important Notes
- The "by" column is a reserved word - MUST quote it as "by" in SQL queries
- Results are truncated by default (first 10 rows, 100 char cells)
- Full results are cached on the frontend - user can expand them in the UI

## Available SQL Functions
${functions}`;
}
```

#### 4. Add Chat Route to Backend
**File**: `index.ts` (update)

```typescript
import index from './index.html';
import { streamText, createGateway, convertToModelMessages } from 'ai';
import { querySqlTool } from './src/server/tools/querySql';
import { buildSystemPrompt } from './src/server/buildSystemPrompt';

const HN_SQL_API = process.env.HN_SQL_API_URL || 'http://localhost:3123';
const AI_GATEWAY_API_KEY = process.env.AI_GATEWAY_API_KEY;

const gateway = AI_GATEWAY_API_KEY
  ? createGateway({ apiKey: AI_GATEWAY_API_KEY })
  : null;

Bun.serve({
  port: process.env.PORT ? parseInt(process.env.PORT) : 3000,
  routes: {
    '/': index,

    '/api/chat': {
      POST: async (req) => {
        if (!gateway) {
          return Response.json(
            { error: 'AI Gateway not configured. Set AI_GATEWAY_API_KEY environment variable.' },
            { status: 503 }
          );
        }

        const { messages, model, schema, userId } = await req.json();

        const result = streamText({
          model: gateway(model),
          system: buildSystemPrompt(schema),
          messages: convertToModelMessages(messages),
          tools: {
            querySql: querySqlTool,
          },
          providerOptions: {
            gateway: {
              user: userId,
            },
          },
        });

        return result.toUIMessageStreamResponse();
      },
    },

    '/api/models': {
      GET: async () => {
        if (!gateway) {
          return Response.json(
            { error: 'AI Gateway not configured' },
            { status: 503 }
          );
        }

        try {
          const result = await gateway.getAvailableModels();
          const models = result.models.map(model => ({
            id: model.id,
            name: model.name,
            description: model.description,
            provider: model.id.split('/')[0],
          }));
          return Response.json({ models });
        } catch (error) {
          return Response.json(
            { error: 'Failed to fetch models' },
            { status: 500 }
          );
        }
      },
    },

    '/api/schema': {
      GET: async () => {
        const response = await fetch(`${HN_SQL_API}/schema`);
        return Response.json(await response.json());
      },
    },

    '/api/query': {
      POST: async (req) => {
        const body = await req.json();
        const response = await fetch(`${HN_SQL_API}/query`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        return Response.json(await response.json());
      },
    },

    '/api/health': {
      GET: () => Response.json({ status: 'ok' }),
    },
  },

  development: {
    hmr: true,
    console: true,
  },
});

console.log('Server running at http://localhost:3000');
```

#### 5. Add API Types for Chat
**File**: `src/types/api.ts` (update - add to existing)

```typescript
// Add these types to existing file

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
```

### Success Criteria:

#### Automated Verification:
- [x] TypeScript compiles: `bun run typecheck`
- [x] Server starts without errors
- [x] Models endpoint returns list: `curl http://localhost:5193/api/models` (requires AI_GATEWAY_API_KEY)
- [x] Chat endpoint responds with streaming data (API key was already configured)

#### Manual Verification:
- [ ] Set `AI_GATEWAY_API_KEY` in `.env` and restart server
- [ ] Test chat endpoint with curl and verify streaming response
- [ ] Verify querySql tool executes when AI decides to use it
- [ ] Verify truncation works (query returns preview + fullData)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation that the chat API works correctly before proceeding to the next phase.

---

## Phase 3: Frontend Hooks for Schema, Models, and User ID

### Overview
Create frontend hooks with caching for schema, models, and anonymous user ID. These will be used by the chat UI.

### Changes Required:

#### 1. Create User ID Hook
**File**: `src/hooks/useUserId.ts` (new)

```typescript
import { useState } from 'react';

const USER_ID_KEY = 'hn-tool:userId';

function getUserId(): string {
  let userId = localStorage.getItem(USER_ID_KEY);

  if (!userId) {
    userId = crypto.randomUUID();
    localStorage.setItem(USER_ID_KEY, userId);
  }

  return userId;
}

export function useUserId(): string {
  const [userId] = useState(() => getUserId());
  return userId;
}
```

#### 2. Update Schema Hook with Caching
**File**: `src/hooks/useSchema.ts` (replace)

```typescript
import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import type { SchemaResponse } from '@/types/api';

const SCHEMA_CACHE_KEY = 'hn-sql:schema';
const SCHEMA_TTL_MS = 60 * 60 * 1000; // 1 hour

interface CachedSchema {
  schema: SchemaResponse;
  timestamp: number;
}

export function useSchema() {
  const [schema, setSchema] = useState<SchemaResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchSchema() {
      // Check cache first
      const cached = localStorage.getItem(SCHEMA_CACHE_KEY);
      if (cached) {
        try {
          const { schema, timestamp }: CachedSchema = JSON.parse(cached);
          if (Date.now() - timestamp < SCHEMA_TTL_MS) {
            setSchema(schema);
            setIsLoading(false);
            return;
          }
        } catch {
          // Invalid cache, fetch fresh
        }
      }

      // Fetch fresh
      try {
        const data = await api.schema();
        setSchema(data);

        // Cache it
        localStorage.setItem(SCHEMA_CACHE_KEY, JSON.stringify({
          schema: data,
          timestamp: Date.now(),
        }));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch schema');
        // Fall back to cached if available
        if (cached) {
          try {
            setSchema(JSON.parse(cached).schema);
          } catch {
            // Ignore parse error
          }
        }
      } finally {
        setIsLoading(false);
      }
    }

    fetchSchema();
  }, []);

  return { schema, error, isLoading };
}
```

#### 3. Create Available Models Hook
**File**: `src/hooks/useAvailableModels.ts` (new)

```typescript
import { useState, useEffect, useMemo } from 'react';
import type { Model } from '@/types/api';

const MODELS_CACHE_KEY = 'ai-gateway:models';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

interface CachedModels {
  models: Model[];
  timestamp: number;
}

export function useAvailableModels() {
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchModels() {
      // Check cache first
      const cached = localStorage.getItem(MODELS_CACHE_KEY);
      if (cached) {
        try {
          const { models, timestamp }: CachedModels = JSON.parse(cached);
          if (Date.now() - timestamp < CACHE_TTL_MS) {
            setModels(models);
            setLoading(false);
            return;
          }
        } catch {
          // Invalid cache, fetch fresh
        }
      }

      try {
        const response = await fetch('/api/models');
        if (!response.ok) {
          throw new Error('Failed to fetch models');
        }

        const data = await response.json();
        setModels(data.models);

        // Cache for 1 hour
        localStorage.setItem(MODELS_CACHE_KEY, JSON.stringify({
          models: data.models,
          timestamp: Date.now(),
        }));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Unknown error');
        // Fall back to cached models if available
        if (cached) {
          try {
            setModels(JSON.parse(cached).models);
          } catch {
            // Ignore parse error
          }
        }
      } finally {
        setLoading(false);
      }
    }

    fetchModels();
  }, []);

  // Group models by provider for UI
  const modelsByProvider = useMemo(() => {
    return models.reduce((acc, model) => {
      const provider = model.provider;
      if (!acc[provider]) acc[provider] = [];
      acc[provider].push(model);
      return acc;
    }, {} as Record<string, Model[]>);
  }, [models]);

  return { models, modelsByProvider, loading, error };
}
```

#### 4. Create Query Results Cache Hook
**File**: `src/hooks/useQueryResultsCache.ts` (new)

```typescript
import { useCallback } from 'react';
import type { QuerySqlToolResult } from '@/types/api';

const QUERY_RESULTS_PREFIX = 'queryResults:';
const MAX_CACHED_RESULTS = 50;

interface CachedQueryResult {
  columns: string[];
  rows: unknown[][];
  sql: string;
  timestamp: number;
}

export function useQueryResultsCache() {
  const cacheResult = useCallback((blockId: string, data: Omit<CachedQueryResult, 'timestamp'>) => {
    try {
      localStorage.setItem(
        `${QUERY_RESULTS_PREFIX}${blockId}`,
        JSON.stringify({ ...data, timestamp: Date.now() })
      );
    } catch {
      // LocalStorage full - clear old entries
      clearOldQueryResults();
      try {
        localStorage.setItem(
          `${QUERY_RESULTS_PREFIX}${blockId}`,
          JSON.stringify({ ...data, timestamp: Date.now() })
        );
      } catch {
        // Still failed, ignore
      }
    }
  }, []);

  const getResult = useCallback((blockId: string): CachedQueryResult | null => {
    const stored = localStorage.getItem(`${QUERY_RESULTS_PREFIX}${blockId}`);
    return stored ? JSON.parse(stored) : null;
  }, []);

  return { cacheResult, getResult };
}

function clearOldQueryResults() {
  const keys = Object.keys(localStorage)
    .filter(k => k.startsWith(QUERY_RESULTS_PREFIX));

  if (keys.length > MAX_CACHED_RESULTS) {
    // Get all with timestamps, sort by age, remove oldest
    const withTimestamps = keys.map(key => {
      try {
        const data = JSON.parse(localStorage.getItem(key) || '{}');
        return { key, timestamp: data.timestamp || 0 };
      } catch {
        return { key, timestamp: 0 };
      }
    });

    withTimestamps.sort((a, b) => a.timestamp - b.timestamp);

    // Remove oldest half
    const toRemove = withTimestamps.slice(0, Math.floor(keys.length / 2));
    toRemove.forEach(({ key }) => localStorage.removeItem(key));
  }
}
```

#### 5. Create Model Selector Component
**File**: `src/components/ModelSelector.tsx` (new)

```typescript
import { useAvailableModels } from '@/hooks/useAvailableModels';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface ModelSelectorProps {
  value: string;
  onChange: (modelId: string) => void;
  showInheritOption?: boolean;
  inheritLabel?: string;
  disabled?: boolean;
}

export function ModelSelector({
  value,
  onChange,
  showInheritOption,
  inheritLabel,
  disabled,
}: ModelSelectorProps) {
  const { modelsByProvider, loading, error } = useAvailableModels();

  if (loading) {
    return (
      <Select disabled>
        <SelectTrigger className="w-[200px]">
          <SelectValue placeholder="Loading models..." />
        </SelectTrigger>
      </Select>
    );
  }

  if (error && Object.keys(modelsByProvider).length === 0) {
    return (
      <Select disabled>
        <SelectTrigger className="w-[200px]">
          <SelectValue placeholder="Error loading models" />
        </SelectTrigger>
      </Select>
    );
  }

  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className="w-[200px]">
        <SelectValue placeholder="Select model" />
      </SelectTrigger>
      <SelectContent>
        {showInheritOption && (
          <SelectItem value="">
            {inheritLabel || 'Use notebook default'}
          </SelectItem>
        )}
        {Object.entries(modelsByProvider).map(([provider, models]) => (
          <SelectGroup key={provider}>
            <SelectLabel className="capitalize">{provider}</SelectLabel>
            {models.map(model => (
              <SelectItem key={model.id} value={model.id}>
                {model.name}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
```

#### 6. Add Constants
**File**: `src/lib/constants.ts` (new)

```typescript
// Default model when none selected
export const DEFAULT_MODEL = 'anthropic/claude-sonnet-4';

// Maximum messages to send in chat context
export const MAX_CONVERSATION_MESSAGES = 25;
```

### Success Criteria:

#### Automated Verification:
- [x] TypeScript compiles: `bun run typecheck`
- [ ] No runtime errors on page load

#### Manual Verification:
- [ ] User ID persists across page refreshes (check localStorage)
- [ ] Schema is cached (second load faster, check Network tab)
- [ ] Models are cached (check localStorage for `ai-gateway:models`)
- [ ] Model selector displays grouped models by provider

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to the next phase.

---

## Phase 4: New Unified Notebook/Chat UI

### Overview
Replace the current SQL-block-centric notebook with a chat-first interface. Users type messages, AI responds with text and/or tool calls (SQL queries), and results are displayed inline.

### Changes Required:

#### 1. Update Tab Types
**File**: `src/types/tabs.ts` (replace)

```typescript
export type TabType = 'notebook' | 'dashboard';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  model?: string; // Per-message model override
  parts?: MessagePart[];
}

export type MessagePart =
  | { type: 'text'; text: string }
  | { type: 'tool-querySql'; state: 'pending' | 'output-available'; input: { sql: string; limit?: number }; output?: QuerySqlToolOutput }
  | { type: 'tool-result'; toolName: string; result: unknown };

export interface QuerySqlToolOutput {
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

export interface Tab {
  id: string;
  type: TabType;
  title: string;
  // For notebook tabs
  defaultModel?: string;
  messages?: Message[];
  // For dashboard tabs
  dashboardId?: string;
}

export interface TabsState {
  tabs: Tab[];
  activeTabId: string | null;
}
```

#### 2. Create Chat Notebook Tab Component
**File**: `src/components/notebook/ChatNotebookTab.tsx` (new)

```typescript
import { useState, useCallback, useRef, useEffect } from 'react';
import { useChat } from '@ai-sdk/react';
import { Button } from '@/components/ui/button';
import { ModelSelector } from '@/components/ModelSelector';
import { ResultsGrid } from '@/components/grid/ResultsGrid';
import { useSchema } from '@/hooks/useSchema';
import { useUserId } from '@/hooks/useUserId';
import { useQueryResultsCache } from '@/hooks/useQueryResultsCache';
import { DEFAULT_MODEL, MAX_CONVERSATION_MESSAGES } from '@/lib/constants';
import type { Tab, Message, QuerySqlToolOutput } from '@/types/tabs';
import {
  Send,
  Loader2,
  Database,
  ChevronDown,
  ChevronRight,
  Settings,
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

export function ChatNotebookTab({ tab, onUpdate }: ChatNotebookTabProps) {
  const [input, setInput] = useState('');
  const [expandedBlocks, setExpandedBlocks] = useState<Set<string>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { schema, isLoading: schemaLoading } = useSchema();
  const userId = useUserId();
  const { cacheResult, getResult } = useQueryResultsCache();

  const defaultModel = tab.defaultModel || DEFAULT_MODEL;

  const { messages, append, status, error } = useChat({
    api: '/api/chat',
    id: tab.id,
    body: {
      model: defaultModel,
      schema,
      userId,
    },
    initialMessages: tab.messages || [],
    onFinish: (message) => {
      // Cache any query results
      if (message.toolInvocations) {
        message.toolInvocations.forEach(invocation => {
          if (invocation.toolName === 'querySql' && invocation.state === 'result') {
            const result = invocation.result as QuerySqlToolOutput;
            if (result.success && result.blockId && result.fullData) {
              cacheResult(result.blockId, {
                columns: result.columns || [],
                rows: result.fullData.rows,
                sql: result.sql,
              });
            }
          }
        });
      }

      // Save to tab state (truncate to MAX_CONVERSATION_MESSAGES)
      const messagesToSave = messages.slice(-MAX_CONVERSATION_MESSAGES);
      onUpdate({ messages: messagesToSave as Message[] });
    },
  });

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || status === 'streaming' || schemaLoading) return;

    const message = input.trim();
    setInput('');
    await append({ role: 'user', content: message });
  }, [input, status, schemaLoading, append]);

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

  const handleModelChange = useCallback((model: string) => {
    onUpdate({ defaultModel: model });
  }, [onUpdate]);

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-2 p-3 border-b bg-gray-50">
        <ModelSelector
          value={defaultModel}
          onChange={handleModelChange}
          disabled={status === 'streaming'}
        />

        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              <Database size={16} className="mr-1" />
              Schema
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

        <span className="text-sm text-gray-500 ml-auto">
          {messages.length} message{messages.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-gray-500 py-12">
            <p className="text-lg mb-2">Start a conversation</p>
            <p className="text-sm">Ask questions about Hacker News data. The AI can run SQL queries to answer your questions.</p>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-lg p-4 ${
                message.role === 'user'
                  ? 'bg-[var(--hn-orange)] text-white'
                  : 'bg-white border shadow-sm'
              }`}
            >
              {/* Text content */}
              {message.content && (
                <div className="whitespace-pre-wrap">{message.content}</div>
              )}

              {/* Tool invocations */}
              {message.toolInvocations?.map((invocation, idx) => {
                if (invocation.toolName === 'querySql') {
                  const isExpanded = expandedBlocks.has(invocation.toolCallId);

                  if (invocation.state === 'call') {
                    return (
                      <div key={idx} className="mt-3 bg-gray-50 rounded p-3">
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <Loader2 size={14} className="animate-spin" />
                          Running query...
                        </div>
                        <code className="text-xs text-gray-500 block mt-2">
                          {invocation.args.sql}
                        </code>
                      </div>
                    );
                  }

                  if (invocation.state === 'result') {
                    const result = invocation.result as QuerySqlToolOutput;

                    if (!result.success) {
                      return (
                        <div key={idx} className="mt-3 bg-red-50 border border-red-200 rounded p-3">
                          <div className="text-sm text-red-700">{result.error}</div>
                          <code className="text-xs text-gray-500 block mt-2">
                            {result.sql}
                          </code>
                        </div>
                      );
                    }

                    // Get full data from cache or use preview
                    const cachedResult = result.blockId ? getResult(result.blockId) : null;
                    const displayData = isExpanded && cachedResult
                      ? { columns: cachedResult.columns, rows: cachedResult.rows }
                      : { columns: result.columns || [], rows: result.preview?.rows || [] };

                    return (
                      <div key={idx} className="mt-3 bg-gray-50 rounded overflow-hidden">
                        {/* SQL Query */}
                        <div className="px-3 py-2 border-b bg-gray-100">
                          <code className="text-xs text-gray-600">{result.sql}</code>
                        </div>

                        {/* Results header */}
                        <button
                          onClick={() => toggleBlockExpanded(invocation.toolCallId)}
                          className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-600 hover:bg-gray-100"
                        >
                          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          <span>
                            {result.fullData?.rowCount || result.preview?.rowCount || 0} rows
                            {result.timing && ` in ${result.timing.elapsed_formatted}`}
                            {result.isTruncated && !isExpanded && ' (showing preview)'}
                          </span>
                        </button>

                        {/* Results grid */}
                        {isExpanded && (
                          <div className="h-64 border-t">
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
                }
                return null;
              })}
            </div>
          </div>
        ))}

        {status === 'streaming' && (
          <div className="flex justify-start">
            <div className="bg-white border shadow-sm rounded-lg p-4">
              <Loader2 size={16} className="animate-spin text-gray-400" />
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded">
            {error.message}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-4 border-t bg-gray-50">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={schemaLoading ? 'Loading schema...' : 'Ask about HN data...'}
            disabled={status === 'streaming' || schemaLoading}
            className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--hn-orange)] focus:border-transparent"
          />
          <Button
            type="submit"
            disabled={!input.trim() || status === 'streaming' || schemaLoading}
          >
            {status === 'streaming' ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Send size={16} />
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
```

#### 3. Update App.tsx
**File**: `src/App.tsx` (update)

```typescript
import { useTabs } from '@/hooks/useTabs';
import { TabBar } from '@/components/tabs/TabBar';
import { ChatNotebookTab } from '@/components/notebook/ChatNotebookTab';
import { DashboardTab } from '@/components/tabs/DashboardTab';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MessageSquare, BarChart3, Lightbulb } from 'lucide-react';

const QUICK_ACTIONS = [
  { type: 'notebook' as const, title: 'Chat Analysis', description: 'Ask questions about HN data using natural language', icon: MessageSquare, disabled: false },
  { type: 'dashboard' as const, title: 'Analytics', description: 'Dashboards with key metrics and insights', icon: BarChart3, disabled: false },
  { type: null, title: 'Post Tester', description: 'Test your post titles before submitting', icon: Lightbulb, disabled: true },
];

function App() {
  const { tabs, activeTabId, activeTab, createTab, closeTab, setActiveTab, updateTab, resetTabs } = useTabs();

  return (
    <div className="h-screen flex flex-col bg-[var(--hn-bg)]">
      <TabBar
        tabs={tabs}
        activeTabId={activeTabId}
        onTabSelect={setActiveTab}
        onTabClose={closeTab}
        onTabRename={(tabId, title) => updateTab(tabId, { title })}
        onReset={resetTabs}
      />

      <main className="flex-1 overflow-hidden">
        {activeTab ? (
          activeTab.type === 'notebook' ? (
            <ChatNotebookTab key={activeTab.id} tab={activeTab} onUpdate={(u) => updateTab(activeTab.id, u)} />
          ) : (
            <DashboardTab />
          )
        ) : (
          <div className="h-full flex flex-col items-center justify-center p-8">
            <h1 className="text-2xl font-bold mb-2">Will it front page?</h1>
            <p className="text-gray-500 mb-8">Analyze what makes content go viral. Currently featuring Hacker News data, with Product Hunt and more coming soon.</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl w-full">
              {QUICK_ACTIONS.map((action) => (
                <Card
                  key={action.title}
                  className={`transition-all ${
                    action.disabled
                      ? 'opacity-60 cursor-not-allowed'
                      : 'cursor-pointer hover:border-[var(--hn-orange)] hover:shadow-md'
                  }`}
                  onClick={() => !action.disabled && action.type && createTab(action.type, action.title)}
                >
                  <CardHeader className="p-6">
                    <div className="flex flex-col gap-4">
                      <div className={`p-3 rounded-lg w-fit ${action.disabled ? 'bg-gray-100' : 'bg-orange-100'}`}>
                        <action.icon className={`h-7 w-7 ${action.disabled ? 'text-gray-400' : 'text-[var(--hn-orange)]'}`} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <CardTitle className="text-lg">{action.title}</CardTitle>
                          {action.disabled && (
                            <span className="text-xs bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded">Soon</span>
                          )}
                        </div>
                        <CardDescription>{action.description}</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                </Card>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
```

#### 4. Update useTabs Hook
**File**: `src/hooks/useTabs.ts` (update)

```typescript
import { useCallback } from 'react';
import { useLocalStorage } from './useLocalStorage';
import { DEFAULT_MODEL } from '@/lib/constants';
import type { Tab, TabsState, TabType } from '@/types/tabs';

const generateId = () => Math.random().toString(36).substr(2, 9);

export function useTabs() {
  const [state, setState] = useLocalStorage<TabsState>('hn-tabs', {
    tabs: [],
    activeTabId: null,
  });

  const createTab = useCallback((type: TabType, title?: string, dashboardId?: string) => {
    const newTab: Tab = {
      id: generateId(),
      type,
      title: title || (type === 'notebook' ? 'New Chat' : 'Dashboard'),
      defaultModel: type === 'notebook' ? DEFAULT_MODEL : undefined,
      messages: type === 'notebook' ? [] : undefined,
      dashboardId: type === 'dashboard' ? dashboardId : undefined,
    };
    setState((prev) => ({
      tabs: [...prev.tabs, newTab],
      activeTabId: newTab.id,
    }));
    return newTab.id;
  }, [setState]);

  const closeTab = useCallback((tabId: string) => {
    setState((prev) => {
      const newTabs = prev.tabs.filter(t => t.id !== tabId);
      const newActiveId = prev.activeTabId === tabId
        ? (newTabs.length > 0 ? newTabs[newTabs.length - 1]?.id ?? null : null)
        : prev.activeTabId;
      return { tabs: newTabs, activeTabId: newActiveId };
    });
  }, [setState]);

  const setActiveTab = useCallback((tabId: string | null) => {
    setState((prev) => ({ ...prev, activeTabId: tabId }));
  }, [setState]);

  const updateTab = useCallback((tabId: string, updates: Partial<Tab>) => {
    setState((prev) => ({
      ...prev,
      tabs: prev.tabs.map(t => t.id === tabId ? { ...t, ...updates } : t),
    }));
  }, [setState]);

  const resetTabs = useCallback(() => {
    setState({ tabs: [], activeTabId: null });
  }, [setState]);

  return {
    tabs: state.tabs,
    activeTabId: state.activeTabId,
    activeTab: state.tabs.find(t => t.id === state.activeTabId),
    createTab,
    closeTab,
    setActiveTab,
    updateTab,
    resetTabs,
  };
}
```

### Success Criteria:

#### Automated Verification:
- [x] TypeScript compiles: `bun run typecheck`
- [x] Server starts without errors

#### Manual Verification:
- [ ] Can create a new "Chat Analysis" tab from home screen
- [ ] Model selector shows available models
- [ ] Can type a message and receive AI response
- [ ] AI correctly calls querySql tool when asked about data
- [ ] Query results display in expandable grid
- [ ] Conversation persists across page refresh
- [ ] Multiple chat tabs work independently

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to the next phase.

---

## Phase 5: Cleanup and Polish

### Overview
Remove old notebook components, clean up unused files, and add finishing touches.

### Changes Required:

#### 1. Remove Old Notebook Components
Delete these files:
- `src/components/notebook/NotebookQueryTab.tsx`
- `src/components/notebook/NotebookBlock.tsx`
- `src/components/tabs/QueryTab.tsx` (if exists)
- `src/lib/notebook.ts`

#### 2. Clean Up Package Dependencies
**File**: `package.json` (update)

Remove Vite-related dependencies:
```bash
bun remove @vitejs/plugin-react vite
```

Add @ai-sdk/react if not already added:
```bash
bun add @ai-sdk/react
```

#### 3. Update Build Script for Production
**File**: `package.json` (verify scripts)

```json
{
  "scripts": {
    "dev": "bun --hot index.ts",
    "build": "bun run typecheck && bun build ./index.html --outdir=./dist --minify",
    "typecheck": "tsc --noEmit",
    "start": "NODE_ENV=production bun index.ts"
  }
}
```

#### 4. Add Production Configuration
**File**: `index.ts` (update development config)

```typescript
// At the end of Bun.serve config, update development section:
development: process.env.NODE_ENV !== 'production' ? {
  hmr: true,
  console: true,
} : undefined,
```

#### 5. Update .gitignore
**File**: `.gitignore` (update if needed)

Ensure these are ignored:
```
dist/
node_modules/
.env
.env.local
```

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compiles: `bun run typecheck`
- [ ] Build succeeds: `bun run build`
- [ ] Production server starts: `bun run start`
- [ ] No TypeScript errors about missing files

#### Manual Verification:
- [ ] Dev server works: `bun run dev`
- [ ] All chat functionality works in dev mode
- [ ] Production build serves correctly
- [ ] No console errors in browser

**Implementation Note**: This is the final phase. After all verification passes, the implementation is complete.

---

## Testing Strategy

### Unit Tests:
- Test `buildSystemPrompt` function with various schema inputs
- Test `querySqlTool` truncation logic
- Test cache hooks (useQueryResultsCache, useAvailableModels, useSchema)

### Integration Tests:
- Test full chat flow: message → AI response → tool call → result display
- Test model selection persistence
- Test conversation history limiting

### Manual Testing Steps:
1. Create new chat tab
2. Ask "What are the top 10 stories by score?"
3. Verify AI calls querySql tool
4. Verify results display in expandable grid
5. Ask follow-up question referencing previous results
6. Change model and verify new messages use new model
7. Close tab and reopen - verify conversation persisted
8. Create multiple tabs and verify independence

## Performance Considerations

- Schema and models are cached for 1 hour to reduce API calls
- Query results are cached in LocalStorage (max 50 entries)
- Conversation history limited to 25 messages to manage context size
- AG Grid handles large result sets efficiently

## Migration Notes

Existing users with old notebook tabs will see them as empty chats. The old `sql` and `blocks` fields are ignored in favor of the new `messages` field. Consider adding a migration function that converts old blocks to initial messages if desired.

## References

- Research: `thoughts/shared/research/2025-12-12-hn-chat-vercel-ai-gateway.md`
- Requirements: `thoughts/shared/research/2025-12-12-hn-analysis-tool-requirements.md`
- AI SDK docs: https://ai-sdk.dev/docs
- Vercel AI Gateway: https://vercel.com/ai-gateway
