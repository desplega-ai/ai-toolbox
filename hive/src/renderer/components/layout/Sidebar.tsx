import React from 'react';
import Fuse from 'fuse.js';
import { PanelLeft, PanelRight, AlertCircle, Circle, XCircle, CheckCircle, Archive, Loader2, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Session } from '../../../shared/types';

interface SidebarProps {
  sessions: Session[];
  currentSessionId: string | null;
  onSessionSelect: (session: Session) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  pendingApprovalCounts?: Record<string, number>;
  hideBackfilledSessions?: boolean;
}

const statusColors: Record<Session['status'], string> = {
  pending: 'text-[var(--foreground-muted)]',
  running: 'text-[var(--success)]',
  waiting: 'text-[var(--warning)]',
  idle: 'text-[var(--primary)]',
  error: 'text-[var(--destructive)]',
  finished: 'text-[var(--success)]',
  archived: 'text-[var(--foreground-muted)]',
};

function SessionStatusIcon({ status, className }: { status: Session['status']; className?: string }) {
  const baseClass = cn('h-3 w-3 flex-shrink-0', statusColors[status], className);

  if (status === 'running') {
    return <Loader2 className={cn(baseClass, 'animate-spin')} />;
  }
  if (status === 'waiting') {
    return <AlertCircle className={baseClass} />;
  }
  if (status === 'error') {
    return <XCircle className={baseClass} />;
  }
  if (status === 'finished') {
    return <CheckCircle className={baseClass} />;
  }
  if (status === 'archived') {
    return <Archive className={baseClass} />;
  }
  // pending, idle
  return <Circle className={baseClass} />;
}

export function Sidebar({
  sessions,
  currentSessionId,
  onSessionSelect,
  isCollapsed,
  onToggleCollapse,
  pendingApprovalCounts = {},
  hideBackfilledSessions = false,
}: SidebarProps) {
  const groupedSessions = React.useMemo(() => {
    // Filter out backfilled sessions if hideBackfilledSessions is enabled
    const filteredSessions = hideBackfilledSessions
      ? sessions.filter((s) => s.metadata?.importedFrom !== 'claude-sdk')
      : sessions;

    // Active: waiting, running, pending, idle, error
    // Done: finished, archived
    const active = filteredSessions.filter((s) =>
      ['waiting', 'running', 'pending', 'idle', 'error'].includes(s.status)
    );
    const done = filteredSessions.filter((s) =>
      ['finished', 'archived'].includes(s.status)
    );

    // Sort active: waiting (with pending approvals) > running > pending/idle/error
    // All sorted by updatedAt desc within each group
    const statusPriority: Record<string, number> = {
      waiting: 0,
      running: 1,
      error: 2,
      pending: 3,
      idle: 4,
    };

    active.sort((a, b) => {
      const priorityA = statusPriority[a.status] ?? 5;
      const priorityB = statusPriority[b.status] ?? 5;
      if (priorityA !== priorityB) return priorityA - priorityB;
      return b.updatedAt - a.updatedAt;
    });

    // Sort done by updatedAt desc
    done.sort((a, b) => b.updatedAt - a.updatedAt);

    return { active, done };
  }, [sessions, hideBackfilledSessions]);

  // Search state
  const [searchQuery, setSearchQuery] = React.useState('');

  // Fuse.js for fuzzy search
  const sessionFuse = React.useMemo(() => {
    const allSessions = [...groupedSessions.active, ...groupedSessions.done];
    return new Fuse(allSessions, {
      keys: ['name'],
      threshold: 0.4,
      ignoreLocation: true,
    });
  }, [groupedSessions.active, groupedSessions.done]);

  // Filter sessions based on search query
  const filteredGroupedSessions = React.useMemo(() => {
    if (!searchQuery.trim()) return groupedSessions;

    const results = sessionFuse.search(searchQuery);
    const matchedIds = new Set(results.map(r => r.item.id));

    return {
      active: groupedSessions.active.filter(s => matchedIds.has(s.id)),
      done: groupedSessions.done.filter(s => matchedIds.has(s.id)),
    };
  }, [groupedSessions, searchQuery, sessionFuse]);

  if (isCollapsed) {
    return (
      <div className="w-full h-full bg-[var(--sidebar)] border-r border-[var(--foreground-muted)]/30 flex items-start justify-center pt-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onToggleCollapse}
          title="Expand sidebar"
        >
          <PanelLeft className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-[var(--sidebar)] border-r border-[var(--foreground-muted)]/30 flex flex-col">
      <div className="p-3 border-b border-[var(--border)] flex items-center justify-between">
        <h2 className="font-semibold text-sm">Sessions</h2>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={onToggleCollapse}
          title="Collapse sidebar"
        >
          <PanelRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Search input */}
      <div className="px-2 py-2 border-b border-[var(--border)]">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--foreground-muted)]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter sessions..."
            className="w-full pl-7 pr-7 py-1.5 text-sm bg-[var(--background)] border border-[var(--border)] rounded focus:outline-none focus:border-[var(--primary)]"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-4">
        {filteredGroupedSessions.active.length > 0 && (
          <SessionGroup
            title="ACTIVE"
            sessions={filteredGroupedSessions.active}
            currentSessionId={currentSessionId}
            onSessionSelect={onSessionSelect}
            pendingApprovalCounts={pendingApprovalCounts}
          />
        )}

        {filteredGroupedSessions.done.length > 0 && (
          <SessionGroup
            title="DONE"
            sessions={filteredGroupedSessions.done}
            currentSessionId={currentSessionId}
            onSessionSelect={onSessionSelect}
            pendingApprovalCounts={pendingApprovalCounts}
          />
        )}

        {filteredGroupedSessions.active.length === 0 && filteredGroupedSessions.done.length === 0 && (
          <p className="text-sm text-[var(--foreground-muted)] text-center py-4">
            {sessions.length === 0 ? 'No sessions yet' : searchQuery ? 'No matching sessions' : 'No sessions (CLI sessions hidden)'}
          </p>
        )}
      </div>

    </div>
  );
}

interface SessionGroupProps {
  title: string;
  sessions: Session[];
  currentSessionId: string | null;
  onSessionSelect: (session: Session) => void;
  pendingApprovalCounts?: Record<string, number>;
}

function SessionGroup({ title, sessions, currentSessionId, onSessionSelect, pendingApprovalCounts = {} }: SessionGroupProps) {
  return (
    <div>
      <h3 className="text-xs font-medium text-[var(--foreground-muted)] mb-1 px-2">
        {title}
      </h3>
      <div className="space-y-0.5">
        {sessions.map((session) => {
          const pendingCount = pendingApprovalCounts[session.id] || 0;
          return (
            <button
              key={session.id}
              onClick={() => onSessionSelect(session)}
              className={cn(
                'w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-left',
                'hover:bg-[var(--sidebar-accent)] transition-colors',
                currentSessionId === session.id && 'bg-[var(--sidebar-accent)]'
              )}
            >
              <SessionStatusIcon status={session.status} />
              <span className="truncate flex-1">{session.name}</span>
              {pendingCount > 0 && (
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[var(--warning)] text-[var(--warning-foreground)] text-xs flex items-center justify-center font-medium">
                  {pendingCount}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
