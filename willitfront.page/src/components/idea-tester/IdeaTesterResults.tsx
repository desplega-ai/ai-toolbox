import { AlertTriangle, CheckCircle, Clock, Lightbulb, TrendingUp } from 'lucide-react';

// Using a flexible type since streaming returns deeply partial objects
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DeepPartialReport = Record<string, any>;

interface IdeaTesterResultsProps {
  report: DeepPartialReport;
  isStreaming: boolean;
}

const VERDICT_CONFIG = {
  strong: { color: 'text-green-600', bg: 'bg-green-50', icon: '🟢' },
  moderate: { color: 'text-yellow-600', bg: 'bg-yellow-50', icon: '🟡' },
  challenging: { color: 'text-red-600', bg: 'bg-red-50', icon: '🔴' },
};

export function IdeaTesterResults({ report, isStreaming }: IdeaTesterResultsProps) {
  const level = report.verdict?.level as 'strong' | 'moderate' | 'challenging' | undefined;
  const verdictConfig = level ? VERDICT_CONFIG[level] : null;

  return (
    <div className="space-y-6">
      {/* Verdict */}
      {report.verdict && (
        <div className={`p-4 rounded-lg ${verdictConfig?.bg || 'bg-gray-50'}`}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-2xl">{verdictConfig?.icon}</span>
            <h2 className={`text-xl font-bold capitalize ${verdictConfig?.color}`}>
              {report.verdict.level}
            </h2>
          </div>
          <p className="text-gray-700">{report.verdict.summary}</p>
          <div className="mt-3 flex gap-4 text-sm">
            <div>
              <span className="font-medium">Front page:</span>{' '}
              <span className={verdictConfig?.color}>{report.verdict.frontPageProbability}%</span>
            </div>
            {report.verdict.expectedScoreRange && (
              <div>
                <span className="font-medium">Expected score:</span>{' '}
                {report.verdict.expectedScoreRange.low === report.verdict.expectedScoreRange.high
                  ? `~${report.verdict.expectedScoreRange.median ?? report.verdict.expectedScoreRange.low}`
                  : `${report.verdict.expectedScoreRange.low} - ${report.verdict.expectedScoreRange.high}`}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Strengths */}
      {report.strengths && report.strengths.length > 0 && (
        <div>
          <h3 className="font-bold flex items-center gap-2 mb-2">
            <CheckCircle className="h-5 w-5 text-green-500" />
            Strengths
          </h3>
          <div className="space-y-2">
            {report.strengths.map((s: { title?: string; description?: string; dataPoint?: string }, i: number) => (
              <div key={i} className="flex items-start gap-2 pl-2">
                <span className="text-green-500 mt-1">✓</span>
                <div>
                  <strong>{s.title}</strong>: {s.description}
                  {s.dataPoint && (
                    <span className="text-gray-500 text-sm ml-2">({s.dataPoint})</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Risks */}
      {report.risks && report.risks.length > 0 && (
        <div>
          <h3 className="font-bold flex items-center gap-2 mb-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            Risks
          </h3>
          <div className="space-y-2">
            {report.risks.map((r: { severity?: string; title?: string; description?: string; mitigation?: string }, i: number) => (
              <div key={i} className="flex items-start gap-2 pl-2">
                <span className={r.severity === 'high' ? 'text-red-500' : 'text-yellow-500'}>
                  ⚠
                </span>
                <div>
                  <strong>{r.title}</strong>
                  <span className={`text-xs ml-2 px-1.5 py-0.5 rounded ${
                    r.severity === 'high' ? 'bg-red-100 text-red-700' :
                    r.severity === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-gray-100 text-gray-700'
                  }`}>
                    {r.severity}
                  </span>
                  <p className="text-gray-600">{r.description}</p>
                  {r.mitigation && (
                    <p className="text-sm text-green-700 mt-1">→ {r.mitigation}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Similar Posts */}
      {report.similarPosts && (
        <div>
          <h3 className="font-bold flex items-center gap-2 mb-2">
            <TrendingUp className="h-5 w-5 text-blue-500" />
            Similar Posts
          </h3>
          {report.similarPosts.posts && report.similarPosts.posts.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-1">Title</th>
                  <th className="text-right py-1 w-20">Score</th>
                  <th className="text-right py-1 w-24">Comments</th>
                </tr>
              </thead>
              <tbody>
                {report.similarPosts.posts.map((p: { title?: string; score?: number; comments?: number; similarityReason?: string }, i: number) => (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="py-1 truncate max-w-xs" title={p.title}>{p.title}</td>
                    <td className="text-right py-1 text-orange-600">{p.score}</td>
                    <td className="text-right py-1 text-gray-500">{p.comments}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {report.similarPosts.insight && (
            <p className="text-sm text-gray-600 mt-2 italic">{report.similarPosts.insight}</p>
          )}
        </div>
      )}

      {/* Recommendations */}
      {report.recommendations && report.recommendations.length > 0 && (
        <div>
          <h3 className="font-bold flex items-center gap-2 mb-2">
            <Lightbulb className="h-5 w-5 text-purple-500" />
            Recommendations
          </h3>
          <div className="space-y-3">
            {[...report.recommendations]
              .sort((a, b) => a.priority - b.priority)
              .map((r, i) => (
                <div key={i} className="border-l-2 border-purple-300 pl-3">
                  <div className="font-medium">
                    <span className="text-purple-600 mr-2">{r.priority}.</span>
                    {r.action}
                  </div>
                  <p className="text-gray-600 text-sm">{r.details}</p>
                  {r.suggestedTitle && (
                    <code className="block bg-gray-100 p-2 mt-1 rounded text-sm">
                      "{r.suggestedTitle}"
                    </code>
                  )}
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Timing */}
      {report.timing && (
        <div className={`p-3 rounded-lg ${
          report.timing.isOptimal ? 'bg-green-50' : 'bg-yellow-50'
        }`}>
          <h3 className="font-bold flex items-center gap-2 mb-1">
            <Clock className={`h-5 w-5 ${
              report.timing.isOptimal ? 'text-green-500' : 'text-yellow-500'
            }`} />
            Timing: <span className="capitalize">{report.timing.currentRating}</span>
          </h3>
          <p className="text-gray-700">{report.timing.advice}</p>
          {report.timing.suggestedTime && (
            <p className="text-sm mt-1">
              <span className="font-medium">Suggested:</span>{' '}
              {report.timing.suggestedTime.dayOfWeek} at {report.timing.suggestedTime.hourUTC}:00 UTC
            </p>
          )}
        </div>
      )}

      {/* Loading indicator */}
      {isStreaming && (
        <div className="text-center text-gray-500 text-sm">
          <span className="animate-pulse">Analyzing...</span>
        </div>
      )}
    </div>
  );
}
