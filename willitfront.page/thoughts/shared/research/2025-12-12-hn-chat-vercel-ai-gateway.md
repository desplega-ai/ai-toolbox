---
date: 2025-12-12T15:30:00-05:00
researcher: Claude
git_commit: 755bdfdf1c77a7535fb5eef491d15014f1a2dec7
branch: main
repository: ai-toolbox
topic: "HN Analysis Tool - Chat Integration with Vercel AI Gateway"
tags: [research, vercel-ai-gateway, ai-sdk, chat, tools, sql, security]
status: complete
last_updated: 2025-12-12
last_updated_by: Claude
last_updated_note: "Dynamic schema in system prompt, stateless backend caching strategy"
related_research:
  - ./2025-12-12-hn-analysis-tool-requirements.md
---

# Research: HN Analysis Tool - Chat Integration with Vercel AI Gateway

**Date**: 2025-12-12T15:30:00-05:00
**Researcher**: Claude
**Git Commit**: 755bdfdf1c77a7535fb5eef491d15014f1a2dec7
**Branch**: main
**Repository**: ai-toolbox

## Research Question

How to integrate Vercel AI Gateway for the chat feature in the HN Analysis Tool, with:
1. Secure secrets management (API keys in backend only)
2. Model selection per notebook
3. AI tools for SQL queries with truncated outputs
4. "Read block" tool to expand full results

## Summary

The Vercel AI Gateway provides a unified API (`https://ai-gateway.vercel.sh/v1`) for 200+ models across 20+ providers. Integration with Bun.serve() keeps API keys server-side. The AI SDK's tool system allows defining SQL query tools with truncation/expansion patterns.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Browser (Frontend)                          │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │                     Chat/Notebook Tab                            ││
│  │  ┌─────────────────┐  ┌──────────────────────────────────────┐ ││
│  │  │ Model Selector  │  │  Chat Messages + Tool Results        │ ││
│  │  │ (per notebook)  │  │  - User messages                     │ ││
│  │  │                 │  │  - AI responses                      │ ││
│  │  │ ○ GPT-4.1       │  │  - SQL tool calls (truncated)        │ ││
│  │  │ ● Claude Sonnet │  │  - [Expand] buttons for full data    │ ││
│  │  │ ○ Gemini 2.5    │  │                                      │ ││
│  │  └─────────────────┘  └──────────────────────────────────────┘ ││
│  └─────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   │ POST /api/chat
                                   │ (messages, model, tools)
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     Bun.serve() Backend                              │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │  /api/chat                                                       ││
│  │  - Receives model selection from frontend                        ││
│  │  - Adds AI_GATEWAY_API_KEY (server-side only)                   ││
│  │  - Defines tools: querySql, readFullBlock                       ││
│  │  - Streams response back to frontend                            ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                      │
│  Environment Variables (never sent to frontend):                     │
│  - AI_GATEWAY_API_KEY                                               │
│  - HN_SQL_API_URL (localhost:3123)                                  │
└─────────────────────────────────────────────────────────────────────┘
                │                              │
                │                              │
                ▼                              ▼
┌──────────────────────────┐    ┌──────────────────────────┐
│   Vercel AI Gateway      │    │     HN-SQL API           │
│   ai-gateway.vercel.sh   │    │     localhost:3123       │
│                          │    │                          │
│   Models:                │    │   POST /query            │
│   - openai/gpt-4.1       │    │   GET  /schema           │
│   - anthropic/claude-*   │    │                          │
│   - google/gemini-*      │    │                          │
│   - xai/grok-*           │    │                          │
└──────────────────────────┘    └──────────────────────────┘
```

## Detailed Findings

### 1. Vercel AI Gateway Integration

#### Installation

```bash
bun add ai zod
```

#### Dynamic Model Discovery

Models are fetched dynamically from the AI Gateway using `gateway.getAvailableModels()`. This ensures the model list is always up-to-date with current availability and pricing.

**Backend endpoint to fetch models:**

```typescript
// index.ts - Add models endpoint
import { createGateway } from 'ai';

const gateway = createGateway({
  apiKey: process.env.AI_GATEWAY_API_KEY,
});

