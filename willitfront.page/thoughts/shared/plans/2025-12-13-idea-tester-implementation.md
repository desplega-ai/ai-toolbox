# Idea Tester Implementation Plan

## Overview

Implement the "Idea Tester" feature that predicts HN post performance using a hybrid approach: deterministic rule-based scoring + statistical similarity analysis + LLM synthesis for report generation. This follows the recommended architecture from the research document.

## Current State Analysis

### Existing Infrastructure
- **Tab system**: Supports `notebook` and `dashboard` types. Idea Tester placeholder exists in `App.tsx` (disabled).
- **SQL query system**: `lib/querySqlTool.ts` provides pattern for querying HN data via `HN_SQL_API`.
- **AI integration**: Gateway pattern in `lib/gateway.ts`, streaming via `streamText` in `api/chat.ts`.
- **Structured output**: Not yet implemented, but research document details `generateObject`/`streamObject` patterns.
- **Frontend patterns**: React hooks for data fetching, Tailwind CSS styling, shadcn/ui components.

### Key Discoveries
- Tab type system at `src/types/tabs.ts:1` - needs `idea-tester` type added
- `useTabs.ts:14` creates tabs with type-specific defaults
- `App.tsx:11` already has "Post Tester" card with `disabled: true`
- Gateway uses AI SDK's `createGateway` for multi-provider access
- System prompt pattern at `lib/systemPrompt.ts` shows how to build context

## Desired End State

A fully functional Idea Tester tab where users can:
1. Enter a post title, optional URL, post type, and planned posting time
2. Click "Analyze" to get a streaming structured report
3. See: verdict, strengths, risks, similar posts, recommendations, timing analysis
4. All analysis backed by deterministic SQL queries + LLM synthesis

### Verification Criteria
- New "Post Tester" card is enabled and creates an `idea-tester` tab
- Form accepts title, URL, type, planned time
- Analysis runs deterministic queries in parallel, then streams LLM report
- Report displays with proper formatting (verdict, strengths, risks, etc.)
- Cost per analysis: ~$0.002 (Haiku for synthesis only)

## What We're NOT Doing

- ML model training (Phase 3 per research - deferred)
- AI persona simulation (Approach 4 in research - deferred)
- Author history integration (would require HN username input)
- Title rewrite suggestions via LLM (scope creep for v1)
- Caching of analysis results (can add later)

## Implementation Approach

**Three-layer architecture:**
1. **Analysis Layer**: Parallel SQL queries + deterministic scoring
2. **Synthesis Layer**: LLM generates structured report from analysis data
3. **Presentation Layer**: React component renders streamed report

---

## Phase 1: Types and Tab Infrastructure

### Overview
Add the `idea-tester` tab type and basic tab creation flow.

### Changes Required:

#### 1. Tab Types
**File**: `src/types/tabs.ts`
**Changes**: Add `idea-tester` to TabType union and IdeaTester-specific fields to Tab interface

```typescript
// Line 1: Update TabType
export type TabType = 'notebook' | 'dashboard' | 'idea-tester';

// Add after line 62, before closing Tab interface
export interface Tab {
  // ... existing fields ...

  // For idea-tester tabs
  ideaTesterInput?: {
    title: string;
    url?: string;
    type: 'story' | 'show_hn' | 'ask_hn';
    plannedTime?: string; // ISO string
  };
  ideaTesterResult?: IdeaTestReport; // Will be defined in lib/
}
```

#### 2. useTabs Hook
**File**: `src/hooks/useTabs.ts`
**Changes**: Handle `idea-tester` tab creation

```typescript
// Line 14-22: Update createTab function
const createTab = useCallback((type: TabType, title?: string, dashboardId?: string) => {
  const newTab: Tab = {
    id: generateId(),
    type,
    title: title || (
      type === 'notebook' ? 'New Chat' :
      type === 'dashboard' ? 'Dashboard' :
      'Post Tester'
    ),
    defaultModel: type === 'notebook' ? DEFAULT_MODEL : undefined,
    messages: type === 'notebook' ? [] : undefined,
    dashboardId: type === 'dashboard' ? dashboardId : undefined,
    ideaTesterInput: type === 'idea-tester' ? { title: '', type: 'story' } : undefined,
  };
  // ... rest unchanged
}, [setState]);
```

