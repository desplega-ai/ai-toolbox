---
date: 2026-01-30T14:00:00-08:00
planner: Claude
git_commit: fc374ef993cf39f2ad40f6a5397911b67cd3d432
branch: main
repository: ai-toolbox
topic: "arewedoomedyet.dev Implementation Plan"
tags: [plan, vercel, convex, react, voting-app]
status: ready
autonomy: autopilot
last_updated: 2026-01-30
last_updated_by: Claude
---

# arewedoomedyet.dev Implementation Plan

## Overview

Build a minimal single-page voting app that displays a large sentiment indicator (YES/High-key/Low-key/NO) based on user votes (0-10 scale) about AI's impact on tech jobs. Features a faded background chart showing 7-day historical trends with a modal for full history. Uses Convex for real-time data, React + Tailwind for UI, Recharts for visualization, deployed to Vercel.

## Current State Analysis

- No `arewedoomedyet.dev/` folder exists yet
- `willitfront.page/` provides reference patterns for:
  - Bun + Vite + Tailwind 4 setup (`willitfront.page/package.json`)
  - Recharts chart components (`willitfront.page/src/components/dashboard/Charts.tsx:84-134`)
  - Vercel deployment config (`willitfront.page/vercel.json`)
  - Build script with Bun (`willitfront.page/build.ts`)
- Taras has Convex already created in Vercel (needs to link)
- Domain `arewedoomedyet.dev` purchased

## Desired End State

A live website at `arewedoomedyet.dev` where:
1. Visitors see a large sentiment word (YES/High-key/Low-key/NO) based on aggregate vote average
2. A single slider question lets anyone vote 0-10 on "how doomed are we"
3. Background shows faded 7-day trend chart
4. Modal accessible to view full historical data
5. All updates happen in real-time across all connected clients

## Key Discoveries

- Tailwind 4 uses `@import "tailwindcss"` syntax (`willitfront.page/src/index.css:1`)
- Path aliases configured via `tsconfig.json` with `@/*` (`willitfront.page/tsconfig.json:21-23`)
- Bun build uses `bun-plugin-tailwind` for CSS processing (`willitfront.page/build.ts:1,11`)
- No vite.config needed - Bun handles everything (`willitfront.page/` has no vite.config)

## Quick Verification Reference

Common commands to verify the implementation:
- `cd arewedoomedyet.dev && bun install`
- `cd arewedoomedyet.dev && bun run typecheck`
- `cd arewedoomedyet.dev && bun run dev`
- `cd arewedoomedyet.dev && npx convex dev`

Key files to check:
- `arewedoomedyet.dev/convex/schema.ts` - Database schema
- `arewedoomedyet.dev/convex/votes.ts` - Mutations & queries
- `arewedoomedyet.dev/src/App.tsx` - Main app component
- `arewedoomedyet.dev/vercel.json` - Deployment config

## What We're NOT Doing

- No user authentication or tracking
- No rate limiting
- No complex UI components (no shadcn/ui)
- No SSR - pure client-side React
- No analytics (can add later)
- No custom domain setup (Vercel handles this after deploy)

## Implementation Approach

Build in 4 phases:
1. Project scaffolding with all config files
2. Convex backend (schema + queries/mutations)
3. React frontend (main UI components)
4. Polish and deploy to Vercel

---

## Phase 1: Project Scaffolding

### Overview
Create the project folder structure and all configuration files, following patterns from `willitfront.page`.

### Changes Required:

#### 1. Create folder and package.json
**File**: `arewedoomedyet.dev/package.json`
**Changes**: Create with minimal dependencies

```json
{
  "name": "arewedoomedyet.dev",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "bun --hot index.ts",
    "build": "bun run typecheck && bun run build.ts",
    "typecheck": "tsc --noEmit",
    "start": "bun index.ts"
  },
  "dependencies": {
    "convex": "^1.21.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "recharts": "^2.15.0"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4.0.0",
    "@types/bun": "latest",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "autoprefixer": "^10.4.20",
    "bun-plugin-tailwind": "^0.1.2",
    "postcss": "^8.5.0",
    "tailwindcss": "^4.0.0",
    "typescript": "^5.7.0"
  }
}
```

