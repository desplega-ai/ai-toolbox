# HN Data Analysis Tool - V1 MVP Implementation Plan

## Overview

Build a browser-based SQL analysis tool for Hacker News data with a tabbed interface, SQL notebook editor, and pre-built dashboards. The UI follows HN's minimal aesthetic (orange accent, simple text-based design).

## Current State Analysis

- **Directory**: Empty (fresh project)
- **API**: HN-SQL running at `localhost:3123` with full schema support
- **Existing patterns**: None - starting fresh

### API Capabilities Verified:
- `POST /query` - Execute SQL queries (returns columns, rows, timing)
- `GET /schema` - Returns tables, SQL keywords, and functions for autocomplete
- `GET /health` - Health check (confirmed working)
- Pre-built endpoints: `/stories`, `/comments`, `/stats/*`, `/top/*`

## Desired End State

A functional web application where users can:
1. Open multiple tabs (Query tabs and Dashboard tabs)
2. Write and execute SQL queries with Monaco editor (with autocomplete)
3. View results in AG Grid
4. Access 5 pre-built dashboards with visualizations
5. Have tab state persist in LocalStorage

### Verification:
- App loads at `localhost:5193`
- Can create/close/switch between tabs
- SQL queries execute and display results
- Monaco has SQL autocomplete from `/schema`
- All 5 dashboards render with data
- Tab state persists on page refresh

## What We're NOT Doing

- Chat/LLM integration (V2)
- Idea Tester feature (V3)
- Export functionality
- Shareable URLs
- Authentication
- Query output caching (opt-in feature deferred)
- Mobile responsive design (desktop-first)

## Implementation Approach

Build incrementally in 6 phases:
1. Project scaffolding with Bun + Vite + React
2. Tab management system
3. API client and types
4. Monaco SQL editor with autocomplete
5. AG Grid results display
6. Pre-built dashboards

## Phase 1: Project Scaffolding

### Overview
Set up the foundational project structure with Bun, Vite, React, TypeScript, and shadcn/ui.

### Changes Required:

#### 1. Initialize Project
**Commands**:
```bash
cd /Users/taras/Documents/code/ai-toolbox/willitfront.page
bun create vite . --template react-ts
bun install
```

#### 2. Install Dependencies
**Commands**:
```bash
# Core dependencies
bun add @monaco-editor/react monaco-editor ag-grid-react ag-grid-community

# shadcn/ui setup
bunx shadcn@latest init

# Chart library for dashboards
bun add recharts

# Utility
bun add clsx tailwind-merge
```

#### 3. Configure shadcn
**File**: `components.json`
```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "default",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.js",
    "css": "src/index.css",
    "baseColor": "neutral",
    "cssVariables": true
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils"
  }
}
```

#### 4. Add shadcn Components
**Commands**:
```bash
bunx shadcn@latest add button tabs card dialog select
```

#### 5. Configure HN Theme Colors
**File**: `src/index.css` (additions to tailwind config)
```css
:root {
  --hn-orange: #ff6600;
  --hn-bg: #f6f6ef;
  --hn-text: #000000;
  --hn-link: #000000;
  --hn-link-visited: #828282;
}
```