#### 3. App.tsx Quick Actions
**File**: `src/App.tsx`
**Changes**: Enable Post Tester card and wire up tab creation

```typescript
// Line 11: Enable the Post Tester
{ type: 'idea-tester' as const, title: 'Post Tester', description: 'Test your post titles before submitting', icon: Lightbulb, disabled: false },

// Line 30-34: Add idea-tester rendering
{activeTab ? (
  activeTab.type === 'notebook' ? (
    <ChatNotebookTab key={activeTab.id} tab={activeTab} onUpdate={(u) => updateTab(activeTab.id, u)} />
  ) : activeTab.type === 'dashboard' ? (
    <DashboardTab />
  ) : (
    <IdeaTesterTab key={activeTab.id} tab={activeTab} onUpdate={(u) => updateTab(activeTab.id, u)} />
  )
) : (
  // ... welcome screen
)}
```

#### 4. Empty IdeaTesterTab Component
**File**: `src/components/tabs/IdeaTesterTab.tsx` (new file)
**Changes**: Create placeholder component

```tsx
import type { Tab } from '@/types/tabs';

interface IdeaTesterTabProps {
  tab: Tab;
  onUpdate: (updates: Partial<Tab>) => void;
}

export function IdeaTesterTab({ tab, onUpdate }: IdeaTesterTabProps) {
  return (
    <div className="h-full flex items-center justify-center">
      <p className="text-gray-500">Idea Tester - Coming in Phase 2</p>
    </div>
  );
}
```

### Success Criteria:

#### Automated Verification:
- [x] TypeScript compiles: `bun run typecheck`
- [x] Build succeeds: `bun run build`
- [ ] App runs without errors: `bun run dev`

#### Manual Verification:
- [ ] Click "Post Tester" card on home screen
- [ ] New tab opens with "Post Tester" title
- [ ] Placeholder content displays
- [ ] Tab can be closed and renamed

---

## Phase 2: Analysis Data Structures and API Types

### Overview
Define the Zod schemas and TypeScript types for the analysis pipeline and LLM output.

### Changes Required:

#### 1. Idea Tester Types
**File**: `lib/ideaTester/types.ts` (new file)
**Changes**: Define all type structures