#### 2. TypeScript config
**File**: `arewedoomedyet.dev/tsconfig.json`
**Changes**: Standard React + Bun config with path aliases

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "useDefineForClassFields": true,
    "lib": ["DOM", "DOM.Iterable", "ESNext"],
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": false,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "types": ["bun-types"],
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src", "convex", "index.ts", "build.ts"]
}
```

#### 3. PostCSS config
**File**: `arewedoomedyet.dev/postcss.config.js`
**Changes**: Tailwind 4 PostCSS plugin

```js
export default {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
```

#### 4. Build script
**File**: `arewedoomedyet.dev/build.ts`
**Changes**: Bun build with Tailwind plugin

```typescript
import tailwindcss from "bun-plugin-tailwind";
import { mkdir, copyFile, readdir } from "node:fs/promises";
import { join } from "node:path";

await Bun.build({
  entrypoints: ["./index.html"],
  outdir: "./dist",
  minify: true,
  publicPath: "/",
  plugins: [tailwindcss],
});

// Copy public folder
const publicDir = "./public";
const distDir = "./dist";
try {
  await mkdir(join(distDir, "public"), { recursive: true });
  const files = await readdir(publicDir);
  for (const file of files) {
    await copyFile(join(publicDir, file), join(distDir, file));
    await copyFile(join(publicDir, file), join(distDir, "public", file));
  }
  console.log(`Copied ${files.length} public assets`);
} catch (err) {
  // public folder may not exist yet, that's fine
}

console.log("Build complete!");
```

#### 5. Vercel config
**File**: `arewedoomedyet.dev/vercel.json`
**Changes**: Deploy config for Convex + Bun

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

#### 6. HTML entry point
**File**: `arewedoomedyet.dev/index.html`
**Changes**: Minimal HTML shell

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Are We Doomed Yet?</title>
    <meta name="description" content="How doomed are we with AI taking over coding? Vote and find out." />
    <link rel="stylesheet" href="./src/index.css" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./src/main.tsx"></script>
  </body>
</html>
```

#### 7. Dev server
**File**: `arewedoomedyet.dev/index.ts`
**Changes**: Bun.serve() for local development

```typescript
import index from "./index.html";

Bun.serve({
  port: process.env.PORT ? parseInt(process.env.PORT) : 3000,
  routes: {
    "/": index,
  },
  development: {
    hmr: true,
    console: true,
  },
});

console.log("Dev server running at http://localhost:3000");
```

#### 8. CSS entry
**File**: `arewedoomedyet.dev/src/index.css`
**Changes**: Tailwind imports + CSS variables for sentiment colors

```css
@import "tailwindcss";

@source "../**/*.{ts,tsx}";

:root {
  --doom-yes: #dc2626;      /* red-600 */
  --doom-highkey: #f97316;  /* orange-500 */
  --doom-lowkey: #eab308;   /* yellow-500 */
  --doom-no: #22c55e;       /* green-500 */
  --bg-dark: #0a0a0a;
}

body {
  background-color: var(--bg-dark);
  color: white;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  min-height: 100vh;
  margin: 0;
}
```

#### 9. Placeholder React files
**File**: `arewedoomedyet.dev/src/main.tsx`
**Changes**: React root (placeholder, will add Convex provider in Phase 2)

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

**File**: `arewedoomedyet.dev/src/App.tsx`
**Changes**: Placeholder app component

```tsx
export default function App() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <h1 className="text-4xl font-bold">Loading...</h1>
    </div>
  );
}
```

#### 10. Public folder
**File**: `arewedoomedyet.dev/public/.gitkeep`
**Changes**: Empty file to ensure folder exists

### Success Criteria:

#### Automated Verification:
- [ ] Dependencies install: `cd arewedoomedyet.dev && bun install`
- [ ] TypeScript compiles: `cd arewedoomedyet.dev && bun run typecheck`
- [ ] Build runs: `cd arewedoomedyet.dev && bun run build`

#### Manual Verification:
- [ ] Dev server starts: `cd arewedoomedyet.dev && bun run dev` shows "Loading..." at localhost:3000
- [ ] Folder structure matches plan

**Implementation Note**: After completing this phase, pause for manual confirmation before proceeding to Convex setup.

---

## Phase 2: Convex Backend

### Overview
Initialize Convex, create the database schema, and implement all queries/mutations for voting and historical data.

### Changes Required:

#### 1. Initialize Convex
**Action**: Run `cd arewedoomedyet.dev && npx convex dev` to:
- Create `convex/` folder with `_generated/`
- Create `.env.local` with `CONVEX_URL`
- Link to existing Convex project (or create new one)

#### 2. Database schema
**File**: `arewedoomedyet.dev/convex/schema.ts`
**Changes**: Define votes table with timestamp index

```typescript
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  votes: defineTable({
    value: v.number(),      // 0-10 scale
    timestamp: v.number(),  // Date.now() in ms
  }).index("by_timestamp", ["timestamp"]),
});
```

#### 3. Votes mutations and queries
**File**: `arewedoomedyet.dev/convex/votes.ts`
**Changes**: All backend logic

```typescript
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

// Submit a new vote
export const submitVote = mutation({
  args: { value: v.number() },
  handler: async (ctx, { value }) => {
    if (value < 0 || value > 10) {
      throw new Error("Vote must be between 0 and 10");
    }
    return await ctx.db.insert("votes", {
      value: Math.round(value), // Ensure integer
      timestamp: Date.now(),
    });
  },
});

// Get current stats (average and count)
export const getStats = query({
  args: {},
  handler: async (ctx) => {
    const votes = await ctx.db.query("votes").collect();
    if (votes.length === 0) {
      return { average: null, count: 0 };
    }
    const sum = votes.reduce((acc, vote) => acc + vote.value, 0);
    return {
      average: sum / votes.length,
      count: votes.length,
    };
  },
});

// Get daily averages for chart (last N days)
export const getDailyAverages = query({
  args: { daysBack: v.number() },
  handler: async (ctx, { daysBack }) => {
    const now = Date.now();
    const msPerDay = 24 * 60 * 60 * 1000;
    const startTime = now - daysBack * msPerDay;

    const votes = await ctx.db
      .query("votes")
      .withIndex("by_timestamp", (q) => q.gte("timestamp", startTime))
      .collect();

    // Group by day (UTC)
    const dailyBuckets: Map<string, number[]> = new Map();

    for (const vote of votes) {
      const date = new Date(vote.timestamp);
      const dayKey = date.toISOString().split("T")[0]; // YYYY-MM-DD
      if (!dailyBuckets.has(dayKey)) {
        dailyBuckets.set(dayKey, []);
      }
      dailyBuckets.get(dayKey)!.push(vote.value);
    }

    // Calculate averages and format for chart
    return Array.from(dailyBuckets.entries())
      .map(([date, values]) => ({
        date,
        average: values.reduce((a, b) => a + b, 0) / values.length,
        count: values.length,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  },
});

// Get all-time daily averages for full history modal
export const getAllDailyAverages = query({
  args: {},
  handler: async (ctx) => {
    const votes = await ctx.db.query("votes").collect();

    if (votes.length === 0) {
      return [];
    }

    // Group by day (UTC)
    const dailyBuckets: Map<string, number[]> = new Map();

    for (const vote of votes) {
      const date = new Date(vote.timestamp);
      const dayKey = date.toISOString().split("T")[0];
      if (!dailyBuckets.has(dayKey)) {
        dailyBuckets.set(dayKey, []);
      }
      dailyBuckets.get(dayKey)!.push(vote.value);
    }

    return Array.from(dailyBuckets.entries())
      .map(([date, values]) => ({
        date,
        average: values.reduce((a, b) => a + b, 0) / values.length,
        count: values.length,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  },
});
```

#### 4. Update main.tsx with Convex provider
**File**: `arewedoomedyet.dev/src/main.tsx`
**Changes**: Wrap app in ConvexProvider

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import "./index.css";
import App from "./App";

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ConvexProvider client={convex}>
      <App />
    </ConvexProvider>
  </StrictMode>
);
```

#### 5. Add .env.local to .gitignore
**File**: `arewedoomedyet.dev/.gitignore`
**Changes**: Standard ignores

```
node_modules
dist
.env.local
.env
```

### Success Criteria:

#### Automated Verification:
- [ ] Convex syncs: `cd arewedoomedyet.dev && npx convex dev` shows "Convex functions ready"
- [ ] TypeScript compiles: `cd arewedoomedyet.dev && bun run typecheck`
- [ ] Schema deployed (Convex dashboard shows `votes` table)

#### Manual Verification:
- [ ] Convex dashboard shows the `votes` table with `by_timestamp` index
- [ ] Can test mutation in Convex dashboard: `votes.submitVote({ value: 5 })`
- [ ] Can test query in Convex dashboard: `votes.getStats()`

**Implementation Note**: Convex dev server must be running in a separate terminal during development. After this phase, pause to verify Convex is working before building the frontend.

---

## Phase 3: React Frontend

### Overview
Build the complete UI: sentiment display, voting slider, background chart, and full history modal.

### Changes Required:

#### 1. Sentiment display component
**File**: `arewedoomedyet.dev/src/components/SentimentDisplay.tsx`
**Changes**: Large text showing current sentiment

```tsx
interface SentimentDisplayProps {
  average: number | null;
  count: number;
}

