import type { DomainAnalysis } from '../types';

const PENALIZED_DOMAINS = new Map<string, number>([
  ['medium.com', 0.6],
  ['youtube.com', 0.7],
  ['reddit.com', 0.5],
  ['twitter.com', 0.7],
  ['x.com', 0.7],
  ['linkedin.com', 0.5],
  ['facebook.com', 0.4],
  ['businessinsider.com', 0.5],
  ['theverge.com', 0.6],
  ['techcrunch.com', 0.7],
  ['forbes.com', 0.6],
  ['wired.com', 0.7],
]);

const PERSONAL_BLOG_INDICATORS = [
  /\.github\.io$/,
  /\.netlify\.app$/,
  /\.vercel\.app$/,
  /\.pages\.dev$/,
  /^blog\./,
  /\.blog$/,
  /substack\.com$/,
];

function extractDomain(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

export function analyzeDomain(url: string | undefined): DomainAnalysis {
  if (!url) {
    return {
      score: 40, // Ask HN baseline
      domain: null,
      isPenalized: false,
      isPersonalBlog: false,
    };
  }

  const domain = extractDomain(url);
  if (!domain) {
    return {
      score: 30,
      domain: null,
      isPenalized: false,
      isPersonalBlog: false,
    };
  }

  // Check for personal blog
  const isPersonalBlog = PERSONAL_BLOG_INDICATORS.some(p => p.test(domain));
  if (isPersonalBlog) {
    return {
      score: 75, // 2.4x advantage
      domain,
      isPenalized: false,
      isPersonalBlog: true,
    };
  }

  // Check penalty list
  const penaltyFactor = PENALIZED_DOMAINS.get(domain);
  if (penaltyFactor !== undefined) {
    return {
      score: Math.round(50 * penaltyFactor),
      domain,
      isPenalized: true,
      penaltyFactor,
      isPersonalBlog: false,
    };
  }

  // GitHub gets slight bonus
  if (domain === 'github.com') {
    return {
      score: 60,
      domain,
      isPenalized: false,
      isPersonalBlog: false,
    };
  }

  return {
    score: 50, // Unknown domain baseline
    domain,
    isPenalized: false,
    isPersonalBlog: false,
  };
}