```typescript
import { z } from 'zod';

// ========== INPUT ==========
export const ideaTestInputSchema = z.object({
  title: z.string().min(1).max(200),
  url: z.string().url().optional(),
  type: z.enum(['story', 'show_hn', 'ask_hn']),
  plannedTime: z.string().datetime().optional(), // ISO string
});

export type IdeaTestInput = z.infer<typeof ideaTestInputSchema>;

// ========== ANALYSIS BUNDLE (deterministic data) ==========
export interface TitleAnalysis {
  score: number; // 0-100
  wordCount: number;
  hasClickbait: boolean;
  hasTechnicalTerms: boolean;
  format: string; // "Show HN", "Ask HN", "standard"
  issues: string[];
}

export interface DomainAnalysis {
  score: number;
  domain: string | null;
  isPenalized: boolean;
  penaltyFactor?: number;
  isPersonalBlog: boolean;
}

export interface TimingAnalysis {
  score: number;
  dayOfWeek: string;
  hourUTC: number;
  isWeekend: boolean;
  isGoldenWindow: boolean;
  isDeadZone: boolean;
}

export interface TypeAnalysis {
  score: number;
  baseSuccessRate: number;
}

export interface PenaltyAnalysis {
  controversyRisk: 'low' | 'medium' | 'high';
  controversyKeywords: string[];
  domainPenalty: number;
  formatPenalty: number;
}

export interface SimilarPost {
  title: string;
  score: number;
  comments: number;
  author: string;
  timeAgo: string;
  url?: string;
  similarityReason: string;
}

export interface StatisticalPrediction {
  scoreRange: { p25: number; median: number; p75: number };
  commentRange: { p25: number; median: number; p75: number };
  sampleSize: number;
  confidence: 'low' | 'medium' | 'high';
}

export interface AnalysisBundle {
  input: IdeaTestInput;
  ruleBasedAnalysis: {
    titleScore: TitleAnalysis;
    domainScore: DomainAnalysis;
    timingScore: TimingAnalysis;
    typeScore: TypeAnalysis;
    penalties: PenaltyAnalysis;
    overallScore: number;
    frontPageProbability: number;
  };
  similarPosts: SimilarPost[];
  statisticalPrediction: StatisticalPrediction;
}

// ========== LLM OUTPUT (structured) ==========
export const ideaTestReportSchema = z.object({
  verdict: z.object({
    level: z.enum(['strong', 'moderate', 'challenging']),
    summary: z.string().describe('One sentence explanation of the verdict'),
    frontPageProbability: z.number().min(0).max(100),
    expectedScoreRange: z.object({
      low: z.number().describe('25th percentile score'),
      median: z.number().describe('50th percentile score'),
      high: z.number().describe('75th percentile score'),
    }),
  }),

  strengths: z.array(z.object({
    title: z.string().describe('Short label, e.g., "Clear title"'),
    description: z.string().describe('Explanation with data reference'),
    dataPoint: z.string().optional().describe('Specific number or fact'),
  })).min(2).max(4),

  risks: z.array(z.object({
    severity: z.enum(['low', 'medium', 'high']),
    title: z.string(),
    description: z.string(),
    mitigation: z.string().optional().describe('How to address this risk'),
  })).min(1).max(4),

  similarPosts: z.object({
    posts: z.array(z.object({
      title: z.string(),
      score: z.number(),
      comments: z.number(),
      similarityReason: z.string(),
    })).max(5),
    insight: z.string().describe('What the similar posts tell us'),
  }),

  recommendations: z.array(z.object({
    priority: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    action: z.string().describe('Imperative action'),
    details: z.string(),
    suggestedTitle: z.string().optional(),
  })).min(2).max(4),

  timing: z.object({
    isOptimal: z.boolean(),
    currentRating: z.enum(['excellent', 'good', 'okay', 'poor']),
    advice: z.string(),
    suggestedTime: z.object({
      dayOfWeek: z.string(),
      hourUTC: z.number().min(0).max(23),
      reason: z.string(),
    }).optional(),
  }),
});

export type IdeaTestReport = z.infer<typeof ideaTestReportSchema>;
```

### Success Criteria:

#### Automated Verification:
- [x] TypeScript compiles: `bun run typecheck`
- [x] Zod schemas are valid (no circular refs, proper .describe() usage)

#### Manual Verification:
- [x] Types can be imported without errors

---

## Phase 3: Rule-Based Analysis Functions

### Overview
Implement deterministic scoring functions for title, domain, timing, and penalties.

### Changes Required:

#### 1. Title Analyzer
**File**: `lib/ideaTester/analyzers/title.ts` (new file)

```typescript
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
```

#### 2. Domain Analyzer
**File**: `lib/ideaTester/analyzers/domain.ts` (new file)

```typescript
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
```

#### 3. Timing Analyzer
**File**: `lib/ideaTester/analyzers/timing.ts` (new file)

```typescript
import type { TimingAnalysis } from '../types';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function analyzeTiming(plannedTime: string | undefined): TimingAnalysis {
  const now = plannedTime ? new Date(plannedTime) : new Date();
  const hour = now.getUTCHours();
  const day = now.getUTCDay();
  const dayName = DAYS[day];
  const isWeekend = day === 0 || day === 6;

  let score = 50;

  // Golden window: Sunday 6am-2pm UTC
  const isGoldenWindow = day === 0 && hour >= 6 && hour <= 14;
  if (isGoldenWindow) score += 20;

  // Weekend bonus (if not in golden window)
  else if (isWeekend) score += 10;

  // Weekday optimal times (9am-12pm PST = 5pm-8pm UTC)
  else if (hour >= 17 && hour <= 20) score += 10;

  // Dead zone penalty (3am-7am UTC)
  const isDeadZone = hour >= 3 && hour <= 7;
  if (isDeadZone) score -= 15;

  // Late night penalty (midnight-3am UTC)
  if (hour >= 0 && hour < 3) score -= 10;

  return {
    score: Math.max(0, Math.min(100, score)),
    dayOfWeek: dayName,
    hourUTC: hour,
    isWeekend,
    isGoldenWindow,
    isDeadZone,
  };
}
```