Bun.serve({
  routes: {
    // ... other routes

    '/api/models': {
      GET: async () => {
        try {
          const result = await gateway.getAvailableModels();

          // Transform to frontend-friendly format
          const models = result.models.map(model => ({
            id: model.id,           // e.g., "anthropic/claude-sonnet-4"
            name: model.name,       // e.g., "Claude Sonnet 4"
            description: model.description,
            pricing: {
              input: model.pricing?.input,
              output: model.pricing?.output,
            },
            // Extract provider from model ID
            provider: model.id.split('/')[0],
          }));

          return Response.json({ models });
        } catch (error) {
          return Response.json({ error: 'Failed to fetch models' }, { status: 500 });
        }
      },
    },
  },
});
```

**Frontend hook to fetch and cache models:**

```typescript
// hooks/useAvailableModels.ts
import { useState, useEffect } from 'react';

interface Model {
  id: string;
  name: string;
  description?: string;
  provider: string;
  pricing?: {
    input?: number;
    output?: number;
  };
}

const MODELS_CACHE_KEY = 'ai-gateway:models';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export function useAvailableModels() {
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchModels() {
      // Check cache first
      const cached = localStorage.getItem(MODELS_CACHE_KEY);
      if (cached) {
        const { models, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < CACHE_TTL_MS) {
          setModels(models);
          setLoading(false);
          return;
        }
      }

      try {
        const response = await fetch('/api/models');
        if (!response.ok) throw new Error('Failed to fetch models');

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
          setModels(JSON.parse(cached).models);
        }
      } finally {
        setLoading(false);
      }
    }

    fetchModels();
  }, []);

  // Group models by provider for UI
  const modelsByProvider = models.reduce((acc, model) => {
    const provider = model.provider;
    if (!acc[provider]) acc[provider] = [];
    acc[provider].push(model);
    return acc;
  }, {} as Record<string, Model[]>);

  return { models, modelsByProvider, loading, error };
}
```

**Model Selector Component:**

```typescript
// components/ModelSelector.tsx
import { useAvailableModels } from '../hooks/useAvailableModels';

interface ModelSelectorProps {
  value: string;
  onChange: (modelId: string) => void;
  showInheritOption?: boolean;
  inheritLabel?: string;
}

