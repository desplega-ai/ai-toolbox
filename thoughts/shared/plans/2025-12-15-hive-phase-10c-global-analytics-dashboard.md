# Hive Phase 10c: Global Analytics Dashboard

## Overview

Create a global analytics dashboard that aggregates cost, tokens, and usage data across all sessions and projects. Accessible via the TopBar analytics button (BarChart3 icon).

## Current State Analysis

### What Exists:
- **Session-level analytics tab** (Phase 10b) - displays stats for a single session
- **session_results table** - stores `total_cost_usd`, `duration_ms`, `usage_json` per result
- **TopBar analytics button** - exists but handler is `{/* TODO */}` (MainLayout.tsx:411)
- **Aggregation helpers** in SessionView.tsx - `formatDuration`, `formatTokens`, `TokenRow`, `DurationRow`

### Key Files:
- `hive/src/renderer/components/layout/MainLayout.tsx:411` - onAnalytics handler (TODO)
- `hive/src/renderer/components/layout/TopBar.tsx:130-132` - Analytics button
- `hive/src/main/database.ts:86-102` - session_results table schema
- `hive/src/main/database.ts:462-504` - sessionResults API
- `hive/src/renderer/components/views/SessionView.tsx:1052-1297` - Session analytics UI components

## Desired End State

After completing this plan:
1. Clicking the analytics button in TopBar opens a modal dialog
2. Modal shows aggregated stats across ALL sessions (all projects)
3. Stats include: total cost, total tokens, total duration, session count
4. Optional breakdown by project (expandable sections)
5. Time range filter (all time, last 7 days, last 30 days, today)

## What We're NOT Doing

1. **Charts/graphs** - simple summary stats only (charts can be added later)
2. **Export functionality** - no CSV/JSON export
3. **Budget alerts** - no warnings or limits
4. **Per-model breakdown** - aggregate across models only
5. **Historical trends** - no time-series visualization
6. **Persistent dashboard** - modal only, not a dedicated route/view

## Implementation Approach

Two phases:
1. **Phase 1**: Add database query for aggregated stats, create IPC handler
2. **Phase 2**: Create GlobalAnalyticsModal component, wire up TopBar button

---

## Phase 1: Backend - Aggregated Analytics Query

### Overview
Add database queries and IPC handler to fetch aggregated analytics.

### Changes Required:

#### 1. Add Aggregation Queries to Database
**File**: `hive/src/main/database.ts`

Add new prepared statements after existing ones (around line 219):

```typescript
// Global analytics aggregation
getGlobalAnalytics: db.prepare(`
  SELECT
    COUNT(DISTINCT sr.session_id) as session_count,
    COUNT(*) as result_count,
    SUM(sr.total_cost_usd) as total_cost,
    SUM(sr.duration_ms) as total_duration,
    SUM(sr.duration_api_ms) as total_api_duration,
    SUM(sr.num_turns) as total_turns,
    SUM(json_extract(sr.usage_json, '$.input_tokens')) as input_tokens,
    SUM(json_extract(sr.usage_json, '$.output_tokens')) as output_tokens,
    SUM(json_extract(sr.usage_json, '$.cache_read_input_tokens')) as cache_read_tokens,
    SUM(json_extract(sr.usage_json, '$.cache_creation_input_tokens')) as cache_write_tokens
  FROM session_results sr
  WHERE sr.subtype != 'interrupted'
`),
getGlobalAnalyticsByTimeRange: db.prepare(`
  SELECT
    COUNT(DISTINCT sr.session_id) as session_count,
    COUNT(*) as result_count,
    SUM(sr.total_cost_usd) as total_cost,
    SUM(sr.duration_ms) as total_duration,
    SUM(sr.duration_api_ms) as total_api_duration,
    SUM(sr.num_turns) as total_turns,
    SUM(json_extract(sr.usage_json, '$.input_tokens')) as input_tokens,
    SUM(json_extract(sr.usage_json, '$.output_tokens')) as output_tokens,
    SUM(json_extract(sr.usage_json, '$.cache_read_input_tokens')) as cache_read_tokens,
    SUM(json_extract(sr.usage_json, '$.cache_creation_input_tokens')) as cache_write_tokens
  FROM session_results sr
  WHERE sr.subtype != 'interrupted'
    AND sr.created_at >= ?