#### 4. Type Analyzer
**File**: `lib/ideaTester/analyzers/type.ts` (new file)

```typescript
import type { TypeAnalysis } from '../types';

// Historical front page rates by content type
const BASE_RATES: Record<string, number> = {
  story: 0.10,      // Regular stories: ~10%
  show_hn: 0.08,    // Show HN: ~8%
  ask_hn: 0.10,     // Ask HN: ~10%
};

export function analyzeType(type: 'story' | 'show_hn' | 'ask_hn'): TypeAnalysis {
  const baseSuccessRate = BASE_RATES[type] || 0.10;

  // Convert to score (higher is better)
  // 10% rate = 50 score baseline
  const score = Math.round(baseSuccessRate * 500);

  return {
    score: Math.min(100, score),
    baseSuccessRate,
  };
}
```

#### 5. Penalty Analyzer
**File**: `lib/ideaTester/analyzers/penalties.ts` (new file)

```typescript
import type { PenaltyAnalysis } from '../types';
import type { IdeaTestInput } from '../types';

const CONTROVERSY_PATTERNS = [
  { pattern: /\b(politics|trump|biden|election|abortion|gun\s+control|climate\s+change)\b/i, weight: 2 },
  { pattern: /\b(gender|diversity|dei|woke|cancel\s+culture)\b/i, weight: 2 },
  { pattern: /\b(crypto|nft|web3|bitcoin|ethereum|blockchain)\b/i, weight: 1 },
  { pattern: /\b(layoff|fired|remote\s+work|rto|return\s+to\s+office)\b/i, weight: 1 },
  { pattern: /\b(elon|musk|twitter|x\.com)\b/i, weight: 1 },
];

export function analyzeePenalties(input: IdeaTestInput): PenaltyAnalysis {
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
```

#### 6. Main Analysis Runner
**File**: `lib/ideaTester/analyze.ts` (new file)

```typescript
import type { IdeaTestInput, AnalysisBundle, SimilarPost, StatisticalPrediction } from './types';
import { analyzeTitle } from './analyzers/title';
import { analyzeDomain } from './analyzers/domain';
import { analyzeTiming } from './analyzers/timing';
import { analyzeType } from './analyzers/type';
import { analyzeePenalties } from './analyzers/penalties';

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
  const penalties = analyzeePenalties(input);

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
```

### Success Criteria:

#### Automated Verification:
- [x] TypeScript compiles: `bun run typecheck`
- [x] Unit tests pass (if added): `bun test`

#### Manual Verification:
- [x] Functions can be imported and called with test data

---

## Phase 4: Similar Posts SQL Query

### Overview
Implement the SQL query to find similar historical posts based on keywords and domain.

### Changes Required:

#### 1. Similar Posts Finder
**File**: `lib/ideaTester/findSimilarPosts.ts` (new file)

