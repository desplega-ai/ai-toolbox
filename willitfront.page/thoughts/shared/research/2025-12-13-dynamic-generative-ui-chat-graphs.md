---
date: 2025-12-13T15:55:00-08:00
researcher: Claude
git_commit: 7d43a24c0c1d4234a45b93632627c5d3eed61203
branch: main
repository: willitfront.page
topic: "Dynamic/Generative UI for Chat Responses - Graph Rendering"
tags: [research, codebase, chat, generative-ui, charts, recharts, tool-rendering]
status: complete
last_updated: 2025-12-13
last_updated_by: Claude
---

# Research: Dynamic/Generative UI for Chat Responses - Graph Rendering

**Date**: 2025-12-13T15:55:00-08:00
**Researcher**: Claude
**Git Commit**: 7d43a24c0c1d4234a45b93632627c5d3eed61203
**Branch**: main
**Repository**: willitfront.page

## Research Question

How to support dynamic (generative UI) on chat responses so that the AI can return graphs (line, pie, bar, etc.) dynamically, rendered the same way SQL blocks are rendered.

## Summary

The codebase is already well-structured to support dynamic graph rendering. Key findings:

1. **Recharts v3.5.1 is already installed** with existing `BarChartViz`, `LineChartViz`, and `MetricCard` components
2. **Tool-based rendering pattern exists** for SQL queries, providing a clear extension pattern
3. **Message part architecture** uses a `parts[]` array that supports multiple content types
4. **No major architectural changes needed** - the system is designed for tool extensibility

## Detailed Findings

### Chat Message Architecture

#### Message Structure (`src/types/tabs.ts:5-16`)

Messages use the `UIMessage` format from `@ai-sdk/react` with a parts-based structure:

```typescript
export interface Message {
  id: string;
  role: 'user' | 'assistant';
  parts: MessagePart[];
  createdAt?: Date | string;
}

export type MessagePart =
  | { type: 'text'; text: string }
  | { type: 'reasoning'; text: string }
  | { type: 'dynamic-tool'; toolName: string; toolCallId: string; state: string; input?: unknown; output?: unknown; errorText?: string }
  | { type: 'tool-result'; toolName: string; result: unknown };
```

The `dynamic-tool` and `tool-result` types are the extension points for adding new tool-based UI renderers.

#### Tool Part Detection (`src/components/notebook/ChatNotebookTab.tsx:66-91`)

```typescript
interface ToolPart {
  type: string;
  toolName?: string;
  toolCallId: string;
  state?: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
}

function isToolPart(part: unknown): part is ToolPart {
  if (typeof part !== 'object' || part === null || !('type' in part)) return false;
  const p = part as { type: string; toolCallId?: string };
  return (p.type === 'dynamic-tool' || p.type.startsWith('tool-')) && !!p.toolCallId;
}

function getToolName(part: ToolPart): string {
  if (part.toolName) return part.toolName;
  if (part.type.startsWith('tool-')) return part.type.slice(5);
  return 'unknown';
}
```

This detection system supports both `dynamic-tool` type (with explicit `toolName`) and `tool-{name}` type formats.

### Message Part Rendering Router

#### `renderPart()` Function (`src/components/notebook/ChatNotebookTab.tsx:605-640`)

```typescript
const renderPart = (part: any, idx: number, isUser: boolean) => {
  // Text part - renders with Markdown
  if (isTextUIPart(part)) {
    const text = preprocessText(part.text);
    if (!text.trim()) return null;
    if (isUser) {
      return <div key={idx} className="whitespace-pre-wrap">{text}</div>;
    }
    return (
      <div key={idx} className="prose prose-sm max-w-none ...">
        <Markdown remarkPlugins={[remarkGfm, remarkBreaks]} components={markdownComponents}>
          {text}
        </Markdown>
      </div>
    );
  }

  // Reasoning part - collapsible thinking block
  if (typeof part === 'object' && part !== null && 'type' in part && part.type === 'reasoning') {
    const reasoningPart = part as { type: 'reasoning'; text: string };
    return <ReasoningBlock key={idx} reasoning={reasoningPart.text} />;
  }

  // Tool part - routes to tool-specific renderer
  if (isToolPart(part) && getToolName(part as ToolPart) === 'querySql') {
    const toolPart = part as ToolPart;
    return renderToolCall(toolPart, idx);
  }

  // Extension point: add more tool handlers here
  return null;
};
```

