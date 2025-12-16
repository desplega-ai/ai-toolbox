import React from 'react';
import { ChevronDown, ChevronRight, Check, X, Loader2, Terminal, FileText, Pencil, Search, FolderOpen, Shield, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { InlineFileLink } from '@/components/ui/file-link';
import type { ToolGroup } from '@/lib/message-grouping';
import type { PermissionRequest } from '../../../shared/sdk-types';
import { SubagentConversation } from './SubagentConversation';

function getToolIcon(toolName: string) {
  switch (toolName) {
    case 'Bash':
      return Terminal;
    case 'Write':
      return FileText;
    case 'Edit':
      return Pencil;
    case 'Read':
      return FileText;
    case 'Grep':
      return Search;
    case 'Glob':
      return FolderOpen;
    case 'Task':
      return Users;
    default:
      return Shield;
  }
}

function getToolSummary(toolName: string, input: unknown): string {
  const inp = input as Record<string, unknown>;
  switch (toolName) {
    case 'Write':
    case 'Read':
    case 'Edit':
      return String(inp.file_path || '');
    case 'Bash':
      const cmd = String(inp.command || '');
      return cmd.length > 50 ? cmd.slice(0, 50) + '...' : cmd;
    case 'Glob':
      return String(inp.pattern || '');
    case 'Grep':
      return `"${String(inp.pattern || '')}"`;
    case 'Task':
      return String(inp.description || inp.subagent_type || '');
    default:
      return '';
  }
}

function ToolDetails({ toolName, input }: { toolName: string; input: Record<string, unknown> }) {
  switch (toolName) {
    case 'Write':
      return (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-[var(--foreground-muted)]">File:</span>
            <InlineFileLink path={input.file_path as string} />
          </div>
          <div className="text-xs text-[var(--foreground-muted)]">Content:</div>
          <pre className="text-xs bg-[var(--background)] p-2 overflow-auto max-h-40 font-mono border border-[var(--border)]">
            {String(input.content || '').slice(0, 1000)}
            {String(input.content || '').length > 1000 && '\n... (truncated)'}
          </pre>
        </div>
      );

    case 'Edit':
      return (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-[var(--foreground-muted)]">File:</span>
            <InlineFileLink path={input.file_path as string} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-xs text-[var(--destructive)] mb-1">- Remove:</div>
              <pre className="text-xs bg-[var(--destructive)]/10 p-2 overflow-auto max-h-24 font-mono border border-[var(--destructive)]/20">
                {String(input.old_string || '').slice(0, 300)}
              </pre>
            </div>
            <div>
              <div className="text-xs text-[var(--success)] mb-1">+ Add:</div>
              <pre className="text-xs bg-[var(--success)]/10 p-2 overflow-auto max-h-24 font-mono border border-[var(--success)]/20">
                {String(input.new_string || '').slice(0, 300)}
              </pre>
            </div>
          </div>
        </div>
      );

    case 'Bash':
      return (
        <div className="space-y-2">
          {typeof input.description === 'string' && input.description && (
            <div className="text-xs text-[var(--foreground-muted)]">{input.description}</div>
          )}
          <pre className="text-xs bg-[var(--background)] p-2 overflow-auto max-h-24 font-mono border border-[var(--border)]">
            <span className="text-[var(--success)]">$</span> {String(input.command || '')}
          </pre>
        </div>
      );

    case 'Read':
      return (
        <div className="flex items-center gap-2 text-xs flex-wrap">
          <span className="text-[var(--foreground-muted)]">File:</span>
          <InlineFileLink path={String(input.file_path || '')} line={typeof input.offset === 'number' ? input.offset : undefined} />
          {typeof input.offset === 'number' && <span className="text-[var(--foreground-muted)]">from line {input.offset}</span>}
          {typeof input.limit === 'number' && <span className="text-[var(--foreground-muted)]">({input.limit} lines)</span>}
        </div>
      );

    case 'Glob':
      return (
        <div className="space-y-1 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-[var(--foreground-muted)]">Pattern:</span>
            <code className="bg-[var(--secondary)] px-1.5 py-0.5">{String(input.pattern || '')}</code>
          </div>
          {typeof input.path === 'string' && input.path && (
            <div className="flex items-center gap-2">
              <span className="text-[var(--foreground-muted)]">In:</span>
              <InlineFileLink path={input.path} />
            </div>
          )}
        </div>
      );

    case 'Grep':
      return (
        <div className="space-y-1 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-[var(--foreground-muted)]">Search:</span>
            <code className="bg-[var(--secondary)] px-1.5 py-0.5">{String(input.pattern || '')}</code>
          </div>
          {typeof input.path === 'string' && input.path && (
            <div className="flex items-center gap-2">
              <span className="text-[var(--foreground-muted)]">In:</span>
              <InlineFileLink path={input.path} />
            </div>
          )}
        </div>
      );

    case 'Task':
      return (
        <div className="space-y-2 text-xs">
          {typeof input.description === 'string' && (
            <div className="flex items-center gap-2">
              <span className="text-[var(--foreground-muted)]">Task:</span>
              <span>{input.description}</span>
            </div>
          )}
          {typeof input.subagent_type === 'string' && (
            <div className="flex items-center gap-2">
              <span className="text-[var(--foreground-muted)]">Agent:</span>
              <code className="bg-[var(--secondary)] px-1.5 py-0.5">{input.subagent_type}</code>
            </div>
          )}
          {typeof input.prompt === 'string' && (
            <div>
              <div className="text-[var(--foreground-muted)] mb-1">Prompt:</div>
              <pre className="bg-[var(--background)] p-2 overflow-auto max-h-32 font-mono border border-[var(--border)]">
                {input.prompt.slice(0, 500)}
                {input.prompt.length > 500 && '\n... (truncated)'}
              </pre>
            </div>
          )}
        </div>
      );

    default:
      return (
        <pre className="text-xs bg-[var(--background)] p-2 overflow-auto max-h-32 font-mono border border-[var(--border)]">
          {JSON.stringify(input, null, 2).slice(0, 500)}
        </pre>
      );
  }
}

function ToolResultDisplay({ content, isError }: { content: unknown; isError: boolean }) {
  const [expanded, setExpanded] = React.useState(false);

  let displayContent = '';
  if (typeof content === 'string') {
    displayContent = content;
  } else if (Array.isArray(content)) {
    displayContent = content
      .map(block => {
        if (typeof block === 'string') return block;
        if (block && typeof block === 'object' && 'text' in block) {
          return String(block.text);
        }
        return JSON.stringify(block);
      })
      .join('\n');
  } else if (content && typeof content === 'object') {
    displayContent = JSON.stringify(content, null, 2);
  } else {
    displayContent = String(content ?? '');
  }

  // Hide permission pending results
  if (displayContent.includes('PERMISSION_DENIED') || displayContent === '<hive:permission-pending/>') {
    return null;
  }

  const truncated = displayContent.length > 200;
  const preview = truncated ? displayContent.slice(0, 200) + '...' : displayContent;

  return (
    <div className={cn(
      "p-2 text-xs border",
      isError
        ? "bg-[var(--destructive)]/5 border-[var(--destructive)]/20"
        : "bg-[var(--success)]/5 border-[var(--success)]/20"
    )}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full text-left cursor-pointer"
      >
        {truncated && (
          expanded ? (
            <ChevronDown className="h-3 w-3 text-[var(--foreground-muted)]" />
          ) : (
            <ChevronRight className="h-3 w-3 text-[var(--foreground-muted)]" />
          )
        )}
        <span className={cn(
          "font-medium",
          isError ? "text-[var(--destructive)]" : "text-[var(--success)]"
        )}>
          {isError ? 'Error' : 'Result'}
        </span>
      </button>
      <pre className={cn(
        "mt-1 font-mono whitespace-pre-wrap overflow-auto",
        expanded ? "max-h-96" : "max-h-24"
      )}>
        {expanded ? displayContent : preview}
      </pre>
    </div>
  );
}

interface ToolGroupBlockProps {
  group: ToolGroup;
  pendingApproval?: PermissionRequest;
  stagedDecision?: 'approved' | 'denied';
  resolvedDecision?: 'approved' | 'denied';
  onApprove: (request: PermissionRequest) => void;
  onDeny: (request: PermissionRequest, message?: string) => void;
  isSelected?: boolean;
  expandedOverride?: boolean;
  onToggleExpand?: () => void;
}

export function ToolGroupBlock({ group, pendingApproval, stagedDecision, resolvedDecision, onApprove, onDeny, isSelected, expandedOverride, onToggleExpand }: ToolGroupBlockProps) {
  console.log(`[ToolGroupBlock] Rendering group ${group.id} (${group.toolName}), pendingApproval:`, pendingApproval ? { id: pendingApproval.id, toolUseId: pendingApproval.toolUseId } : 'none', 'stagedDecision:', stagedDecision, 'resolvedDecision:', resolvedDecision);
  const [expandedInternal, setExpandedInternal] = React.useState(!!pendingApproval || !group.result);

  // Use override if provided, otherwise use internal state
  const expanded = expandedOverride !== undefined ? expandedOverride : expandedInternal;

  const handleToggle = () => {
    if (onToggleExpand) {
      onToggleExpand();
    } else {
      setExpandedInternal(!expandedInternal);
    }
  };

  // Auto-expand if pending approval or still running
  React.useEffect(() => {
    if (pendingApproval || !group.result) {
      if (!expanded) {
        setExpandedInternal(true);
      }
    }
  }, [pendingApproval, group.result, expanded]);

  const isPending = !!pendingApproval;
  const isComplete = !!group.result;

  // Check if this is a permission-denied result (not a real error)
  const resultContent = group.result?.content;
  const isPermissionDenied = typeof resultContent === 'string' && resultContent.includes('PERMISSION_DENIED');
  const isError = group.result?.isError && !isPermissionDenied;

  const isDangerous = ['Bash', 'Write', 'Edit'].includes(group.toolName);
  const ToolIcon = getToolIcon(group.toolName);
  const summary = getToolSummary(group.toolName, group.toolInput);

  return (
    <div className={cn(
      "border",
      isPending
        ? isDangerous
          ? "border-[var(--warning)] bg-[var(--warning)]/5"
          : "border-[var(--primary)] bg-[var(--primary)]/5"
        : resolvedDecision === 'approved'
          ? "border-[var(--success)]/30 bg-[var(--success)]/5"
          : resolvedDecision === 'denied'
            ? "border-[var(--destructive)]/30 bg-[var(--destructive)]/5"
            : isError
              ? "border-[var(--destructive)]/30 bg-[var(--destructive)]/5"
              : isComplete
                ? "border-[var(--success)]/30 bg-[var(--success)]/5"
                : "border-[var(--border)] bg-[var(--secondary)]"
    )}>
      {/* Header - always visible */}
      <button
        onClick={handleToggle}
        className="w-full flex items-center gap-2 p-3 text-left cursor-pointer hover:bg-[var(--foreground)]/5 transition-colors"
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-[var(--foreground-muted)]" />
        ) : (
          <ChevronRight className="h-4 w-4 text-[var(--foreground-muted)]" />
        )}
        <ToolIcon className={cn(
          "h-4 w-4",
          isPending
            ? isDangerous ? "text-[var(--warning)]" : "text-[var(--primary)]"
            : isError
              ? "text-[var(--destructive)]"
              : isComplete
                ? "text-[var(--success)]"
                : "text-[var(--primary)]"
        )} />
        <span className={cn(
          "font-medium text-sm",
          isPending
            ? isDangerous ? "text-[var(--warning)]" : "text-[var(--primary)]"
            : isError
              ? "text-[var(--destructive)]"
              : "text-[var(--foreground)]"
        )}>{group.toolName}</span>

        {/* Summary */}
        {summary && (
          <span className="text-xs text-[var(--foreground-muted)] truncate flex-1">{summary}</span>
        )}

        {/* Status indicators */}
        {isPending && !stagedDecision && (
          <span className={cn(
            "text-xs px-1.5 py-0.5",
            isDangerous ? "bg-[var(--warning)]/20 text-[var(--warning)]" : "bg-[var(--primary)]/20 text-[var(--primary)]"
          )}>
            Pending Approval
          </span>
        )}
        {isPending && stagedDecision === 'approved' && (
          <span className="text-xs px-1.5 py-0.5 bg-[var(--success)]/20 text-[var(--success)]">
            ✓ Will Approve
          </span>
        )}
        {isPending && stagedDecision === 'denied' && (
          <span className="text-xs px-1.5 py-0.5 bg-[var(--destructive)]/20 text-[var(--destructive)]">
            ✗ Will Deny
          </span>
        )}
        {!isComplete && !isPending && (
          <Loader2 className="h-3 w-3 animate-spin text-[var(--foreground-muted)]" />
        )}
        {/* Show resolved decision outcome */}
        {resolvedDecision === 'approved' && !isPending && (
          <span className="text-xs px-1.5 py-0.5 bg-[var(--success)]/20 text-[var(--success)]">
            Approved
          </span>
        )}
        {resolvedDecision === 'denied' && !isPending && (
          <span className="text-xs px-1.5 py-0.5 bg-[var(--destructive)]/20 text-[var(--destructive)]">
            Denied
          </span>
        )}
        {/* Show Done/Error only if no resolved decision */}
        {isComplete && !isError && !isPending && !resolvedDecision && (
          <span className="text-xs px-1.5 py-0.5 bg-[var(--success)]/20 text-[var(--success)]">
            Done
          </span>
        )}
        {isError && !isPending && !resolvedDecision && (
          <span className="text-xs px-1.5 py-0.5 bg-[var(--destructive)]/20 text-[var(--destructive)]">
            Error
          </span>
        )}

        {/* Subagent indicator */}
        {group.isSubagent && group.subagentMessages.length > 0 && (
          <span className="text-xs px-1.5 py-0.5 bg-[var(--secondary)] text-[var(--foreground-muted)]">
            {group.subagentMessages.length} messages
          </span>
        )}
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-[var(--border)] p-3 space-y-3">
          {/* Tool details (input preview) */}
          <ToolDetails toolName={group.toolName} input={group.toolInput as Record<string, unknown>} />

          {/* Approval buttons if pending */}
          {isPending && pendingApproval && (
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border)]">
              <Button
                variant={stagedDecision === 'denied' ? 'destructive' : 'outline'}
                size="sm"
                onClick={() => onDeny(pendingApproval, 'User denied permission')}
              >
                <X className="h-3 w-3 mr-1" />
                {stagedDecision === 'denied' ? 'Denied' : 'Deny'}
              </Button>
              <Button
                variant={stagedDecision === 'approved' ? 'default' : 'outline'}
                size="sm"
                onClick={() => onApprove(pendingApproval)}
              >
                <Check className="h-3 w-3 mr-1" />
                {stagedDecision === 'approved' ? 'Approved' : 'Approve'}
              </Button>
            </div>
          )}

          {/* Subagent conversation (for Task tools) */}
          {group.isSubagent && group.subagentMessages.length > 0 && (
            <SubagentConversation messages={group.subagentMessages} />
          )}

          {/* Tool result */}
          {group.result && (
            <ToolResultDisplay
              content={group.result.content}
              isError={group.result.isError}
            />
          )}
        </div>
      )}
    </div>
  );
}
