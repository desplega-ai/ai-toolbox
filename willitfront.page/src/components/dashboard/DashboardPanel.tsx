import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import type { QueryResponse } from '@/types/api';
import type { DashboardQuery } from '@/types/dashboard';
import { ResultsGrid } from '@/components/grid/ResultsGrid';
import { BarChartViz, LineChartViz, MetricCard } from './Charts';
import { Loader2 } from 'lucide-react';

interface DashboardPanelProps {
  query: DashboardQuery;
}

export function DashboardPanel({ query }: DashboardPanelProps) {
  const [data, setData] = useState<QueryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.query(query.sql)
      .then(setData)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [query.sql]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded">
        {error}
      </div>
    );
  }

  if (!data) return null;

  return (
    <div>
      {query.visualization === 'table' && (
        <div className="h-64">
          <ResultsGrid data={data} />
        </div>
      )}
      {query.visualization === 'bar' && <BarChartViz data={data} />}
      {query.visualization === 'line' && <LineChartViz data={data} />}
      {query.visualization === 'metric' && <MetricCard data={data} label={query.metricLabel} />}
      {data.timing && (
        <div className="text-xs text-gray-400 mt-2 text-right">
          {data.timing.elapsed_formatted}
        </div>
      )}
    </div>
  );
}