export function ModelSelector({ value, onChange, showInheritOption, inheritLabel }: ModelSelectorProps) {
  const { modelsByProvider, loading, error } = useAvailableModels();

  if (loading) return <select disabled><option>Loading models...</option></select>;
  if (error) return <select disabled><option>Error loading models</option></select>;

  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {showInheritOption && (
        <option value="">{inheritLabel || 'Use notebook default'}</option>
      )}
      {Object.entries(modelsByProvider).map(([provider, models]) => (
        <optgroup key={provider} label={provider}>
          {models.map(model => (
            <option key={model.id} value={model.id}>
              {model.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
```

**Default Model Constant:**

```typescript
// lib/constants.ts
// Default model when none selected - should exist in AI Gateway
export const DEFAULT_MODEL = 'anthropic/claude-sonnet-4';
```

### 2. Secure Backend API (Secrets Server-Side Only)

The critical security pattern: **API keys never leave the server**.

**Important**: Backend is fully stateless. Frontend is the source of truth (SOT) for all data and sends everything needed with each request.

```typescript
// index.ts (Bun.serve backend)
import { streamText, convertToModelMessages, createGateway } from 'ai';
import { z } from 'zod';
import index from './index.html';

const HN_SQL_API = process.env.HN_SQL_API_URL || 'http://localhost:3123';

const gateway = createGateway({
  apiKey: process.env.AI_GATEWAY_API_KEY,
});

// Build system prompt from schema provided by frontend
function buildSystemPrompt(schema: Schema): string {
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

Bun.serve({
  port: 3000,
  routes: {
    '/': index,

    '/api/chat': {
      POST: async (req) => {
        // Frontend sends everything: messages, model, and cached schema
        const { messages, model, schema } = await req.json();

        const result = streamText({
          model: gateway(model),
          system: buildSystemPrompt(schema),
          messages: convertToModelMessages(messages),
          tools: {
            querySql: createQuerySqlTool(),
          },
        });

        return result.toUIMessageStreamResponse();
      },
    },

    '/api/models': {
      GET: async () => {
        // Fetch fresh from AI Gateway (frontend caches for 1 hour)
        const result = await gateway.getAvailableModels();
        const models = result.models.map(model => ({
          id: model.id,
          name: model.name,
          description: model.description,
          provider: model.id.split('/')[0],
        }));
        return Response.json({ models });
      },
    },

    '/api/schema': {
      GET: async () => {
        // Proxy to HN-SQL API (frontend caches and sends with chat requests)
        const response = await fetch(`${HN_SQL_API}/schema`);
        return Response.json(await response.json());
      },
    },
  },

  development: {
    hmr: true,
    console: true,
  },
});
```

### Frontend as Source of Truth (SOT)

The frontend owns all state and sends everything the backend needs with each request. Backend is a pure stateless proxy.

**Data flow:**
```
┌─────────────────────────────────────────────────────────────────┐
│                    Frontend (Source of Truth)                    │
│                                                                  │
│  LocalStorage:                                                   │
│  ├── ai-gateway:models     → cached 1 hour                      │
│  ├── hn-sql:schema         → cached 1 hour                      │
│  ├── notebooks:{id}        → permanent                          │
│  └── queryResults:{id}     → cached 24 hours                    │
│                                                                  │
│  On chat request, frontend sends:                                │
│  { messages, model, schema }                                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Backend (Stateless Proxy)                     │
│                                                                  │
│  POST /api/chat                                                  │
│  - Receives: messages, model, schema (from frontend cache)      │
│  - Builds system prompt from schema                              │
│  - Calls AI Gateway with server-side API key                    │
│  - Streams response back                                        │
│                                                                  │
│  GET /api/models                                                 │
│  - Calls gateway.getAvailableModels()                           │
│  - Frontend caches result                                        │
│                                                                  │
│  GET /api/schema                                                 │
│  - Proxies to HN-SQL API                                        │
│  - Frontend caches result                                        │
└─────────────────────────────────────────────────────────────────┘
```

**Frontend cache hooks:**

```typescript
// hooks/useSchema.ts
const SCHEMA_CACHE_KEY = 'hn-sql:schema';
const SCHEMA_TTL_MS = 60 * 60 * 1000; // 1 hour

export function useSchema() {
  const [schema, setSchema] = useState<Schema | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchSchema() {
      // Check cache first
      const cached = localStorage.getItem(SCHEMA_CACHE_KEY);
      if (cached) {
        const { schema, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < SCHEMA_TTL_MS) {
          setSchema(schema);
          setLoading(false);
          return;
        }
      }

      // Fetch fresh
      const response = await fetch('/api/schema');
      const data = await response.json();
      setSchema(data);
      setLoading(false);

      // Cache it
      localStorage.setItem(SCHEMA_CACHE_KEY, JSON.stringify({
        schema: data,
        timestamp: Date.now(),
      }));
    }
    fetchSchema();
  }, []);

  return { schema, loading };
}
```

**Sending chat request with schema:**

```typescript
// hooks/useChat.ts (or in ChatTab component)
const { schema } = useSchema();
const { models } = useAvailableModels();

async function sendChatMessage(userMessage: string) {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [...previousMessages, { role: 'user', content: userMessage }],
      model: selectedModel,
      schema: schema,  // Frontend sends cached schema
    }),
  });
  // Handle streaming response...
}
```

### Cache Summary

| Data | Key | TTL | Sent to Backend |
|------|-----|-----|-----------------|
| User ID | `hn-tool:userId` | Permanent | Yes (with all requests) |
| Models | `ai-gateway:models` | 1 hour | No (just for UI) |
| Schema | `hn-sql:schema` | 1 hour | Yes (with `/api/chat`) |
| Query results | `queryResults:{blockId}` | 24 hours | No (UI expansion only) |
| Notebooks | `notebooks:{id}` | Permanent | No (local state) |

### Anonymous User ID

Generate a random user ID on first visit, stored permanently in LocalStorage. Sent with requests for:
- Future analytics/usage tracking
- Rate limiting per user
- Potential account linking / sync features
- AI Gateway provider options (user tracking)

```typescript
// lib/userId.ts
const USER_ID_KEY = 'hn-tool:userId';

export function getUserId(): string {
  let userId = localStorage.getItem(USER_ID_KEY);

  if (!userId) {
    // Generate a random UUID on first visit
    userId = crypto.randomUUID();
    localStorage.setItem(USER_ID_KEY, userId);
  }

  return userId;
}

// Hook version
export function useUserId(): string {
  const [userId] = useState(() => getUserId());
  return userId;
}
```

**Include in chat requests:**

```typescript
// Updated chat request payload
const { schema } = useSchema();
const userId = useUserId();

async function sendChatMessage(userMessage: string) {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [...previousMessages, { role: 'user', content: userMessage }],
      model: selectedModel,
      schema: schema,
      userId: userId,  // For tracking/rate limiting
    }),
  });
}
```

**Backend can use for AI Gateway tracking:**

```typescript
'/api/chat': {
  POST: async (req) => {
    const { messages, model, schema, userId } = await req.json();

    const result = streamText({
      model: gateway(model),
      system: buildSystemPrompt(schema),
      messages: convertToModelMessages(messages),
      tools: { querySql: createQuerySqlTool() },
      // Pass userId to AI Gateway for usage tracking
      providerOptions: {
        gateway: {
          user: userId,
        },
      },
    });

    return result.toUIMessageStreamResponse();
  },
},
```

This enables Vercel AI Gateway's per-user analytics and potential rate limiting in their dashboard.

### 3. SQL Query Tool with Truncation

The key insight: **truncate by default, provide expansion via a separate tool**.

```typescript
// tools/querySql.ts
import { tool } from 'ai';
import { z } from 'zod';

