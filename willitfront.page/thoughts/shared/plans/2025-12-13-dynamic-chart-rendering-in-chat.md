# Dynamic Chart Rendering in Chat - Implementation Plan

## Overview

Add a `renderChart` tool that allows the AI to dynamically render charts (bar, line, pie, metric) in chat responses, using the same tool-based rendering pattern as `querySql`. Charts will be rendered inline in chat messages with loading/success states, expandable views, and support for AI-specified customization (title, axis labels).

## Current State Analysis

### Existing Infrastructure

**Message Parts System** (`src/types/tabs.ts:12-16`):
- Parts array supports `text`, `reasoning`, `dynamic-tool`, `tool-result` types
- Tool parts have `toolName`, `toolCallId`, `state`, `input`, `output` fields

**Tool Rendering Pattern** (`src/components/notebook/ChatNotebookTab.tsx`):
- `isToolPart()` (line 76-81) detects tool parts
- `getToolName()` (line 83-91) extracts tool name
- `renderPart()` (line 605-640) routes to tool-specific renderers
- `renderToolCall()` (line 648-816) handles querySql with state machine

**Existing Chart Components** (`src/components/dashboard/Charts.tsx`):
- `BarChartViz` - accepts `QueryResponse` data format
- `LineChartViz` - accepts `QueryResponse` data format
- `MetricCard` - single value display
- All use Recharts v3.5.1 (already installed)

**Missing:**
- `PieChartViz` component
- `renderChart` tool (API side)
- Chart renderer in chat UI

### Key Discoveries

1. `QueryResponse` format (`src/types/api.ts:6-15`): `{ columns: string[], rows: unknown[][], row_count: number, ... }`
2. Chart components auto-detect x/y columns from first two columns
3. Tool output is sent to frontend and cached by `toolCallId`
4. 1000 row limit for charts (from research document)

## Desired End State

After implementation:
1. AI can call `renderChart` with data and optional chart configuration
2. Charts render inline in chat with loading → success state transitions
3. Charts are expandable/collapsible like SQL results
4. AI can specify chart type, or system auto-detects from data shape
5. AI can customize title and axis labels
6. PieChart support added alongside existing bar/line/metric types

### Verification

- AI can respond to "show me a chart of posts by day" with an inline bar chart
- Charts display loading state while rendering
- Charts are expandable/collapsible
- Auto-detection correctly chooses bar for categorical data, line for time series
- Type checking passes: `bun run typecheck`

## What We're NOT Doing

- No chart editing or re-running (unlike SQL blocks)
- No saving charts to notebook (they live in chat messages only)
- No chart data export functionality
- No custom color themes beyond system defaults
- No multi-series charts in this phase
- No chart animations or interactions beyond tooltips

## Implementation Approach

The implementation follows the existing tool pattern:
1. Define tool in `lib/` with Zod schema
2. Register tool in `api/chat.ts`
3. Add output type in `src/types/tabs.ts`
4. Add renderer in `ChatNotebookTab.tsx`

---

## Phase 1: API - Create renderChart Tool

### Overview

Create the `renderChart` tool that accepts chart data and configuration, validates it, and returns the data in a format ready for frontend rendering.

### Changes Required

#### 1. Create renderChart Tool

**File**: `lib/renderChartTool.ts` (new file)

```typescript
import { tool } from 'ai';
import { z } from 'zod';

const MAX_CHART_ROWS = 1000;

const chartTypeSchema = z.enum(['bar', 'line', 'pie', 'metric']).optional();

const renderChartParams = z.object({
  data: z.object({
    columns: z.array(z.string()).describe('Column names'),
    rows: z.array(z.array(z.unknown())).describe('Data rows'),
  }).describe('Chart data in QueryResponse format'),
  chartType: chartTypeSchema.describe('Chart type - if omitted, auto-detected from data shape'),
  title: z.string().optional().describe('Chart title'),
  xAxisLabel: z.string().optional().describe('X-axis label (for bar/line charts)'),
  yAxisLabel: z.string().optional().describe('Y-axis label (for bar/line charts)'),
});

type RenderChartParams = z.infer<typeof renderChartParams>;

/**
 * Auto-detect chart type based on data shape
 */
function detectChartType(columns: string[], rows: unknown[][]): 'bar' | 'line' | 'pie' | 'metric' {
  // Single value = metric
  if (rows.length === 1 && columns.length === 1) {
    return 'metric';
  }

  // Two columns where first is string/category = bar or pie
  if (columns.length === 2 && rows.length > 0) {
    const firstColValues = rows.map(r => r[0]);
    const allStrings = firstColValues.every(v => typeof v === 'string');

    // Small number of categories (2-8) with numeric values = pie
    if (allStrings && rows.length >= 2 && rows.length <= 8) {
      const secondColValues = rows.map(r => r[1]);
      const allNumeric = secondColValues.every(v => typeof v === 'number');
      if (allNumeric) {
        return 'pie';
      }
    }
  }

  // Time-based first column = line
  if (columns.length >= 2 && rows.length > 0) {
    const firstCol = columns[0].toLowerCase();
    const timeIndicators = ['date', 'time', 'day', 'month', 'year', 'hour', 'week', 'quarter'];
    if (timeIndicators.some(t => firstCol.includes(t))) {
      return 'line';
    }

    // Check if first column values look like dates
    const firstValue = rows[0]?.[0];
    if (typeof firstValue === 'string' && !isNaN(Date.parse(firstValue))) {
      return 'line';
    }
  }

  // Default to bar
  return 'bar';
}

export function createRenderChartTool() {
  return tool({
    description: `Render a chart visualization. Use this after querying data with querySql.

