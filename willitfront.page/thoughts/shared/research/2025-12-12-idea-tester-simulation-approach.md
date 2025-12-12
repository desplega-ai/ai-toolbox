---
date: 2025-12-12T15:45:00-05:00
researcher: Claude
git_commit: 755bdfdf1c77a7535fb5eef491d15014f1a2dec7
branch: main
repository: ai-toolbox
topic: "Idea Tester - Post Performance Simulation Approach"
tags: [research, idea-tester, ml-prediction, hn-algorithm, simulation]
status: complete
last_updated: 2025-12-12
last_updated_by: Claude
last_updated_note: "Added hybrid pipeline with LLM synthesis (Recommended Approach)"
related_to: thoughts/shared/research/2025-12-12-hn-analysis-tool-requirements.md
---

# Research: Idea Tester - Post Performance Simulation Approach

**Date**: 2025-12-12T15:45:00-05:00
**Researcher**: Claude
**Git Commit**: 755bdfdf1c77a7535fb5eef491d15014f1a2dec7
**Branch**: main
**Repository**: ai-toolbox

## Research Question

How should we implement the "Idea Tester" simulation feature that predicts HN post performance based on historical analysis?

## Summary

The Idea Tester can be implemented using a **hybrid approach** combining:
1. **Rule-based scoring** using known HN algorithm factors (penalties, timing, domains)
2. **Statistical similarity** to historical successful posts
3. **Optional ML model** for enhanced predictions
4. **LLM synthesis** to generate a coherent, actionable report

Key insight from research: **Best models achieve only ~60% accuracy** due to inherent unpredictability of social dynamics. The simulation should embrace this uncertainty and present results as probability ranges rather than definitive predictions.

---

## Recommended Approach: Hybrid Pipeline + LLM Synthesis

This is the **recommended architecture** - combining deterministic analysis methods with LLM-powered report generation.

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         IDEA TESTER PIPELINE                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  INPUT                                                                  │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ Title: "Show HN: SQL notebook for analyzing HN data"            │   │
│  │ URL: https://myblog.com/hn-tool                                 │   │
│  │ Type: show_hn                                                   │   │
│  │ Planned Time: Sunday 10am UTC                                   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                              │                                          │
│                              ▼                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                    PARALLEL ANALYSIS LAYER                        │  │
│  │                                                                   │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐               │  │
│  │  │ Rule-Based  │  │ Statistical │  │ ML Model    │               │  │
│  │  │ Scoring     │  │ Similarity  │  │ (Optional)  │               │  │
│  │  │             │  │             │  │             │               │  │
│  │  │ • Title     │  │ • Top 10    │  │ • XGBoost   │               │  │
│  │  │ • Domain    │  │   similar   │  │   probability│              │  │
│  │  │ • Timing    │  │   posts     │  │ • Confidence │              │  │
│  │  │ • Penalties │  │ • Score     │  │   interval  │               │  │
│  │  │ • Type      │  │   ranges    │  │             │               │  │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘               │  │
│  │         │                │                │                       │  │
│  └─────────┼────────────────┼────────────────┼───────────────────────┘  │
│            │                │                │                          │
│            ▼                ▼                ▼                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                    STRUCTURED DATA LAYER                          │  │
│  │                                                                   │  │
│  │  {                                                                │  │
│  │    "ruleBasedAnalysis": { ... },                                  │  │
│  │    "similarPosts": [ ... ],                                       │  │
│  │    "mlPrediction": { ... }                                        │  │
│  │  }                                                                │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                              │                                          │
│                              ▼                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                    LLM SYNTHESIS LAYER                            │  │
│  │                                                                   │  │
│  │  Takes all analysis data + generates human-readable report        │  │
│  │  with consistent format, actionable insights, and reasoning       │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                              │                                          │
│                              ▼                                          │
│  OUTPUT                                                                 │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ Formatted Report (Markdown/HTML)                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Data Structures

#### Input
```typescript
interface IdeaTestInput {
  title: string;
  url?: string;
  type: 'story' | 'show_hn' | 'ask_hn';
  plannedTime?: Date;
}
```

#### Analysis Results (passed to LLM)
```typescript
interface AnalysisBundle {
  input: IdeaTestInput;

  // From Approach 1: Rule-Based
  ruleBasedAnalysis: {
    titleScore: {
      score: number;          // 0-100
      wordCount: number;
      hasClickbait: boolean;
      hasTechnicalTerms: boolean;
      format: string;         // "Show HN", "Ask HN", "standard"
      issues: string[];       // ["Too long", "Contains superlatives"]
    };
    domainScore: {
      score: number;
      domain: string;
      isPenalized: boolean;
      penaltyFactor?: number;
      isPersonalBlog: boolean;
    };
    timingScore: {
      score: number;
      dayOfWeek: string;
      hourUTC: number;
      isWeekend: boolean;
      isGoldenWindow: boolean;
      isDeadZone: boolean;
    };
    typeScore: {
      score: number;
      baseSuccessRate: number;  // e.g., 8% for Show HN
    };
    penalties: {
      controversyRisk: 'low' | 'medium' | 'high';
      controversyKeywords: string[];
      domainPenalty: number;
      formatPenalty: number;
    };
    overallScore: number;       // Weighted combination
    frontPageProbability: number;
  };

  // From Approach 2: Statistical Similarity
  similarPosts: Array<{
    title: string;
    score: number;
    comments: number;
    author: string;
    timeAgo: string;
    url?: string;
    similarityReason: string;  // "Same domain", "Similar keywords"
  }>;
  statisticalPrediction: {
    scoreRange: { p25: number; median: number; p75: number };
    commentRange: { p25: number; median: number; p75: number };
    sampleSize: number;
    confidence: 'low' | 'medium' | 'high';
  };

  // From Approach 3: ML Model (optional)
  mlPrediction?: {
    frontPageProbability: number;
    confidence: number;
    featureImportance: Array<{
      feature: string;
      contribution: number;  // positive or negative
    }>;
  };
}
```

