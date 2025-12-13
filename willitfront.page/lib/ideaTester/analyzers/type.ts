import type { TypeAnalysis } from '../types';

// Historical front page rates by content type
const BASE_RATES: Record<string, number> = {
  story: 0.10,      // Regular stories: ~10%
  show_hn: 0.08,    // Show HN: ~8%
  ask_hn: 0.10,     // Ask HN: ~10%
  launch_hn: 0.12,  // Launch HN: ~12% (launches tend to get attention)
};

export function analyzeType(type: 'story' | 'show_hn' | 'ask_hn' | 'launch_hn'): TypeAnalysis {
  const baseSuccessRate = BASE_RATES[type] || 0.10;

  // Convert to score (higher is better)
  // 10% rate = 50 score baseline
  const score = Math.round(baseSuccessRate * 500);

  return {
    score: Math.min(100, score),
    baseSuccessRate,
  };
}