`),
getAnalyticsByProject: db.prepare(`
  SELECT
    s.project_id as project_id,
    p.name as project_name,
    COUNT(DISTINCT sr.session_id) as session_count,
    COUNT(*) as result_count,
    SUM(sr.total_cost_usd) as total_cost,
    SUM(sr.duration_ms) as total_duration,
    SUM(json_extract(sr.usage_json, '$.input_tokens')) as input_tokens,
    SUM(json_extract(sr.usage_json, '$.output_tokens')) as output_tokens,
    SUM(json_extract(sr.usage_json, '$.cache_read_input_tokens')) as cache_read_tokens,
    SUM(json_extract(sr.usage_json, '$.cache_creation_input_tokens')) as cache_write_tokens
  FROM session_results sr
  JOIN sessions s ON sr.session_id = s.id
  JOIN projects p ON s.project_id = p.id
  WHERE sr.subtype != 'interrupted'
    AND (? IS NULL OR sr.created_at >= ?)
  GROUP BY s.project_id, p.name
  ORDER BY total_cost DESC
`),
```

#### 2. Add Database API Methods
**File**: `hive/src/main/database.ts`

Add to `sessionResults` object (after `getByClaudeSessionId` method, around line 503):

```typescript
getGlobalAnalytics(sinceTimestamp?: number): GlobalAnalytics {
  let row: GlobalAnalyticsRow;
  if (sinceTimestamp) {
    row = statements.getGlobalAnalyticsByTimeRange.get(sinceTimestamp) as GlobalAnalyticsRow;
  } else {
    row = statements.getGlobalAnalytics.get() as GlobalAnalyticsRow;
  }
  return {
    sessionCount: row.session_count || 0,
    resultCount: row.result_count || 0,
    totalCost: row.total_cost || 0,
    totalDuration: row.total_duration || 0,
    totalApiDuration: row.total_api_duration || 0,
    totalTurns: row.total_turns || 0,
    inputTokens: row.input_tokens || 0,
    outputTokens: row.output_tokens || 0,
    cacheReadTokens: row.cache_read_tokens || 0,
    cacheWriteTokens: row.cache_write_tokens || 0,
  };
},

getAnalyticsByProject(sinceTimestamp?: number): ProjectAnalytics[] {
  const rows = statements.getAnalyticsByProject.all(
    sinceTimestamp ?? null,
    sinceTimestamp ?? null
  ) as ProjectAnalyticsRow[];
  return rows.map(row => ({
    projectId: row.project_id,
    projectName: row.project_name,
    sessionCount: row.session_count || 0,
    resultCount: row.result_count || 0,
    totalCost: row.total_cost || 0,
    totalDuration: row.total_duration || 0,
    inputTokens: row.input_tokens || 0,
    outputTokens: row.output_tokens || 0,
    cacheReadTokens: row.cache_read_tokens || 0,
    cacheWriteTokens: row.cache_write_tokens || 0,
  }));
},
```

#### 3. Add Type Definitions
**File**: `hive/src/main/database.ts`

Add after `SessionResultRow` interface (around line 277):

```typescript
interface GlobalAnalyticsRow {
  session_count: number | null;
  result_count: number | null;
  total_cost: number | null;
  total_duration: number | null;
  total_api_duration: number | null;
  total_turns: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cache_read_tokens: number | null;
  cache_write_tokens: number | null;
}

interface ProjectAnalyticsRow {
  project_id: string;
  project_name: string;
  session_count: number | null;
  result_count: number | null;
  total_cost: number | null;
  total_duration: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cache_read_tokens: number | null;
  cache_write_tokens: number | null;
}

export interface GlobalAnalytics {
  sessionCount: number;
  resultCount: number;
  totalCost: number;
  totalDuration: number;
  totalApiDuration: number;
  totalTurns: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface ProjectAnalytics {
  projectId: string;
  projectName: string;
  sessionCount: number;
  resultCount: number;
  totalCost: number;
  totalDuration: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}
```

#### 4. Add IPC Handler
**File**: `hive/src/main/ipc-handlers.ts`

Add after session results handlers (around line 208):

