import { useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import { SqlEditor } from '@/components/editor/SqlEditor';
import { ResultsGrid } from '@/components/grid/ResultsGrid';
import { Button } from '@/components/ui/button';
import { useQuery } from '@/hooks/useQuery';
import { buildQueryWithCTEs } from '@/lib/notebook';
import type { NotebookBlock as NotebookBlockType } from '@/types/tabs';
import type { QueryResponse } from '@/types/api';
import {
  Play,
  Loader2,
  Trash2,
  ChevronDown,
  ChevronRight,
  Wand2,
} from 'lucide-react';
import { format } from 'sql-formatter';

interface NotebookBlockProps {
  block: NotebookBlockType;
  blockIndex: number;
  allBlocks: NotebookBlockType[];
  onChange: (content: string) => void;
  onDelete: () => void;
  onExecute?: (result: QueryResponse) => void;
  canDelete: boolean;
  forceCollapsed?: boolean;
}

export interface NotebookBlockHandle {
  execute: () => Promise<QueryResponse | null>;
}

export const NotebookBlock = forwardRef<NotebookBlockHandle, NotebookBlockProps>(
  function NotebookBlock({ block, blockIndex, allBlocks, onChange, onDelete, onExecute, canDelete, forceCollapsed }, ref) {
  const [result, setResult] = useState<QueryResponse | null>(null);
  const [localCollapsed, setLocalCollapsed] = useState(false);
  const { error, isLoading, execute } = useQuery();

  // Use forceCollapsed if provided, otherwise use local state
  const collapsed = forceCollapsed !== undefined ? forceCollapsed : localCollapsed;

  const handleExecute = useCallback(async (): Promise<QueryResponse | null> => {
    if (!block.content.trim()) return null;
    try {
      // Build query with CTEs from previous blocks if referenced
      const queryWithCTEs = buildQueryWithCTEs(blockIndex, allBlocks);
      const data = await execute(queryWithCTEs);
      setResult(data);
      onExecute?.(data);
      return data;
    } catch {
      setResult(null);
      return null;
    }
  }, [block.content, blockIndex, allBlocks, execute, onExecute]);

  // Expose execute method to parent
  useImperativeHandle(ref, () => ({
    execute: handleExecute,
  }), [handleExecute]);

  const handleFormat = useCallback(() => {
    try {
      const formatted = format(block.content, { language: 'sql', keywordCase: 'upper' });
      onChange(formatted);
    } catch {
      // Keep original if formatting fails
    }
  }, [block.content, onChange]);

  return (
    <div className="group bg-white border rounded-lg shadow-sm mb-4">
      {/* Block Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-gray-50 rounded-t-lg">
        <span className="text-xs font-medium text-blue-600 font-mono bg-blue-50 px-2 py-0.5 rounded">{block.name}</span>
        <span className="text-xs text-gray-400">SQL</span>

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
            onClick={() => setLocalCollapsed(!localCollapsed)}
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
});