type Sentiment = "YES" | "High-key" | "Low-key" | "NO";

function getSentiment(average: number | null): Sentiment | null {
  if (average === null) return null;
  if (average >= 7.5) return "YES";
  if (average >= 5) return "High-key";
  if (average >= 2.5) return "Low-key";
  return "NO";
}

function getSentimentColor(sentiment: Sentiment | null): string {
  switch (sentiment) {
    case "YES": return "var(--doom-yes)";
    case "High-key": return "var(--doom-highkey)";
    case "Low-key": return "var(--doom-lowkey)";
    case "NO": return "var(--doom-no)";
    default: return "white";
  }
}

export function SentimentDisplay({ average, count }: SentimentDisplayProps) {
  const sentiment = getSentiment(average);
  const color = getSentimentColor(sentiment);

  return (
    <div className="text-center">
      <h1
        className="text-[20vw] font-black leading-none tracking-tight"
        style={{ color }}
      >
        {sentiment ?? "..."}
      </h1>
      {average !== null && (
        <p className="text-white/60 text-lg mt-4">
          Average: {average.toFixed(2)} / 10 ({count.toLocaleString()} votes)
        </p>
      )}
    </div>
  );
}
```

#### 2. Voting form component
**File**: `arewedoomedyet.dev/src/components/VotingForm.tsx`
**Changes**: Simple slider with single question

```tsx
import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";

