---
date: 2026-01-30T12:00:00-08:00
researcher: Claude
git_commit: fc374ef993cf39f2ad40f6a5397911b67cd3d432
branch: main
repository: ai-toolbox
topic: "arewedoomedyet.dev - AI Doom Sentiment Voting App"
tags: [research, vercel, convex, react, voting-app, recharts]
status: complete
autonomy: autopilot
last_updated: 2026-01-30
last_updated_by: Claude
---

# Research: arewedoomedyet.dev - AI Doom Sentiment Voting App

**Date**: 2026-01-30
**Researcher**: Claude
**Git Commit**: fc374ef993cf39f2ad40f6a5397911b67cd3d432
**Branch**: main

## Research Question

How to create a simple Vercel-deployed page with Convex DB that displays a sentiment gauge (YES/High-key/Low-key/NO) based on user votes (0-10) about AI's impact on tech jobs, with a historical trend graph in the background.

## Summary

This project can be built as a minimal React + Convex app following patterns established in `willitfront.page`. The app needs three core components: (1) a voting form with 0-10 slider/buttons, (2) a large sentiment display that maps the aggregate average to YES/High-key/Low-key/NO, and (3) a faded background chart showing historical trends using Recharts (already used in `willitfront.page`). Convex provides real-time reactivity out of the box, meaning all visitors see live vote updates without polling. The deployment follows the same Vercel + Bun pattern used in `willitfront.page` but with Convex replacing the traditional API layer.

## Detailed Findings

### Existing Patterns in This Repo

The `willitfront.page/` project provides a solid template for this new project:

**Stack (`willitfront.page/package.json:1-58`):**
- React 19 + TypeScript
- Tailwind CSS 4
- Bun as runtime
- Vite for bundling (but Bun HTML imports work too)
- Recharts for charts (already integrated)
- Vercel deployment with `vercel.json` config

**Project Structure:**
```
willitfront.page/
├── index.html              # Entry point
├── index.ts                # Bun.serve() dev server
├── vercel.json             # Vercel deployment config
├── src/
│   ├── main.tsx            # React root
│   ├── App.tsx             # Main app component
│   ├── index.css           # Tailwind styles
│   ├── components/
│   │   ├── ui/             # Reusable UI components
│   │   └── dashboard/Charts.tsx  # Recharts implementations
│   └── hooks/              # Custom React hooks
├── api/                    # Vercel serverless functions
└── lib/                    # Shared code for API routes
```

**Recharts Usage (`willitfront.page/src/components/dashboard/Charts.tsx:84-134`):**
The repo already has `LineChartViz` and other chart components using Recharts with `ResponsiveContainer`. These can be adapted for the sentiment trend chart.

### Convex Integration Approach

Convex replaces the traditional API layer entirely. Instead of `api/` serverless functions, Convex provides:

**Schema Design:**
```typescript
// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  votes: defineTable({
    value: v.number(),      // 0-10 scale
    timestamp: v.number(),  // Date.now() in ms
  }).index("by_timestamp", ["timestamp"]),
});
```

**Mutations & Queries:**
```typescript
// convex/votes.ts
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const submitVote = mutation({
  args: { value: v.number() },
  handler: async (ctx, { value }) => {
    if (value < 0 || value > 10) throw new Error("Vote must be 0-10");
    return await ctx.db.insert("votes", {
      value,
      timestamp: Date.now(),
    });
  },
});

export const getStats = query({
  args: {},
  handler: async (ctx) => {
    const votes = await ctx.db.query("votes").collect();
    if (votes.length === 0) return { average: null, count: 0 };
    const sum = votes.reduce((acc, v) => acc + v.value, 0);
    return { average: sum / votes.length, count: votes.length };
  },
});

export const getHistoricalData = query({
  args: { hoursBack: v.number() },
  handler: async (ctx, { hoursBack }) => {
    const startTime = Date.now() - hoursBack * 60 * 60 * 1000;
    const votes = await ctx.db
      .query("votes")
      .withIndex("by_timestamp", (q) => q.gte("timestamp", startTime))
      .collect();

    // Group by hour and calculate averages
    const hourlyBuckets: Map<number, number[]> = new Map();
    for (const vote of votes) {
      const hourBucket = Math.floor(vote.timestamp / (60 * 60 * 1000));
      if (!hourlyBuckets.has(hourBucket)) hourlyBuckets.set(hourBucket, []);
      hourlyBuckets.get(hourBucket)!.push(vote.value);
    }

    return Array.from(hourlyBuckets.entries())
      .map(([hour, values]) => ({
        timestamp: hour * 60 * 60 * 1000,
        average: values.reduce((a, b) => a + b, 0) / values.length,
      }))
      .sort((a, b) => a.timestamp - b.timestamp);
  },
});
```

**React Integration:**
```tsx
// src/main.tsx
import { ConvexProvider, ConvexReactClient } from "convex/react";

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConvexProvider client={convex}>
      <App />
    </ConvexProvider>
  </StrictMode>,
);
```

