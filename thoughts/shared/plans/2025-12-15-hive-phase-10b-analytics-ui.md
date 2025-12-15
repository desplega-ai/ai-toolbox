# Hive Phase 10b: Analytics Tab UI

## Overview

Replace the Analytics tab placeholder with a working session-level analytics summary. Display aggregated cost, tokens, duration, and turn count from all result messages in the current session.

## Current State Analysis

### What Exists:
- **Result messages are persisted** in `session_results` table (Phase 10a complete)
- **Inline stats** already displayed after each turn in MessageList.tsx:255-349
  - Duration with tooltip (total/API breakdown)
  - Cost in USD ($X.XXXX)
  - Token count with breakdown (input/cache read/cache write/output)
  - Turn count (when > 1)
- **Analytics tab is a placeholder** at SessionView.tsx:725 showing "Coming soon"
- **Data available**: `SDKResultMessage` contains `total_cost_usd`, `duration_ms`, `duration_api_ms`, `num_turns`, `usage`

### Key Files:
- `hive/src/renderer/components/views/SessionView.tsx:725` - Analytics tab render
- `hive/src/renderer/components/views/SessionView.tsx:740-746` - PlaceholderTab component
- `hive/src/renderer/components/session/MessageList.tsx:11-14` - `formatTokens` helper
- `hive/src/shared/sdk-types.ts:66-82` - `SDKResultMessage` type

## Desired End State

After completing this plan:
1. Analytics tab shows aggregated session statistics
2. Statistics include: total cost, total tokens (input/output), total duration, turn count
3. UI matches the style of existing result message stats (tooltips with breakdowns)
4. Data updates as new result messages arrive (reactive to messages prop)

## What We're NOT Doing

1. **Project-level analytics** - aggregating across sessions (future enhancement)
2. **Cost estimation** - predicting cost before sending (future enhancement)
3. **Budget alerts** - warnings when approaching limits (future enhancement)
4. **Export functionality** - CSV/JSON export (explicitly out of scope)
5. **Charts/graphs** - simple summary stats only
6. **Historical trends** - no time-series visualization

## Implementation Approach

Single phase: Create an `AnalyticsTab` component that:
1. Filters messages to find all `result` type messages
2. Aggregates statistics from all results
3. Displays a clean summary card with the totals

---

## Phase 1: Analytics Tab Component

### Overview
Create the AnalyticsTab component and wire it up in SessionView.

### Changes Required:

#### 1. Create AnalyticsTab Component
**File**: `hive/src/renderer/components/views/SessionView.tsx`

Replace the `PlaceholderTab` usage for analytics with a new `AnalyticsTab` component.

Add after the `MetaTab` component (around line 1050):