**Extension Point**: New chart tools would be added as additional `if` conditions checking `getToolName(part) === 'renderChart'` (or similar).

### SQL Tool Rendering Pattern

#### `renderToolCall()` State Machine (`src/components/notebook/ChatNotebookTab.tsx:648-816`)

The SQL tool renderer handles multiple states with distinct visual presentations:

| State | Visual | Description |
|-------|--------|-------------|
| `input-streaming` / `input-available` | Blue background, spinner | Query running |
| `output-error` | Red background, expandable | Query failed |
| `output-available` (success=false) | Red background | API error |
| `output-available` (success=true) | Green background | Success with results |

Key patterns:
- **Color-coded headers** (blue=running, red=error, green=success)
- **Expandable/collapsible content** via `expandedBlocks` Set state
- **Preview vs full data** toggle for large results
- **Loading indicator** during streaming

Example success state rendering:
```typescript
if (part.state === 'output-available') {
  const result = part.output as QuerySqlToolOutput;

  if (!result.success) { /* error UI */ }

  // Success state
  return (
    <div key={idx} className="mt-3 border border-green-200 bg-green-50 rounded-lg overflow-hidden">
      {/* Header with status icon and timing */}
      <div className="flex items-center gap-2 px-3 py-2 bg-green-100 border-b border-green-200">
        <CheckCircle size={14} className="text-green-600" />
        <span className="text-sm font-medium text-green-800">SQL Query</span>
        {result.timing && <span className="text-xs text-green-600 ml-auto">{result.timing.elapsed_formatted}</span>}
      </div>
      {/* SQL preview */}
      <div className="p-3 border-b border-green-200">
        <pre className="text-xs text-green-900 bg-green-100/50 p-2 rounded overflow-x-auto">{result.sql}</pre>
      </div>
      {/* Expandable results grid */}
      <button onClick={() => toggleBlockExpanded(part.toolCallId)} className="...">
        {isExpanded ? <ChevronDown /> : <ChevronRight />}
        <span>{result.fullData?.rowCount || 0} rows</span>
      </button>
      {isExpanded && (
        <div className="h-64 border-t border-green-200">
          <ResultsGrid data={{ columns: displayData.columns, rows: displayData.rows, ... }} />
        </div>
      )}
    </div>
  );
}
```

### Existing Chart Components

#### Location: `src/components/dashboard/Charts.tsx`

Three chart components already exist using Recharts:

**1. BarChartViz**
```typescript
export function BarChartViz({ data }: ChartProps) {
  const columns = data?.columns ?? [];
  const rows = data?.rows ?? [];

  const chartData = rows.map(row => {
    const obj: Record<string, unknown> = {};
    columns.forEach((col, i) => {
      // Auto-formats day/hour labels
      if (col === 'day' && typeof row[i] === 'number') {
        obj[col] = DAY_NAMES[row[i] as number] ?? row[i];
      } else if (col === 'hour' && typeof row[i] === 'number') {
        obj[col] = formatHour(row[i] as number);
      } else {
        obj[col] = row[i];
      }
    });
    return obj;
  });

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={chartData}>
        <XAxis dataKey={labelKey} />
        <YAxis tickFormatter={(v) => formatCompact(v)} />
        <Tooltip formatter={(v: number) => v.toLocaleString()} />
        <Bar dataKey={valueKey} fill="var(--hn-orange)" />
      </BarChart>
    </ResponsiveContainer>
  );
}
```

**2. LineChartViz**
```typescript
export function LineChartViz({ data }: ChartProps) {
  // Similar structure, with timestamp formatting for month/time columns
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={chartData}>
        <XAxis dataKey={xKey} tick={{ fontSize: 10 }} angle={-45} textAnchor="end" height={60} />
        <YAxis tickFormatter={(v) => formatCompact(v)} />
        <Tooltip formatter={(v: number) => v.toLocaleString()} />
        <Line type="monotone" dataKey={yKey} stroke="var(--hn-orange)" dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
```

