import type { IdeaTestInput, AnalysisBundle, SimilarPost, StatisticalPrediction } from './types';
import { analyzeTitle } from './analyzers/title';
import { analyzeDomain } from './analyzers/domain';
import { analyzeTiming } from './analyzers/timing';
import { analyzeType } from './analyzers/type';
import { analyzePenalties } from './analyzers/penalties';

// Gather metadata for AI to use in scoring
// AI has full discretion to weigh these factors
export function gatherMetadata(input: IdeaTestInput) {
  const titleAnalysis = analyzeTitle(input.title);
  const domainAnalysis = analyzeDomain(input.url);
  const timingAnalysis = analyzeTiming(input.plannedTime);
  const typeAnalysis = analyzeType(input.type);
  const penalties = analyzePenalties(input);

  return {
    titleAnalysis,
    domainAnalysis,
    timingAnalysis,
    typeAnalysis,
    penalties,
  };
}

export function calculateStatistics(similarPosts: SimilarPost[]): StatisticalPrediction {
  if (similarPosts.length < 3) {
    return {
      scoreRange: { p25: 1, median: 5, p75: 20 },
      commentRange: { p25: 0, median: 2, p75: 10 },
      sampleSize: similarPosts.length,
      confidence: 'low',
    };
  }

  const scores = similarPosts.map(p => p.score).sort((a, b) => a - b);
  const comments = similarPosts.map(p => p.comments).sort((a, b) => a - b);

  const percentile = (arr: number[], p: number) => {
    const idx = Math.floor((p / 100) * (arr.length - 1));
    return arr[idx];
  };

  return {
    scoreRange: {
      p25: percentile(scores, 25),
      median: percentile(scores, 50),
      p75: percentile(scores, 75),
    },
    commentRange: {
      p25: percentile(comments, 25),
      median: percentile(comments, 50),
      p75: percentile(comments, 75),
    },
    sampleSize: similarPosts.length,
    confidence: similarPosts.length >= 10 ? 'high' : 'medium',
  };
}

export function buildAnalysisBundle(
  input: IdeaTestInput,
  similarPosts: SimilarPost[]
): AnalysisBundle {
  const metadata = gatherMetadata(input);
  const statisticalPrediction = calculateStatistics(similarPosts);

  return {
    input,
    metadata,
    similarPosts,
    statisticalPrediction,
  };
}