### Implementation

#### Step 1: Run Analysis Pipeline
```typescript
async function analyzePost(input: IdeaTestInput): Promise<AnalysisBundle> {
  // Run all analyses in parallel
  const [ruleBasedAnalysis, similarPosts, mlPrediction] = await Promise.all([
    runRuleBasedAnalysis(input),
    findSimilarPosts(input),
    runMLPrediction(input).catch(() => undefined), // Optional, may not exist
  ]);

  // Calculate statistical predictions from similar posts
  const statisticalPrediction = calculateStatistics(similarPosts);

  return {
    input,
    ruleBasedAnalysis,
    similarPosts,
    statisticalPrediction,
    mlPrediction,
  };
}
```

#### Step 2: Rule-Based Analysis
```typescript
async function runRuleBasedAnalysis(input: IdeaTestInput) {
  const titleScore = analyzeTitle(input.title);
  const domainScore = analyzeDomain(input.url);
  const timingScore = analyzeTiming(input.plannedTime);
  const typeScore = analyzeType(input.type);
  const penalties = detectPenalties(input);

  const overallScore =
    titleScore.score * 0.35 +
    domainScore.score * 0.25 +
    timingScore.score * 0.20 +
    typeScore.score * 0.20;

  // Apply base rate (only ~10% reach front page)
  const frontPageProbability = Math.min(30, (overallScore / 100) * 30);

  return {
    titleScore,
    domainScore,
    timingScore,
    typeScore,
    penalties,
    overallScore,
    frontPageProbability,
  };
}
```

#### Step 3: Statistical Similarity
```typescript
async function findSimilarPosts(input: IdeaTestInput): Promise<SimilarPost[]> {
  const keywords = extractKeywords(input.title);
  const domain = input.url ? extractDomain(input.url) : null;

  // Query HN API for similar posts
  const sql = `
    SELECT title, score, descendants, "by", time, url
    FROM hn
    WHERE type = 'story'
      AND score IS NOT NULL
      AND (
        ${keywords.map((k, i) => `title ILIKE '%' || $keyword${i} || '%'`).join(' OR ')}
        ${domain ? `OR url LIKE '%${domain}%'` : ''}
      )
    ORDER BY score DESC
    LIMIT 10
  `;

  const results = await queryApi(sql, keywords);

  return results.map(r => ({
    ...r,
    timeAgo: formatTimeAgo(r.time),
    similarityReason: determineSimilarity(input, r),
  }));
}
```

#### Step 4: LLM Synthesis (Vercel AI SDK + Structured Output)

Using the Vercel AI SDK with Zod for type-safe structured output:

```typescript
import { generateObject } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';

// Zod schema for structured output (provides runtime validation + TypeScript types)
const ideaTestReportSchema = z.object({
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
    dataPoint: z.string().optional().describe('Specific number or fact from analysis'),
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
    insight: z.string().describe('What the similar posts tell us about expectations'),
  }),

  recommendations: z.array(z.object({
    priority: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    action: z.string().describe('Imperative action, e.g., "Add specificity"'),
    details: z.string(),
    suggestedTitle: z.string().optional().describe('Alternative title if recommending change'),
  })).min(2).max(4),

  timing: z.object({
    isOptimal: z.boolean(),
    currentRating: z.enum(['excellent', 'good', 'okay', 'poor']),
    advice: z.string(),
    suggestedTime: z.object({
      dayOfWeek: z.string(),
      hourUTC: z.number().min(0).max(23),
      reason: z.string(),
    }).optional().describe('Only include if suggesting a different time'),
  }),
});

// Infer TypeScript type from Zod schema
type IdeaTestReport = z.infer<typeof ideaTestReportSchema>;

// System prompt for the LLM
const SYNTHESIS_SYSTEM_PROMPT = `You are an expert Hacker News analyst.
Analyze the provided data and generate a structured report.
Be direct, data-driven, and actionable. Reference specific numbers from the analysis.
Do not include fluff or generic advice - every insight should be backed by the data provided.`;

async function generateReport(bundle: AnalysisBundle): Promise<IdeaTestReport> {
  const { object } = await generateObject({
    model: anthropic('claude-3-5-haiku-latest'),
    schema: ideaTestReportSchema,
    system: SYNTHESIS_SYSTEM_PROMPT,
    prompt: `Analyze this HN post idea and generate a structured report:

## Input
Title: "${bundle.input.title}"
URL: ${bundle.input.url || '(none - Ask HN)'}
Type: ${bundle.input.type}
Planned Time: ${bundle.input.plannedTime?.toISOString() || 'not specified'}

## Analysis Data
${JSON.stringify(bundle, null, 2)}

Generate a report evaluating this post's potential on Hacker News.
Use the analysis data to support your assessments.`,
  });

  return object;
}
```

#### Streaming Support (for real-time UI updates)