#### 6. Configure TypeScript Paths
**File**: `tsconfig.json`
```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

#### 7. Update Vite Config
**File**: `vite.config.ts`
```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5193,
    proxy: {
      '/api': {
        target: 'http://localhost:3123',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
```

### Success Criteria:

#### Automated Verification:
- [x] `bun run dev` starts without errors
- [x] `bun run build` completes successfully
- [x] TypeScript compiles: `bun run typecheck` (add script)
- [x] App loads at `http://localhost:5193`

#### Manual Verification:
- [x] Page displays "Hello World" or similar placeholder
- [x] Browser console has no errors

---

## Phase 2: Tab Management System

### Overview
Implement the browser-like tab bar with support for creating, closing, and switching between tabs. State persists in LocalStorage.

### Changes Required:

#### 1. Tab Types
**File**: `src/types/tabs.ts`
```typescript
export type TabType = 'query' | 'dashboard';

export interface Tab {
  id: string;
  type: TabType;
  title: string;
  // For query tabs
  sql?: string;
  // For dashboard tabs
  dashboardId?: string;
}

export interface TabsState {
  tabs: Tab[];
  activeTabId: string | null;
}
```

#### 2. LocalStorage Hook
**File**: `src/hooks/useLocalStorage.ts`
```typescript
import { useState, useEffect } from 'react';

export function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const setValue = (value: T) => {
    setStoredValue(value);
    window.localStorage.setItem(key, JSON.stringify(value));
  };

  return [storedValue, setValue];
}
```

#### 3. Tabs Hook
**File**: `src/hooks/useTabs.ts`
```typescript
import { useLocalStorage } from './useLocalStorage';
import { Tab, TabsState, TabType } from '@/types/tabs';

const generateId = () => Math.random().toString(36).substr(2, 9);

export function useTabs() {
  const [state, setState] = useLocalStorage<TabsState>('hn-tabs', {
    tabs: [],
    activeTabId: null,
  });

  const createTab = (type: TabType, title?: string, dashboardId?: string) => {
    const newTab: Tab = {
      id: generateId(),
      type,
      title: title || (type === 'query' ? 'New Query' : 'Dashboard'),
      sql: type === 'query' ? '' : undefined,
      dashboardId: type === 'dashboard' ? dashboardId : undefined,
    };
    setState({
      tabs: [...state.tabs, newTab],
      activeTabId: newTab.id,
    });
    return newTab.id;
  };

  const closeTab = (tabId: string) => {
    const newTabs = state.tabs.filter(t => t.id !== tabId);
    const newActiveId = state.activeTabId === tabId
      ? (newTabs.length > 0 ? newTabs[newTabs.length - 1].id : null)
      : state.activeTabId;
    setState({ tabs: newTabs, activeTabId: newActiveId });
  };

  const setActiveTab = (tabId: string) => {
    setState({ ...state, activeTabId: tabId });
  };

  const updateTab = (tabId: string, updates: Partial<Tab>) => {
    setState({
      ...state,
      tabs: state.tabs.map(t => t.id === tabId ? { ...t, ...updates } : t),
    });
  };

  return {
    tabs: state.tabs,
    activeTabId: state.activeTabId,
    activeTab: state.tabs.find(t => t.id === state.activeTabId),
    createTab,
    closeTab,
    setActiveTab,
    updateTab,
  };
}
```

#### 4. Tab Bar Component
**File**: `src/components/tabs/TabBar.tsx`
```typescript
import { Plus, X } from 'lucide-react';
import { Tab, TabType } from '@/types/tabs';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

interface TabBarProps {
  tabs: Tab[];
  activeTabId: string | null;
  onTabSelect: (tabId: string) => void;
  onTabClose: (tabId: string) => void;
  onNewTab: (type: TabType, dashboardId?: string) => void;
}

const DASHBOARDS = [
  { id: 'overview', name: 'Overview' },
  { id: 'top-content', name: 'Top Content' },
  { id: 'users', name: 'User Leaderboard' },
  { id: 'domains', name: 'Domain Analysis' },
  { id: 'activity', name: 'Activity Timeline' },
];

export function TabBar({ tabs, activeTabId, onTabSelect, onTabClose, onNewTab }: TabBarProps) {
  return (
    <div className="flex items-center bg-[var(--hn-orange)] px-2 h-10">
      {tabs.map(tab => (
        <div
          key={tab.id}
          className={`flex items-center px-3 py-1 mr-1 cursor-pointer rounded-t ${
            tab.id === activeTabId ? 'bg-[var(--hn-bg)]' : 'bg-orange-200 hover:bg-orange-100'
          }`}
          onClick={() => onTabSelect(tab.id)}
        >
          <span className="text-sm truncate max-w-32">{tab.title}</span>
          <button
            className="ml-2 hover:bg-gray-200 rounded p-0.5"
            onClick={(e) => { e.stopPropagation(); onTabClose(tab.id); }}
          >
            <X size={14} />
          </button>
        </div>
      ))}

      <Dialog>
        <DialogTrigger asChild>
          <button className="p-1 hover:bg-orange-500 rounded ml-1">
            <Plus size={18} className="text-white" />
          </button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Tab</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            <Button variant="outline" onClick={() => onNewTab('query')}>
              New SQL Query
            </Button>
            <div className="border-t pt-2 mt-2">
              <p className="text-sm text-gray-500 mb-2">Open Dashboard:</p>
              {DASHBOARDS.map(d => (
                <Button
                  key={d.id}
                  variant="ghost"
                  className="w-full justify-start"
                  onClick={() => onNewTab('dashboard', d.id)}
                >
                  {d.name}
                </Button>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

#### 5. Main App Layout
**File**: `src/App.tsx`
```typescript
import { useTabs } from '@/hooks/useTabs';
import { TabBar } from '@/components/tabs/TabBar';

function App() {
  const { tabs, activeTabId, activeTab, createTab, closeTab, setActiveTab } = useTabs();

  return (
    <div className="h-screen flex flex-col bg-[var(--hn-bg)]">
      <TabBar
        tabs={tabs}
        activeTabId={activeTabId}
        onTabSelect={setActiveTab}
        onTabClose={closeTab}
        onNewTab={(type, dashboardId) => createTab(type, undefined, dashboardId)}
      />

      <main className="flex-1 overflow-hidden">
        {activeTab ? (
          <div className="h-full p-4">
            {activeTab.type === 'query' && <div>Query Tab: {activeTab.id}</div>}
            {activeTab.type === 'dashboard' && <div>Dashboard: {activeTab.dashboardId}</div>}
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-gray-500">
            Click + to open a new tab
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
```

### Success Criteria:

#### Automated Verification:
- [x] `bun run build` succeeds
- [x] `bun run typecheck` passes

#### Manual Verification:
- [x] Can click + to open new tab dialog
- [x] Can create Query and Dashboard tabs
- [x] Can switch between tabs
- [x] Can close tabs with X button
- [x] Tab state persists after page refresh
- [x] Closing last tab shows empty state

---

## Phase 3: API Client and Types

### Overview
Create a typed API client for the HN-SQL backend with proper error handling.

### Changes Required:

#### 1. API Types
**File**: `src/types/api.ts`
```typescript
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
```

#### 2. API Client
**File**: `src/lib/api.ts`
```typescript
import { QueryRequest, QueryResponse, QueryError, SchemaResponse } from '@/types/api';

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

#### 3. Query Hook
**File**: `src/hooks/useQuery.ts`
```typescript
import { useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { QueryResponse } from '@/types/api';

interface QueryState {
  data: QueryResponse | null;
  error: string | null;
  isLoading: boolean;
}

export function useQuery() {
  const [state, setState] = useState<QueryState>({
    data: null,
    error: null,
    isLoading: false,
  });

  const execute = useCallback(async (sql: string, limit?: number) => {
    setState({ data: null, error: null, isLoading: true });
    try {
      const data = await api.query(sql, limit);
      setState({ data, error: null, isLoading: false });
      return data;
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Query failed';
      setState({ data: null, error, isLoading: false });
      throw err;
    }
  }, []);

  const clear = useCallback(() => {
    setState({ data: null, error: null, isLoading: false });
  }, []);

  return { ...state, execute, clear };
}
```

#### 4. Schema Hook
**File**: `src/hooks/useSchema.ts`
```typescript
import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { SchemaResponse } from '@/types/api';

export function useSchema() {
  const [schema, setSchema] = useState<SchemaResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    api.schema()
      .then(setSchema)
      .catch(err => setError(err.message))
      .finally(() => setIsLoading(false));
  }, []);

  return { schema, error, isLoading };
}
```

### Success Criteria:

#### Automated Verification:
- [x] `bun run typecheck` passes
- [x] `bun run build` succeeds

#### Manual Verification:
- [x] API proxy works (can fetch from `/api/health` in browser console)
- [x] Schema loads on app start (verify in React DevTools or console)

---

## Phase 4: Monaco SQL Editor

### Overview
Integrate Monaco Editor with SQL syntax highlighting and autocomplete powered by the `/schema` endpoint.

### Changes Required:

#### 1. Monaco Configuration
**File**: `src/lib/monaco-config.ts`
```typescript
import { Monaco } from '@monaco-editor/react';
import { SchemaResponse } from '@/types/api';

export function configureMonaco(monaco: Monaco, schema: SchemaResponse) {
  // Register SQL language completion provider
  monaco.languages.registerCompletionItemProvider('sql', {
    provideCompletionItems: (model, position) => {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };

      const suggestions = [
        // Keywords
        ...schema.keywords.map(keyword => ({
          label: keyword,
          kind: monaco.languages.CompletionItemKind.Keyword,
          insertText: keyword,
          range,
        })),
        // Functions
        ...schema.functions.map(fn => ({
          label: fn,
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: `${fn}()`,
          range,
        })),
        // Tables
        ...schema.tables.map(table => ({
          label: table.name,
          kind: monaco.languages.CompletionItemKind.Class,
          insertText: table.name,
          detail: 'Table',
          range,
        })),
        // Columns (from all tables)
        ...schema.tables.flatMap(table =>
          table.columns.map(col => ({
            label: col.name,
            kind: monaco.languages.CompletionItemKind.Field,
            insertText: col.name === 'by' ? '"by"' : col.name,
            detail: `${col.type}${col.nullable ? ' (nullable)' : ''} - ${col.description}`,
            range,
          }))
        ),
      ];

      return { suggestions };
    },
  });
}
```

#### 2. SQL Editor Component
**File**: `src/components/editor/SqlEditor.tsx`
```typescript
import { useRef, useEffect } from 'react';
import Editor, { Monaco, OnMount } from '@monaco-editor/react';
import { editor } from 'monaco-editor';
import { useSchema } from '@/hooks/useSchema';
import { configureMonaco } from '@/lib/monaco-config';

interface SqlEditorProps {
  value: string;
  onChange: (value: string) => void;
  onExecute: () => void;
}

export function SqlEditor({ value, onChange, onExecute }: SqlEditorProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const { schema } = useSchema();
  const monacoConfigured = useRef(false);

  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;

    // Add Cmd/Ctrl+Enter to execute
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      onExecute();
    });

    // Configure autocomplete if schema is ready
    if (schema && !monacoConfigured.current) {
      configureMonaco(monaco, schema);
      monacoConfigured.current = true;
    }
  };

  // Configure autocomplete when schema loads after editor mount
  useEffect(() => {
    if (schema && editorRef.current && !monacoConfigured.current) {
      const monaco = (window as any).monaco as Monaco;
      if (monaco) {
        configureMonaco(monaco, schema);
        monacoConfigured.current = true;
      }
    }
  }, [schema]);

  return (
    <div className="border rounded overflow-hidden">
      <Editor
        height="200px"
        defaultLanguage="sql"
        value={value}
        onChange={(v) => onChange(v || '')}
        onMount={handleEditorMount}
        options={{
          minimap: { enabled: false },
          fontSize: 14,
          lineNumbers: 'on',
          scrollBeyondLastLine: false,
          wordWrap: 'on',
          automaticLayout: true,
          tabSize: 2,
          suggestOnTriggerCharacters: true,
        }}
        theme="vs"
      />
    </div>
  );
}
```

### Success Criteria:

#### Automated Verification:
- [x] `bun run typecheck` passes
- [x] `bun run build` succeeds

#### Manual Verification:
- [x] Monaco editor renders in query tab
- [x] Typing SQL shows autocomplete suggestions
- [x] Keywords (SELECT, FROM, WHERE) appear in autocomplete
- [x] Column names appear with type info
- [x] "by" column suggests quoted version ("by")
- [x] Cmd/Ctrl+Enter triggers execute callback

---

## Phase 5: AG Grid Results Display

### Overview
Display query results in AG Grid with proper column types and formatting.

### Changes Required:

#### 1. Results Grid Component
**File**: `src/components/grid/ResultsGrid.tsx`
```typescript
import { useMemo } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ColDef, GridReadyEvent } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';
import { QueryResponse } from '@/types/api';

interface ResultsGridProps {
  data: QueryResponse;
}

export function ResultsGrid({ data }: ResultsGridProps) {
  const columnDefs = useMemo<ColDef[]>(() => {
    return data.columns.map((col, index) => ({
      field: `col_${index}`,
      headerName: col,
      sortable: true,
      filter: true,
      resizable: true,
      // Format timestamps
      valueFormatter: (params) => {
        if (col === 'time' && params.value) {
          return new Date(params.value).toLocaleString();
        }
        return params.value;
      },
    }));
  }, [data.columns]);

  const rowData = useMemo(() => {
    return data.rows.map(row => {
      const obj: Record<string, unknown> = {};
      row.forEach((val, i) => {
        obj[`col_${i}`] = val;
      });
      return obj;
    });
  }, [data.rows]);

  const onGridReady = (event: GridReadyEvent) => {
    event.api.sizeColumnsToFit();
  };

  return (
    <div className="ag-theme-alpine w-full h-full">
      <AgGridReact
        columnDefs={columnDefs}
        rowData={rowData}
        onGridReady={onGridReady}
        defaultColDef={{
          sortable: true,
          filter: true,
          resizable: true,
        }}
        animateRows={true}
        rowSelection="multiple"
      />
    </div>
  );
}
```

#### 2. Query Tab Component
**File**: `src/components/tabs/QueryTab.tsx`
```typescript
import { useState } from 'react';
import { SqlEditor } from '@/components/editor/SqlEditor';
import { ResultsGrid } from '@/components/grid/ResultsGrid';
import { useQuery } from '@/hooks/useQuery';
import { Button } from '@/components/ui/button';
import { Play, Loader2 } from 'lucide-react';
import { Tab } from '@/types/tabs';

interface QueryTabProps {
  tab: Tab;
  onUpdate: (updates: Partial<Tab>) => void;
}

export function QueryTab({ tab, onUpdate }: QueryTabProps) {
  const [sql, setSql] = useState(tab.sql || '');
  const { data, error, isLoading, execute } = useQuery();

  const handleSqlChange = (value: string) => {
    setSql(value);
    onUpdate({ sql: value });
  };

  const handleExecute = async () => {
    if (!sql.trim()) return;
    try {
      await execute(sql);
      // Update tab title with first part of query
      const title = sql.trim().split('\n')[0].substring(0, 30) || 'Query';
      onUpdate({ title });
    } catch {
      // Error is handled in state
    }
  };

  return (
    <div className="h-full flex flex-col gap-4 p-4">
      <div className="flex-shrink-0">
        <SqlEditor
          value={sql}
          onChange={handleSqlChange}
          onExecute={handleExecute}
        />
        <div className="flex items-center gap-2 mt-2">
          <Button onClick={handleExecute} disabled={isLoading || !sql.trim()}>
            {isLoading ? <Loader2 className="animate-spin mr-2" size={16} /> : <Play size={16} className="mr-2" />}
            Run Query
          </Button>
          {data && (
            <span className="text-sm text-gray-500">
              {data.row_count} rows in {data.timing.elapsed_formatted}
              {data.truncated && ' (truncated)'}
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded">
          {error}
        </div>
      )}

      {data && (
        <div className="flex-1 min-h-0">
          <ResultsGrid data={data} />
        </div>
      )}
    </div>
  );
}
```

#### 3. Update App.tsx
**File**: `src/App.tsx` (update the activeTab rendering section)
```typescript
// Add import
import { QueryTab } from '@/components/tabs/QueryTab';

// Update the main section
<main className="flex-1 overflow-hidden">
  {activeTab ? (
    activeTab.type === 'query' ? (
      <QueryTab tab={activeTab} onUpdate={(u) => updateTab(activeTab.id, u)} />
    ) : (
      <div className="h-full p-4">Dashboard: {activeTab.dashboardId}</div>
    )
  ) : (
    <div className="h-full flex items-center justify-center text-gray-500">
      Click + to open a new tab
    </div>
  )}
</main>
```

### Success Criteria:

#### Automated Verification:
- [x] `bun run typecheck` passes
- [x] `bun run build` succeeds

#### Manual Verification:
- [x] Query tab shows Monaco editor at top
- [x] "Run Query" button executes the query
- [x] Results appear in AG Grid below
- [x] Grid columns match query columns
- [x] Can sort and filter columns
- [x] Timestamps are formatted readably
- [x] Row count and timing shown after query
- [x] Error messages display when query fails
- [x] Cmd/Ctrl+Enter executes query from editor

---

## Phase 6: Pre-built Dashboards

### Overview
Create 5 dashboard views with pre-defined queries and visualizations using Recharts.

### Changes Required:

#### 1. Dashboard Types
**File**: `src/types/dashboard.ts`
```typescript
export interface DashboardConfig {
  id: string;
  name: string;
  description: string;
  queries: DashboardQuery[];
}

export interface DashboardQuery {
  id: string;
  title: string;
  sql: string;
  visualization: 'table' | 'bar' | 'line' | 'metric';
  // For metric visualization
  metricLabel?: string;
}
```

#### 2. Dashboard Configurations
**File**: `src/lib/dashboards.ts`
```typescript
import { DashboardConfig } from '@/types/dashboard';

export const dashboards: DashboardConfig[] = [
  {
    id: 'overview',
    name: 'Overview',
    description: 'Key metrics at a glance',
    queries: [
      {
        id: 'total-stories',
        title: 'Total Stories',
        sql: `SELECT COUNT(*) as count FROM hn WHERE type = 'story'`,
        visualization: 'metric',
        metricLabel: 'Stories',
      },
      {
        id: 'total-comments',
        title: 'Total Comments',
        sql: `SELECT COUNT(*) as count FROM hn WHERE type = 'comment'`,
        visualization: 'metric',
        metricLabel: 'Comments',
      },
      {
        id: 'unique-users',
        title: 'Unique Users',
        sql: `SELECT COUNT(DISTINCT "by") as count FROM hn WHERE "by" IS NOT NULL`,
        visualization: 'metric',
        metricLabel: 'Users',
      },
      {
        id: 'items-by-type',
        title: 'Items by Type',
        sql: `SELECT type, COUNT(*) as count FROM hn GROUP BY type ORDER BY count DESC`,
        visualization: 'bar',
      },
    ],
  },
  {
    id: 'top-content',
    name: 'Top Content',
    description: 'Highest performing stories and discussions',
    queries: [
      {
        id: 'top-stories',
        title: 'Top Stories by Score',
        sql: `SELECT title, score, "by", time FROM hn WHERE type = 'story' ORDER BY score DESC LIMIT 20`,
        visualization: 'table',
      },
      {
        id: 'most-discussed',
        title: 'Most Discussed',
        sql: `SELECT title, descendants as comments, score, "by" FROM hn WHERE type = 'story' AND descendants IS NOT NULL ORDER BY descendants DESC LIMIT 20`,
        visualization: 'table',
      },
    ],
  },
  {
    id: 'users',
    name: 'User Leaderboard',
    description: 'Most active and successful users',
    queries: [
      {
        id: 'top-authors',
        title: 'Top Story Authors (by total score)',
        sql: `SELECT "by", COUNT(*) as stories, SUM(score) as total_score FROM hn WHERE type = 'story' AND "by" IS NOT NULL GROUP BY "by" ORDER BY total_score DESC LIMIT 20`,
        visualization: 'table',
      },
      {
        id: 'active-commenters',
        title: 'Most Active Commenters',
        sql: `SELECT "by", COUNT(*) as comments FROM hn WHERE type = 'comment' AND "by" IS NOT NULL GROUP BY "by" ORDER BY comments DESC LIMIT 20`,
        visualization: 'bar',
      },
    ],
  },
  {
    id: 'domains',
    name: 'Domain Analysis',
    description: 'Most posted and best performing domains',
    queries: [
      {
        id: 'top-domains',
        title: 'Most Posted Domains',
        sql: `SELECT REGEXP_EXTRACT(url, 'https?://([^/]+)', 1) as domain, COUNT(*) as posts, ROUND(AVG(score), 1) as avg_score FROM hn WHERE type = 'story' AND url IS NOT NULL GROUP BY domain HAVING domain IS NOT NULL ORDER BY posts DESC LIMIT 20`,
        visualization: 'table',
      },
      {
        id: 'best-domains',
        title: 'Highest Avg Score (min 3 posts)',
        sql: `SELECT REGEXP_EXTRACT(url, 'https?://([^/]+)', 1) as domain, COUNT(*) as posts, ROUND(AVG(score), 1) as avg_score FROM hn WHERE type = 'story' AND url IS NOT NULL GROUP BY domain HAVING domain IS NOT NULL AND posts >= 3 ORDER BY avg_score DESC LIMIT 20`,
        visualization: 'bar',
      },
    ],
  },
  {
    id: 'activity',
    name: 'Activity Timeline',
    description: 'Posting patterns and trends',
    queries: [
      {
        id: 'posts-by-hour',
        title: 'Posts by Hour (UTC)',
        sql: `SELECT HOUR(time) as hour, COUNT(*) as posts FROM hn WHERE type = 'story' GROUP BY hour ORDER BY hour`,
        visualization: 'bar',
      },
      {
        id: 'activity-timeline',
        title: 'Activity Over Time',
        sql: `SELECT DATE_TRUNC('hour', time) as hour, COUNT(*) as items FROM hn GROUP BY hour ORDER BY hour`,
        visualization: 'line',
      },
    ],
  },
];

export function getDashboard(id: string): DashboardConfig | undefined {
  return dashboards.find(d => d.id === id);
}
```

#### 3. Chart Components
**File**: `src/components/dashboard/Charts.tsx`
```typescript
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { QueryResponse } from '@/types/api';

interface ChartProps {
  data: QueryResponse;
}

export function BarChartViz({ data }: ChartProps) {
  const chartData = data.rows.map(row => {
    const obj: Record<string, unknown> = {};
    data.columns.forEach((col, i) => {
      obj[col] = row[i];
    });
    return obj;
  });

  const labelKey = data.columns[0];
  const valueKey = data.columns[1];

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={chartData}>
        <XAxis dataKey={labelKey} />
        <YAxis />
        <Tooltip />
        <Bar dataKey={valueKey} fill="var(--hn-orange)" />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function LineChartViz({ data }: ChartProps) {
  const chartData = data.rows.map(row => {
    const obj: Record<string, unknown> = {};
    data.columns.forEach((col, i) => {
      // Format timestamps for display
      if (col.includes('hour') || col.includes('time') || col.includes('date')) {
        obj[col] = new Date(row[i] as string).toLocaleString();
      } else {
        obj[col] = row[i];
      }
    });
    return obj;
  });

  const xKey = data.columns[0];
  const yKey = data.columns[1];

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={chartData}>
        <XAxis dataKey={xKey} tick={{ fontSize: 10 }} />
        <YAxis />
        <Tooltip />
        <Line type="monotone" dataKey={yKey} stroke="var(--hn-orange)" />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function MetricCard({ data, label }: ChartProps & { label?: string }) {
  const value = data.rows[0]?.[0] ?? 0;
  return (
    <div className="bg-white p-6 rounded-lg border text-center">
      <div className="text-4xl font-bold text-[var(--hn-orange)]">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
      {label && <div className="text-gray-500 mt-1">{label}</div>}
    </div>
  );
}
```

#### 4. Dashboard Panel Component
**File**: `src/components/dashboard/DashboardPanel.tsx`
```typescript
import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { QueryResponse } from '@/types/api';
import { DashboardQuery } from '@/types/dashboard';
import { ResultsGrid } from '@/components/grid/ResultsGrid';
import { BarChartViz, LineChartViz, MetricCard } from './Charts';
import { Loader2 } from 'lucide-react';

interface DashboardPanelProps {
  query: DashboardQuery;
}

export function DashboardPanel({ query }: DashboardPanelProps) {
  const [data, setData] = useState<QueryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.query(query.sql)
      .then(setData)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [query.sql]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded">
        {error}
      </div>
    );
  }

  if (!data) return null;

  return (
    <div>
      {query.visualization === 'table' && (
        <div className="h-64">
          <ResultsGrid data={data} />
        </div>
      )}
      {query.visualization === 'bar' && <BarChartViz data={data} />}
      {query.visualization === 'line' && <LineChartViz data={data} />}
      {query.visualization === 'metric' && <MetricCard data={data} label={query.metricLabel} />}
    </div>
  );
}
```

#### 5. Dashboard Tab Component
**File**: `src/components/tabs/DashboardTab.tsx`
```typescript
import { getDashboard } from '@/lib/dashboards';
import { DashboardPanel } from '@/components/dashboard/DashboardPanel';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface DashboardTabProps {
  dashboardId: string;
}

export function DashboardTab({ dashboardId }: DashboardTabProps) {
  const dashboard = getDashboard(dashboardId);

  if (!dashboard) {
    return <div className="p-4 text-red-500">Dashboard not found: {dashboardId}</div>;
  }

  // Check if this is the overview dashboard with metrics
  const hasMetrics = dashboard.queries.some(q => q.visualization === 'metric');
  const metrics = dashboard.queries.filter(q => q.visualization === 'metric');
  const otherQueries = dashboard.queries.filter(q => q.visualization !== 'metric');

  return (
    <div className="h-full overflow-auto p-4">
      <div className="mb-4">
        <h1 className="text-2xl font-bold">{dashboard.name}</h1>
        <p className="text-gray-500">{dashboard.description}</p>
      </div>

      {/* Metrics row */}
      {hasMetrics && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          {metrics.map(query => (
            <DashboardPanel key={query.id} query={query} />
          ))}
        </div>
      )}

      {/* Other panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {otherQueries.map(query => (
          <Card key={query.id}>
            <CardHeader>
              <CardTitle className="text-lg">{query.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <DashboardPanel query={query} />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
```

#### 6. Update App.tsx
**File**: `src/App.tsx` (final update)
```typescript
import { useTabs } from '@/hooks/useTabs';
import { TabBar } from '@/components/tabs/TabBar';
import { QueryTab } from '@/components/tabs/QueryTab';
import { DashboardTab } from '@/components/tabs/DashboardTab';

function App() {
  const { tabs, activeTabId, activeTab, createTab, closeTab, setActiveTab, updateTab } = useTabs();

  return (
    <div className="h-screen flex flex-col bg-[var(--hn-bg)]">
      <TabBar
        tabs={tabs}
        activeTabId={activeTabId}
        onTabSelect={setActiveTab}
        onTabClose={closeTab}
        onNewTab={(type, dashboardId) => {
          const title = type === 'dashboard' && dashboardId
            ? dashboardId.charAt(0).toUpperCase() + dashboardId.slice(1).replace('-', ' ')
            : undefined;
          createTab(type, title, dashboardId);
        }}
      />

      <main className="flex-1 overflow-hidden">
        {activeTab ? (
          activeTab.type === 'query' ? (
            <QueryTab tab={activeTab} onUpdate={(u) => updateTab(activeTab.id, u)} />
          ) : (
            <DashboardTab dashboardId={activeTab.dashboardId || ''} />
          )
        ) : (
          <div className="h-full flex items-center justify-center text-gray-500">
            Click + to open a new tab
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
```

### Success Criteria:

#### Automated Verification:
- [x] `bun run typecheck` passes
- [x] `bun run build` succeeds

#### Manual Verification:
- [x] Overview dashboard shows 3 metric cards
- [x] Overview shows Items by Type bar chart
- [x] Top Content dashboard shows two tables
- [x] User Leaderboard shows table and bar chart
- [x] Domain Analysis shows table and bar chart
- [x] Activity Timeline shows bar chart and line chart
- [x] All dashboards load data without errors
- [x] Charts render with HN orange color

---

## Testing Strategy

### Unit Tests (Future Enhancement):
- Tab state management (create, close, switch)
- API client error handling
- LocalStorage serialization

### Integration Tests (Future Enhancement):
- Query execution flow
- Dashboard data loading

### Manual Testing Steps:
1. Fresh load - app starts with no tabs
2. Create query tab, write SQL, execute
3. Create each dashboard type
4. Switch between tabs
5. Close tabs
6. Refresh page - verify state persists
7. Test invalid SQL - verify error display
8. Test API offline - verify graceful degradation

## Performance Considerations

- Monaco editor is lazy-loaded
- AG Grid uses virtualization for large result sets
- Dashboards load queries independently (parallel)
- Consider memoizing dashboard query results if data is static

## References

- Research document: `thoughts/shared/research/2025-12-12-hn-analysis-tool-requirements.md`
- API running at: `localhost:3123`
- shadcn/ui docs: https://ui.shadcn.com
- Monaco React: https://github.com/suren-atoyan/monaco-react
- AG Grid React: https://www.ag-grid.com/react-data-grid/
