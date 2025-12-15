import React from 'react';
import { X, DollarSign, Clock, MessageSquare, Database, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
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

function formatCost(cost: number): string {
  return `$${cost.toFixed(2)}`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
  return `${(ms / 3600000).toFixed(1)}h`;
}

function formatTokens(tokens: number): string {
  if (tokens < 1000) return tokens.toString();
  if (tokens < 1000000) return `${(tokens / 1000).toFixed(1)}K`;
  return `${(tokens / 1000000).toFixed(2)}M`;
}

function getTimestampForRange(range: AnalyticsTimeRange): number | undefined {
  if (range === 'all') return undefined;

  const now = Date.now();
  if (range === 'today') {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today.getTime();
  }
  if (range === '7days') {
    return now - 7 * 24 * 60 * 60 * 1000;
  }
  if (range === '30days') {
    return now - 30 * 24 * 60 * 60 * 1000;
  }
  return undefined;
}

export function GlobalAnalyticsModal({ isOpen, onClose }: GlobalAnalyticsModalProps) {
  const [timeRange, setTimeRange] = React.useState<AnalyticsTimeRange>('all');
  const [globalStats, setGlobalStats] = React.useState<GlobalAnalytics | null>(null);
  const [projectStats, setProjectStats] = React.useState<ProjectAnalytics[]>([]);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (isOpen) {
      loadAnalytics();
    }
  }, [isOpen, timeRange]);

  const loadAnalytics = async () => {
    setLoading(true);
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
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const totalTokens = globalStats
    ? globalStats.inputTokens + globalStats.outputTokens
    : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 cursor-pointer"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-2xl bg-[var(--background)] rounded-lg shadow-xl border border-[var(--border)] max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
          <h2 className="text-lg font-semibold">Analytics</h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Time range selector */}
        <div className="px-4 pt-4">
          <div className="flex gap-2">
            {TIME_RANGES.map((range) => (
              <button
                key={range.value}
                onClick={() => setTimeRange(range.value)}
                className={`px-3 py-1.5 text-sm rounded border transition-colors cursor-pointer ${
                  timeRange === range.value
                    ? 'border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--foreground)]'
                    : 'border-[var(--border)] hover:border-[var(--foreground-muted)] hover:bg-[var(--secondary)]'
                }`}
              >
                {range.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="p-4 space-y-6 overflow-y-auto flex-1">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-[var(--foreground-muted)]">Loading...</div>
            </div>
          ) : globalStats ? (
            <>
              {/* Global Stats Grid */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {/* Total Cost */}
                <div className="p-4 rounded-lg border border-[var(--border)] bg-[var(--secondary)]">
                  <div className="flex items-center gap-2 text-[var(--foreground-muted)] mb-1">
                    <DollarSign className="h-4 w-4" />
                    <span className="text-xs uppercase tracking-wide">Total Cost</span>
                  </div>
                  <div className="text-2xl font-semibold">{formatCost(globalStats.totalCost)}</div>
                </div>

                {/* Total Duration */}
                <div className="p-4 rounded-lg border border-[var(--border)] bg-[var(--secondary)]">
                  <div className="flex items-center gap-2 text-[var(--foreground-muted)] mb-1">
                    <Clock className="h-4 w-4" />
                    <span className="text-xs uppercase tracking-wide">Total Time</span>
                  </div>
                  <div className="text-2xl font-semibold">{formatDuration(globalStats.totalDuration)}</div>
                  <div className="text-xs text-[var(--foreground-muted)] mt-1">
                    API: {formatDuration(globalStats.totalApiDuration)}
                  </div>
                </div>

                {/* Sessions */}
                <div className="p-4 rounded-lg border border-[var(--border)] bg-[var(--secondary)]">
                  <div className="flex items-center gap-2 text-[var(--foreground-muted)] mb-1">
                    <MessageSquare className="h-4 w-4" />
                    <span className="text-xs uppercase tracking-wide">Sessions</span>
                  </div>
                  <div className="text-2xl font-semibold">{globalStats.sessionCount}</div>
                  <div className="text-xs text-[var(--foreground-muted)] mt-1">
                    {globalStats.totalTurns} turns
                  </div>
                </div>

                {/* Total Tokens */}
                <div className="p-4 rounded-lg border border-[var(--border)] bg-[var(--secondary)]">
                  <div className="flex items-center gap-2 text-[var(--foreground-muted)] mb-1">
                    <Database className="h-4 w-4" />
                    <span className="text-xs uppercase tracking-wide">Tokens</span>
                  </div>
                  <div className="text-2xl font-semibold">{formatTokens(totalTokens)}</div>
                  <div className="text-xs text-[var(--foreground-muted)] mt-1">
                    In: {formatTokens(globalStats.inputTokens)} / Out: {formatTokens(globalStats.outputTokens)}
                  </div>
                </div>

                {/* Cache Stats */}
                <div className="p-4 rounded-lg border border-[var(--border)] bg-[var(--secondary)]">
                  <div className="flex items-center gap-2 text-[var(--foreground-muted)] mb-1">
                    <TrendingUp className="h-4 w-4" />
                    <span className="text-xs uppercase tracking-wide">Cache</span>
                  </div>
                  <div className="text-2xl font-semibold">{formatTokens(globalStats.cacheReadTokens)}</div>
                  <div className="text-xs text-[var(--foreground-muted)] mt-1">
                    Read / {formatTokens(globalStats.cacheWriteTokens)} written
                  </div>
                </div>

                {/* Average Cost per Session */}
                <div className="p-4 rounded-lg border border-[var(--border)] bg-[var(--secondary)]">
                  <div className="flex items-center gap-2 text-[var(--foreground-muted)] mb-1">
                    <DollarSign className="h-4 w-4" />
                    <span className="text-xs uppercase tracking-wide">Avg/Session</span>
                  </div>
                  <div className="text-2xl font-semibold">
                    {globalStats.sessionCount > 0
                      ? formatCost(globalStats.totalCost / globalStats.sessionCount)
                      : '$0.00'}
                  </div>
                </div>
              </div>

              {/* Project Breakdown */}
              {projectStats.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium mb-3">By Project</h3>
                  <div className="space-y-2">
                    {projectStats.map((project) => (
                      <div
                        key={project.projectId}
                        className="flex items-center justify-between p-3 rounded border border-[var(--border)] bg-[var(--secondary)]"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{project.projectName}</div>
                          <div className="text-xs text-[var(--foreground-muted)]">
                            {project.sessionCount} sessions · {formatTokens(project.inputTokens + project.outputTokens)} tokens
                          </div>
                        </div>
                        <div className="text-right ml-4">
                          <div className="font-semibold">{formatCost(project.totalCost)}</div>
                          <div className="text-xs text-[var(--foreground-muted)]">
                            {formatDuration(project.totalDuration)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Empty state */}
              {globalStats.sessionCount === 0 && (
                <div className="text-center py-8 text-[var(--foreground-muted)]">
                  No analytics data for this time period
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-8 text-[var(--foreground-muted)]">
              No analytics data available
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
