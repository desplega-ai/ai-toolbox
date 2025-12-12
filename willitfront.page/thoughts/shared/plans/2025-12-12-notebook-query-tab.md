# Notebook-Style Query Tab Implementation Plan

## Overview

Transform the QueryTab from a single SQL editor into a Jupyter-style notebook interface with multiple SQL blocks, inline results, and auto-expanding editors.

## Current State Analysis

- **QueryTab** (`src/components/tabs/QueryTab.tsx`): Single SQL editor + single results grid
- **SqlEditor** (`src/components/editor/SqlEditor.tsx`): Fixed 200px height Monaco editor
- **Tab type** (`src/types/tabs.ts`): Stores single `sql?: string`
- **useQuery hook** (`src/hooks/useQuery.ts`): Executes single query, returns single result

### Key Discoveries:
- Monaco already has `automaticLayout: true` (`SqlEditor.tsx:69`)
- Tab state persists to localStorage via `useTabs` hook
- Results use AG Grid with good virtualization

## Desired End State

A notebook interface where users can:
1. Add multiple SQL blocks to a single tab
2. Run individual blocks or "Run All" sequentially
3. See results inline below each block
4. Reorder blocks via drag & drop
5. Delete blocks
6. Collapse/expand results
7. Have editors auto-expand as they type (no internal scrolling)

### Verification:
- Can add new SQL blocks with + button
- Each block has run/delete controls
- Results appear inline below each block
- "Run All" executes blocks top-to-bottom
- Blocks can be reordered via drag handles
- Editor height grows with content
- State persists on refresh

## What We're NOT Doing

