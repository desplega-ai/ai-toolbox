import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import type { QueryResponse } from '@/types/api';

interface ChartProps {
  data: QueryResponse;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function formatHour(hour: number): string {
  if (hour === 0) return '12 AM';
  if (hour === 12) return '12 PM';
  if (hour < 12) return `${hour} AM`;
  return `${hour - 12} PM`;
}

function formatCompact(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  return value.toString();
}

export function BarChartViz({ data }: ChartProps) {
  const columns = data?.columns ?? [];
  const rows = data?.rows ?? [];

  if (columns.length === 0 || rows.length === 0) {
    return <div className="h-[300px] flex items-center justify-center text-gray-400">No data</div>;
  }

  const labelKey = columns[0] ?? 'label';
  const valueKey = columns[1] ?? 'value';

  const chartData = rows.map(row => {
    const obj: Record<string, unknown> = {};
    columns.forEach((col, i) => {
      if (col === 'day' && typeof row[i] === 'number') {
        obj[col] = DAY_NAMES[row[i] as number] ?? row[i];
      } else if (col === 'hour' && typeof row[i] === 'number') {
        obj[col] = formatHour(row[i] as number);
      } else {
        obj[col] = row[i];
      }
    });
    return obj;
  });

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={chartData}>
        <XAxis dataKey={labelKey} />
        <YAxis tickFormatter={(v) => formatCompact(v)} />
        <Tooltip formatter={(v: number) => v.toLocaleString()} />
        <Bar dataKey={valueKey} fill="var(--hn-orange)" />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function LineChartViz({ data }: ChartProps) {
  const columns = data?.columns ?? [];
  const rows = data?.rows ?? [];

  if (columns.length === 0 || rows.length === 0) {
    return <div className="h-[300px] flex items-center justify-center text-gray-400">No data</div>;
  }

  const chartData = rows.map(row => {
    const obj: Record<string, unknown> = {};
    columns.forEach((col, i) => {
      // Format timestamps for display
      if (col.includes('month')) {
        const d = new Date(row[i] as string);
        obj[col] = d.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
      } else if (col.includes('hour') || col.includes('time') || col.includes('date')) {
        obj[col] = new Date(row[i] as string).toLocaleString();
      } else {
        obj[col] = row[i];
      }
    });
    return obj;
  });

  const xKey = columns[0] ?? 'x';
  const yKey = columns[1] ?? 'y';

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={chartData}>
        <XAxis dataKey={xKey} tick={{ fontSize: 10 }} angle={-45} textAnchor="end" height={60} />
        <YAxis tickFormatter={(v) => formatCompact(v)} />
        <Tooltip formatter={(v: number) => v.toLocaleString()} />
        <Line type="monotone" dataKey={yKey} stroke="var(--hn-orange)" dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function MetricCard({ data, label }: ChartProps & { label?: string }) {
  const rows = data?.rows ?? [];
  const value = rows[0]?.[0] ?? 0;

  let displayValue: string;
  let isDate = false;
  if (typeof value === 'number') {
    displayValue = formatCompact(value);
  } else if (typeof value === 'string' && !isNaN(Date.parse(value))) {
    isDate = true;
    displayValue = new Date(value).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } else {
    displayValue = String(value);
  }

  return (
    <div className="bg-white p-6 rounded-lg border text-center h-full flex flex-col justify-center">
      <div className={`font-bold text-[var(--hn-orange)] ${isDate ? 'text-lg' : 'text-4xl'}`}>
        {displayValue}
      </div>
      {label && <div className="text-gray-500 mt-1">{label}</div>}
    </div>
  );
}
