import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import type { QueryResponse } from '@/types/api';

interface ChartProps {
  data: QueryResponse;
}

export function BarChartViz({ data }: ChartProps) {
  const chartData = data.rows.map(row => {
    const obj: Record<string, unknown> = {};
    data.columns.forEach((col, i) => {
      obj[col] = row[i];
    });
    return obj;
  });

  const labelKey = data.columns[0] ?? 'label';
  const valueKey = data.columns[1] ?? 'value';

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={chartData}>
        <XAxis dataKey={labelKey} />
        <YAxis />
        <Tooltip />
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
      if (col.includes('hour') || col.includes('time') || col.includes('date')) {
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
        <XAxis dataKey={xKey} tick={{ fontSize: 10 }} />
        <YAxis />
        <Tooltip />
        <Line type="monotone" dataKey={yKey} stroke="var(--hn-orange)" />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function MetricCard({ data, label }: ChartProps & { label?: string }) {
  const value = data.rows[0]?.[0] ?? 0;
  const displayValue = typeof value === 'number'
    ? value.toLocaleString()
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