const MAX_PREVIEW_ROWS = 10;
const MAX_CELL_LENGTH = 100;

// In-memory cache for full results (use Redis in production)
const queryResultsCache = new Map<string, any>();

export function createQuerySqlTool() {
  return tool({
    description: `Execute a SQL query against the Hacker News database.
Returns truncated results by default (first ${MAX_PREVIEW_ROWS} rows, cell content capped at ${MAX_CELL_LENGTH} chars).
Use readFullBlock tool to get full results if needed.
Remember to quote the "by" column in SQL queries.`,
    inputSchema: z.object({
      sql: z.string().describe('The SQL query to execute'),
      limit: z.number().optional().describe('Max rows to return (default 1000, max 10000)'),
    }),
    execute: async ({ sql, limit }) => {
      const HN_SQL_API = process.env.HN_SQL_API_URL || 'http://localhost:3123';

      try {
        const response = await fetch(`${HN_SQL_API}/query`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sql, limit: limit || 1000 }),
        });

        if (!response.ok) {
          const error = await response.json();
          return {
            success: false,
            error: error.error || 'Query failed',
            sql,
          };
        }

        const data = await response.json();

        // Generate a unique block ID for this result
        const blockId = crypto.randomUUID();

        // Store full results for later expansion
        queryResultsCache.set(blockId, {
          columns: data.columns,
          rows: data.rows,
          sql,
          timing: data.timing,
        });

        // Clean up old cache entries after 30 minutes
        setTimeout(() => queryResultsCache.delete(blockId), 30 * 60 * 1000);

        // Truncate for preview
        const truncatedRows = data.rows.slice(0, MAX_PREVIEW_ROWS).map((row: any[]) =>
          row.map((cell: any) => {
            if (cell === null) return null;
            const str = String(cell);
            return str.length > MAX_CELL_LENGTH
              ? str.slice(0, MAX_CELL_LENGTH) + '...'
              : str;
          })
        );

        const isTruncated = data.rows.length > MAX_PREVIEW_ROWS ||
          data.rows.some((row: any[]) =>
            row.some((cell: any) => cell !== null && String(cell).length > MAX_CELL_LENGTH)
          );

        return {
          success: true,
          blockId,  // Frontend can use this to expand
          columns: data.columns,
          rows: truncatedRows,
          previewRowCount: truncatedRows.length,
          totalRowCount: data.row_count,
          isTruncated,
          timing: data.timing,
          message: isTruncated
            ? `Showing ${truncatedRows.length} of ${data.row_count} rows (truncated). Use readFullBlock("${blockId}") to see full results.`
            : `Query returned ${data.row_count} rows.`,
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
}
```

### 4. Read Full Block Tool

```typescript
// tools/readFullBlock.ts
import { tool } from 'ai';
import { z } from 'zod';

export function createReadFullBlockTool() {
  return tool({
    description: `Retrieve the full (non-truncated) results of a previous SQL query.
Use this when the user asks to see all results or when you need to analyze data
that was truncated in the preview.`,
    inputSchema: z.object({
      blockId: z.string().describe('The block ID from a previous querySql result'),
      startRow: z.number().optional().describe('Start row index (0-based, for pagination)'),
      rowCount: z.number().optional().describe('Number of rows to return (default: all remaining)'),
    }),
    execute: async ({ blockId, startRow = 0, rowCount }) => {
      const cached = queryResultsCache.get(blockId);

      if (!cached) {
        return {
          success: false,
          error: 'Block not found. It may have expired (30 min TTL) or the ID is invalid.',
        };
      }

      const endRow = rowCount ? startRow + rowCount : cached.rows.length;
      const rows = cached.rows.slice(startRow, endRow);

      return {
        success: true,
        columns: cached.columns,
        rows,
        startRow,
        endRow: Math.min(endRow, cached.rows.length),
        totalRows: cached.rows.length,
        sql: cached.sql,
        hasMore: endRow < cached.rows.length,
      };
    },
  });
}
```

### 5. Frontend Chat Component

```typescript
// components/ChatTab.tsx
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useState } from 'react';
import { ResultsGrid } from './grid/ResultsGrid';

interface ChatTabProps {
  notebookId: string;
  model: string;
  onModelChange: (model: string) => void;
}

export function ChatTab({ notebookId, model, onModelChange }: ChatTabProps) {
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/chat',
      body: { model }, // Model sent with each request
    }),
    id: notebookId,
  });

  const [input, setInput] = useState('');

  return (
    <div className="chat-tab">
      <ModelSelector value={model} onChange={onModelChange} />

      <div className="messages">
        {messages.map(message => (
          <div key={message.id} className={`message ${message.role}`}>
            {message.parts.map((part, i) => {
              switch (part.type) {
                case 'text':
                  return <div key={i} className="text">{part.text}</div>;

                case 'tool-querySql':
                  if (part.state === 'output-available') {
                    const result = part.output;
                    return (
                      <div key={i} className="sql-result">
                        <div className="sql-query">
                          <code>{result.sql}</code>
                        </div>
                        {result.success ? (
                          <>
                            <ResultsGrid
                              columns={result.columns}
                              rows={result.rows}
                            />
                            {result.isTruncated && (
                              <div className="truncation-notice">
                                Showing {result.previewRowCount} of {result.totalRowCount} rows
                                <button
                                  onClick={() => expandBlock(result.blockId)}
                                  className="expand-btn"
                                >
                                  Expand Full Results
                                </button>
                              </div>
                            )}
                            <div className="timing">{result.timing.elapsed_formatted}</div>
                          </>
                        ) : (
                          <div className="error">{result.error}</div>
                        )}
                      </div>
                    );
                  }
                  return <div key={i}>Running query...</div>;

                case 'tool-readFullBlock':
                  if (part.state === 'output-available') {
                    return (
                      <div key={i} className="full-results">
                        <ResultsGrid
                          columns={part.output.columns}
                          rows={part.output.rows}
                        />
                        {part.output.hasMore && (
                          <div>Showing rows {part.output.startRow}-{part.output.endRow} of {part.output.totalRows}</div>
                        )}
                      </div>
                    );
                  }
                  return <div key={i}>Loading full results...</div>;

                default:
                  return null;
              }
            })}
          </div>
        ))}
      </div>

      <form onSubmit={(e) => {
        e.preventDefault();
        if (input.trim()) {
          sendMessage({ text: input });
          setInput('');
        }
      }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about HN data..."
        />
        <button type="submit" disabled={status === 'streaming'}>
          Send
        </button>
      </form>
    </div>
  );
}
```

### 6. Environment Configuration

```bash
# .env (server-side only, never commit)
AI_GATEWAY_API_KEY=your_vercel_ai_gateway_key
HN_SQL_API_URL=http://localhost:3123

