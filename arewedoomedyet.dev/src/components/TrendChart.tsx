import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, ReferenceLine } from "recharts";

interface TrendChartProps {
  data: Array<{ date: string; average: number; count: number }>;
  faded?: boolean;
}

const sentimentLabels = [
  { value: 1.25, label: "NO", color: "var(--doom-no)" },
  { value: 3.75, label: "Low-key", color: "var(--doom-lowkey)" },
  { value: 6.25, label: "High-key", color: "var(--doom-highkey)" },
  { value: 8.75, label: "YES", color: "var(--doom-yes)" },
];

const sentimentBoundaries = [2.5, 5, 7.5];

function getSentimentForValue(value: number): { label: string; color: string } {
  if (value >= 7.5) return { label: "YES", color: "var(--doom-yes)" };
  if (value >= 5) return { label: "High-key", color: "var(--doom-highkey)" };
  if (value >= 2.5) return { label: "Low-key", color: "var(--doom-lowkey)" };
  return { label: "NO", color: "var(--doom-no)" };
}

export function TrendChart({ data, faded = false }: TrendChartProps) {
  if (data.length === 0) return null;

  // Format date for display
  const formattedData = data.map((d) => ({
    ...d,
    displayDate: new Date(d.date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
  }));

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null;
    const value = payload[0].value;
    const count = payload[0].payload.count;
    const sentiment = getSentimentForValue(value);

    return (
      <div className="bg-zinc-900 border border-white/20 rounded-lg px-3 py-2">
        <p className="text-white/60 text-sm">{label}</p>
        <p className="text-lg font-bold" style={{ color: sentiment.color }}>
          {sentiment.label}
        </p>
        <p className="text-white/60 text-sm">
          {value.toFixed(1)}/10 • {count} vote{count !== 1 ? "s" : ""}
        </p>
      </div>
    );
  };

  return (
    <div
      className={faded ? "absolute inset-0 pointer-events-none" : "w-full h-full"}
      style={{ opacity: faded ? 0.15 : 1 }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={formattedData} margin={{ top: 20, right: 30, bottom: 20, left: 70 }}>
          <XAxis
            dataKey="displayDate"
            stroke="white"
            strokeOpacity={0.3}
            tick={{ fill: "white", fillOpacity: 0.7, fontSize: 12 }}
            hide={faded}
          />
          <YAxis
            domain={[0, 10]}
            stroke="white"
            strokeOpacity={0.3}
            ticks={[1.25, 3.75, 6.25, 8.75]}
            tickFormatter={(value) => {
              const sentiment = sentimentLabels.find(s => s.value === value);
              return sentiment?.label || "";
            }}
            tick={{ fill: "white", fillOpacity: 0.7, fontSize: 12 }}
            hide={faded}
          />
          {!faded && sentimentBoundaries.map((y) => (
            <ReferenceLine
              key={y}
              y={y}
              stroke="white"
              strokeOpacity={0.1}
              strokeDasharray="3 3"
            />
          ))}
          {!faded && <Tooltip content={<CustomTooltip />} />}
          <Line
            type="monotone"
            dataKey="average"
            stroke="white"
            strokeWidth={faded ? 2 : 3}
            dot={!faded ? { fill: "white", strokeWidth: 0, r: 4 } : false}
            activeDot={!faded ? { fill: "white", strokeWidth: 0, r: 6 } : false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
