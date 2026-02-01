interface SentimentDisplayProps {
  average: number | null;
  count: number;
}

type Sentiment = "YES" | "High-key" | "Low-key" | "NO";

function getSentiment(average: number | null): Sentiment | null {
  if (average === null) return null;
  if (average >= 7.5) return "YES";
  if (average >= 5) return "High-key";
  if (average >= 2.5) return "Low-key";
  return "NO";
}

function getSentimentColor(sentiment: Sentiment | null): string {
  switch (sentiment) {
    case "YES": return "var(--doom-yes)";
    case "High-key": return "var(--doom-highkey)";
    case "Low-key": return "var(--doom-lowkey)";
    case "NO": return "var(--doom-no)";
    default: return "white";
  }
}

export function SentimentDisplay({ average, count }: SentimentDisplayProps) {
  const sentiment = getSentiment(average);
  const color = getSentimentColor(sentiment);

  return (
    <div className="text-center">
      <p className="text-white/40 text-2xl md:text-4xl mb-2">Are we doomed yet?</p>
      <h1
        className="text-[25vw] md:text-[20vw] font-black leading-none tracking-tight"
        style={{ color }}
      >
        {sentiment ?? "..."}
      </h1>
      {average !== null && (
        <p className="text-white/30 text-sm mt-6">
          {average.toFixed(1)}/10 from {count.toLocaleString()} votes
        </p>
      )}
    </div>
  );
}
