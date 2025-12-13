import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import type { QueryResponse, MetricResponse, DashboardTableResponse, DashboardChartResponse, TimingInfo } from '@/types/api';
import type { DashboardQuery, DashboardEndpoint } from '@/types/dashboard';
import { ResultsGrid } from '@/components/grid/ResultsGrid';
import { BarChartViz, LineChartViz, MetricCard } from './Charts';
import { Spinner } from '@/components/ui/spinner';

interface DashboardPanelProps {
  query: DashboardQuery;
}

// Transform MetricResponse to QueryResponse format
function metricToQueryResponse(res: MetricResponse): QueryResponse {
  return {
    columns: ['value'],
    rows: [[res?.value ?? 0]],
    row_count: 1,
    truncated: false,
    timing: res?.timing,
  };
}

// Transform DashboardTableResponse to QueryResponse format
function tableToQueryResponse(res: DashboardTableResponse): QueryResponse {
  const columns = res?.columns ?? [];
  const rows = res?.rows ?? [];
  return {
    columns,
    rows: rows.map(row => columns.map(col => row[col])),
    row_count: res?.row_count ?? 0,
    truncated: false,
    timing: res?.timing,
  };
}

// Transform DashboardChartResponse to QueryResponse format
function chartToQueryResponse(res: DashboardChartResponse): QueryResponse {
  const data = res?.data ?? [];
  if (!data || data.length === 0) {
    return { columns: [], rows: [], row_count: 0, truncated: false, timing: res?.timing };
  }
  const columns = Object.keys(data[0]);
  return {
    columns,
    rows: data.map(row => columns.map(col => row[col])),
    row_count: res?.count ?? data.length,
    truncated: false,
    timing: res?.timing,
  };
}

// Fetch data from the appropriate dashboard endpoint
async function fetchDashboardData(endpoint: DashboardEndpoint): Promise<QueryResponse> {
  const methods = api.dashboard;

  switch (endpoint) {
    // Metric endpoints
    case 'totalStories':
      return methods.totalStories().then(metricToQueryResponse);
    case 'totalComments':
      return methods.totalComments().then(metricToQueryResponse);
    case 'uniqueUsers':
      return methods.uniqueUsers().then(metricToQueryResponse);
    case 'lastSynced':
      return methods.lastSynced().then(metricToQueryResponse);

    // Table endpoints
    case 'mostDiscussed':
      return methods.mostDiscussed().then(tableToQueryResponse);
    case 'topAuthors':
      return methods.topAuthors().then(tableToQueryResponse);
    case 'topDomains':
      return methods.topDomains().then(tableToQueryResponse);

    // Chart endpoints
    case 'itemsByType':
      return methods.itemsByType().then(chartToQueryResponse);
    case 'activeCommenters':
      return methods.activeCommenters().then(chartToQueryResponse);
    case 'bestDomains':
      return methods.bestDomains().then(chartToQueryResponse);
    case 'postsByHour':
      return methods.postsByHour().then(chartToQueryResponse);
    case 'postsByDay':
      return methods.postsByDay().then(chartToQueryResponse);
    case 'timeline':
      return methods.timeline().then(chartToQueryResponse);

    default:
      throw new Error(`Unknown endpoint: ${endpoint}`);
  }
}

export function DashboardPanel({ query }: DashboardPanelProps) {
  const [data, setData] = useState<QueryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchDashboardData(query.endpoint)
      .then(setData)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [query.endpoint]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Spinner className="size-6" />
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

  const isMetric = query.visualization === 'metric';

  return (
    <div>
      {query.visualization === 'table' && (
        <div className="h-64">
          <ResultsGrid data={data} />
        </div>
      )}
      {query.visualization === 'bar' && <BarChartViz data={data} />}
      {query.visualization === 'line' && <LineChartViz data={data} />}
      {isMetric && <MetricCard data={data} label={query.metricLabel} showTiming />}
      {!isMetric && data.timing && (
        <div className="text-xs text-gray-400 mt-2 text-right">
          {data.timing.elapsed_formatted}
        </div>
      )}
    </div>
  );
}
