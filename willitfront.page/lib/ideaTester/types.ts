import { z } from 'zod';

// ========== INPUT ==========
export const ideaTestInputSchema = z.object({
  title: z.string().min(1).max(200),
  url: z.string().url().optional(),
  type: z.enum(['story', 'show_hn', 'ask_hn']),
  plannedTime: z.string().datetime().optional(),
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
    frontPageProbability: z.number(),
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
  })),

  risks: z.array(z.object({
    severity: z.enum(['low', 'medium', 'high']),
    title: z.string(),
    description: z.string(),
    mitigation: z.string().optional().describe('How to address this risk'),
  })),

  similarPosts: z.object({
    posts: z.array(z.object({
      title: z.string(),
      score: z.number(),
      comments: z.number(),
      similarityReason: z.string(),
    })),
    insight: z.string().describe('What the similar posts tell us'),
  }),

  recommendations: z.array(z.object({
    priority: z.number().describe('Priority 1, 2, or 3'),
    action: z.string().describe('Imperative action'),
    details: z.string(),
    suggestedTitle: z.string().optional(),
  })),

  timing: z.object({
    isOptimal: z.boolean(),
    currentRating: z.enum(['excellent', 'good', 'okay', 'poor']),
    advice: z.string(),
    suggestedTime: z.object({
      dayOfWeek: z.string(),
      hourUTC: z.number(),
      reason: z.string(),
    }).optional(),
  }),
});

export type IdeaTestReport = z.infer<typeof ideaTestReportSchema>;