```typescript
interface SessionAnalytics {
  totalCost: number;
  totalDuration: number;
  totalApiDuration: number;
  totalTurns: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  resultCount: number;
}

function computeSessionAnalytics(messages: SDKMessage[]): SessionAnalytics {
  const stats: SessionAnalytics = {
    totalCost: 0,
    totalDuration: 0,
    totalApiDuration: 0,
    totalTurns: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    resultCount: 0,
  };

  for (const msg of messages) {
    if (msg.type !== 'result') continue;
    const result = msg as SDKResultMessage;

    // Skip interrupted results (they don't have stats)
    if (result.subtype === 'interrupted') continue;

    stats.resultCount++;
    stats.totalCost += result.total_cost_usd || 0;
    stats.totalDuration += result.duration_ms || 0;
    stats.totalApiDuration += result.duration_api_ms || 0;
    stats.totalTurns += result.num_turns || 1;

    if (result.usage) {
      stats.inputTokens += result.usage.input_tokens || 0;
      stats.outputTokens += result.usage.output_tokens || 0;
      stats.cacheReadTokens += result.usage.cache_read_input_tokens || 0;
      stats.cacheWriteTokens += result.usage.cache_creation_input_tokens || 0;
    }
  }

  return stats;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = ((ms % 60000) / 1000).toFixed(0);
  return `${mins}m ${secs}s`;
}

function formatTokens(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(2)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function AnalyticsTab({ messages }: { messages: SDKMessage[] }) {
  const stats = React.useMemo(() => computeSessionAnalytics(messages), [messages]);

  const totalTokens = stats.inputTokens + stats.outputTokens + stats.cacheReadTokens + stats.cacheWriteTokens;

  if (stats.resultCount === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-[var(--foreground-muted)]">
          No analytics data yet - send a message to start
        </p>
      </div>
    );
  }

  const statCards: Array<{
    label: string;
    value: string;
    subtext?: string;
    tooltip?: string[];
  }> = [
    {
      label: 'Total Cost',
      value: `$${stats.totalCost.toFixed(4)}`,
      subtext: stats.resultCount > 1 ? `across ${stats.resultCount} turns` : undefined,
    },
    {
      label: 'Total Tokens',
      value: formatTokens(totalTokens),
      tooltip: [
        `Input: ${formatTokens(stats.inputTokens)}`,
        `Output: ${formatTokens(stats.outputTokens)}`,
        stats.cacheReadTokens > 0 ? `Cache read: ${formatTokens(stats.cacheReadTokens)}` : null,
        stats.cacheWriteTokens > 0 ? `Cache write: ${formatTokens(stats.cacheWriteTokens)}` : null,
      ].filter(Boolean) as string[],
    },
    {
      label: 'Total Duration',
      value: formatDuration(stats.totalDuration),
      tooltip: [
        `Total: ${formatDuration(stats.totalDuration)}`,
        `API time: ${formatDuration(stats.totalApiDuration)}`,
        `Overhead: ${formatDuration(stats.totalDuration - stats.totalApiDuration)}`,
      ],
    },
    {
      label: 'Turns',
      value: String(stats.totalTurns),
      subtext: stats.resultCount !== stats.totalTurns
        ? `(${stats.resultCount} result${stats.resultCount > 1 ? 's' : ''})`
        : undefined,
    },
  ];

  return (
    <div className="h-full overflow-auto p-4">
      <div className="max-w-2xl space-y-6">
        {/* Summary Header */}
        <div>
          <h3 className="text-sm font-medium text-[var(--foreground-muted)] uppercase tracking-wider mb-4">
            Session Analytics
          </h3>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {statCards.map((card) => (
              <div
                key={card.label}
                className="bg-[var(--background-secondary)] rounded-lg border border-[var(--border)] p-4"
              >
                <div className="text-xs text-[var(--foreground-muted)] mb-1">
                  {card.label}
                </div>
                {card.tooltip ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="text-2xl font-semibold cursor-help">
                        {card.value}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <div className="space-y-0.5">
                        {card.tooltip.map((line, i) => (
                          <div key={i}>{line}</div>
                        ))}
                      </div>
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <div className="text-2xl font-semibold">{card.value}</div>
                )}
                {card.subtext && (
                  <div className="text-xs text-[var(--foreground-muted)] mt-1">
                    {card.subtext}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Token Breakdown */}
        <div>
          <h3 className="text-sm font-medium text-[var(--foreground-muted)] uppercase tracking-wider mb-3">
            Token Breakdown
          </h3>
          <div className="bg-[var(--background-secondary)] rounded-lg border border-[var(--border)] divide-y divide-[var(--border)]">
            <TokenRow label="Input tokens" value={stats.inputTokens} total={totalTokens} />
            <TokenRow label="Output tokens" value={stats.outputTokens} total={totalTokens} />
            {stats.cacheReadTokens > 0 && (
              <TokenRow label="Cache read" value={stats.cacheReadTokens} total={totalTokens} />
            )}
            {stats.cacheWriteTokens > 0 && (
              <TokenRow label="Cache write" value={stats.cacheWriteTokens} total={totalTokens} />
            )}
          </div>
        </div>

        {/* Duration Breakdown */}
        <div>
          <h3 className="text-sm font-medium text-[var(--foreground-muted)] uppercase tracking-wider mb-3">
            Duration Breakdown
          </h3>
          <div className="bg-[var(--background-secondary)] rounded-lg border border-[var(--border)] divide-y divide-[var(--border)]">
            <DurationRow
              label="API time"
              value={stats.totalApiDuration}
              total={stats.totalDuration}
            />
            <DurationRow
              label="Overhead"
              value={stats.totalDuration - stats.totalApiDuration}
              total={stats.totalDuration}
            />
          </div>
        </div>
      </div>
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

function DurationRow({ label, value, total }: { label: string; value: number; total: number }) {
  const percent = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <span className="text-sm text-[var(--foreground-muted)]">{label}</span>
      <div className="flex items-center gap-3">
        <div className="w-24 h-2 bg-[var(--border)] rounded-full overflow-hidden">
          <div
            className="h-full bg-[var(--success)] transition-all duration-300"
            style={{ width: `${percent}%` }}
          />
        </div>
        <span className="text-sm font-mono w-16 text-right">{formatDuration(value)}</span>
        <span className="text-xs text-[var(--foreground-muted)] w-12 text-right">
          {percent.toFixed(1)}%
        </span>
      </div>
    </div>
  );
}
```

#### 2. Update Analytics Tab Render
**File**: `hive/src/renderer/components/views/SessionView.tsx`

Change line 725 from:
```typescript
{activeTab === 'analytics' && <PlaceholderTab title="Analytics" />}
```

To:
```typescript
{activeTab === 'analytics' && <AnalyticsTab messages={messages} />}
```

#### 3. Add SDKResultMessage Import
**File**: `hive/src/renderer/components/views/SessionView.tsx`

Update the import at line 16 to include `SDKResultMessage`:
```typescript
import type { SDKMessage, PermissionRequest, SDKStreamEvent, SDKResultMessage } from '../../../shared/sdk-types';
```

---

## Success Criteria

### Automated Verification:
- [x] TypeScript compiles: `cd hive && pnpm exec tsc --noEmit`
- [ ] App starts without errors: `cd hive && pnpm start`

### Manual Verification:
- [ ] Open a session with existing messages
- [ ] Click the Analytics tab - see aggregated stats
- [ ] Total cost matches sum of inline costs
- [ ] Token breakdown shows correct percentages
- [ ] Duration breakdown shows API vs overhead
- [ ] Send a new message - stats update after completion
- [ ] Empty session shows "No analytics data yet" message

---

## References

- Predecessor plan: [`2025-12-15-hive-phase-10-analytics-persist-results.md`](./2025-12-15-hive-phase-10-analytics-persist-results.md)
- Foundation plan: [`2025-12-15-hive-v0.1-foundation-setup.md`](./2025-12-15-hive-v0.1-foundation-setup.md) (Phase 10 section)
- Result message type: `hive/src/shared/sdk-types.ts:66-82`
- Inline stats rendering: `hive/src/renderer/components/session/MessageList.tsx:255-349`