# For BYOK (optional - use your own provider keys via Vercel AI Gateway dashboard)
# Go to Vercel Dashboard > AI Gateway > Integrations to add provider keys
```

### 7. Data Flow for Chat with SQL Tools

```
User: "What are the top 5 stories today by score?"
        │
        ▼
Frontend: POST /api/chat
{
  messages: [...],
  model: "anthropic/claude-sonnet-4"
}
        │
        ▼
Backend: streamText() with tools
        │
        ▼
AI Gateway: claude-sonnet-4 decides to use querySql tool
{
  tool: "querySql",
  input: {
    sql: "SELECT title, score, \"by\" FROM hn WHERE type = 'story' ORDER BY score DESC LIMIT 5"
  }
}
        │
        ▼
Tool executes: POST localhost:3123/query
        │
        ▼
HN-SQL API returns full results
        │
        ▼
Tool truncates & caches:
- Store full results with blockId "abc-123"
- Return truncated preview (5 rows, 100 char cells)
        │
        ▼
AI formats response with truncated results
        │
        ▼
Frontend renders: AG Grid with preview + "Expand" button
        │
        ▼
User clicks "Expand" or asks "show me all results"
        │
        ▼
AI calls readFullBlock("abc-123")
        │
        ▼
Full results returned from cache
```

## LocalStorage Schema for Notebooks

```typescript
// types/storage.ts
interface StoredNotebook {
  id: string;
  name: string;
  type: 'chat' | 'query' | 'dashboard';
  model: string;  // For chat/query tabs
  messages: StoredMessage[];
  createdAt: number;
  updatedAt: number;
}