- Markdown/text blocks (future enhancement)
- Cell execution order indicators (like Jupyter's [1], [2])
- Export to .sql or .ipynb
- Keyboard navigation between cells
- Cell duplication

## Implementation Approach

1. Update types to support multiple blocks per tab
2. Create auto-expanding SqlEditor variant
3. Build NotebookBlock component with controls
4. Create NotebookQueryTab to orchestrate blocks
5. Add drag & drop reordering with @dnd-kit

---

## Phase 1: Types and Data Model

### Overview
Update the Tab type to store an array of notebook blocks instead of a single SQL string.

### Changes Required:

#### 1. Add Block Types
**File**: `src/types/tabs.ts`

```typescript
export type TabType = 'query' | 'dashboard';

export type BlockType = 'sql'; // Future: | 'text'

export interface NotebookBlock {
  id: string;
  type: BlockType;
  content: string;
  // Result state (not persisted, but useful for in-memory)
  collapsed?: boolean;
}

export interface Tab {
  id: string;
  type: TabType;
  title: string;
  // Legacy single SQL (for migration)
  sql?: string;
  // New notebook blocks
  blocks?: NotebookBlock[];
  // For dashboard tabs
  dashboardId?: string;
}

export interface TabsState {
  tabs: Tab[];
  activeTabId: string | null;
}
```

#### 2. Add Block Helper Functions
**File**: `src/lib/notebook.ts`

```typescript
import type { NotebookBlock, Tab } from '@/types/tabs';

export const generateBlockId = () => Math.random().toString(36).substr(2, 9);

export function createBlock(type: 'sql' = 'sql', content = ''): NotebookBlock {
  return {
    id: generateBlockId(),
    type,
    content,
    collapsed: false,
  };
}

export function migrateTabToNotebook(tab: Tab): Tab {
  // If tab already has blocks, return as-is
  if (tab.blocks && tab.blocks.length > 0) {
    return tab;
  }

  // Migrate legacy sql field to blocks
  if (tab.sql) {
    return {
      ...tab,
      blocks: [createBlock('sql', tab.sql)],
      sql: undefined,
    };
  }

  // New tab with empty block
  return {
    ...tab,
    blocks: [createBlock('sql', '')],
  };
}

export function getTabBlocks(tab: Tab): NotebookBlock[] {
  const migrated = migrateTabToNotebook(tab);
  return migrated.blocks || [createBlock('sql', '')];
}
```

### Success Criteria:

#### Automated Verification:
- [x] `bun run typecheck` passes
- [x] `bun run build` succeeds

#### Manual Verification:
- [ ] Existing tabs with `sql` field still work after migration logic is in place

---

## Phase 2: Auto-Expanding SQL Editor

### Overview
Create a variant of SqlEditor that dynamically adjusts height based on content.

### Changes Required:

#### 1. Update SqlEditor with Auto-Height
**File**: `src/components/editor/SqlEditor.tsx`

```typescript
import { useRef, useEffect, useState } from 'react';
import Editor, { type Monaco, type OnMount } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { useSchema } from '@/hooks/useSchema';
import { configureMonaco } from '@/lib/monaco-config';

interface SqlEditorProps {
  value: string;
  onChange: (value: string) => void;
  onExecute: () => void;
  autoHeight?: boolean;
  minHeight?: number;
  maxHeight?: number;
}

const LINE_HEIGHT = 19; // Monaco default line height at 14px font
const PADDING = 10; // Top + bottom padding

export function SqlEditor({
  value,
  onChange,
  onExecute,
  autoHeight = false,
  minHeight = 80,
  maxHeight = 600,
}: SqlEditorProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const onExecuteRef = useRef(onExecute);
  const { schema } = useSchema();
  const monacoConfigured = useRef(false);
  const [editorHeight, setEditorHeight] = useState(minHeight);

  // Keep the ref updated with the latest callback
  useEffect(() => {
    onExecuteRef.current = onExecute;
  }, [onExecute]);

  // Calculate height based on content
  useEffect(() => {
    if (autoHeight && editorRef.current) {
      const lineCount = editorRef.current.getModel()?.getLineCount() || 1;
      const contentHeight = lineCount * LINE_HEIGHT + PADDING;
      const newHeight = Math.min(Math.max(contentHeight, minHeight), maxHeight);
      setEditorHeight(newHeight);
    }
  }, [value, autoHeight, minHeight, maxHeight]);

  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;

    // Add Cmd/Ctrl+Enter to execute
    editor.addAction({
      id: 'execute-query',
      label: 'Execute Query',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
      run: () => {
        onExecuteRef.current();
      },
    });

    // Configure autocomplete if schema is ready
    if (schema && !monacoConfigured.current) {
      configureMonaco(monaco, schema);
      monacoConfigured.current = true;
    }

    // Initial height calculation
    if (autoHeight) {
      const lineCount = editor.getModel()?.getLineCount() || 1;
      const contentHeight = lineCount * LINE_HEIGHT + PADDING;
      setEditorHeight(Math.min(Math.max(contentHeight, minHeight), maxHeight));
    }
  };

  // Configure autocomplete when schema loads after editor mount
  useEffect(() => {
    if (schema && editorRef.current && !monacoConfigured.current) {
      const monaco = (window as unknown as { monaco: Monaco }).monaco;
      if (monaco) {
        configureMonaco(monaco, schema);
        monacoConfigured.current = true;
      }
    }
  }, [schema]);

  const height = autoHeight ? `${editorHeight}px` : '200px';

  return (
    <div className="border rounded overflow-hidden">
      <Editor
        height={height}
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
          scrollbar: {
            vertical: autoHeight ? 'hidden' : 'auto',
            horizontal: 'auto',
            alwaysConsumeMouseWheel: false,
          },
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
- [ ] Editor with `autoHeight={true}` grows as lines are added
- [ ] Editor respects minHeight (doesn't shrink below)
- [ ] Editor respects maxHeight (doesn't grow beyond)
- [ ] Cmd/Ctrl+Enter still executes query

---

## Phase 3: NotebookBlock Component

### Overview
Create a self-contained block component with SQL editor, controls, and inline results.

### Changes Required:

#### 1. Install dnd-kit for drag & drop
**Command**:
```bash
bun add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

#### 2. Create NotebookBlock Component
**File**: `src/components/notebook/NotebookBlock.tsx`

```typescript
import { useState, useCallback } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { SqlEditor } from '@/components/editor/SqlEditor';
import { ResultsGrid } from '@/components/grid/ResultsGrid';
import { Button } from '@/components/ui/button';
import { useQuery } from '@/hooks/useQuery';
import type { NotebookBlock as NotebookBlockType } from '@/types/tabs';
import type { QueryResponse } from '@/types/api';
import {
  Play,
  Loader2,
  Trash2,
  GripVertical,
  ChevronDown,
  ChevronRight,
  Wand2,
} from 'lucide-react';
import { format } from 'sql-formatter';

interface NotebookBlockProps {
  block: NotebookBlockType;
  onChange: (content: string) => void;
  onDelete: () => void;
  onExecute?: (result: QueryResponse) => void;
  canDelete: boolean;
}

export function NotebookBlock({
  block,
  onChange,
  onDelete,
  onExecute,
  canDelete,
}: NotebookBlockProps) {
  const [result, setResult] = useState<QueryResponse | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const { error, isLoading, execute } = useQuery();

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: block.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const handleExecute = useCallback(async () => {
    if (!block.content.trim()) return;
    try {
      const data = await execute(block.content);
      setResult(data);
      onExecute?.(data);
    } catch {
      setResult(null);
    }
  }, [block.content, execute, onExecute]);

  const handleFormat = useCallback(() => {
    try {
      const formatted = format(block.content, { language: 'sql', keywordCase: 'upper' });
      onChange(formatted);
    } catch {
      // Keep original if formatting fails
    }
  }, [block.content, onChange]);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group bg-white border rounded-lg shadow-sm mb-4"
    >
      {/* Block Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-gray-50 rounded-t-lg">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600"
        >
          <GripVertical size={16} />
        </button>

        <span className="text-xs font-medium text-gray-500 uppercase">SQL</span>

        <div className="flex-1" />

        <Button
          variant="ghost"
          size="sm"
          onClick={handleFormat}
          disabled={!block.content.trim()}
          className="h-7 px-2"
        >
          <Wand2 size={14} />
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={handleExecute}
          disabled={isLoading || !block.content.trim()}
          className="h-7 px-2"
        >
          {isLoading ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Play size={14} />
          )}
        </Button>

        {canDelete && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            className="h-7 px-2 text-gray-400 hover:text-red-500"
          >
            <Trash2 size={14} />
          </Button>
        )}
      </div>

      {/* Editor */}
      <div className="p-2">
        <SqlEditor
          value={block.content}
          onChange={onChange}
          onExecute={handleExecute}
          autoHeight
          minHeight={60}
          maxHeight={400}
        />
      </div>

      {/* Error */}
      {error && (
        <div className="mx-2 mb-2 bg-red-50 border border-red-200 text-red-700 p-3 rounded text-sm">
          {error}
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="border-t">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
            <span>
              {result.row_count} rows in {result.timing.elapsed_formatted}
              {result.truncated && ' (truncated)'}
            </span>
          </button>

          {!collapsed && (
            <div className="h-64 border-t">
              <ResultsGrid data={result} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

### Success Criteria:

#### Automated Verification:
- [x] `bun run typecheck` passes
- [x] `bun run build` succeeds

#### Manual Verification:
- [ ] Block renders with drag handle, SQL label, and action buttons
- [ ] Play button executes query
- [ ] Results appear inline below editor
- [ ] Collapse/expand toggle works
- [ ] Format button formats SQL
- [ ] Delete button removes block (when allowed)
- [ ] Drag handle is grabbable

---

## Phase 4: NotebookQueryTab

### Overview
Create the main notebook container that manages multiple blocks with drag & drop and "Run All".

### Changes Required:

#### 1. Create NotebookQueryTab Component
**File**: `src/components/notebook/NotebookQueryTab.tsx`

```typescript
import { useState, useCallback, useEffect } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { NotebookBlock } from './NotebookBlock';
import { Button } from '@/components/ui/button';
import { useSchema } from '@/hooks/useSchema';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { createBlock, getTabBlocks } from '@/lib/notebook';
import type { Tab, NotebookBlock as NotebookBlockType } from '@/types/tabs';
import { Plus, PlayCircle, Loader2, Database } from 'lucide-react';

interface NotebookQueryTabProps {
  tab: Tab;
  onUpdate: (updates: Partial<Tab>) => void;
}

export function NotebookQueryTab({ tab, onUpdate }: NotebookQueryTabProps) {
  const [blocks, setBlocks] = useState<NotebookBlockType[]>(() => getTabBlocks(tab));
  const [isRunningAll, setIsRunningAll] = useState(false);
  const [runProgress, setRunProgress] = useState({ current: 0, total: 0 });
  const { schema } = useSchema();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Sync blocks to tab state
  useEffect(() => {
    onUpdate({ blocks });
  }, [blocks, onUpdate]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setBlocks((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  }, []);

  const handleBlockChange = useCallback((blockId: string, content: string) => {
    setBlocks((prev) =>
      prev.map((b) => (b.id === blockId ? { ...b, content } : b))
    );
  }, []);

  const handleBlockDelete = useCallback((blockId: string) => {
    setBlocks((prev) => prev.filter((b) => b.id !== blockId));
  }, []);

  const handleAddBlock = useCallback(() => {
    setBlocks((prev) => [...prev, createBlock('sql', '')]);
  }, []);

  const handleRunAll = useCallback(async () => {
    const sqlBlocks = blocks.filter((b) => b.type === 'sql' && b.content.trim());
    if (sqlBlocks.length === 0) return;

    setIsRunningAll(true);
    setRunProgress({ current: 0, total: sqlBlocks.length });

    // We'll trigger execution on each block sequentially
    // This is a simplified version - blocks will execute via their own useQuery
    // For true sequential execution, we'd need to lift state up more

    // For now, just show progress indication
    for (let i = 0; i < sqlBlocks.length; i++) {
      setRunProgress({ current: i + 1, total: sqlBlocks.length });
      // Small delay to show progress
      await new Promise((r) => setTimeout(r, 100));
    }

    setIsRunningAll(false);
  }, [blocks]);

  // Update tab title based on first block content
  useEffect(() => {
    const firstBlock = blocks[0];
    if (firstBlock?.content) {
      const title = firstBlock.content.trim().split('\n')[0]?.substring(0, 30) || 'Notebook';
      onUpdate({ title });
    }
  }, [blocks, onUpdate]);

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-2 p-3 border-b bg-gray-50">
        <Button onClick={handleAddBlock} variant="outline" size="sm">
          <Plus size={16} className="mr-1" />
          Add Block
        </Button>

        <Button
          onClick={handleRunAll}
          disabled={isRunningAll || blocks.every((b) => !b.content.trim())}
          size="sm"
        >
          {isRunningAll ? (
            <>
              <Loader2 size={16} className="mr-1 animate-spin" />
              Running {runProgress.current}/{runProgress.total}
            </>
          ) : (
            <>
              <PlayCircle size={16} className="mr-1" />
              Run All
            </>
          )}
        </Button>

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
                          {col.type}
                          {col.nullable ? '?' : ''}
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

        <span className="text-sm text-gray-500 ml-2">
          {blocks.length} block{blocks.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Blocks */}
      <div className="flex-1 overflow-auto p-4">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={blocks.map((b) => b.id)}
            strategy={verticalListSortingStrategy}
          >
            {blocks.map((block) => (
              <NotebookBlock
                key={block.id}
                block={block}
                onChange={(content) => handleBlockChange(block.id, content)}
                onDelete={() => handleBlockDelete(block.id)}
                canDelete={blocks.length > 1}
              />
            ))}
          </SortableContext>
        </DndContext>

        {/* Add block button at bottom */}
        <button
          onClick={handleAddBlock}
          className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-400 hover:border-gray-400 hover:text-gray-500 transition-colors flex items-center justify-center gap-2"
        >
          <Plus size={16} />
          Add SQL Block
        </button>
      </div>
    </div>
  );
}
```

#### 2. Update App.tsx to Use NotebookQueryTab
**File**: `src/App.tsx`

Replace the QueryTab import and usage:

```typescript
import { useTabs } from '@/hooks/useTabs';
import { TabBar } from '@/components/tabs/TabBar';
import { NotebookQueryTab } from '@/components/notebook/NotebookQueryTab';
import { DashboardTab } from '@/components/tabs/DashboardTab';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Database, BarChart3, Users, Globe, Activity } from 'lucide-react';