```typescript
import { streamObject } from 'ai';

async function generateReportStreaming(
  bundle: AnalysisBundle,
  onPartialObject: (partial: Partial<IdeaTestReport>) => void
): Promise<IdeaTestReport> {
  const { partialObjectStream, object } = streamObject({
    model: anthropic('claude-3-5-haiku-latest'),
    schema: ideaTestReportSchema,
    system: SYNTHESIS_SYSTEM_PROMPT,
    prompt: `Analyze this HN post idea...${JSON.stringify(bundle)}`,
  });

  // Stream partial updates to UI
  for await (const partialObject of partialObjectStream) {
    onPartialObject(partialObject);
  }

  // Return final validated object
  return object;
}

// Usage in React with useObject hook
import { useObject } from '@ai-sdk/react';

function IdeaTestForm() {
  const { object, submit, isLoading } = useObject({
    api: '/api/analyze-idea',
    schema: ideaTestReportSchema,
  });

  return (
    <div>
      <button onClick={() => submit({ title: '...', url: '...' })} disabled={isLoading}>
        Analyze
      </button>

      {/* Renders progressively as data streams in */}
      {object && <IdeaTestResults report={object} />}
    </div>
  );
}
```

#### API Route (Next.js / Bun)

```typescript
// src/api/analyze-idea.ts (Bun.serve route)
import { streamObject } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';

export async function POST(req: Request) {
  const { title, url, type, plannedTime } = await req.json();

  // Run analysis pipeline
  const bundle = await analyzePost({ title, url, type, plannedTime });

  // Stream structured response
  const result = streamObject({
    model: anthropic('claude-3-5-haiku-latest'),
    schema: ideaTestReportSchema,
    system: SYNTHESIS_SYSTEM_PROMPT,
    prompt: `Analyze this HN post idea...${JSON.stringify(bundle)}`,
  });

  return result.toTextStreamResponse();
}
```

#### Dependencies

```bash
bun add ai @ai-sdk/anthropic zod
```

### Example Output

Given input:
```
Title: "Show HN: SQL notebook for analyzing HN data"
URL: https://myblog.com/hn-tool
Type: show_hn
Time: Sunday 10am UTC
```

Structured JSON response from LLM:
```json
{
  "verdict": {
    "level": "strong",
    "summary": "Clear technical utility with excellent timing positions this well above average Show HN posts",
    "frontPageProbability": 18,
    "expectedScoreRange": {
      "low": 15,
      "median": 45,
      "high": 120
    }
  },
  "strengths": [
    {
      "title": "Clear, descriptive title",
      "description": "States exactly what the tool does without hype or marketing language",
      "dataPoint": "Title score: 72/100"
    },
    {
      "title": "Personal blog domain",
      "description": "Personal blogs have 2.4x advantage over corporate sources on HN",
      "dataPoint": "Domain score: 75/100"
    },
    {
      "title": "Excellent timing",
      "description": "Sunday 10am UTC falls within the golden window for HN submissions",
      "dataPoint": "15.7% breakout rate vs 9% average"
    },
    {
      "title": "Technical utility",
      "description": "SQL and data analysis tools consistently engage the HN developer audience"
    }
  ],
  "risks": [
    {
      "severity": "medium",
      "title": "Show HN baseline is low",
      "description": "Only ~8% of Show HN posts reach the front page regardless of quality",
      "mitigation": "Ensure demo is instantly accessible without signup"
    },
    {
      "severity": "low",
      "title": "Self-referential topic",
      "description": "Posts about HN itself can feel navel-gazing to some users",
      "mitigation": "Focus on the SQL/analysis angle rather than the HN aspect"
    },
    {
      "severity": "low",
      "title": "No live demo indicator",
      "description": "Title doesn't signal that there's a working demo available"
    }
  ],
  "similarPosts": {
    "posts": [
      {
        "title": "Show HN: InstantDB - A Modern Firebase",
        "score": 1145,
        "comments": 287,
        "similarityReason": "Show HN + database/data tool"
      },
      {
        "title": "I built a SQL interface for exploring datasets",
        "score": 342,
        "comments": 89,
        "similarityReason": "SQL + data exploration"
      },
      {
        "title": "Show HN: Query HN data with SQL",
        "score": 89,
        "comments": 23,
        "similarityReason": "Same topic: SQL + HN data"
      }
    ],
    "insight": "SQL/data tools show high variance (89-1,145 pts). Success correlates strongly with demo quality and first-comment engagement. The directly comparable post scored 89, but better-executed tools reach 300+."
  },
  "recommendations": [
    {
      "priority": 1,
      "action": "Add specificity to title",
      "details": "Include a concrete number or unique angle to stand out",
      "suggestedTitle": "Show HN: SQL notebook for analyzing 40M HN posts"
    },
    {
      "priority": 2,
      "action": "Ensure instant demo access",
      "details": "Top Show HN posts have working demos with no signup barriers. Verify the demo loads quickly and works on mobile."
    },
    {
      "priority": 3,
      "action": "Prepare engaging first comment",
      "details": "Write a comment explaining your motivation, technical choices, and what makes this different from existing tools."
    }
  ],
  "timing": {
    "isOptimal": true,
    "currentRating": "excellent",
    "advice": "Sunday 10am UTC is one of the best times to post. The golden window (6am-2pm UTC on weekends) has 15.7% breakout rate compared to 9% average. No changes needed."
  }
}
```

#### UI Rendering Example

The structured output makes UI rendering straightforward:

```tsx
function IdeaTestResults({ report }: { report: IdeaTestReport }) {
  const verdictColors = {
    strong: 'text-green-600',
    moderate: 'text-yellow-600',
    challenging: 'text-red-600',
  };

  const verdictIcons = {
    strong: '🟢',
    moderate: '🟡',
    challenging: '🔴',
  };

  return (
    <div className="space-y-6">
      {/* Verdict */}
      <div className={`p-4 rounded-lg ${verdictColors[report.verdict.level]}`}>
        <h2 className="text-xl font-bold">
          {verdictIcons[report.verdict.level]} {report.verdict.level.toUpperCase()}
        </h2>
        <p>{report.verdict.summary}</p>
        <div className="mt-2 flex gap-4">
          <span>Front page: {report.verdict.frontPageProbability}%</span>
          <span>
            Score: {report.verdict.expectedScoreRange.low} - {report.verdict.expectedScoreRange.high}
          </span>
        </div>
      </div>

      {/* Strengths */}
      <div>
        <h3 className="font-bold">Strengths</h3>
        {report.strengths.map((s, i) => (
          <div key={i} className="flex items-start gap-2">
            <span className="text-green-500">✓</span>
            <div>
              <strong>{s.title}</strong>: {s.description}
              {s.dataPoint && <span className="text-gray-500 ml-2">({s.dataPoint})</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Risks */}
      <div>
        <h3 className="font-bold">Risks</h3>
        {report.risks.map((r, i) => (
          <div key={i} className="flex items-start gap-2">
            <span className={r.severity === 'high' ? 'text-red-500' : 'text-yellow-500'}>⚠</span>
            <div>
              <strong>{r.title}</strong>: {r.description}
              {r.mitigation && <p className="text-sm text-gray-600">→ {r.mitigation}</p>}
            </div>
          </div>
        ))}
      </div>

      {/* Similar Posts Table */}
      <div>
        <h3 className="font-bold">Similar Posts</h3>
        <table className="w-full">
          <thead>
            <tr><th>Title</th><th>Score</th><th>Comments</th></tr>
          </thead>
          <tbody>
            {report.similarPosts.posts.map((p, i) => (
              <tr key={i}>
                <td>{p.title}</td>
                <td>{p.score}</td>
                <td>{p.comments}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-sm mt-2">{report.similarPosts.insight}</p>
      </div>

      {/* Recommendations */}
      <div>
        <h3 className="font-bold">Recommendations</h3>
        {report.recommendations
          .sort((a, b) => a.priority - b.priority)
          .map((r, i) => (
            <div key={i}>
              <strong>{r.priority}. {r.action}</strong>
              <p>{r.details}</p>
              {r.suggestedTitle && (
                <code className="block bg-gray-100 p-2 mt-1">"{r.suggestedTitle}"</code>
              )}
            </div>
          ))}
      </div>

      {/* Timing */}
      <div className={report.timing.isOptimal ? 'text-green-600' : 'text-yellow-600'}>
        <h3 className="font-bold">Timing: {report.timing.currentRating.toUpperCase()}</h3>
        <p>{report.timing.advice}</p>
        {report.timing.suggestedTime && (
          <p>
            Suggested: {report.timing.suggestedTime.dayOfWeek} at{' '}
            {report.timing.suggestedTime.hourUTC}:00 UTC
          </p>
        )}
      </div>
    </div>
  );
}
```

### Cost Analysis

| Component | Cost | Notes |
|-----------|------|-------|
| Rule-based analysis | $0 | Pure computation |
| SQL similarity search | $0 | Database query |
| ML prediction | $0 | Pre-trained model |
| LLM synthesis | ~$0.002 | Haiku, ~500 tokens in/out |
| **Total per analysis** | **~$0.002** | Very cost effective |

Compare to persona approach: ~$0.04/test (20x more expensive)

### Why This Approach Works

| Benefit | Explanation |
|---------|-------------|
| **Deterministic + Creative** | Analysis is reliable; LLM handles presentation |
| **Low cost** | Single LLM call for synthesis only |
| **Consistent format** | Structured prompt ensures predictable output |
| **Explainable** | All numbers come from traceable analysis |
| **Fast** | Parallel analysis, single LLM call |
| **Extensible** | Easy to add new analysis modules |

### Implementation Priority

1. **Phase 1**: Rule-based + Similar posts + Basic LLM synthesis
2. **Phase 2**: Add ML model when more training data available
3. **Phase 3**: Refine LLM prompt based on user feedback

---

## Individual Analysis Approaches (Components)

The following sections detail each analysis approach that feeds into the hybrid pipeline.

### Approach 1: Rule-Based Scoring

A deterministic scoring system based on documented HN factors:

```typescript
interface IdeaTestInput {
  title: string;
  url?: string;          // Optional - blank for Ask HN
  type: 'story' | 'show_hn' | 'ask_hn';
  plannedTime?: Date;    // When they plan to post
}

interface SimulationResult {
  frontPageProbability: number;  // 0-100%
  expectedScoreRange: [number, number];  // 25th-75th percentile
  expectedCommentRange: [number, number];
  riskFactors: RiskFactor[];
  optimizationSuggestions: Suggestion[];
  similarSuccessfulPosts: HistoricalPost[];
  confidenceLevel: 'low' | 'medium' | 'high';
}
```

### Scoring Components

#### 1. Title Score (Weight: 35%)

| Factor | Positive | Negative |
|--------|----------|----------|
| Length | 7-12 words optimal | <4 or >17 words |
| Format | Descriptive, factual | Clickbait, superlatives |
| Technical terms | Programming languages, tools | Vague buzzwords |
| Question mark | Good for Ask HN | Suspicious for stories |
| Numbers | "7 ways...", versions | N/A |

