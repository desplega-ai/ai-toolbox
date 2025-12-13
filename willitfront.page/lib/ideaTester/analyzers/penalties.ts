import type { PenaltyAnalysis, IdeaTestInput } from '../types';

const CONTROVERSY_PATTERNS = [
  { pattern: /\b(politics|trump|biden|election|abortion|gun\s+control|climate\s+change)\b/i, weight: 2 },
  { pattern: /\b(gender|diversity|dei|woke|cancel\s+culture)\b/i, weight: 2 },
  { pattern: /\b(crypto|nft|web3|bitcoin|ethereum|blockchain)\b/i, weight: 1 },
  { pattern: /\b(layoff|fired|remote\s+work|rto|return\s+to\s+office)\b/i, weight: 1 },
  { pattern: /\b(elon|musk|twitter|x\.com)\b/i, weight: 1 },
];

export function analyzePenalties(input: IdeaTestInput): PenaltyAnalysis {
  const controversyKeywords: string[] = [];
  let controversyScore = 0;

  for (const { pattern, weight } of CONTROVERSY_PATTERNS) {
    const match = input.title.match(pattern);
    if (match) {
      controversyKeywords.push(match[0]);
      controversyScore += weight;
    }
  }

  const controversyRisk: 'low' | 'medium' | 'high' =
    controversyScore >= 3 ? 'high' :
    controversyScore >= 1 ? 'medium' :
    'low';

  // Domain penalty (already computed, just summarize)
  const domainPenalty = 0; // Will be computed from domain analysis

  // Format penalty (e.g., all caps)
  let formatPenalty = 0;
  if (input.title === input.title.toUpperCase() && input.title.length > 10) {
    formatPenalty = 20; // All caps penalty
  }

  return {
    controversyRisk,
    controversyKeywords,
    domainPenalty,
    formatPenalty,
  };
}