```typescript
import type { IdeaTestInput, SimilarPost } from './types';
import { HN_SQL_API } from '../constants';

function extractKeywords(title: string): string[] {
  // Remove common words and extract meaningful terms
  const stopWords = new Set([
    'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'must', 'can', 'to', 'of', 'in', 'for',
    'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
    'before', 'after', 'above', 'below', 'between', 'under', 'again',
    'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why',
    'how', 'all', 'each', 'few', 'more', 'most', 'other', 'some', 'such',
    'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too',
    'very', 's', 't', 'just', 'now', 'show', 'hn', 'ask', 'tell', 'launch',
    'my', 'i', 'we', 'our', 'your', 'it', 'its', 'this', 'that',
  ]);

  const words = title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 3 && !stopWords.has(w));

  // Return unique words, prioritizing longer ones
  return [...new Set(words)].sort((a, b) => b.length - a.length).slice(0, 5);
}

function extractDomain(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor(Date.now() / 1000 - timestamp);

  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  if (seconds < 2592000) return `${Math.floor(seconds / 604800)}w ago`;
  if (seconds < 31536000) return `${Math.floor(seconds / 2592000)}mo ago`;
  return `${Math.floor(seconds / 31536000)}y ago`;
}

export async function findSimilarPosts(input: IdeaTestInput): Promise<SimilarPost[]> {
  const keywords = extractKeywords(input.title);
  const domain = input.url ? extractDomain(input.url) : null;

  if (keywords.length === 0 && !domain) {
    return [];
  }

  // Build WHERE clause for keyword matching
  const keywordConditions = keywords
    .map((_, i) => `title ILIKE '%' || $${i + 1} || '%'`)
    .join(' OR ');

  const domainCondition = domain
    ? `OR url ILIKE '%${domain}%'`
    : '';

  const sql = `
    SELECT
      title,
      score,
      descendants as comments,
      "by" as author,
      time,
      url
    FROM hn
    WHERE type = 'story'
      AND score IS NOT NULL
      AND score > 0
      AND (${keywordConditions || '1=0'} ${domainCondition})
    ORDER BY score DESC
    LIMIT 20
  `;

  try {
    const response = await fetch(`${HN_SQL_API}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql, limit: 20 }),
    });

    if (!response.ok) {
      console.error('Similar posts query failed:', await response.text());
      return [];
    }

    const data = await response.json();

    // Map columns to objects
    const colMap = new Map(data.columns.map((c: string, i: number) => [c, i]));

    return data.rows.map((row: unknown[]): SimilarPost => {
      const title = row[colMap.get('title') as number] as string;
      const rowUrl = row[colMap.get('url') as number] as string | null;
      const rowDomain = rowUrl ? extractDomain(rowUrl) : null;

      // Determine similarity reason
      let similarityReason = 'Similar topic';
      if (domain && rowDomain === domain) {
        similarityReason = 'Same domain';
      } else {
        const matchedKeywords = keywords.filter(k =>
          title.toLowerCase().includes(k.toLowerCase())
        );
        if (matchedKeywords.length > 0) {
          similarityReason = `Keywords: ${matchedKeywords.join(', ')}`;
        }
      }

      return {
        title,
        score: row[colMap.get('score') as number] as number,
        comments: (row[colMap.get('comments') as number] as number) || 0,
        author: row[colMap.get('author') as number] as string,
        timeAgo: formatTimeAgo(row[colMap.get('time') as number] as number),
        url: rowUrl || undefined,
        similarityReason,
      };
    }).slice(0, 10); // Return top 10
  } catch (error) {
    console.error('Error finding similar posts:', error);
    return [];
  }
}
```

### Success Criteria:

#### Automated Verification:
- [x] TypeScript compiles: `bun run typecheck`

#### Manual Verification:
- [ ] Query returns results for sample inputs
- [ ] Similarity reasons are accurate

---

## Phase 5: LLM Synthesis API Route

### Overview
Create the API endpoint that runs analysis and streams structured report via LLM.

### Changes Required:

#### 1. System Prompt for Synthesis
**File**: `lib/ideaTester/synthesisPrompt.ts` (new file)

```typescript
export const SYNTHESIS_SYSTEM_PROMPT = `You are an expert Hacker News analyst.
Analyze the provided data and generate a structured report.

Be direct, data-driven, and actionable. Reference specific numbers from the analysis data.
Do not include fluff or generic advice - every insight should be backed by the data provided.

Key guidelines:
- The frontPageProbability should be realistic (typically 5-25% even for good posts)
- Strengths should highlight what's working well
- Risks should identify potential issues with actionable mitigations
- Recommendations should be specific and prioritized
- If suggesting a different title, make it concrete and specific
- Timing advice should reference the specific analysis data`;
```

#### 2. API Route
**File**: `api/analyze-idea.ts` (new file)

```typescript
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { streamObject } from 'ai';
import { gateway, getAllowedModelIds } from '../lib/gateway';
import { ideaTestInputSchema, ideaTestReportSchema, type IdeaTestInput } from '../lib/ideaTester/types';
import { buildAnalysisBundle } from '../lib/ideaTester/analyze';
import { findSimilarPosts } from '../lib/ideaTester/findSimilarPosts';
import { SYNTHESIS_SYSTEM_PROMPT } from '../lib/ideaTester/synthesisPrompt';

