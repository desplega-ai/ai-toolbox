import type { TitleAnalysis } from '../types';

const CLICKBAIT_PATTERNS = /\b(amazing|incredible|you won't believe|shocking|insane|unbelievable|mind-blowing)\b/i;
const TECH_TERMS = /\b(rust|go|golang|python|typescript|javascript|react|postgres|redis|kubernetes|docker|linux|aws|gcp|azure|llm|ai|ml|api|sql|graphql|grpc)\b/i;
const SUPERLATIVES = /\b(best|worst|only|always|never|everyone|nobody)\b/i;

export function analyzeTitle(title: string): TitleAnalysis {
  const wordCount = title.split(/\s+/).filter(w => w.length > 0).length;
  const charCount = title.length;

  const issues: string[] = [];
  let score = 50; // baseline

  // Word count scoring
  if (wordCount >= 7 && wordCount <= 12) score += 10;
  if (wordCount < 4) { score -= 15; issues.push('Title is too short'); }
  if (wordCount > 17) { score -= 15; issues.push('Title is too long'); }

  // Character count
  if (charCount > 80) { score -= 10; issues.push('Title exceeds 80 characters'); }

  // Clickbait detection
  const hasClickbait = CLICKBAIT_PATTERNS.test(title);
  if (hasClickbait) { score -= 20; issues.push('Contains clickbait language'); }

  // Superlatives
  if (SUPERLATIVES.test(title)) { score -= 5; issues.push('Contains superlatives'); }

  // Technical terms bonus
  const hasTechnicalTerms = TECH_TERMS.test(title);
  if (hasTechnicalTerms) score += 5;

  // Format detection
  let format = 'standard';
  if (/^Show HN:/i.test(title)) { format = 'Show HN'; score += 5; }
  else if (/^Ask HN:/i.test(title)) { format = 'Ask HN'; score += 3; }
  else if (/^Launch HN:/i.test(title)) { format = 'Launch HN'; }
  else if (/^Tell HN:/i.test(title)) { format = 'Tell HN'; }

  // Numbers in title (slight bonus)
  if (/\d/.test(title)) score += 2;

  return {
    score: Math.max(0, Math.min(100, score)),
    wordCount,
    hasClickbait,
    hasTechnicalTerms,
    format,
    issues,
  };
}