```typescript
// Global analytics
ipcMain.handle('analytics:get-global', (_, { sinceTimestamp }: { sinceTimestamp?: number }) => {
  return database.sessionResults.getGlobalAnalytics(sinceTimestamp);
});

ipcMain.handle('analytics:get-by-project', (_, { sinceTimestamp }: { sinceTimestamp?: number }) => {
  return database.sessionResults.getAnalyticsByProject(sinceTimestamp);
});
```

#### 5. Add Shared Types
**File**: `hive/src/shared/types.ts`

Add at the end of the file:

```typescript
// Global Analytics Types
export interface GlobalAnalytics {
  sessionCount: number;
  resultCount: number;
  totalCost: number;
  totalDuration: number;
  totalApiDuration: number;
  totalTurns: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface ProjectAnalytics {
  projectId: string;
  projectName: string;
  sessionCount: number;
  resultCount: number;
  totalCost: number;
  totalDuration: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export type AnalyticsTimeRange = 'all' | 'today' | '7days' | '30days';
```

### Success Criteria:

#### Automated Verification:
- [x] TypeScript compiles: `cd hive && pnpm exec tsc --noEmit`
- [ ] App starts without errors: `cd hive && pnpm start`

#### Manual Verification:
- [ ] Query works in SQLite: `sqlite3 ~/.hive/hive.db "SELECT SUM(total_cost_usd) FROM session_results WHERE subtype != 'interrupted'"`

---

## Phase 2: Frontend - Global Analytics Modal

### Overview
Create the GlobalAnalyticsModal component and wire it up to the TopBar button.

### Changes Required:

#### 1. Create GlobalAnalyticsModal Component
**File**: `hive/src/renderer/components/views/GlobalAnalyticsModal.tsx` (new file)

