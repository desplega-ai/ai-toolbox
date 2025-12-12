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
  const labelKey = data.columns[0] ?? 'label';
  const valueKey = data.columns[1] ?? 'value';

  const chartData = data.rows.map(row => {
    const obj: Record<string, unknown> = {};
    data.columns.forEach((col, i) => {
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
  const chartData = data.rows.map(row => {
    const obj: Record<string, unknown> = {};
    data.columns.forEach((col, i) => {
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

  const xKey = data.columns[0] ?? 'x';
  const yKey = data.columns[1] ?? 'y';

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
  const value = data.rows[0]?.[0] ?? 0;
  const displayValue = typeof value === 'number'
    ? formatCompact(value)
    : String(value);

  return (
    <div className="bg-white p-6 rounded-lg border text-center">
      <div className="text-4xl font-bold text-[var(--hn-orange)]">
        {displayValue}
      </div>
      {label && <div className="text-gray-500 mt-1">{label}</div>}
    </div>
  );
}
