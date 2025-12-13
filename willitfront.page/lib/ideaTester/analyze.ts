import type { IdeaTestInput, AnalysisBundle, SimilarPost, StatisticalPrediction } from './types';
import { analyzeTitle } from './analyzers/title';
import { analyzeDomain } from './analyzers/domain';
import { analyzeTiming } from './analyzers/timing';
import { analyzeType } from './analyzers/type';
import { analyzePenalties } from './analyzers/penalties';

// Weights for overall score
const WEIGHTS = {
  title: 0.35,
  domain: 0.25,
  timing: 0.20,
  type: 0.20,
};

export function runRuleBasedAnalysis(input: IdeaTestInput) {
  const titleScore = analyzeTitle(input.title);
  const domainScore = analyzeDomain(input.url);
  const timingScore = analyzeTiming(input.plannedTime);
  const typeScore = analyzeType(input.type);
  const penalties = analyzePenalties(input);

  const overallScore =
    titleScore.score * WEIGHTS.title +
    domainScore.score * WEIGHTS.domain +
    timingScore.score * WEIGHTS.timing +
    typeScore.score * WEIGHTS.type;

  // Apply base rate (only ~10% reach front page)
  // Max probability capped at 30% even for perfect score
  const frontPageProbability = Math.min(30, Math.round((overallScore / 100) * 30));

  return {
    titleScore,
    domainScore,
    timingScore,
    typeScore,
    penalties,
    overallScore: Math.round(overallScore),
    frontPageProbability,
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
  const ruleBasedAnalysis = runRuleBasedAnalysis(input);
  const statisticalPrediction = calculateStatistics(similarPosts);

  return {
    input,
    ruleBasedAnalysis,
    similarPosts,
    statisticalPrediction,
  };
}