interface StoredMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;  // For text parts
  toolCalls?: StoredToolCall[];
}

interface StoredToolCall {
  id: string;
  toolName: string;
  input: any;
  output?: any;
  blockId?: string;  // For querySql results
}

// Storage key pattern
// notebooks:{notebookId} -> StoredNotebook
// tabs:order -> string[] (tab IDs in order)
// tabs:active -> string (active tab ID)
```

## Security Considerations

| Concern | Mitigation |
|---------|------------|
| API key exposure | Keys only in backend env vars, never sent to frontend |
| SQL injection | AI generates SQL, but HN-SQL API should validate/sanitize |
| Rate limiting | Implement per-user rate limits on /api/chat |
| Cache size | Set TTL on queryResultsCache, limit total entries |
| CORS | Configure Bun.serve() to only accept same-origin requests |

## Related Research

- [HN Data Analysis Tool - Project Requirements](./2025-12-12-hn-analysis-tool-requirements.md)

## Sources

### Vercel AI Gateway
- [Vercel AI Gateway - Main Page](https://vercel.com/ai-gateway)
- [AI Gateway Documentation](https://vercel.com/docs/ai-gateway)
- [Getting Started Guide](https://vercel.com/docs/ai-gateway/getting-started)
- [Authentication Documentation](https://vercel.com/docs/ai-gateway/authentication)
- [Browse AI Gateway Models](https://vercel.com/ai-gateway/models)

### AI SDK
- [AI SDK Core: Tool Calling](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling)
- [AI SDK UI: Chatbot Tool Usage](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-with-tool-calling)
- [AI SDK Foundations: Tools](https://ai-sdk.dev/docs/foundations/tools)
- [AI SDK - AI Gateway Provider](https://ai-sdk.dev/providers/ai-sdk-providers/ai-gateway)

### Security
- [Best Practices for API Key Safety - OpenAI](https://help.openai.com/en/articles/5112595-best-practices-for-api-key-safety)
- [Secure & Optimize LLM Access with an LLM Proxy](https://apipark.com/techblog/en/secure-optimize-llm-access-with-an-llm-proxy/)

## Decisions Made

| Question | Decision |
|----------|----------|
| Cache persistence | **Stateless backend** - Store query results in LocalStorage on frontend, not server-side cache |
| Model selection | **Two-level**: Notebook default + per-block override capability |
| Conversation history | **Limit to 25 messages** - Stop/truncate at that point |
| Model fallbacks | Not for now - user explicitly selects model |

## Updated Architecture: Stateless Backend + LocalStorage Cache

The backend is fully stateless. Query results are returned in full and cached in LocalStorage by the frontend.

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Browser (Frontend)                          │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │                     Chat/Notebook Tab                            ││
│  │  ┌─────────────────┐  ┌──────────────────────────────────────┐ ││
│  │  │ Notebook Model  │  │  Block 1: [claude-sonnet-4] ▼        │ ││
│  │  │ Default:        │  │  User: "Show top stories"            │ ││
│  │  │ claude-sonnet-4 │  │  AI: [SQL result - truncated view]   │ ││
│  │  │                 │  │      [Expand] button                 │ ││
│  │  │ Change default  │  │                                      │ ││
│  │  │ [Settings ⚙]    │  │  Block 2: [gpt-4.1] ▼  (overridden)  │ ││
│  │  │                 │  │  User: "Analyze this differently"    │ ││
│  │  │                 │  │  AI: [Different analysis]            │ ││
│  │  └─────────────────┘  └──────────────────────────────────────┘ ││
│  │                                                                  ││
│  │  LocalStorage:                                                   ││
│  │  - notebooks:{id} → messages, default model, block models       ││
│  │  - queryResults:{blockId} → full query data (for expansion)     ││
│  └─────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────┘
```

