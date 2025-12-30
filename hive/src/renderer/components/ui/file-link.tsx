import React from 'react';
import { ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useFileViewerStore } from '@/lib/store';

interface FileLinkProps {
  path: string;
  line?: number;
  className?: string;
  children?: React.ReactNode;
}

/**
 * A clickable file path that opens the file in the configured editor.
 * Supports optional line number for editors that support file:line syntax.
 */
export function FileLink({ path, line, className, children }: FileLinkProps) {
  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    try {
      // Some editors support file:line syntax, others use different flags
      // For simplicity, we just open the file - the editor will handle it
      await window.electronAPI.invoke('shell:open-in-editor', { path });
    } catch (error) {
      console.error('Failed to open file in editor:', error);
    }
  };

  // Shorten the path for display if it's too long
  const displayPath = children || formatPath(path);
  const fullPath = line ? `${path}:${line}` : path;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={handleClick}
          className={cn(
            "inline-flex items-center gap-1 text-left font-mono",
            "text-[var(--primary)] hover:text-[var(--primary)]/80",
            "hover:underline underline-offset-2 cursor-pointer",
            "transition-colors",
            className
          )}
        >
          <span className="truncate">{displayPath}</span>
          <ExternalLink className="h-3 w-3 flex-shrink-0 opacity-60" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">
        <div className="text-xs">
          <div>Open in editor</div>
          <div className="text-[var(--foreground-muted)] font-mono">{fullPath}</div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Format a file path for display, shortening if necessary
 */
function formatPath(path: string | undefined): string {
  // Handle undefined or empty path
  if (!path) return '';
  // If path is short enough, show it all
  if (path.length <= 50) return path;

  // Split into parts
  const parts = path.split('/');

  // If just a filename, show it
  if (parts.length <= 2) return path;

  // Show first dir, ellipsis, and last 2 parts
  const filename = parts.slice(-1)[0];
  const parent = parts.slice(-2, -1)[0];
  const first = parts[0] || '';

  // Handle absolute paths starting with /
  if (first === '') {
    return `/${parts[1]}/.../${parent}/${filename}`;
  }

  return `${first}/.../${parent}/${filename}`;
}

interface InlineFileLinkProps {
  path?: string;
  line?: number;
  className?: string;
}

/**
 * A simpler inline file link without tooltip, for compact displays
 * Opens in the file viewer split pane instead of external editor
 */
export function InlineFileLink({ path, line, className }: InlineFileLinkProps) {
  const setOpenFile = useFileViewerStore((state) => state.setOpenFile);

  // Handle undefined path gracefully
  if (!path) {
    return <span className="text-[var(--foreground-muted)] text-xs">(unknown path)</span>;
  }

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setOpenFile({ path, line });
    // Dispatch event to collapse sidebar when file viewer opens
    window.dispatchEvent(new Event('collapse-sidebar'));
  };

  const displayPath = formatPath(path);

  return (
    <button
      onClick={handleClick}
      title={`View ${path}${line ? `:${line}` : ''}`}
      className={cn(
        "inline-flex items-center gap-0.5 font-mono",
        "text-[var(--primary)] hover:text-[var(--primary)]/80",
        "hover:underline underline-offset-2 cursor-pointer",
        "bg-[var(--secondary)] px-1.5 py-0.5",
        className
      )}
    >
      {displayPath}
      <ExternalLink className="h-2.5 w-2.5 opacity-60" />
    </button>
  );
}