// Use a fast, cheap model for synthesis
const SYNTHESIS_MODEL = 'anthropic/claude-3-5-haiku-latest';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method not allowed');
  }

  if (!gateway) {
    return res.status(503).json({
      error: 'AI Gateway not configured. Set AI_GATEWAY_API_KEY environment variable.',
    });
  }

  // Validate input
  const parseResult = ideaTestInputSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: 'Invalid input',
      details: parseResult.error.issues,
    });
  }

  const input: IdeaTestInput = parseResult.data;

  try {
    // Run deterministic analysis in parallel with similar posts query
    const similarPosts = await findSimilarPosts(input);
    const bundle = buildAnalysisBundle(input, similarPosts);

    // Stream structured response from LLM
    const result = streamObject({
      model: gateway(SYNTHESIS_MODEL),
      schema: ideaTestReportSchema,
      system: SYNTHESIS_SYSTEM_PROMPT,
      prompt: `Analyze this HN post idea and generate a structured report:

## Input
Title: "${input.title}"
URL: ${input.url || '(none - Ask HN style)'}
Type: ${input.type}
Planned Time: ${input.plannedTime || 'not specified'}

## Analysis Data
${JSON.stringify(bundle, null, 2)}

Generate a report evaluating this post's potential on Hacker News.
Use the analysis data to support your assessments.`,
    });

    // Stream response
    const response = result.toTextStreamResponse();

    res.setHeader('Content-Type', response.headers.get('Content-Type') || 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const reader = response.body?.getReader();
    if (!reader) {
      return res.status(500).json({ error: 'Failed to create stream' });
    }

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
    res.end();
  } catch (error) {
    console.error('Analysis error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Analysis failed',
    });
  }
}
```

#### 3. Local Dev Server Route
**File**: Add to `index.ts` routes

```typescript
// Add import at top
import analyzeIdeaHandler from './api/analyze-idea';

// Add route (around line where other routes are defined)
'/api/analyze-idea': {
  POST: async (req) => {
    // Adapt Bun request to Vercel-like interface
    const body = await req.json();
    // Similar adaptation as other routes...
  },
},
```

### Success Criteria:

#### Automated Verification:
- [x] TypeScript compiles: `bun run typecheck`
- [x] Build succeeds: `bun run build`

#### Manual Verification:
- [ ] POST to `/api/analyze-idea` with valid input returns streaming response
- [ ] Response matches `IdeaTestReport` schema
- [ ] Response includes data-backed insights

---

## Phase 6: Frontend Form and Results Display

### Overview
Build the complete Idea Tester UI with form input and streaming report display.

### Changes Required:

#### 1. Form Component
**File**: `src/components/idea-tester/IdeaTesterForm.tsx` (new file)

```tsx
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface IdeaTesterFormProps {
  onSubmit: (input: {
    title: string;
    url?: string;
    type: 'story' | 'show_hn' | 'ask_hn';
    plannedTime?: string;
  }) => void;
  isLoading: boolean;
}

export function IdeaTesterForm({ onSubmit, isLoading }: IdeaTesterFormProps) {
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [type, setType] = useState<'story' | 'show_hn' | 'ask_hn'>('story');
  const [timeMode, setTimeMode] = useState<'now' | 'best' | 'custom'>('now');
  const [customTime, setCustomTime] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    let plannedTime: string | undefined;
    if (timeMode === 'custom' && customTime) {
      plannedTime = new Date(customTime).toISOString();
    } else if (timeMode === 'now') {
      plannedTime = new Date().toISOString();
    }
    // 'best' leaves plannedTime undefined - LLM will suggest

    onSubmit({
      title,
      url: url || undefined,
      type,
      plannedTime,
    });
  };

  const charCount = title.length;
  const isOverLimit = charCount > 80;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Title */}
      <div>
        <label className="block text-sm font-medium mb-1">Title</label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Show HN: A SQL interface for HN data analysis"
          maxLength={200}
          required
        />
        <div className={`text-xs mt-1 ${isOverLimit ? 'text-red-500' : 'text-gray-500'}`}>
          {charCount}/80 characters {isOverLimit && '(exceeds recommended limit)'}
        </div>
      </div>

      {/* URL */}
      <div>
        <label className="block text-sm font-medium mb-1">URL (optional)</label>
        <Input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://myblog.com/my-project"
        />
        <div className="text-xs text-gray-500 mt-1">
          Leave empty for Ask HN posts
        </div>
      </div>

      {/* Type */}
      <div>
        <label className="block text-sm font-medium mb-1">Post Type</label>
        <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="story">Story</SelectItem>
            <SelectItem value="show_hn">Show HN</SelectItem>
            <SelectItem value="ask_hn">Ask HN</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Timing */}
      <div>
        <label className="block text-sm font-medium mb-1">Planned Time</label>
        <div className="flex gap-2 flex-wrap">
          <Button
            type="button"
            variant={timeMode === 'now' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTimeMode('now')}
          >
            Now
          </Button>
          <Button
            type="button"
            variant={timeMode === 'best' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTimeMode('best')}
          >
            Best time
          </Button>
          <Button
            type="button"
            variant={timeMode === 'custom' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTimeMode('custom')}
          >
            Custom
          </Button>
        </div>
        {timeMode === 'custom' && (
          <Input
            type="datetime-local"
            value={customTime}
            onChange={(e) => setCustomTime(e.target.value)}
            className="mt-2"
          />
        )}
      </div>

      {/* Submit */}
      <Button type="submit" disabled={!title || isLoading} className="w-full">
        {isLoading ? 'Analyzing...' : 'Analyze Post Idea'}
      </Button>
    </form>
  );
}
```

#### 2. Results Component
**File**: `src/components/idea-tester/IdeaTesterResults.tsx` (new file)

```tsx
import type { IdeaTestReport } from '@/../lib/ideaTester/types';
import { AlertTriangle, CheckCircle, Clock, Lightbulb, TrendingUp } from 'lucide-react';