**3. MetricCard**
```typescript
export function MetricCard({ data, label }: ChartProps & { label?: string }) {
  const value = data?.rows?.[0]?.[0] ?? 0;
  // Formats numbers compactly (1.5k, 2.3M) or dates nicely
  return (
    <div className="bg-white p-6 rounded-lg border text-center h-full flex flex-col justify-center">
      <div className="font-bold text-[var(--hn-orange)] text-4xl">{displayValue}</div>
      {label && <div className="text-gray-500 mt-1">{label}</div>}
    </div>
  );
}
```

**Input Format**: All charts accept `QueryResponse`:
```typescript
interface ChartProps {
  data: QueryResponse;  // { columns: string[], rows: unknown[][], row_count: number, ... }
}
```

### Data Flow: API to UI

1. **User sends message** via `useChat` hook from `@ai-sdk/react`
2. **API streams response** with tool calls appearing as message parts
3. **Tool parts have states**: `input-streaming` → `input-available` → `output-available`
4. **`renderPart()` routes** each part to appropriate renderer based on type/toolName
5. **Tool output displayed** with state-specific UI (loading, error, success)

### Dependencies

- `recharts: ^3.5.1` - Already installed
- `@ai-sdk/react` - Chat hook with streaming tool support
- `react-markdown` - Text part rendering
- `@monaco-editor/react` - Code block rendering
- `ag-grid-react` - Results table rendering

## Code References

| File | Line | Description |
|------|------|-------------|
| `src/components/notebook/ChatNotebookTab.tsx` | 66-91 | Tool part type guards and detection |
| `src/components/notebook/ChatNotebookTab.tsx` | 605-640 | `renderPart()` - message part router |
| `src/components/notebook/ChatNotebookTab.tsx` | 648-816 | `renderToolCall()` - SQL tool renderer |
| `src/components/dashboard/Charts.tsx` | 24-58 | `BarChartViz` component |
| `src/components/dashboard/Charts.tsx` | 61-98 | `LineChartViz` component |
| `src/components/dashboard/Charts.tsx` | 100-129 | `MetricCard` component |
| `src/types/tabs.ts` | 12-16 | `MessagePart` type definition |
| `src/types/tabs.ts` | 18-39 | `QuerySqlToolOutput` type |
| `lib/querySqlTool.ts` | 41-111 | SQL tool implementation (API side) |

## Architecture Documentation

### Current Tool System Pattern

```
┌─────────────────────────────────────────────────────────────┐
│                      API Layer                               │
│  ┌─────────────┐                                            │
│  │ streamText  │ ──→ tools: { querySql, ... }               │
│  └─────────────┘                                            │
└───────────────────────────┬─────────────────────────────────┘
                            │ SSE stream
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    useChat Hook                              │
│  message.parts[] = [                                        │
│    { type: 'text', text: '...' },                           │
│    { type: 'dynamic-tool', toolName: 'querySql', ... },     │
│  ]                                                          │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                   renderPart()                               │
│  ┌────────────────┐  ┌───────────────┐  ┌────────────────┐  │
│  │ isTextUIPart?  │  │ type=reason?  │  │ isToolPart?    │  │
│  │ → Markdown     │  │ → Reasoning   │  │ → toolName?    │  │
│  │                │  │   Block       │  │   → renderer   │  │
│  └────────────────┘  └───────────────┘  └────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Extension Pattern for New Tools

To add a new tool (e.g., `renderChart`):

1. **API: Define tool** in `lib/renderChartTool.ts`
2. **API: Register tool** in `api/chat.ts` tools object
3. **Types: Add output type** in `src/types/tabs.ts`
4. **UI: Add condition** in `renderPart()` checking `getToolName(part) === 'renderChart'`
5. **UI: Create renderer** function similar to `renderToolCall()`

## Open Questions

1. **Pie charts**: Recharts has `PieChart` but no component exists yet - would need to add `PieChartViz`
  Yes
2. **Chart type selection**: Should AI decide chart type, or should there be heuristics based on data shape?
  Yes, heuristics
3. **Interactive features**: Should charts be expandable/collapsible like SQL results?
  Yes
4. **Data size limits**: What's the max rows to render in a chart vs show in table?
  Limit to 1000 rows for charts

## Related Research

- `thoughts/shared/research/2025-12-12-hn-chat-vercel-ai-gateway.md` - Chat architecture details
- `thoughts/shared/plans/2025-12-12-chat-integration-vercel-ai-gateway.md` - Original chat implementation plan