Chart types:
- bar: Categorical comparisons (e.g., posts by type, users by karma)
- line: Time series or trends (e.g., posts over time, daily activity)
- pie: Part-to-whole relationships (best for 2-8 categories)
- metric: Single value display (e.g., total count, average)

If chartType is omitted, the system auto-detects based on data shape.
Data should come from a querySql result.`,
    inputSchema: renderChartParams,
    execute: async ({ data, chartType, title, xAxisLabel, yAxisLabel }: RenderChartParams) => {
      try {
        const { columns, rows } = data;

        // Validate data
        if (!columns || columns.length === 0) {
          return {
            success: false as const,
            error: 'No columns provided',
          };
        }

        if (!rows || rows.length === 0) {
          return {
            success: false as const,
            error: 'No data rows provided',
          };
        }

        // Enforce row limit
        const truncatedRows = rows.slice(0, MAX_CHART_ROWS);
        const wasTruncated = rows.length > MAX_CHART_ROWS;

        // Auto-detect chart type if not specified
        const resolvedChartType = chartType || detectChartType(columns, truncatedRows);

        // Validate chart type against data
        if (resolvedChartType === 'metric' && (columns.length !== 1 || truncatedRows.length !== 1)) {
          // Metric requested but data doesn't fit - use first value
          return {
            success: true as const,
            chartType: 'metric' as const,
            title,
            data: {
              columns: [columns[0]],
              rows: [[truncatedRows[0]?.[0] ?? 0]],
              row_count: 1,
            },
            wasTruncated: false,
          };
        }

        return {
          success: true as const,
          chartType: resolvedChartType,
          title,
          xAxisLabel,
          yAxisLabel,
          data: {
            columns,
            rows: truncatedRows,
            row_count: truncatedRows.length,
          },
          wasTruncated,
          originalRowCount: wasTruncated ? rows.length : undefined,
        };
      } catch (error) {
        return {
          success: false as const,
          error: error instanceof Error ? error.message : 'Failed to render chart',
        };
      }
    },
  });
}
```

#### 2. Register Tool in Chat API

**File**: `api/chat.ts`

Add import and register tool:

```typescript
// Add import
import { createRenderChartTool } from '../lib/renderChartTool';

// In handler, after createQuerySqlTool:
const renderChartTool = createRenderChartTool();

// Update tools object:
tools: {
  querySql: querySqlTool,
  renderChart: renderChartTool,
},
```

#### 3. Update System Prompt

**File**: `lib/systemPrompt.ts`

Add chart tool documentation to system prompt:

```typescript
// Add after the Response Formatting Guidelines section:

## Chart Visualization
You can render charts using the renderChart tool after querying data:
1. First use querySql to get the data
2. Then use renderChart with the result data

Chart types:
- **bar**: Best for categorical comparisons (e.g., posts by type)
- **line**: Best for time series/trends (e.g., activity over time)
- **pie**: Best for part-to-whole (2-8 categories only)
- **metric**: Best for single values (e.g., total count)

If you don't specify a chart type, it will be auto-detected from data shape.
You can customize with title, xAxisLabel, and yAxisLabel.

Example flow:
1. querySql({ sql: "SELECT type, COUNT(*) as count FROM hn GROUP BY type" })
2. renderChart({ data: <result>, chartType: "bar", title: "Posts by Type" })
`;
```

### Success Criteria

#### Automated Verification:
- [x] Type checking passes: `bun run typecheck`
- [x] Build succeeds: `bun run build`
- [x] Tool schema validates correctly

#### Manual Verification:
- [ ] AI can call renderChart tool (visible in streamed response)
- [ ] Tool returns expected output structure

---

## Phase 2: UI - Add Chart Type and PieChart Component

### Overview

Add the `RenderChartToolOutput` type and create the missing `PieChartViz` component.

### Changes Required

#### 1. Add Output Type

**File**: `src/types/tabs.ts`

Add after `QuerySqlToolOutput`:

```typescript
export interface RenderChartToolOutput {
  success: boolean;
  error?: string;
  chartType?: 'bar' | 'line' | 'pie' | 'metric';
  title?: string;
  xAxisLabel?: string;
  yAxisLabel?: string;
  data?: {
    columns: string[];
    rows: unknown[][];
    row_count: number;
  };
  wasTruncated?: boolean;
  originalRowCount?: number;
}
```

#### 2. Add PieChartViz Component

**File**: `src/components/dashboard/Charts.tsx`

Add import and component:

```typescript
// Update imports
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Legend
} from 'recharts';