### Per-Block Model Selection

```typescript
// types/notebook.ts
interface NotebookSettings {
  id: string;
  name: string;
  defaultModel: string;  // Notebook-level default
  messages: Message[];
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  model?: string;  // Per-block override (undefined = use notebook default)
  toolCalls?: ToolCall[];
}

// When sending to API, resolve the model:
function getModelForMessage(message: Message, notebook: NotebookSettings): string {
  return message.model || notebook.defaultModel;
}
```

### Updated Frontend Component with Per-Block Model

```typescript
// components/ChatTab.tsx
interface ChatBlockProps {
  message: Message;
  notebookModel: string;
  onModelChange: (messageId: string, model: string) => void;
}

function ChatBlock({ message, notebookModel, onModelChange }: ChatBlockProps) {
  const effectiveModel = message.model || notebookModel;

  return (
    <div className="chat-block">
      <div className="block-header">
        <ModelSelector
          value={effectiveModel}
          onChange={(model) => onModelChange(message.id, model)}
          showInheritOption={true}
          inheritLabel={`Notebook default (${notebookModel})`}
        />
      </div>
      <div className="block-content">
        {/* message content */}
      </div>
    </div>
  );
}
```

### Conversation History Limit (25 Messages)

```typescript
// lib/chat.ts
const MAX_CONVERSATION_MESSAGES = 25;

function prepareMessagesForApi(messages: Message[]): Message[] {
  // Take only the last 25 messages
  const recentMessages = messages.slice(-MAX_CONVERSATION_MESSAGES);

  // If we truncated, optionally add a system note
  if (messages.length > MAX_CONVERSATION_MESSAGES) {
    console.log(`Conversation truncated: ${messages.length} → ${MAX_CONVERSATION_MESSAGES} messages`);
  }

  return recentMessages;
}

// In the chat hook:
const { messages, sendMessage } = useChat({
  transport: new DefaultChatTransport({
    api: '/api/chat',
    body: { model },
  }),
  // Before sending, truncate history
  onBeforeSend: (messages) => prepareMessagesForApi(messages),
});
```

### Updated Tool: Stateless Query (No Server Cache)

```typescript
// tools/querySql.ts - Stateless version
export function createQuerySqlTool() {
  return tool({
    description: `Execute a SQL query against the Hacker News database.