```typescript
function scoreTile(title: string): number {
  let score = 50; // baseline

  const wordCount = title.split(/\s+/).length;
  if (wordCount >= 7 && wordCount <= 12) score += 10;
  if (wordCount < 4 || wordCount > 17) score -= 15;

  // Clickbait detection
  const clickbaitPatterns = /\b(amazing|incredible|you won't believe|shocking)\b/i;
  if (clickbaitPatterns.test(title)) score -= 20;

  // Technical terms bonus
  const techTerms = /\b(rust|go|python|typescript|react|postgres|redis|kubernetes)\b/i;
  if (techTerms.test(title)) score += 5;

  // Show HN format
  if (/^Show HN:/i.test(title)) score += 5;

  return Math.max(0, Math.min(100, score));
}
```

#### 2. Domain Score (Weight: 25%)

Based on documented penalties and success rates:

| Domain Category | Score Modifier |
|-----------------|----------------|
| Personal blog | +15 (2.4x advantage) |
| GitHub project | +5 |
| Major news (BBC, NYT) | +10 |
| Penalized domains | -20 to -40 |
| No URL (Ask HN) | -10 |

```typescript
const PENALIZED_DOMAINS = new Map([
  ['medium.com', 0.6],
  ['youtube.com', 0.7],
  ['reddit.com', 0.5],
  ['github.com', 0.8],  // Light penalty
  ['businessinsider.com', 0.5],
  ['theverge.com', 0.6],
]);

function scoreDomain(url: string | undefined): number {
  if (!url) return 40; // Ask HN baseline

  const domain = extractDomain(url);

  // Check for personal blog indicators
  if (isLikelyPersonalBlog(domain)) return 75;

  // Check penalty list
  const penalty = PENALIZED_DOMAINS.get(domain);
  if (penalty) return 50 * penalty;

  return 50; // Unknown domain baseline
}
```

#### 3. Timing Score (Weight: 20%)

| Time Factor | Score Modifier |
|-------------|----------------|
| Weekend | +15 (20-30% advantage) |
| Sunday 6am-2pm UTC | +20 (golden window) |
| 3am-7am UTC | -15 (dead zone) |
| Weekday 9am-12pm PST | +10 (high traffic) |

```typescript
function scoreTime(plannedTime: Date): number {
  const hour = plannedTime.getUTCHours();
  const day = plannedTime.getUTCDay();
  const isWeekend = day === 0 || day === 6;

  let score = 50;

  // Weekend bonus
  if (isWeekend) score += 15;

  // Sunday golden window (6am-2pm UTC)
  if (day === 0 && hour >= 6 && hour <= 14) score += 10;

  // Dead zone penalty
  if (hour >= 3 && hour <= 7) score -= 15;

  return score;
}
```

#### 4. Content Type Score (Weight: 20%)

Based on historical front page rates:

| Content Type | Base Success Rate |
|--------------|-------------------|
| Technical tutorial | 15% |
| Open source release | 12% |
| Industry news | 11% |
| Show HN | 8% |
| Ask HN | 10% |
| Product launch | 4% |

### Final Probability Calculation

```typescript
function calculateFrontPageProbability(input: IdeaTestInput): number {
  const titleScore = scoreTile(input.title) * 0.35;
  const domainScore = scoreDomain(input.url) * 0.25;
  const timeScore = scoreTime(input.plannedTime) * 0.20;
  const typeScore = scoreContentType(input.type) * 0.20;

  const rawScore = titleScore + domainScore + timeScore + typeScore;

  // Apply base rate (only ~10% reach front page)
  const probability = (rawScore / 100) * 0.30; // Max 30% even for perfect score

  return Math.round(probability * 100);
}
```

---

### Approach 2: Statistical Similarity (Enhanced)

Use the available HN data to find similar historical posts:

```typescript
async function findSimilarPosts(title: string): Promise<HistoricalPost[]> {
  // Use SQL to find posts with similar characteristics
  const sql = `
    SELECT title, score, descendants, "by", time, url
    FROM hn
    WHERE type = 'story'
      AND (
        -- Title word overlap
        title ILIKE '%' || $keyword1 || '%'
        OR title ILIKE '%' || $keyword2 || '%'
      )
    ORDER BY score DESC
    LIMIT 10
  `;

  // Extract key terms from input title
  const keywords = extractKeyTerms(title);

  return await queryApi(sql, { keyword1: keywords[0], keyword2: keywords[1] });
}

function predictFromSimilar(similarPosts: HistoricalPost[]): ScoreRange {
  if (similarPosts.length < 3) {
    return { low: 1, median: 5, high: 20, confidence: 'low' };
  }

  const scores = similarPosts.map(p => p.score).sort((a, b) => a - b);

  return {
    low: percentile(scores, 25),
    median: percentile(scores, 50),
    high: percentile(scores, 75),
    confidence: similarPosts.length >= 10 ? 'high' : 'medium'
  };
}
```

---

### Approach 3: ML-Enhanced (Future/Optional)

For more sophisticated predictions, a machine learning model could be trained:

#### Recommended Model Stack

| Component | Recommendation | Rationale |
|-----------|----------------|-----------|
| Model | XGBoost Classifier | Works well with ~1000 samples, interpretable |
| Text Features | Sentence embeddings | BERT or Sentence-BERT for semantic understanding |
| Uncertainty | Gaussian Process calibration | Provides confidence intervals |

#### Features to Extract

**Title Features:**
- Word count, character count
- Sentiment score (VADER or similar)
- Readability score (Flesch-Kincaid)
- Presence of numbers, questions, technical terms
- TF-IDF similarity to successful titles

**Domain Features:**
- Is personal blog (boolean)
- Penalty domain (boolean + factor)
- Domain historical average score

**Temporal Features:**
- Hour of day (cyclical encoding)
- Day of week (one-hot)
- Is weekend (boolean)