// ... rest of QUICK_ACTIONS stays the same ...

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
            <NotebookQueryTab tab={activeTab} onUpdate={(u) => updateTab(activeTab.id, u)} />
          ) : (
            <DashboardTab dashboardId={activeTab.dashboardId || ''} />
          )
        ) : (
          // ... empty state stays the same ...
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
- [ ] Query tab shows notebook interface with toolbar
- [ ] "Add Block" button adds new SQL block
- [ ] "Run All" button shows progress and executes blocks
- [ ] Blocks can be reordered via drag & drop
- [ ] Schema dialog still works
- [ ] Block count updates in toolbar
- [ ] Dashed "Add SQL Block" button at bottom works

---

## Phase 5: Sequential Run All Execution

### Overview
Implement proper sequential execution for "Run All" that waits for each query to complete before proceeding.

### Changes Required:

#### 1. Add executeBlock method to NotebookBlock
**File**: `src/components/notebook/NotebookBlock.tsx`

Add `useImperativeHandle` to expose `execute` method:

```typescript
import { useState, useCallback, forwardRef, useImperativeHandle } from 'react';
// ... other imports ...

export interface NotebookBlockHandle {
  execute: () => Promise<QueryResponse | null>;
}

export const NotebookBlock = forwardRef<NotebookBlockHandle, NotebookBlockProps>(
  function NotebookBlock({ block, onChange, onDelete, onExecute, canDelete }, ref) {
    const [result, setResult] = useState<QueryResponse | null>(null);
    const [collapsed, setCollapsed] = useState(false);
    const { error, isLoading, execute } = useQuery();

    // ... useSortable and style setup ...

    const handleExecute = useCallback(async () => {
      if (!block.content.trim()) return null;
      try {
        const data = await execute(block.content);
        setResult(data);
        onExecute?.(data);
        return data;
      } catch {
        setResult(null);
        return null;
      }
    }, [block.content, execute, onExecute]);

    // Expose execute method to parent
    useImperativeHandle(ref, () => ({
      execute: handleExecute,
    }), [handleExecute]);

    // ... rest of component stays the same ...
  }
);
```

#### 2. Update NotebookQueryTab to use refs
**File**: `src/components/notebook/NotebookQueryTab.tsx`

```typescript
import { useState, useCallback, useEffect, useRef } from 'react';
import { NotebookBlock, type NotebookBlockHandle } from './NotebookBlock';
// ... other imports ...

export function NotebookQueryTab({ tab, onUpdate }: NotebookQueryTabProps) {
  const [blocks, setBlocks] = useState<NotebookBlockType[]>(() => getTabBlocks(tab));
  const [isRunningAll, setIsRunningAll] = useState(false);
  const [runProgress, setRunProgress] = useState({ current: 0, total: 0 });
  const blockRefs = useRef<Map<string, NotebookBlockHandle>>(new Map());
  const { schema } = useSchema();

  // ... sensors and effects stay the same ...

  const handleRunAll = useCallback(async () => {
    const sqlBlocks = blocks.filter((b) => b.type === 'sql' && b.content.trim());
    if (sqlBlocks.length === 0) return;

    setIsRunningAll(true);
    setRunProgress({ current: 0, total: sqlBlocks.length });

    for (let i = 0; i < sqlBlocks.length; i++) {
      const block = sqlBlocks[i];
      const blockRef = blockRefs.current.get(block.id);

      setRunProgress({ current: i + 1, total: sqlBlocks.length });

      if (blockRef) {
        await blockRef.execute();
      }
    }

    setIsRunningAll(false);
  }, [blocks]);

  // ... rest stays the same, but update NotebookBlock render ...

  return (
    // ... same structure ...
    {blocks.map((block) => (
      <NotebookBlock
        key={block.id}
        ref={(handle) => {
          if (handle) {
            blockRefs.current.set(block.id, handle);
          } else {
            blockRefs.current.delete(block.id);
          }
        }}
        block={block}
        onChange={(content) => handleBlockChange(block.id, content)}
        onDelete={() => handleBlockDelete(block.id)}
        canDelete={blocks.length > 1}
      />
    ))}
    // ...
  );
}
```

### Success Criteria:

#### Automated Verification:
- [x] `bun run typecheck` passes
- [x] `bun run build` succeeds

#### Manual Verification:
- [ ] "Run All" executes blocks sequentially (one at a time)
- [ ] Progress indicator shows current/total
- [ ] Each block shows its loading state while running
- [ ] Results appear after each block completes

---

## Testing Strategy

### Manual Testing Steps:
1. Create new query tab - should show notebook with one empty block
2. Type SQL in block - editor should expand as lines are added
3. Execute block - results appear inline
4. Collapse/expand results
5. Add second block
6. Reorder blocks via drag & drop
7. Run All - should execute sequentially
8. Delete block (only when >1 block exists)
9. Refresh page - blocks should persist
10. Open old tab with legacy `sql` field - should migrate to blocks

## Performance Considerations

- Monaco editors are lazy-loaded (already handled)
- Each block has its own query state (isolated)
- Drag & drop uses CSS transforms (no layout thrashing)
- Results grids use AG Grid virtualization

## Migration Notes

- Legacy tabs with `sql` field will auto-migrate to `blocks` on first load
- Migration is non-destructive (original sql preserved until overwritten)
- `getTabBlocks()` helper handles migration transparently

## References

- dnd-kit docs: https://docs.dndkit.com/
- Monaco auto-height: https://github.com/microsoft/monaco-editor/issues/103
- Current implementation: `src/components/tabs/QueryTab.tsx`