Returns truncated preview in the response. Full results are included
for the frontend to cache in LocalStorage.`,
    inputSchema: z.object({
      sql: z.string().describe('The SQL query to execute'),
      limit: z.number().optional().describe('Max rows to return (default 1000, max 10000)'),
    }),
    execute: async ({ sql, limit }) => {
      const HN_SQL_API = process.env.HN_SQL_API_URL || 'http://localhost:3123';

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
        const MAX_PREVIEW_ROWS = 10;
        const MAX_CELL_LENGTH = 100;

        const truncatedRows = data.rows.slice(0, MAX_PREVIEW_ROWS).map((row: any[]) =>
          row.map((cell: any) => {
            if (cell === null) return null;
            const str = String(cell);
            return str.length > MAX_CELL_LENGTH ? str.slice(0, MAX_CELL_LENGTH) + '...' : str;
          })
        );

        return {
          success: true,
          blockId,
          sql,
          columns: data.columns,
          // Preview for AI context
          preview: {
            rows: truncatedRows,
            rowCount: truncatedRows.length,
          },
          // Full data for frontend to cache in LocalStorage
          fullData: {
            rows: data.rows,
            rowCount: data.row_count,
          },
          timing: data.timing,
          isTruncated: data.row_count > MAX_PREVIEW_ROWS,
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
}
```

### Frontend: Cache Full Results in LocalStorage

```typescript
// hooks/useQueryResultsCache.ts
const QUERY_RESULTS_PREFIX = 'queryResults:';

export function useQueryResultsCache() {
  const cacheResult = (blockId: string, data: QueryResult) => {
    try {
      localStorage.setItem(
        `${QUERY_RESULTS_PREFIX}${blockId}`,
        JSON.stringify(data)
      );
    } catch (e) {
      // LocalStorage full - clear old entries
      clearOldQueryResults();
      localStorage.setItem(`${QUERY_RESULTS_PREFIX}${blockId}`, JSON.stringify(data));
    }
  };

  const getResult = (blockId: string): QueryResult | null => {
    const stored = localStorage.getItem(`${QUERY_RESULTS_PREFIX}${blockId}`);
    return stored ? JSON.parse(stored) : null;
  };

  const clearOldQueryResults = () => {
    // Remove query results older than 24 hours
    const keys = Object.keys(localStorage).filter(k => k.startsWith(QUERY_RESULTS_PREFIX));
    // Keep only the 50 most recent
    if (keys.length > 50) {
      keys.slice(0, keys.length - 50).forEach(k => localStorage.removeItem(k));
    }
  };

  return { cacheResult, getResult };
}

// In ChatTab, when tool result arrives:
const { cacheResult, getResult } = useQueryResultsCache();

// When rendering tool-querySql part:
if (part.type === 'tool-querySql' && part.state === 'output-available') {
  const result = part.output;
  if (result.success && result.fullData) {
    // Cache full results in LocalStorage
    cacheResult(result.blockId, {
      columns: result.columns,
      rows: result.fullData.rows,
      sql: result.sql,
    });
  }

  // Render uses preview, "Expand" button loads from LocalStorage
}
```

### Updated LocalStorage Schema

```typescript
// types/storage.ts
interface StoredNotebook {
  id: string;
  name: string;
  type: 'chat' | 'query' | 'dashboard';
  defaultModel: string;  // Notebook-level default model
  messages: StoredMessage[];
  createdAt: number;
  updatedAt: number;
}

interface StoredMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  model?: string;  // Per-block model override (undefined = use notebook default)
  toolCalls?: StoredToolCall[];
}

interface StoredToolCall {
  id: string;
  toolName: string;
  input: any;
  output?: any;  // Preview only - full data in separate cache
  blockId?: string;  // Reference to queryResults:{blockId} in LocalStorage
}

// Storage keys:
// notebooks:{notebookId} → StoredNotebook
// queryResults:{blockId} → { columns, rows, sql }  (full query results)
// tabs:order → string[]
// tabs:active → string
```

## Open Questions

1. **Error handling**: How should the UI handle tool execution failures gracefully?
2. **LocalStorage limits**: What to do when LocalStorage is full? (Current: clear oldest 50 entries)
