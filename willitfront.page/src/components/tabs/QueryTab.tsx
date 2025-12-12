import { useState } from 'react';
import { SqlEditor } from '@/components/editor/SqlEditor';
import { ResultsGrid } from '@/components/grid/ResultsGrid';
import { useQuery } from '@/hooks/useQuery';
import { useSchema } from '@/hooks/useSchema';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Play, Loader2, Database, Wand2 } from 'lucide-react';
import { format } from 'sql-formatter';
import type { Tab } from '@/types/tabs';

interface QueryTabProps {
  tab: Tab;
  onUpdate: (updates: Partial<Tab>) => void;
}

export function QueryTab({ tab, onUpdate }: QueryTabProps) {
  const [sql, setSql] = useState(tab.sql || '');
  const { data, error, isLoading, execute } = useQuery();
  const { schema } = useSchema();

  const handleSqlChange = (value: string) => {
    setSql(value);
    onUpdate({ sql: value });
  };

  const handleExecute = async () => {
    if (!sql.trim()) return;
    try {
      await execute(sql);
      // Update tab title with first part of query
      const title = sql.trim().split('\n')[0]?.substring(0, 30) || 'Query';
      onUpdate({ title });
    } catch {
      // Error is handled in state
    }
  };

  const handleFormat = () => {
    try {
      const formatted = format(sql, { language: 'sql', keywordCase: 'upper' });
      setSql(formatted);
      onUpdate({ sql: formatted });
    } catch {
      // If formatting fails, just keep the original
    }
  };

  return (
    <div className="h-full flex flex-col gap-4 p-4">
      <div className="flex-shrink-0">
        <SqlEditor
          value={sql}
          onChange={handleSqlChange}
          onExecute={handleExecute}
        />
        <div className="flex items-center gap-2 mt-2">
          <Button onClick={handleExecute} disabled={isLoading || !sql.trim()}>
            {isLoading ? <Loader2 className="animate-spin mr-2" size={16} /> : <Play size={16} className="mr-2" />}
            Run Query
          </Button>
          <span className="text-sm text-gray-400">⌘/Ctrl + Enter</span>

          <Button variant="outline" size="sm" onClick={handleFormat} disabled={!sql.trim()}>
            <Wand2 size={16} className="mr-1" />
            Format
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
              {schema?.tables.map(table => (
                <div key={table.name} className="mb-4">
                  <h3 className="font-bold text-lg text-[var(--hn-orange)] mb-2">{table.name}</h3>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-1 pr-4">Column</th>
                        <th className="text-left py-1 pr-4">Type</th>
                        <th className="text-left py-1">Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {table.columns.map(col => (
                        <tr key={col.name} className="border-b border-gray-100">
                          <td className="py-1 pr-4 font-mono">{col.name}</td>
                          <td className="py-1 pr-4 text-gray-500">{col.type}{col.nullable ? '?' : ''}</td>
                          <td className="py-1 text-gray-600">{col.description}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </DialogContent>
          </Dialog>

          {data && (
            <span className="text-sm text-gray-500 ml-2">
              {data.row_count} rows in {data.timing.elapsed_formatted}
              {data.truncated && ' (truncated)'}
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded">
          {error}
        </div>
      )}

      {data && (
        <div className="flex-1 min-h-0">
          <ResultsGrid data={data} />
        </div>
      )}
    </div>
  );
}
