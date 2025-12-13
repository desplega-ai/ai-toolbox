import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, Legend } from 'recharts';
import type { QueryResponse } from '@/types/api';

interface ChartProps {
  data: QueryResponse;
  title?: string;
  xAxisLabel?: string;
  yAxisLabel?: string;
}

const PIE_COLORS = [
  'var(--hn-orange)',
  '#2563eb', // blue
  '#16a34a', // green
  '#dc2626', // red
  '#9333ea', // purple
  '#ca8a04', // yellow
  '#0891b2', // cyan
  '#be185d', // pink
];

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

export function BarChartViz({ data, title, xAxisLabel, yAxisLabel }: ChartProps) {
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
    <div className="w-full">
      {title && <div className="text-sm font-medium text-gray-700 mb-2 text-center">{title}</div>}
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData}>
          <XAxis
            dataKey={labelKey}
            label={xAxisLabel ? { value: xAxisLabel, position: 'bottom', offset: -5 } : undefined}
          />
          <YAxis
            tickFormatter={(v) => formatCompact(v)}
            label={yAxisLabel ? { value: yAxisLabel, angle: -90, position: 'insideLeft' } : undefined}
          />
          <Tooltip formatter={(v: number) => v.toLocaleString()} />
          <Bar dataKey={valueKey} fill="var(--hn-orange)" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function LineChartViz({ data, title, xAxisLabel, yAxisLabel }: ChartProps) {
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
    <div className="w-full">
      {title && <div className="text-sm font-medium text-gray-700 mb-2 text-center">{title}</div>}
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData}>
          <XAxis
            dataKey={xKey}
            tick={{ fontSize: 10 }}
            angle={-45}
            textAnchor="end"
            height={60}
            label={xAxisLabel ? { value: xAxisLabel, position: 'bottom', offset: 40 } : undefined}
          />
          <YAxis
            tickFormatter={(v) => formatCompact(v)}
            label={yAxisLabel ? { value: yAxisLabel, angle: -90, position: 'insideLeft' } : undefined}
          />
          <Tooltip formatter={(v: number) => v.toLocaleString()} />
          <Line type="monotone" dataKey={yKey} stroke="var(--hn-orange)" dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function MetricCard({ data, label, title, showTiming }: ChartProps & { label?: string; showTiming?: boolean }) {
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

  const displayLabel = title || label;

  return (
    <div className="bg-white p-4 sm:p-6 rounded-lg border text-center h-full flex flex-col justify-center relative">
      <div className={`font-bold text-[var(--hn-orange)] ${isDate ? 'text-base sm:text-lg' : 'text-2xl sm:text-4xl'}`}>
        {displayValue}
      </div>
      {displayLabel && <div className="text-gray-500 mt-1 text-sm sm:text-base">{displayLabel}</div>}
      {showTiming && data.timing && (
        <div className="absolute bottom-1 right-2 text-[10px] text-gray-400">
          {data.timing.elapsed_formatted}
        </div>
      )}
    </div>
  );
}

export function PieChartViz({ data, title }: ChartProps) {
  const columns = data?.columns ?? [];
  const rows = data?.rows ?? [];

  if (columns.length < 2 || rows.length === 0) {
    return <div className="h-[300px] flex items-center justify-center text-gray-400">No data</div>;
  }

  const chartData = rows.map((row, idx) => ({
    name: String(row[0] ?? ''),
    value: Number(row[1] ?? 0),
    fill: PIE_COLORS[idx % PIE_COLORS.length],
  }));

  const total = chartData.reduce((sum, d) => sum + d.value, 0);

  return (
    <div className="w-full">
      {title && <div className="text-sm font-medium text-gray-700 mb-2 text-center">{title}</div>}
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={({ name, percent }) => `${name}: ${((percent ?? 0) * 100).toFixed(0)}%`}
            outerRadius={100}
            dataKey="value"
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.fill} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: number) => [
              `${value.toLocaleString()} (${((value / total) * 100).toFixed(1)}%)`,
              ''
            ]}
          />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