export function VotingForm() {
  const [value, setValue] = useState(5);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const submitVote = useMutation(api.votes.submitVote);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await submitVote({ value });
      setSubmitted(true);
      // Reset after short delay to allow another vote
      setTimeout(() => setSubmitted(false), 2000);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto px-4">
      <label className="block text-white/80 text-center mb-6 text-lg">
        How doomed are we with AI taking over coding?
      </label>

      <div className="flex items-center gap-4 mb-4">
        <span className="text-white/60 text-sm w-16 text-right">Not at all</span>
        <input
          type="range"
          min="0"
          max="10"
          value={value}
          onChange={(e) => setValue(parseInt(e.target.value))}
          className="flex-1 h-2 bg-white/20 rounded-lg appearance-none cursor-pointer accent-white"
        />
        <span className="text-white/60 text-sm w-16">Completely</span>
      </div>

      <div className="text-center mb-4">
        <span className="text-4xl font-bold text-white">{value}</span>
      </div>

      <button
        onClick={handleSubmit}
        disabled={submitting || submitted}
        className="w-full py-3 px-6 bg-white/10 hover:bg-white/20 disabled:bg-white/5
                   text-white font-medium rounded-lg transition-colors
                   disabled:cursor-not-allowed"
      >
        {submitting ? "Submitting..." : submitted ? "Voted!" : "Submit Vote"}
      </button>
    </div>
  );
}
```

#### 3. Background trend chart
**File**: `arewedoomedyet.dev/src/components/TrendChart.tsx`
**Changes**: Faded line chart in background

```tsx
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";