```typescript
import React from 'react';
import { X, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { GlobalAnalytics, ProjectAnalytics, AnalyticsTimeRange } from '../../../shared/types';

interface GlobalAnalyticsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const TIME_RANGES: { value: AnalyticsTimeRange; label: string }[] = [
  { value: 'all', label: 'All Time' },
  { value: 'today', label: 'Today' },
  { value: '7days', label: 'Last 7 Days' },
  { value: '30days', label: 'Last 30 Days' },
];

function getTimestampForRange(range: AnalyticsTimeRange): number | undefined {
  if (range === 'all') return undefined;
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  switch (range) {
    case 'today':
      return now - day;
    case '7days':
      return now - 7 * day;
    case '30days':
      return now - 30 * day;
    default:
      return undefined;
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) {
    const mins = Math.floor(ms / 60000);
    const secs = ((ms % 60000) / 1000).toFixed(0);
    return `${mins}m ${secs}s`;
  }
  const hours = Math.floor(ms / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  return `${hours}h ${mins}m`;
}

function formatTokens(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(2)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export function GlobalAnalyticsModal({ isOpen, onClose }: GlobalAnalyticsModalProps) {
  const [timeRange, setTimeRange] = React.useState<AnalyticsTimeRange>('all');
  const [globalStats, setGlobalStats] = React.useState<GlobalAnalytics | null>(null);
  const [projectStats, setProjectStats] = React.useState<ProjectAnalytics[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [expandedProjects, setExpandedProjects] = React.useState<Set<string>>(new Set());

  // Load analytics data
  React.useEffect(() => {
    if (!isOpen) return;

    async function loadAnalytics() {
      setIsLoading(true);
      try {
        const sinceTimestamp = getTimestampForRange(timeRange);
        const [global, byProject] = await Promise.all([
          window.electronAPI.invoke<GlobalAnalytics>('analytics:get-global', { sinceTimestamp }),
          window.electronAPI.invoke<ProjectAnalytics[]>('analytics:get-by-project', { sinceTimestamp }),
        ]);
        setGlobalStats(global);
        setProjectStats(byProject);
      } catch (error) {
        console.error('Failed to load analytics:', error);
      } finally {
        setIsLoading(false);
      }
    }

    loadAnalytics();
  }, [isOpen, timeRange]);

  const toggleProject = (projectId: string) => {
    setExpandedProjects(prev => {
      const next = new Set(prev);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      return next;
    });
  };

  if (!isOpen) return null;

  const totalTokens = globalStats
    ? globalStats.inputTokens + globalStats.outputTokens + globalStats.cacheReadTokens + globalStats.cacheWriteTokens
    : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-[var(--background)] rounded-lg border border-[var(--border)] shadow-xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
          <h2 className="text-lg font-semibold">Global Analytics</h2>
          <div className="flex items-center gap-3">
            <Select
              value={timeRange}
              onChange={(value) => setTimeRange(value as AnalyticsTimeRange)}
              options={TIME_RANGES}
              variant="compact"
            />
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-[var(--foreground-muted)]">Loading analytics...</p>
            </div>
          ) : !globalStats || globalStats.resultCount === 0 ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-[var(--foreground-muted)]">
                No analytics data yet - use Claude to start tracking usage
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Summary Cards */}
              <div>
                <h3 className="text-sm font-medium text-[var(--foreground-muted)] uppercase tracking-wider mb-4">
                  Summary
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <StatCard
                    label="Total Cost"
                    value={`$${globalStats.totalCost.toFixed(4)}`}
                    subtext={`${globalStats.sessionCount} session${globalStats.sessionCount !== 1 ? 's' : ''}`}
                  />
                  <StatCard
                    label="Total Tokens"
                    value={formatTokens(totalTokens)}
                    tooltip={[
                      `Input: ${formatTokens(globalStats.inputTokens)}`,
                      `Output: ${formatTokens(globalStats.outputTokens)}`,
                      globalStats.cacheReadTokens > 0 ? `Cache read: ${formatTokens(globalStats.cacheReadTokens)}` : null,
                      globalStats.cacheWriteTokens > 0 ? `Cache write: ${formatTokens(globalStats.cacheWriteTokens)}` : null,
                    ].filter(Boolean) as string[]}
                  />
                  <StatCard
                    label="Total Duration"
                    value={formatDuration(globalStats.totalDuration)}
                    tooltip={[
                      `Total: ${formatDuration(globalStats.totalDuration)}`,
                      `API time: ${formatDuration(globalStats.totalApiDuration)}`,
                      `Overhead: ${formatDuration(globalStats.totalDuration - globalStats.totalApiDuration)}`,
                    ]}
                  />
                  <StatCard
                    label="Total Turns"
                    value={String(globalStats.totalTurns)}
                    subtext={`${globalStats.resultCount} result${globalStats.resultCount !== 1 ? 's' : ''}`}
                  />
                </div>
              </div>

              {/* Token Breakdown */}
              <div>
                <h3 className="text-sm font-medium text-[var(--foreground-muted)] uppercase tracking-wider mb-3">
                  Token Breakdown
                </h3>
                <div className="bg-[var(--background-secondary)] rounded-lg border border-[var(--border)] divide-y divide-[var(--border)]">
                  <TokenRow label="Input tokens" value={globalStats.inputTokens} total={totalTokens} />
                  <TokenRow label="Output tokens" value={globalStats.outputTokens} total={totalTokens} />
                  {globalStats.cacheReadTokens > 0 && (
                    <TokenRow label="Cache read" value={globalStats.cacheReadTokens} total={totalTokens} />
                  )}
                  {globalStats.cacheWriteTokens > 0 && (
                    <TokenRow label="Cache write" value={globalStats.cacheWriteTokens} total={totalTokens} />
                  )}
                </div>
              </div>

              {/* By Project */}
              {projectStats.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-[var(--foreground-muted)] uppercase tracking-wider mb-3">
                    By Project
                  </h3>
                  <div className="bg-[var(--background-secondary)] rounded-lg border border-[var(--border)] divide-y divide-[var(--border)]">
                    {projectStats.map((project) => {
                      const isExpanded = expandedProjects.has(project.projectId);
                      const projectTotalTokens = project.inputTokens + project.outputTokens + project.cacheReadTokens + project.cacheWriteTokens;
                      return (
                        <div key={project.projectId}>
                          <button
                            onClick={() => toggleProject(project.projectId)}
                            className="w-full flex items-center justify-between px-4 py-3 hover:bg-[var(--background)]/50 transition-colors"
                          >
                            <div className="flex items-center gap-2">
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4 text-[var(--foreground-muted)]" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-[var(--foreground-muted)]" />
                              )}
                              <span className="font-medium">{project.projectName}</span>
                              <span className="text-xs text-[var(--foreground-muted)]">
                                ({project.sessionCount} session{project.sessionCount !== 1 ? 's' : ''})
                              </span>
                            </div>
                            <span className="font-mono text-sm">
                              ${project.totalCost.toFixed(4)}
                            </span>
                          </button>
                          {isExpanded && (
                            <div className="px-4 pb-3 pl-10 space-y-1 text-sm text-[var(--foreground-muted)]">
                              <div className="flex justify-between">
                                <span>Tokens</span>
                                <span className="font-mono">{formatTokens(projectTotalTokens)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>Duration</span>
                                <span className="font-mono">{formatDuration(project.totalDuration)}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  subtext,
  tooltip,
}: {
  label: string;
  value: string;
  subtext?: string;
  tooltip?: string[];
}) {
  return (
    <div className="bg-[var(--background-secondary)] rounded-lg border border-[var(--border)] p-4">
      <div className="text-xs text-[var(--foreground-muted)] mb-1">{label}</div>
      {tooltip ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="text-2xl font-semibold cursor-help">{value}</div>
          </TooltipTrigger>
          <TooltipContent>
            <div className="space-y-0.5">
              {tooltip.map((line, i) => (
                <div key={i}>{line}</div>
              ))}
            </div>
          </TooltipContent>
        </Tooltip>
      ) : (
        <div className="text-2xl font-semibold">{value}</div>
      )}
      {subtext && (
        <div className="text-xs text-[var(--foreground-muted)] mt-1">{subtext}</div>
      )}
    </div>
  );
}

function TokenRow({ label, value, total }: { label: string; value: number; total: number }) {
  const percent = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <span className="text-sm text-[var(--foreground-muted)]">{label}</span>
      <div className="flex items-center gap-3">
        <div className="w-24 h-2 bg-[var(--border)] rounded-full overflow-hidden">
          <div
            className="h-full bg-[var(--primary)] transition-all duration-300"
            style={{ width: `${percent}%` }}
          />
        </div>
        <span className="text-sm font-mono w-16 text-right">{formatTokens(value)}</span>
        <span className="text-xs text-[var(--foreground-muted)] w-12 text-right">
          {percent.toFixed(1)}%
        </span>
      </div>
    </div>
  );
}
```