// Add color palette for pie chart
const PIE_COLORS = [
  'var(--hn-orange)',
  '#2563eb', // blue
  '#16a34a', // green
  '#dc2626', // red
  '#9333ea', // purple
  '#ca8a04', // yellow
  '#0891b2', // cyan
  '#be185d', // pink
];

// Add PieChartViz component
export function PieChartViz({ data, title }: ChartProps & { title?: string }) {
  const columns = data?.columns ?? [];
  const rows = data?.rows ?? [];

  if (columns.length < 2 || rows.length === 0) {
    return <div className="h-[300px] flex items-center justify-center text-gray-400">No data</div>;
  }

  const labelKey = columns[0] ?? 'name';
  const valueKey = columns[1] ?? 'value';

  const chartData = rows.map((row, idx) => ({
    name: String(row[0] ?? ''),
    value: Number(row[1] ?? 0),
    fill: PIE_COLORS[idx % PIE_COLORS.length],
  }));

  const total = chartData.reduce((sum, d) => sum + d.value, 0);

  return (
    <div className="w-full">
      {title && <div className="text-sm font-medium text-gray-700 mb-2 text-center">{title}</div>}
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
            outerRadius={100}
            dataKey="value"
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.fill} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: number) => [
              `${value.toLocaleString()} (${((value / total) * 100).toFixed(1)}%)`,
              ''
            ]}
          />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
```

#### 3. Update Existing Charts for Custom Labels

**File**: `src/components/dashboard/Charts.tsx`

Update `BarChartViz` and `LineChartViz` to accept optional labels:

```typescript
// Update ChartProps interface
interface ChartProps {
  data: QueryResponse;
  title?: string;
  xAxisLabel?: string;
  yAxisLabel?: string;
}

