import { useState, useCallback, useRef } from 'react';
import { NotebookBlock, type NotebookBlockHandle } from './NotebookBlock';
import { Button } from '@/components/ui/button';
import { useSchema } from '@/hooks/useSchema';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { createBlock, getTabBlocks, generateBlockName } from '@/lib/notebook';
import type { Tab, NotebookBlock as NotebookBlockType } from '@/types/tabs';
import { Plus, PlayCircle, Loader2, Database, ChevronsDownUp, ChevronsUpDown } from 'lucide-react';

interface NotebookQueryTabProps {
  tab: Tab;
  onUpdate: (updates: Partial<Tab>) => void;
}

export function NotebookQueryTab({ tab, onUpdate }: NotebookQueryTabProps) {
  const [blocks, setBlocks] = useState<NotebookBlockType[]>(() => getTabBlocks(tab));
  const [isRunningAll, setIsRunningAll] = useState(false);
  const [runProgress, setRunProgress] = useState({ current: 0, total: 0 });
  const [allCollapsed, setAllCollapsed] = useState(false);
  const blockRefs = useRef<Map<string, NotebookBlockHandle>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);
  const { schema } = useSchema();

  // Helper to update blocks and sync to tab
  const updateBlocks = useCallback((newBlocks: NotebookBlockType[]) => {
    setBlocks(newBlocks);
    onUpdate({ blocks: newBlocks });
  }, [onUpdate]);

  const handleBlockChange = useCallback((blockId: string, content: string) => {
    setBlocks((prev) => {
      const newBlocks = prev.map((b) => (b.id === blockId ? { ...b, content } : b));
      // Sync to tab state
      onUpdate({ blocks: newBlocks });
      return newBlocks;
    });
  }, [onUpdate]);

  const handleBlockDelete = useCallback((blockId: string) => {
    setBlocks((prev) => {
      const newBlocks = prev.filter((b) => b.id !== blockId);
      onUpdate({ blocks: newBlocks });
      return newBlocks;
    });
  }, [onUpdate]);

  const handleAddBlock = useCallback(() => {
    setBlocks((prev) => {
      const name = generateBlockName(prev);
      const newBlocks = [...prev, createBlock('sql', '', name)];
      onUpdate({ blocks: newBlocks });
      return newBlocks;
    });
    // Scroll to bottom after adding
    setTimeout(() => {
      containerRef.current?.scrollTo({
        top: containerRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }, 100);
  }, [onUpdate]);

  const handleToggleAllCollapsed = useCallback(() => {
    setAllCollapsed((prev) => !prev);
  }, []);

  const handleRunAll = useCallback(async () => {
    const sqlBlocks = blocks.filter((b) => b.type === 'sql' && b.content.trim());
    if (sqlBlocks.length === 0) return;

    setIsRunningAll(true);
    setRunProgress({ current: 0, total: sqlBlocks.length });

    for (let i = 0; i < sqlBlocks.length; i++) {
      const block = sqlBlocks[i];
      if (!block) continue;

      const blockRef = blockRefs.current.get(block.id);

      setRunProgress({ current: i + 1, total: sqlBlocks.length });

      if (blockRef) {
        await blockRef.execute();
      }
    }

    setIsRunningAll(false);
  }, [blocks]);

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-2 p-3 border-b bg-gray-50">
        <Button onClick={handleAddBlock} variant="outline" size="sm">
          <Plus size={16} className="mr-1" />
          Add Block
        </Button>

        <Button
          onClick={handleRunAll}
          disabled={isRunningAll || blocks.every((b) => !b.content.trim())}
          size="sm"
        >
          {isRunningAll ? (
            <>
              <Loader2 size={16} className="mr-1 animate-spin" />
              Running {runProgress.current}/{runProgress.total}
            </>
          ) : (
            <>
              <PlayCircle size={16} className="mr-1" />
              Run All
            </>
          )}
        </Button>

        <Button
          onClick={handleToggleAllCollapsed}
          variant="outline"
          size="sm"
          title={allCollapsed ? "Expand all results" : "Collapse all results"}
        >
          {allCollapsed ? (
            <ChevronsUpDown size={16} className="mr-1" />
          ) : (
            <ChevronsDownUp size={16} className="mr-1" />
          )}
          {allCollapsed ? 'Expand' : 'Collapse'}
        </Button>

        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              <Database size={16} className="mr-1" />
              Schema
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
            <DialogHeader>
              <DialogTitle>Database Schema</DialogTitle>
            </DialogHeader>
            {schema?.tables.map((table) => (
              <div key={table.name} className="mb-4">
                <h3 className="font-bold text-lg text-[var(--hn-orange)] mb-2">
                  {table.name}
                </h3>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-1 pr-4">Column</th>
                      <th className="text-left py-1 pr-4">Type</th>
                      <th className="text-left py-1">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {table.columns.map((col) => (
                      <tr key={col.name} className="border-b border-gray-100">
                        <td className="py-1 pr-4 font-mono">{col.name}</td>
                        <td className="py-1 pr-4 text-gray-500">
                          {col.type}
                          {col.nullable ? '?' : ''}
                        </td>
                        <td className="py-1 text-gray-600">{col.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </DialogContent>
        </Dialog>

        <span className="text-sm text-gray-500 ml-2">
          {blocks.length} block{blocks.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Blocks */}
      <div ref={containerRef} className="flex-1 overflow-auto p-4">
        {blocks.map((block, index) => (
          <NotebookBlock
            key={block.id}
            ref={(handle) => {
              if (handle) {
                blockRefs.current.set(block.id, handle);
              } else {
                blockRefs.current.delete(block.id);
              }
            }}
            block={block}
            blockIndex={index}
            allBlocks={blocks}
            onChange={(content) => handleBlockChange(block.id, content)}
            onDelete={() => handleBlockDelete(block.id)}
            canDelete={blocks.length > 1}
            forceCollapsed={allCollapsed ? true : undefined}
          />
        ))}

        {/* Add block button at bottom */}
        <button
          onClick={handleAddBlock}
          className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-400 hover:border-gray-400 hover:text-gray-500 transition-colors flex items-center justify-center gap-2"
        >
          <Plus size={16} />
          Add SQL Block
        </button>
      </div>
    </div>
  );
}