#### 2. Wire Up TopBar Analytics Button
**File**: `hive/src/renderer/components/layout/MainLayout.tsx`

Add import at the top:
```typescript
import { GlobalAnalyticsModal } from '@/components/views/GlobalAnalyticsModal';
```

Add state for modal visibility (around line 37):
```typescript
const [showAnalyticsModal, setShowAnalyticsModal] = React.useState(false);
```

Update the onAnalytics handler (around line 411):
```typescript
onAnalytics={() => setShowAnalyticsModal(true)}
```

Add modal to the JSX, just before the closing `</TabContext.Provider>` (around line 450):
```typescript
<GlobalAnalyticsModal
  isOpen={showAnalyticsModal}
  onClose={() => setShowAnalyticsModal(false)}
/>
```

### Success Criteria:

#### Automated Verification:
- [x] TypeScript compiles: `cd hive && pnpm exec tsc --noEmit`
- [ ] App starts without errors: `cd hive && pnpm start`

#### Manual Verification:
- [ ] Click analytics button in TopBar - modal opens
- [ ] Modal shows aggregated stats across all sessions
- [ ] Time range filter works (All Time, Today, 7 Days, 30 Days)
- [ ] Per-project breakdown is collapsible and shows correct data
- [ ] Empty state shows "No analytics data yet" message
- [ ] Modal closes when clicking X or backdrop

---

## References

- Predecessor plans:
  - [`2025-12-15-hive-phase-10-analytics-persist-results.md`](./2025-12-15-hive-phase-10-analytics-persist-results.md) - Phase 10a
  - [`2025-12-15-hive-phase-10b-analytics-ui.md`](./2025-12-15-hive-phase-10b-analytics-ui.md) - Phase 10b
- Database schema: `hive/src/main/database.ts:86-102`
- Session analytics UI: `hive/src/renderer/components/views/SessionView.tsx:1052-1297`
- TopBar analytics button: `hive/src/renderer/components/layout/TopBar.tsx:130-132`