// Update BarChartViz
export function BarChartViz({ data, title, xAxisLabel, yAxisLabel }: ChartProps) {
  // ... existing logic ...

  return (
    <div className="w-full">
      {title && <div className="text-sm font-medium text-gray-700 mb-2 text-center">{title}</div>}
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData}>
          <XAxis
            dataKey={labelKey}
            label={xAxisLabel ? { value: xAxisLabel, position: 'bottom', offset: -5 } : undefined}
          />
          <YAxis
            tickFormatter={(v) => formatCompact(v)}
            label={yAxisLabel ? { value: yAxisLabel, angle: -90, position: 'insideLeft' } : undefined}
          />
          <Tooltip formatter={(v: number) => v.toLocaleString()} />
          <Bar dataKey={valueKey} fill="var(--hn-orange)" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// Update LineChartViz similarly
export function LineChartViz({ data, title, xAxisLabel, yAxisLabel }: ChartProps) {
  // ... existing logic ...

  return (
    <div className="w-full">
      {title && <div className="text-sm font-medium text-gray-700 mb-2 text-center">{title}</div>}
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData}>
          <XAxis
            dataKey={xKey}
            tick={{ fontSize: 10 }}
            angle={-45}
            textAnchor="end"
            height={60}
            label={xAxisLabel ? { value: xAxisLabel, position: 'bottom', offset: 40 } : undefined}
          />
          <YAxis
            tickFormatter={(v) => formatCompact(v)}
            label={yAxisLabel ? { value: yAxisLabel, angle: -90, position: 'insideLeft' } : undefined}
          />
          <Tooltip formatter={(v: number) => v.toLocaleString()} />
          <Line type="monotone" dataKey={yKey} stroke="var(--hn-orange)" dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// Update MetricCard
export function MetricCard({ data, label, title }: ChartProps & { label?: string }) {
  // ... existing logic, use title || label for display ...
}
```

### Success Criteria

#### Automated Verification:
- [x] Type checking passes: `bun run typecheck`
- [x] Build succeeds: `bun run build`
- [x] PieChartViz renders without errors

#### Manual Verification:
- [ ] PieChart renders correctly with test data
- [ ] Custom labels appear on bar/line charts

---

## Phase 3: UI - Integrate Chart Rendering in Chat

### Overview

Add the chart tool renderer to `ChatNotebookTab.tsx`, following the same state machine pattern as `renderToolCall` for SQL.

### Changes Required

#### 1. Add Chart Renderer Function

**File**: `src/components/notebook/ChatNotebookTab.tsx`

Add imports and renderer:

```typescript
// Add imports
import { BarChartViz, LineChartViz, PieChartViz, MetricCard } from '@/components/dashboard/Charts';
import type { RenderChartToolOutput } from '@/types/tabs';
import { BarChart3 } from 'lucide-react'; // Add chart icon

// Add after renderToolCall function (around line 816)
const renderChartToolCall = (part: ToolPart, idx: number) => {
  const isExpanded = expandedBlocks.has(part.toolCallId);

  // Running state
  if (part.state === 'input-streaming' || part.state === 'input-available') {
    return (
      <div key={idx} className="mt-3 border border-blue-200 bg-blue-50 rounded-lg overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 bg-blue-100 border-b border-blue-200">
          <BarChart3 size={14} className="text-blue-600" />
          <span className="text-sm font-medium text-blue-800">Rendering Chart</span>
          <Loader2 size={14} className="animate-spin text-blue-600 ml-auto" />
        </div>
      </div>
    );
  }

  // Error state
  if (part.state === 'output-error') {
    return (
      <div key={idx} className="mt-3 border border-red-200 bg-red-50 rounded-lg overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 bg-red-100">
          <XCircle size={14} className="text-red-600" />
          <span className="text-sm font-medium text-red-800">Chart Error</span>
        </div>
        <div className="p-3">
          <p className="text-sm text-red-700">{part.errorText || 'Failed to render chart'}</p>
        </div>
      </div>
    );
  }

  // Output available
  if (part.state === 'output-available') {
    const result = part.output as RenderChartToolOutput;

    if (!result.success) {
      return (
        <div key={idx} className="mt-3 border border-red-200 bg-red-50 rounded-lg overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 bg-red-100">
            <XCircle size={14} className="text-red-600" />
            <span className="text-sm font-medium text-red-800">Chart Error</span>
          </div>
          <div className="p-3">
            <p className="text-sm text-red-700">{result.error}</p>
          </div>
        </div>
      );
    }

    // Success state - render chart
    const chartData = {
      columns: result.data?.columns || [],
      rows: result.data?.rows || [],
      row_count: result.data?.row_count || 0,
      truncated: result.wasTruncated || false,
      timing: { elapsed_seconds: 0, elapsed_formatted: '0ms' },
    };

    const chartTypeLabel = {
      bar: 'Bar Chart',
      line: 'Line Chart',
      pie: 'Pie Chart',
      metric: 'Metric',
    }[result.chartType || 'bar'];

    return (
      <div key={idx} className="mt-3 border border-emerald-200 bg-emerald-50 rounded-lg overflow-hidden">
        {/* Header */}
        <button
          onClick={() => toggleBlockExpanded(part.toolCallId)}
          className="flex items-center gap-2 w-full px-3 py-2 bg-emerald-100 hover:bg-emerald-200 text-left"
        >
          {isExpanded ? <ChevronDown size={14} className="text-emerald-600" /> : <ChevronRight size={14} className="text-emerald-600" />}
          <BarChart3 size={14} className="text-emerald-600" />
          <span className="text-sm font-medium text-emerald-800">
            {result.title || chartTypeLabel}
          </span>
          <span className="text-xs text-emerald-600 ml-auto">
            {result.data?.row_count || 0} data points
            {result.wasTruncated && ` (truncated from ${result.originalRowCount})`}
          </span>
        </button>

        {/* Chart content */}
        {isExpanded && (
          <div className="p-4 bg-white">
            {result.chartType === 'bar' && (
              <BarChartViz
                data={chartData}
                title={result.title}
                xAxisLabel={result.xAxisLabel}
                yAxisLabel={result.yAxisLabel}
              />
            )}
            {result.chartType === 'line' && (
              <LineChartViz
                data={chartData}
                title={result.title}
                xAxisLabel={result.xAxisLabel}
                yAxisLabel={result.yAxisLabel}
              />
            )}
            {result.chartType === 'pie' && (
              <PieChartViz
                data={chartData}
                title={result.title}
              />
            )}
            {result.chartType === 'metric' && (
              <MetricCard
                data={chartData}
                title={result.title}
                label={result.title}
              />
            )}
          </div>
        )}
      </div>
    );
  }

  // Fallback
  return (
    <div key={idx} className="mt-3 border border-gray-200 bg-gray-50 rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-100">
        <BarChart3 size={14} className="text-gray-600" />
        <span className="text-sm font-medium text-gray-700">Chart</span>
        <span className="text-xs text-gray-500 ml-auto">{part.state || 'unknown'}</span>
      </div>
    </div>
  );
};
```

#### 2. Update renderPart to Handle Charts

**File**: `src/components/notebook/ChatNotebookTab.tsx`

Update `renderPart` function (around line 633-640):

```typescript
// In renderPart, after the querySql check:

// Tool part - querySql
if (isToolPart(part) && getToolName(part as ToolPart) === 'querySql') {
  const toolPart = part as ToolPart;
  return renderToolCall(toolPart, idx);
}

// Tool part - renderChart
if (isToolPart(part) && getToolName(part as ToolPart) === 'renderChart') {
  const toolPart = part as ToolPart;
  return renderChartToolCall(toolPart, idx);
}
```

#### 3. Default Charts to Expanded

Update the initial state or auto-expand chart tool calls:

```typescript
// Option 1: Auto-expand chart results when they arrive
// In the component, add effect to auto-expand charts:
useEffect(() => {
  messages.forEach(msg => {
    msg.parts.forEach(part => {
      if (isToolPart(part) && getToolName(part as ToolPart) === 'renderChart') {
        const toolPart = part as ToolPart;
        if (toolPart.state === 'output-available' && !expandedBlocks.has(toolPart.toolCallId)) {
          setExpandedBlocks(prev => new Set([...prev, toolPart.toolCallId]));
        }
      }
    });
  });
}, [messages]);
```

### Success Criteria

#### Automated Verification:
- [x] Type checking passes: `bun run typecheck`
- [x] Build succeeds: `bun run build`
- [ ] No console errors in browser

#### Manual Verification:
- [ ] Chart loading state shows "Rendering Chart" with spinner
- [ ] Successful chart renders inline in chat
- [ ] Chart is expandable/collapsible
- [ ] All chart types (bar, line, pie, metric) render correctly
- [ ] Error states display properly

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Polish and Testing

### Overview

Final polish including verifying the AI uses the tool correctly and edge case handling.

### Changes Required

#### 1. Test AI Flow

Verify the AI correctly:
1. Queries data first with `querySql`
2. Passes result data to `renderChart`
3. Chooses appropriate chart types
4. Uses sensible titles/labels

#### 2. Edge Cases

Handle edge cases:
- Empty data (already handled by chart components)
- Very large datasets (truncation at 1000 rows)
- Invalid chart type for data shape (fallback to detected type)
- Missing columns (error message)

### Success Criteria

#### Automated Verification:
- [ ] Full build passes: `bun run build`
- [ ] Type checking passes: `bun run typecheck`

#### Manual Verification:
- [ ] "Show me posts by type as a chart" produces a bar chart
- [ ] "Chart the daily post trend" produces a line chart
- [ ] "What percentage of posts are stories vs comments?" produces a pie chart
- [ ] "How many total posts are there?" with metric request shows MetricCard
- [ ] Auto-detection works when chart type not specified
- [ ] Custom titles and labels appear correctly

---

## Testing Strategy

### Unit Tests

Not adding unit tests for this feature as the existing patterns don't include them for tool rendering.

### Integration Tests

Manual integration testing via the chat interface.

### Manual Testing Steps

1. Open chat interface
2. Ask "Show me a breakdown of post types as a bar chart"
3. Verify: querySql runs, then renderChart runs, bar chart appears
4. Ask "Show the daily trend of posts over the last month"
5. Verify: Line chart with time-based x-axis
6. Ask "What's the distribution of post types?" (no chart type specified)
7. Verify: Auto-detects and shows appropriate chart (pie for small categories, bar for larger)
8. Test expand/collapse on charts
9. Test error handling with invalid query

## Performance Considerations

- Charts limited to 1000 data points to prevent browser performance issues
- Chart components use `ResponsiveContainer` for efficient resizing
- No re-rendering of charts unless data changes

## References

- Research document: `thoughts/shared/research/2025-12-13-dynamic-generative-ui-chat-graphs.md`
- SQL tool implementation: `lib/querySqlTool.ts`
- Existing charts: `src/components/dashboard/Charts.tsx`
- Message rendering: `src/components/notebook/ChatNotebookTab.tsx`