interface TrendChartProps {
  data: Array<{ date: string; average: number; count: number }>;
  faded?: boolean;
}

export function TrendChart({ data, faded = false }: TrendChartProps) {
  if (data.length === 0) return null;

  // Format date for display
  const formattedData = data.map((d) => ({
    ...d,
    displayDate: new Date(d.date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
  }));

  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{ opacity: faded ? 0.15 : 1 }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={formattedData} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
          <XAxis
            dataKey="displayDate"
            stroke="white"
            strokeOpacity={0.3}
            tick={{ fill: "white", fillOpacity: 0.5 }}
            hide={faded}
          />
          <YAxis
            domain={[0, 10]}
            stroke="white"
            strokeOpacity={0.3}
            tick={{ fill: "white", fillOpacity: 0.5 }}
            hide={faded}
          />
          {!faded && (
            <Tooltip
              contentStyle={{
                backgroundColor: "rgba(0,0,0,0.8)",
                border: "1px solid rgba(255,255,255,0.2)",
                borderRadius: "8px",
              }}
              labelStyle={{ color: "white" }}
              formatter={(value: number) => [value.toFixed(2), "Average"]}
            />
          )}
          <Line
            type="monotone"
            dataKey="average"
            stroke="white"
            strokeWidth={faded ? 2 : 3}
            dot={!faded}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
```

#### 4. Full history modal
**File**: `arewedoomedyet.dev/src/components/HistoryModal.tsx`
**Changes**: Modal with full historical chart

```tsx
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { TrendChart } from "./TrendChart";

interface HistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function HistoryModal({ isOpen, onClose }: HistoryModalProps) {
  const allData = useQuery(api.votes.getAllDailyAverages);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
      onClick={onClose}
    >
      <div
        className="bg-zinc-900 rounded-xl p-6 w-full max-w-4xl max-h-[80vh] mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-white">Full History</h2>
          <button
            onClick={onClose}
            className="text-white/60 hover:text-white text-2xl leading-none"
          >
            &times;
          </button>
        </div>

        <div className="h-[400px] relative">
          {allData ? (
            <TrendChart data={allData} faded={false} />
          ) : (
            <div className="flex items-center justify-center h-full text-white/60">
              Loading...
            </div>
          )}
        </div>

        {allData && allData.length > 0 && (
          <p className="text-white/60 text-sm mt-4 text-center">
            {allData.length} days of data, starting {allData[0].date}
          </p>
        )}
      </div>
    </div>
  );
}
```

#### 5. Main App component
**File**: `arewedoomedyet.dev/src/App.tsx`
**Changes**: Compose all components

```tsx
import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { SentimentDisplay } from "./components/SentimentDisplay";
import { VotingForm } from "./components/VotingForm";
import { TrendChart } from "./components/TrendChart";
import { HistoryModal } from "./components/HistoryModal";

export default function App() {
  const [showHistory, setShowHistory] = useState(false);
  const stats = useQuery(api.votes.getStats);
  const trendData = useQuery(api.votes.getDailyAverages, { daysBack: 7 });

  const isLoading = stats === undefined;

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Background chart */}
      {trendData && <TrendChart data={trendData} faded />}

      {/* Main content */}
      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center p-4">
        {isLoading ? (
          <h1 className="text-4xl font-bold text-white/60">Loading...</h1>
        ) : (
          <>
            <SentimentDisplay
              average={stats.average}
              count={stats.count}
            />

            <div className="mt-12">
              <VotingForm />
            </div>

            <button
              onClick={() => setShowHistory(true)}
              className="mt-8 text-white/40 hover:text-white/60 text-sm underline transition-colors"
            >
              View full history
            </button>
          </>
        )}
      </div>

      {/* History modal */}
      <HistoryModal
        isOpen={showHistory}
        onClose={() => setShowHistory(false)}
      />
    </div>
  );
}
```

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compiles: `cd arewedoomedyet.dev && bun run typecheck`
- [ ] Build succeeds: `cd arewedoomedyet.dev && bun run build`

#### Manual Verification:
- [ ] Dev server shows sentiment display (with "..." if no votes)
- [ ] Slider works and submits votes
- [ ] Vote count updates in real-time
- [ ] Background chart shows 7-day trend (faded)
- [ ] "View full history" link opens modal with full chart
- [ ] Modal closes when clicking X or outside

**Implementation Note**: Run both `bun run dev` and `npx convex dev` in separate terminals during development. After this phase, do thorough manual testing before deploying.

---

## Phase 4: Polish & Deploy

### Overview
Final touches: favicon, meta tags, and deployment to Vercel.

### Changes Required:

#### 1. Create favicon
**Action**: Create a simple favicon (can use an online generator or placeholder)
**File**: `arewedoomedyet.dev/public/favicon.ico`

#### 2. Update HTML meta tags
**File**: `arewedoomedyet.dev/index.html`
**Changes**: Add Open Graph tags and favicon

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Are We Doomed Yet?</title>
    <meta name="description" content="How doomed are we with AI taking over coding? Vote and find out." />

    <!-- Open Graph -->
    <meta property="og:title" content="Are We Doomed Yet?" />
    <meta property="og:description" content="How doomed are we with AI taking over coding? Vote and find out." />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="https://arewedoomedyet.dev" />

    <!-- Favicon -->
    <link rel="icon" type="image/x-icon" href="./public/favicon.ico" />

    <link rel="stylesheet" href="./src/index.css" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./src/main.tsx"></script>
  </body>
</html>
```

