import { useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import { SqlEditor } from '@/components/editor/SqlEditor';
import { ResultsGrid } from '@/components/grid/ResultsGrid';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
  Info,
} from 'lucide-react';
import { format } from 'sql-formatter';

const EXAMPLE_QUERIES = [
  { name: 'Top Stories', sql: `SELECT title, score, "by" FROM hn WHERE type = 'story' ORDER BY score DESC LIMIT 10` },
  { name: 'Top Authors', sql: `SELECT "by", COUNT(*) as posts, SUM(score) as total_score FROM hn WHERE type = 'story' GROUP BY "by" ORDER BY total_score DESC LIMIT 20` },
  { name: 'Monthly Activity', sql: `SELECT DATE_TRUNC('month', time) as month, COUNT(*) as items FROM hn GROUP BY month ORDER BY month` },
  { name: 'Top Domains', sql: `SELECT REGEXP_EXTRACT(url, 'https?://([^/]+)', 1) as domain, COUNT(*) as posts FROM hn WHERE url IS NOT NULL GROUP BY domain ORDER BY posts DESC LIMIT 15` },
  { name: 'Items by Type', sql: `SELECT type, COUNT(*) as count FROM hn GROUP BY type ORDER BY count DESC` },
  { name: 'Most Discussed', sql: `SELECT title, descendants as comments, score FROM hn WHERE type = 'story' AND descendants IS NOT NULL ORDER BY descendants DESC LIMIT 10` },
  { name: 'Recent Stories', sql: `SELECT title, score, "by", time FROM hn WHERE type = 'story' ORDER BY time DESC LIMIT 20` },
];

// Examples that reference previous blocks (for blocks after the first)
const CHAINED_EXAMPLES = [
  { name: 'Filter previous results', sql: `SELECT * FROM q1 WHERE score > 100`, description: 'Use q1 to reference the block above' },
  { name: 'Aggregate previous results', sql: `SELECT COUNT(*) as total, AVG(score) as avg_score FROM q1`, description: 'Calculate stats from previous block' },
  { name: 'Join with previous', sql: `SELECT q1.*, q2.* FROM q1 JOIN q2 ON q1."by" = q2."by"`, description: 'Join results from two blocks' },
];

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
  const [showExamples, setShowExamples] = useState(false);
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

  const handleSelectExample = useCallback((sql: string) => {
    onChange(sql);
    setShowExamples(false);
  }, [onChange]);

  return (
    <div className="group bg-white border rounded-lg shadow-sm mb-4">
      {/* Block Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-gray-50 rounded-t-lg">
        <span
          className="text-xs font-medium text-blue-600 font-mono bg-blue-50 px-2 py-0.5 rounded cursor-help"
          title={`Other blocks can reference this as "${block.name}" in their SQL`}
        >
          {block.name}
        </span>
        <span className="text-xs text-gray-400">SQL</span>

        {blockIndex > 0 && (
          <span className="text-xs text-gray-400 flex items-center gap-1" title="You can reference previous blocks by name (e.g., SELECT * FROM q1)">
            <Info size={12} />
            <span className="hidden sm:inline">Can use {allBlocks.slice(0, blockIndex).map(b => b.name).join(', ')}</span>
          </span>
        )}

        <div className="flex-1" />

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowExamples(true)}
          className="h-7 px-2 text-xs text-gray-500"
          title="Browse example queries"
        >
          Examples
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={handleFormat}
          disabled={!block.content.trim()}
          className="h-7 px-2"
          title="Format SQL"
        >
          <Wand2 size={14} />
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={handleExecute}
          disabled={isLoading || !block.content.trim()}
          className="h-7 px-2"
          title="Run query (Cmd+Enter)"
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
            title="Delete block"
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

      {/* Examples Modal */}
      <Dialog open={showExamples} onOpenChange={setShowExamples}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Example Queries</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {blockIndex > 0 && (
              <>
                <div className="text-xs font-medium text-gray-500 uppercase tracking-wide pt-2">
                  Chain with previous blocks ({allBlocks.slice(0, blockIndex).map(b => b.name).join(', ')})
                </div>
                {CHAINED_EXAMPLES.map((example, idx) => (
                  <button
                    key={`chain-${idx}`}
                    onClick={() => handleSelectExample(example.sql)}
                    className="w-full text-left p-3 rounded-lg border border-blue-200 bg-blue-50/50 hover:border-blue-400 hover:bg-blue-50 transition-colors"
                  >
                    <div className="font-medium text-sm mb-1">{example.name}</div>
                    <div className="text-xs text-gray-500 mb-1">{example.description}</div>
                    <code className="text-xs text-blue-600 block truncate">{example.sql}</code>
                  </button>
                ))}
                <div className="text-xs font-medium text-gray-500 uppercase tracking-wide pt-4">
                  Standalone queries
                </div>
              </>
            )}
            {EXAMPLE_QUERIES.map((example, idx) => (
              <button
                key={idx}
                onClick={() => handleSelectExample(example.sql)}
                className="w-full text-left p-3 rounded-lg border hover:border-[var(--hn-orange)] hover:bg-orange-50 transition-colors"
              >
                <div className="font-medium text-sm mb-1">{example.name}</div>
                <code className="text-xs text-gray-500 block truncate">{example.sql}</code>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
});