**Author Features (if available):**
- Historical karma
- Previous post success rate
- Account age

#### Training Approach

```python
from xgboost import XGBClassifier
from sklearn.model_selection import StratifiedKFold

# Binary classification: front_page (score > 50) vs not
model = XGBClassifier(
    n_estimators=100,
    max_depth=4,        # Shallow to prevent overfitting
    learning_rate=0.1,
    reg_alpha=0.1,
    reg_lambda=1.0,
    scale_pos_weight=9  # Handle class imbalance (90% don't reach front page)
)

# 5-fold cross-validation for reliable estimates
cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
```

---

### Approach 4: LLM-Based User Simulation (Experimental)

This approach simulates HN user behavior using AI personas, inspired by the [Every.to experiment](https://every.to/also-true-for-humans/i-cloned-2-000-hacker-news-users-to-predict-viral-posts) that achieved **60% accuracy** with 1,903 AI personas.

#### Concept

Instead of predicting scores directly, we simulate how different types of HN users would react to a post:

```
┌─────────────────────────────────────────────────────────────┐
│                    User Simulation Flow                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. Cluster historical users by behavior                    │
│     └── Commenter vs Poster                                 │
│     └── Topic interests (security, dev tools, news, etc.)  │
│     └── Activity level (karma, frequency)                   │
│                                                             │
│  2. Create AI personas from clusters                        │
│     └── "The Security Expert" (posts about CVEs, breaches) │
│     └── "The Dev Tools Enthusiast" (Show HN, open source)  │
│     └── "The News Curator" (tech industry, startups)       │
│     └── "The Skeptic" (critical comments, fact-checks)     │
│                                                             │
│  3. Simulate voting for hypothetical post                   │
│     └── Each persona evaluates: "Would I upvote this?"      │
│     └── LLM considers persona's interests + post content    │
│                                                             │
│  4. Aggregate results                                       │
│     └── 7/10 personas upvote → ~70% positive reception     │
│     └── Show which personas engaged and why                 │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### User Clustering from Available Data

Based on the dataset (~10,000 items, ~4,755 unique users), we can identify user archetypes:

**Data Available for Clustering:**
- Posts per user (stories vs comments ratio)
- Topics they post about (extracted from titles)
- Average score of their stories
- Comment frequency

**Example Clusters from Dataset:**

| Archetype | Example User | Characteristics |
|-----------|--------------|-----------------|
| News Curator | `todsacerdoti` | 13 stories, diverse tech topics (NixOS, desktop UX, dev tools) |
| Security Reporter | `Bender` | 13 stories, security/CVE focused (Microsoft patches, breaches) |
| Tech Aggregator | `doener` | Design/UX + policy topics, moderate engagement |
| Active Commenter | `tptacek` | 28 comments, 0 stories, high-karma contributor |
| General Poster | `rbanffy` | Mix of stories (12) and comments (6), broad topics |

#### Implementation Architecture

```typescript
interface UserPersona {
  id: string;
  name: string;                    // "The Security Expert"
  description: string;             // LLM-generated from comment history
  interests: string[];             // ["security", "privacy", "enterprise"]
  votingPatterns: {
    prefersTechnical: boolean;
    likesShowHN: boolean;
    skepticalOfHype: boolean;
    engagesWithNews: boolean;
  };
  examplePosts: string[];          // Titles they've engaged with
  weight: number;                  // Representation in HN population
}

interface SimulationVote {
  persona: UserPersona;
  vote: 'upvote' | 'skip' | 'downvote';
  reasoning: string;               // Why this persona voted this way
  confidence: number;              // How certain the LLM is
}
```

#### Persona Generation Process

**Step 1: Extract User Profiles**
```sql
-- Get users with enough activity to profile
SELECT
  "by" as username,
  COUNT(*) as total_posts,
  STRING_AGG(DISTINCT
    CASE WHEN type = 'story' THEN title END, ' | '
  ) as story_titles,
  AVG(CASE WHEN type = 'story' THEN score END) as avg_score
FROM hn
WHERE "by" IS NOT NULL
GROUP BY "by"
HAVING COUNT(*) >= 5
ORDER BY total_posts DESC
LIMIT 100;
```

**Step 2: Generate Persona via LLM**
```typescript
async function generatePersona(userProfile: UserProfile): Promise<UserPersona> {
  const prompt = `
    Based on this Hacker News user's activity, create a persona:

    Username: ${userProfile.username}
    Stories posted: ${userProfile.storyTitles.join(', ')}
    Average score: ${userProfile.avgScore}

    Generate:
    1. A descriptive name (e.g., "The DevOps Practitioner")
    2. Their likely interests (3-5 topics)
    3. What types of posts they would upvote
    4. What they would skip or downvote

    Format as JSON.
  `;

  return await llm.complete(prompt);
}
```

**Step 3: Simulate Voting**
```typescript
async function simulateVote(
  persona: UserPersona,
  post: IdeaTestInput
): Promise<SimulationVote> {
  const prompt = `
    You are ${persona.name}: ${persona.description}

    Your interests: ${persona.interests.join(', ')}
    Posts you typically upvote: ${persona.examplePosts.slice(0, 3).join(', ')}

    A new post appears on Hacker News:
    Title: "${post.title}"
    URL: ${post.url || '(Ask HN - no URL)'}
    Type: ${post.type}

    Would you upvote, skip, or flag this post? Explain briefly.

    Respond as JSON: { "vote": "upvote|skip|downvote", "reasoning": "...", "confidence": 0.0-1.0 }
  `;

  return await llm.complete(prompt);
}
```

#### Panel Composition Strategy

Research suggests **5-10 personas** is sufficient for useful signal:

| Persona | Weight | Represents |
|---------|--------|------------|
| Tech News Curator | 20% | Users who submit/upvote industry news |
| Dev Tools Enthusiast | 20% | Show HN voters, open source fans |
| Security Professional | 10% | CVE trackers, privacy advocates |
| Startup Watcher | 15% | VC/funding news, company launches |
| Academic/Researcher | 10% | Papers, deep technical content |
| Skeptical Veteran | 10% | High-karma users, critical eye |
| General Tech Reader | 15% | Broad interests, casual browser |

#### Aggregation and Display

```typescript
interface PersonaPanelResult {
  overallSentiment: number;        // 0-100% positive
  upvoteCount: number;
  skipCount: number;
  downvoteCount: number;

  personaBreakdown: Array<{
    persona: string;
    vote: string;
    reasoning: string;
  }>;

  strengthSignals: string[];       // "Appeals to Dev Tools Enthusiasts"
  weaknessSignals: string[];       // "May not interest Security crowd"
}
```

**UI Display:**
```
┌─────────────────────────────────────────────────────────────┐
│ AI Persona Panel Results                                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Panel Verdict: 6/8 would upvote (75% positive)             │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 👤 Dev Tools Enthusiast     ⬆️ UPVOTE                   │ │
│ │    "SQL tools for analysis always interest me"          │ │
│ ├─────────────────────────────────────────────────────────┤ │
│ │ 👤 Security Professional    ➡️ SKIP                     │ │
│ │    "Not in my domain, would scroll past"                │ │
│ ├─────────────────────────────────────────────────────────┤ │
│ │ 👤 Skeptical Veteran        ⬆️ UPVOTE                   │ │
│ │    "Clear title, real utility, no hype"                 │ │
│ ├─────────────────────────────────────────────────────────┤ │
│ │ 👤 Tech News Curator        ⬆️ UPVOTE                   │ │
│ │    "Data tools posts do well, would share"              │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ 💡 Insight: Strong appeal to builders, less to news readers │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### Limitations and Caveats

| Limitation | Impact | Mitigation |
|------------|--------|------------|
| LLM personas are approximations | May not capture real user nuance | Validate against historical accuracy |
| Cascading effects not modeled | Early votes influence later votes | Present as "initial reception" only |
| Persona accuracy ~60% ceiling | Cannot predict outlier success | Combine with rule-based approach |
| API cost per simulation | ~8 LLM calls per test | Cache persona definitions, batch calls |
| Cold-start for new topics | Unknown topic = uncertain votes | Flag low-confidence predictions |

#### Cost Considerations

| Operation | Estimated Cost | Frequency |
|-----------|---------------|-----------|
| Persona generation | ~$0.02/persona | Once per cluster |
| Vote simulation | ~$0.005/vote | 8 per test |
| Full test | ~$0.04 | Per user test |

With caching and batching, cost is manageable for interactive use.

#### Research Background

The approach is informed by:

1. **Every.to Experiment** (2025): 1,903 AI personas achieved 60% accuracy predicting HN front page
2. **Stanford Generative Agents**: 25 agents in "Smallville" exhibited emergent social behavior
3. **Microsoft TinyTroupe**: Python framework for multi-agent persona simulation
4. **Academic research**: Persona variables explain <10% variance individually, but ensemble improves signal

**Key Insight**: Individual predictions are unreliable, but **aggregate panel sentiment** provides useful directional signal.

---

## Risk Factor Detection

The simulation should identify specific risks:

### Automatic Penalties

| Risk | Detection | Severity |
|------|-----------|----------|
| Controversy trigger | Title contains political/divisive keywords | High |
| Domain penalty | URL matches penalized domain list | Medium |
| Clickbait | Superlatives, sensational language | High |
| Too long title | >80 characters | Low |
| Poor timing | 3am-7am UTC | Medium |

### Controversy Prediction

Based on the HN algorithm's controversy penalty:

```typescript
function predictControversyRisk(title: string): 'low' | 'medium' | 'high' {
  const controversialTopics = [
    /\b(politics|trump|biden|election|abortion|gun|climate)\b/i,
    /\b(gender|diversity|dei|woke)\b/i,
    /\b(crypto|nft|web3|bitcoin)\b/i,
    /\b(layoff|fired|remote work|rto)\b/i,
  ];

  const matches = controversialTopics.filter(p => p.test(title)).length;

  if (matches >= 2) return 'high';
  if (matches >= 1) return 'medium';
  return 'low';
}
```

---

## UI Design Recommendations

### Input Form

```
┌─────────────────────────────────────────────────────────────┐
│ Test Your HN Post Idea                                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Title:                                                      │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Show HN: A SQL interface for HN data analysis           │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                    42/80    │
│                                                             │
│ URL (optional):                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ https://myblog.com/hn-sql-tool                          │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ Post Type:  ○ Story  ● Show HN  ○ Ask HN                   │
│                                                             │
│ Planned Time:  ○ Now  ○ Best time  ● Custom: [Sun 6am UTC] │
│                                                             │
│                              [Analyze Post Idea]            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Results Display

```
┌─────────────────────────────────────────────────────────────┐
│ Analysis Results                                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Front Page Probability: ████████░░ 18%                      │
│                         (Above average for Show HN)         │
│                                                             │
│ Expected Score Range:   5 - 45 points (median: 15)          │
│ Expected Comments:      2 - 20 comments                     │
│                                                             │
│ Confidence: Medium (based on 7 similar posts)               │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ ✓ Strengths                                                 │
│   • Clear, descriptive title                                │
│   • Personal blog domain (2.4x advantage)                   │
│   • Technical topic popular on HN                           │
│   • Good timing (Sunday morning UTC)                        │
│                                                             │
│ ⚠ Risks                                                     │
│   • Show HN posts have lower baseline (~8% front page)      │
│   • Consider removing "HN" from title (self-referential)    │
│                                                             │
│ 💡 Suggestions                                               │
│   • Try: "Show HN: SQL notebook for analyzing 40M posts"    │
│   • Add a number for specificity                            │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ Similar Successful Posts                                    │
│                                                             │
│ • "Show HN: InstantDB - A Modern Firebase" (1,145 pts)     │
│ • "I built a SQL interface for..." (342 pts)               │
│ • "Show HN: Query HN data with SQL" (89 pts)               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation Phases

### Phase 1: Rule-Based MVP
- Implement scoring functions for title, domain, timing
- Hard-coded penalty lists and bonuses
- Basic similar post search via SQL
- Display probability and risk factors

### Phase 2: Statistical Enhancement
- Build historical statistics by content type
- Improve similarity search with keyword extraction
- Add confidence intervals based on sample size
- Track prediction accuracy for calibration

### Phase 3: ML Model (Optional)
- Train XGBoost classifier on available data
- Extract text embeddings for semantic similarity
- Implement uncertainty estimation
- A/B test against rule-based approach

---

## Key Insights from Research

### Accuracy Limitations

| Source | Best Accuracy | Notes |
|--------|---------------|-------|
| Stanford CS229 | ~65% | Various classifiers on HN data |
| AI Persona Experiment | 60% | 1,903 AI agents voting |
| Intoli Neural Network | Binary loss 0.32 | Title-only features |

**Key Quote**: "Popularity is disconnected from the inherent structural characteristics of news content and cannot be easily modeled" - Stanford CS229

### What This Means for UX

1. **Present uncertainty honestly** - Use ranges, not point estimates
2. **Focus on controllable factors** - Title optimization, timing
3. **Emphasize risk avoidance** - Penalty detection more valuable than score prediction
4. **Show similar posts** - Let users calibrate expectations themselves

---

## Data Requirements

To implement this feature, we need:

1. **Historical HN data** (already available via API)
   - Title, score, descendants, time, url, type
   - ~1000 stories sufficient for rule-based approach

2. **Derived statistics** (can compute once and cache)
   - Average score by content type
   - Success rate by domain
   - Best posting times

3. **Penalty domain list** (static, from research)
   - Known penalized domains
   - Controversial keyword patterns

---

## Open Questions

1. **Real-time vs cached statistics?**
   - HN patterns may shift; how often to refresh baselines?

2. **Author history integration?**
   - Would require user to input their HN username
   - Adds complexity but improves predictions

3. **Title rewrite suggestions?**
   - Could use LLM to suggest title improvements
   - Scope creep for V3?

---

## Sources

### HN Algorithm & Ranking
- [How Hacker News ranking really works](http://www.righto.com/2013/11/how-hacker-news-ranking-really-works.html)
- [Reverse Engineering the HN Ranking Algorithm](https://sangaline.com/post/reverse-engineering-the-hacker-news-ranking-algorithm/)

### Prediction Research
- [Stanford CS229 - Predicting Popularity of Posts on HN](https://cs229.stanford.edu/proj2016/report/GengYuanWang-PredictingPopularityOfPostsOnHackerNews-report.pdf)
- [Intoli - Neural Network Title Predictor](https://intoli.com/blog/hacker-news-title-tool/)
- [AI Persona Experiment (60% accuracy)](https://every.to/also-true-for-humans/i-cloned-2-000-hacker-news-users-to-predict-viral-posts)

### Timing & Optimization
- [Best Time to Post on HN](https://chanind.github.io/2019/05/07/best-time-to-submit-to-hacker-news.html)
- [Show HN Timing Analysis](https://www.myriade.ai/blogs/when-is-it-the-best-time-to-post-on-show-hn/)
- [Awesome Directories - HN Front Page Guide](https://awesome-directories.com/blog/hacker-news-front-page-guide/)

### ML Approaches
- [UCI Online News Popularity Dataset](https://archive.ics.uci.edu/dataset/332/online+news+popularity)
- [XGBoost vs LightGBM Comparison](https://neptune.ai/blog/xgboost-vs-lightgbm)
- [Gaussian Process Uncertainty](https://scikit-learn.org/stable/modules/gaussian_process.html)

### Content Virality
- [Berger & Milkman - What Makes Online Content Viral](https://jonahberger.com/wp-content/uploads/2013/02/ViralityB.pdf)
- [Analysis of 10,000 Show HN Submissions](https://antontarasenko.github.io/show-hn/)

### LLM User Simulation
- [Every.to - I Cloned 2,000 HN Users to Predict Viral Posts](https://every.to/also-true-for-humans/i-cloned-2-000-hacker-news-users-to-predict-viral-posts)
- [Stanford Generative Agents - Interactive Simulacra of Human Behavior](https://arxiv.org/abs/2304.03442)
- [Microsoft TinyTroupe - Multi-Agent Persona Simulation](https://github.com/microsoft/TinyTroupe)
- [Quantifying the Persona Effect in LLM Simulations](https://arxiv.org/abs/2402.10811)
- [Silicon Sampling - AI-Powered Personas for Market Research](https://onlinelibrary.wiley.com/doi/10.1002/mar.21982)
- [LAUS: LLM As User Simulator - ACM SIGIR 2024](https://dl.acm.org/doi/abs/10.1145/3726302.3730224)