#### 3. Deploy to Vercel
**Actions**:
1. Push code to GitHub (if not already)
2. In Vercel dashboard, import the `arewedoomedyet.dev` folder
3. Set root directory to `arewedoomedyet.dev`
4. Add environment variable: `CONVEX_DEPLOY_KEY` (from Convex dashboard > Settings > Deploy Keys)
5. Deploy
6. Configure custom domain `arewedoomedyet.dev` in Vercel

### Success Criteria:

#### Automated Verification:
- [ ] Build succeeds locally: `cd arewedoomedyet.dev && bun run build`
- [ ] Dist folder contains index.html and bundled assets

#### Manual Verification:
- [ ] Vercel build succeeds
- [ ] Site loads at Vercel preview URL
- [ ] Real-time updates work in production
- [ ] Custom domain resolves correctly
- [ ] Open Graph preview shows correct info when sharing link

**Implementation Note**: After Vercel deploy, verify Convex is working in production by submitting a test vote and checking the Convex dashboard.

---

## Testing Strategy

**Local Testing:**
1. Run `bun run dev` and `npx convex dev` concurrently
2. Test voting flow end-to-end
3. Open multiple browser tabs to verify real-time sync
4. Test on mobile viewport

**Production Testing:**
1. Verify Convex functions work via preview URL
2. Check real-time updates across devices
3. Test with slow network (throttle in DevTools)
4. Validate meta tags with social media preview tools

## References

- Research document: `thoughts/taras/research/2026-01-30-arewedoomedyet-dev.md`
- Reference project: `willitfront.page/`
- Convex React docs: https://docs.convex.dev/client/react
- Convex Vercel deploy: https://docs.convex.dev/production/hosting/vercel