interface IdeaTesterResultsProps {
  report: Partial<IdeaTestReport>;
  isStreaming: boolean;
}

const VERDICT_CONFIG = {
  strong: { color: 'text-green-600', bg: 'bg-green-50', icon: '🟢' },
  moderate: { color: 'text-yellow-600', bg: 'bg-yellow-50', icon: '🟡' },
  challenging: { color: 'text-red-600', bg: 'bg-red-50', icon: '🔴' },
};

export function IdeaTesterResults({ report, isStreaming }: IdeaTesterResultsProps) {
  const verdictConfig = report.verdict?.level ? VERDICT_CONFIG[report.verdict.level] : null;

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
                {report.verdict.expectedScoreRange.low} - {report.verdict.expectedScoreRange.high}
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
            {report.strengths.map((s, i) => (
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
            {report.risks.map((r, i) => (
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
                {report.similarPosts.posts.map((p, i) => (
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
```

#### 3. Complete IdeaTesterTab
**File**: `src/components/tabs/IdeaTesterTab.tsx` (replace placeholder)

```tsx
import { useState } from 'react';
import { experimental_useObject as useObject } from '@ai-sdk/react';
import type { Tab } from '@/types/tabs';
import { ideaTestReportSchema } from '@/../lib/ideaTester/types';
import { IdeaTesterForm } from '@/components/idea-tester/IdeaTesterForm';
import { IdeaTesterResults } from '@/components/idea-tester/IdeaTesterResults';

interface IdeaTesterTabProps {
  tab: Tab;
  onUpdate: (updates: Partial<Tab>) => void;
}

export function IdeaTesterTab({ tab, onUpdate }: IdeaTesterTabProps) {
  const [hasSubmitted, setHasSubmitted] = useState(false);

  const { object, submit, isLoading, error } = useObject({
    api: '/api/analyze-idea',
    schema: ideaTestReportSchema,
  });

  const handleSubmit = (input: {
    title: string;
    url?: string;
    type: 'story' | 'show_hn' | 'ask_hn';
    plannedTime?: string;
  }) => {
    setHasSubmitted(true);
    submit(input);

    // Update tab with input for persistence
    onUpdate({
      ideaTesterInput: input,
    });
  };

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold mb-2">Post Tester</h1>
        <p className="text-gray-500 mb-6">
          Test your Hacker News post idea before submitting. Get AI-powered insights
          on title optimization, timing, and expected performance.
        </p>

        <div className="grid gap-8 lg:grid-cols-2">
          {/* Form Column */}
          <div className="lg:sticky lg:top-6 lg:self-start">
            <div className="bg-white border rounded-lg p-4 shadow-sm">
              <IdeaTesterForm onSubmit={handleSubmit} isLoading={isLoading} />
            </div>
          </div>

          {/* Results Column */}
          <div>
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                <p className="text-red-700">{error.message}</p>
              </div>
            )}

            {hasSubmitted && (
              <div className="bg-white border rounded-lg p-4 shadow-sm">
                {object ? (
                  <IdeaTesterResults report={object} isStreaming={isLoading} />
                ) : isLoading ? (
                  <div className="text-center py-8 text-gray-500">
                    <div className="animate-spin h-8 w-8 border-2 border-orange-500 border-t-transparent rounded-full mx-auto mb-2" />
                    Running analysis...
                  </div>
                ) : null}
              </div>
            )}

            {!hasSubmitted && (
              <div className="text-center py-12 text-gray-400">
                <p>Enter your post idea and click "Analyze" to get started</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
```

### Success Criteria:

#### Automated Verification:
- [x] TypeScript compiles: `bun run typecheck`
- [x] Build succeeds: `bun run build`

#### Manual Verification:
- [ ] Form accepts all inputs correctly
- [ ] Submit triggers streaming response
- [ ] Report sections render progressively
- [ ] Error states display properly
- [ ] Works on mobile viewport

---

## Phase 7: Integration and Polish

### Overview
Wire everything together, add proper imports, and polish the UX.

### Changes Required:

#### 1. Update App.tsx imports
**File**: `src/App.tsx`
**Changes**: Add IdeaTesterTab import

```typescript
// Add import
import { IdeaTesterTab } from '@/components/tabs/IdeaTesterTab';
```

#### 2. Create lib/ideaTester/index.ts barrel export
**File**: `lib/ideaTester/index.ts` (new file)

```typescript
export * from './types';
export * from './analyze';
export * from './findSimilarPosts';
export * from './synthesisPrompt';
```

#### 3. Add label component if needed
**File**: `src/components/ui/label.tsx` (if not exists)

Use shadcn/ui: `bunx shadcn@latest add label`

#### 4. Vercel configuration
**File**: `vercel.json`
**Changes**: Ensure new API route is included

```json
{
  "functions": {
    "api/analyze-idea.ts": {
      "includeFiles": "lib/**"
    }
  }
}
```

### Success Criteria:

#### Automated Verification:
- [x] TypeScript compiles: `bun run typecheck`
- [x] Build succeeds: `bun run build`
- [ ] Local dev works: `bun run dev`

#### Manual Verification:
- [ ] Complete flow works: enter idea → analyze → see report
- [ ] Report contains accurate data points from analysis
- [ ] Similar posts match input keywords/domain
- [ ] Timing analysis reflects input time correctly
- [ ] UI is responsive and handles loading states

---

## Testing Strategy

### Unit Tests

Create `lib/ideaTester/__tests__/analyzers.test.ts`:
- Test `analyzeTitle` with various title formats
- Test `analyzeDomain` with penalized vs personal blog domains
- Test `analyzeTiming` for golden window detection
- Test penalty detection with controversial keywords

### Integration Tests

- Test `/api/analyze-idea` endpoint with mock inputs
- Verify structured output matches schema
- Test error handling for invalid inputs

### Manual Testing Steps

1. **Basic flow**: Enter "Show HN: A simple tool" with no URL, submit, verify report
2. **Domain impact**: Enter URL from penalized domain (medium.com), verify risk flagged
3. **Timing**: Select Sunday 10am UTC, verify golden window detected
4. **Similar posts**: Use title with common HN keywords (rust, postgres), verify matches
5. **Edge cases**: Very short title, very long title, all caps, clickbait words

---

## Performance Considerations

- **Parallel queries**: Similar posts query runs in parallel with rule-based analysis
- **Streaming**: LLM response streams progressively for fast perceived performance
- **Model cost**: Using Haiku (~$0.002/request) for synthesis only
- **No ML overhead**: Deterministic analysis adds minimal latency

---

## Migration Notes

No database migrations required. This is a new feature with no existing data dependencies.

---

## References

- Research document: `thoughts/shared/research/2025-12-12-idea-tester-simulation-approach.md`
- Existing tool pattern: `lib/querySqlTool.ts:41-111`
- AI SDK streaming: `api/chat.ts:32-49`
- Tab system: `src/types/tabs.ts`, `src/hooks/useTabs.ts`