```tsx
// In component
import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";

const stats = useQuery(api.votes.getStats);  // Auto-updates in real-time
const submitVote = useMutation(api.votes.submitVote);
```

### Sentiment Mapping Logic

The average vote (0-10) maps to sentiment categories:

| Average Range | Sentiment | Display |
|---------------|-----------|---------|
| 0.0 - 2.5     | NO        | "NO" (green) |
| 2.5 - 5.0     | Low-key   | "Low-key" (yellow) |
| 5.0 - 7.5     | High-key  | "High-key" (orange) |
| 7.5 - 10.0    | YES       | "YES" (red) |

### Project Structure for arewedoomedyet.dev

```
arewedoomedyet.dev/
├── index.html              # Entry point
├── index.ts                # Bun.serve() local dev
├── package.json
├── vercel.json             # Vercel config
├── convex/
│   ├── _generated/         # Auto-generated by Convex
│   ├── schema.ts           # Database schema
│   └── votes.ts            # Mutations & queries
├── src/
│   ├── main.tsx            # React root with ConvexProvider
│   ├── App.tsx             # Main app (single page)
│   ├── index.css           # Tailwind styles
│   └── components/
│       ├── VotingForm.tsx      # 0-10 voting slider/buttons
│       ├── SentimentDisplay.tsx # Big YES/High-key/Low-key/NO
│       └── TrendChart.tsx      # Background historical chart
└── public/
    └── favicon.ico
```

### Vercel Deployment with Convex

**Setup Steps:**
1. Create Vite React project: `npm create vite@latest arewedoomedyet.dev -- --template react-ts`
2. Install Convex: `npm install convex`
3. Initialize Convex: `npx convex dev` (creates `convex/` folder, `.env.local`)
4. Link to existing Convex project (you mentioned it's already created in Vercel)

**vercel.json for Convex app:**
```json
{
  "buildCommand": "npx convex deploy --cmd 'bun run build'",
  "installCommand": "bun install",
  "outputDirectory": "dist",
  "bunVersion": "1.x",
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

**Environment Variables (Vercel Dashboard):**
- `CONVEX_DEPLOY_KEY` - Production deploy key from Convex Dashboard
- `VITE_CONVEX_URL` - Your Convex deployment URL (auto-set by Convex)

### UI Design Considerations

**Main Display:**
- Large centered sentiment word (YES/High-key/Low-key/NO)
- Background gradient or color shifts based on current sentiment
- Faded line chart showing historical trend (last 24-72 hours)

**Voting Form:**
- Simple horizontal slider (0-10) or 11 buttons
- Submit button or auto-submit on change
- Brief explainer: "How doomed are we with AI taking over coding? (0=not at all, 10=completely)"

**Visual Inspiration:**
- Full-page design like istheinternetonfire.com or isitchristmas.com
- Single focus: the big answer
- Subtle animations on vote submission

### Dependencies

```json
{
  "dependencies": {
    "convex": "^1.x",
    "react": "^19.x",
    "react-dom": "^19.x",
    "recharts": "^2.x"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4.x",
    "@types/react": "^19.x",
    "@types/react-dom": "^19.x",
    "autoprefixer": "^10.x",
    "postcss": "^8.x",
    "tailwindcss": "^4.x",
    "typescript": "^5.x",
    "vite": "^7.x"
  }
}
```

## Code References

| File | Line | Description |
|------|------|-------------|
| `willitfront.page/package.json` | 1-58 | Reference stack and dependencies |
| `willitfront.page/vercel.json` | 1-17 | Vercel deployment configuration pattern |
| `willitfront.page/index.ts` | 1-85 | Bun.serve() local development server |
| `willitfront.page/src/main.tsx` | 1-12 | React root pattern |
| `willitfront.page/src/components/dashboard/Charts.tsx` | 84-134 | Recharts LineChart implementation |
| `willitfront.page/index.html` | 1-20 | HTML entry point pattern |

## Architecture Documentation

**Key Differences from willitfront.page:**

1. **No `api/` folder** - Convex replaces serverless functions
2. **No `lib/` folder** - Convex handles data layer
3. **Simpler structure** - Single-page app with minimal components
4. **Real-time by default** - Convex `useQuery` auto-subscribes to updates

**Build & Deploy Flow:**
1. `npx convex deploy` - Deploys Convex functions
2. `bun run build` - Builds Vite React app
3. Vercel serves static files + Convex handles backend

## Historical Context (from thoughts/)

This is a new project without prior research or plans. However, the `willitfront.page` project demonstrates successful patterns for Vercel + Bun + React deployments in this monorepo.

## Related Research

No directly related research documents. This is a net-new project.

## Clarified Requirements

1. **No rate limiting** - Anyone can vote as many times as they want
2. **No vote uniqueness** - No user tracking needed
3. **Time granularity** - Daily averages for the chart
4. **Historical depth** - Default: 7 days. Full history available via modal/expanded view
5. **Form simplicity** - Single question, that's it. No extra UI chrome.
