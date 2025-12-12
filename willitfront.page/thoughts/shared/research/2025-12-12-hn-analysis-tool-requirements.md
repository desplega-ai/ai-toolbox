---
date: 2025-12-12T14:30:00-05:00
researcher: Claude
git_commit: 3d9714ca79786ed8f87ffd0869271d5bf0a94c4c
branch: main
repository: ai-toolbox
topic: "HN Data Analysis Tool - Project Requirements & API Research"
tags: [research, new-project, hn-api, shadcn, monaco, ag-grid]
status: complete
last_updated: 2025-12-12
last_updated_by: Claude
---

# Research: HN Data Analysis Tool - Project Requirements & API Research

**Date**: 2025-12-12T14:30:00-05:00
**Researcher**: Claude
**Git Commit**: 3d9714ca79786ed8f87ffd0869271d5bf0a94c4c
**Branch**: main
**Repository**: ai-toolbox

## Research Question

Document the requirements and API capabilities for building a Hacker News data analysis tool with a browser-like tabbed interface, SQL notebook, chat, idea tester, and dashboard features.

## Summary

This is a **new project** (empty directory). The HN-SQL API at `localhost:3123` provides SQL query capabilities against a comprehensive Hacker News dataset. The API supports direct SQL queries, pre-built endpoints for stories/comments/jobs, statistics, and schema introspection for editor autocomplete.

## API Documentation

### Base URL
```
http://localhost:3123
```

### Available Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/query` | POST | Execute arbitrary SQL queries |
| `/schema` | GET | Get schema for Monaco autocomplete |
| `/health` | GET | Health check |
| `/stories` | GET | List stories with filters |
| `/comments` | GET | List comments with filters |
| `/jobs` | GET | List job postings |
| `/stats/types` | GET | Item counts by type |
| `/stats/users` | GET | Top users by post count |
| `/top/stories` | GET | Top stories by score |

### Database Schema

Single table: `hn`

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | int64 | No | Item ID |
| `type` | string | Yes | story, comment, job, poll, pollopt |
| `by` | string | Yes | Author username (**must quote as "by"**) |
| `time` | timestamp | Yes | Creation time (UTC) |
| `title` | string | Yes | Title (stories/jobs/polls) |
| `url` | string | Yes | External URL |
| `text` | string | Yes | Content (HTML) |
| `score` | int32 | Yes | Points/score |
| `descendants` | int32 | Yes | Comment count |
| `parent` | int64 | Yes | Parent item ID |
| `kids` | list<int64> | Yes | Child comment IDs |
| `dead` | bool | Yes | Dead/flagged item |
| `deleted` | bool | Yes | Deleted item |
| `poll` | int64 | Yes | Parent poll (for pollopts) |
| `parts` | list<int64> | Yes | Poll option IDs (for polls) |

### SQL Query Endpoint

**POST /query**
```json
{
  "sql": "SELECT * FROM hn WHERE type = 'story' LIMIT 10",
  "limit": 1000  // optional, max 10000
}
```

Response:
```json
{
  "columns": ["id", "type", "by", ...],
  "rows": [[...], [...], ...],
  "row_count": 10,
  "truncated": false,
  "timing": {
    "elapsed_seconds": 0.123,
    "elapsed_formatted": "123ms"
  }
}
```

### Schema Endpoint (for Monaco Autocomplete)

**GET /schema**

Returns:
- `tables[]` - Table definitions with columns
- `keywords[]` - SQL keywords (SELECT, FROM, WHERE, etc.)
- `functions[]` - Available functions (COUNT, AVG, DATE_TRUNC, etc.)

Available SQL Functions:
- Aggregates: COUNT, SUM, AVG, MIN, MAX, COUNT_DISTINCT, LIST, STRING_AGG
- String: LENGTH, LOWER, UPPER, TRIM, SUBSTR, REPLACE, CONCAT, REGEXP_*
- Date: DATE_TRUNC, DATE_PART, EXTRACT, STRFTIME, YEAR, MONTH, DAY
- Other: COALESCE, NULLIF, CAST, TRY_CAST, UNNEST, ARRAY_LENGTH

## Application Requirements

### Features (by version)

**V1 (MVP)**
- SQL "notebook" interface to run queries
- General analysis dashboards with pre-defined queries and visualizations

**V2**
- Chat interface to interact with data in natural language
- Mixed mode: text messages + SQL queries in same thread

**V3**
- "Idea Tester" - simulate post performance based on historical analysis

### UI/UX Requirements

| Requirement | Details |
|-------------|---------|
| Style | HN-inspired: simple, minimal, text-based |
| Layout | Browser-like with tabs at top |
| Tab Types | Query/Chat, Idea Tester, Dashboard |
| New Tab | Modal/selector to choose tab type |
| Storage | LocalStorage sync (tabs, queries) |
| Query Output Storage | Opt-in (re-run queries on tab load by default) |

### Technical Stack

| Component | Technology |
|-----------|------------|
| Runtime | Bun |
| Framework | React + TypeScript |
| UI Components | shadcn/ui |
| Code Editor | Monaco Editor |
| Data Grid | AG Grid |
| State/Storage | LocalStorage |

### Tab Types Detail

#### 1. Query/Chat Tab
- Monaco editor for SQL input
- Schema autocomplete from `/schema` endpoint
- AG Grid for results display
- Toggle between text (chat) and SQL mode
- Can mix text messages with SQL queries

#### 2. Dashboard Tab
- Pre-defined queries
- Visualizations (charts, metrics)
- Could use pre-built endpoints (/stats/*, /top/*)

#### 3. Idea Tester Tab (v3)
- Text input for hypothetical post
- Historical analysis simulation
- Performance prediction

### Data Flow

```
┌─────────────────────────────────────────────────────────┐
│                    Browser UI                            │
│  ┌─────────┬─────────┬─────────┬─────────┐              │
│  │  Tab 1  │  Tab 2  │  Tab 3  │   +     │  Tab Bar     │
│  └─────────┴─────────┴─────────┴─────────┘              │
│  ┌───────────────────────────────────────────────────┐  │
│  │                                                   │  │
│  │   Query Tab: Monaco Editor + AG Grid Results      │  │
│  │   Chat Tab: Messages + Monaco + AG Grid           │  │
│  │   Dashboard Tab: Charts + Metrics                 │  │
│  │   Idea Tester: Form + Analysis Results            │  │
│  │                                                   │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
              ┌─────────────────────────┐
              │   LocalStorage Sync     │
              │   - Tab state           │
              │   - Query history       │
              │   - Output (opt-in)     │
              └─────────────────────────┘
                           │
                           ▼
              ┌─────────────────────────┐
              │   HN-SQL API            │
              │   localhost:3123        │
              │                         │
              │   POST /query           │
              │   GET  /schema          │
              │   GET  /stories         │
              │   GET  /stats/*         │
              └─────────────────────────┘
```

### Suggested Project Structure

```
willitfront.page/
├── src/
│   ├── components/
│   │   ├── ui/           # shadcn components
│   │   ├── tabs/
│   │   │   ├── TabBar.tsx
│   │   │   ├── QueryTab.tsx
│   │   │   ├── ChatTab.tsx
│   │   │   ├── DashboardTab.tsx
│   │   │   └── IdeaTesterTab.tsx
│   │   ├── editor/
│   │   │   └── SqlEditor.tsx     # Monaco wrapper
│   │   ├── grid/
│   │   │   └── ResultsGrid.tsx   # AG Grid wrapper
│   │   └── dashboard/
│   │       └── Charts.tsx
│   ├── hooks/
│   │   ├── useApi.ts
│   │   ├── useLocalStorage.ts
│   │   └── useTabs.ts
│   ├── lib/
│   │   ├── api.ts        # API client
│   │   ├── schema.ts     # Schema types
│   │   └── storage.ts    # LocalStorage utils
│   ├── types/
│   │   └── index.ts
│   ├── App.tsx
│   └── main.tsx
├── public/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts        # or bun config
└── components.json       # shadcn config
```

### HN Style Reference

The UI should mimic HN's aesthetic:
- Orange (#ff6600) accent color
- Verdana/sans-serif font
- Light background (#f6f6ef)
- Minimal borders, table-like layouts
- Simple text links
- No heavy shadows or gradients

## API Example Queries

```sql
-- Top 10 stories by score
SELECT title, score, "by", time
FROM hn
WHERE type = 'story'
ORDER BY score DESC
LIMIT 10;

-- Stories per month
SELECT DATE_TRUNC('month', time) as month, COUNT(*) as count
FROM hn
WHERE type = 'story'
GROUP BY 1
ORDER BY 1;

-- Most prolific users
SELECT "by", COUNT(*) as posts
FROM hn
WHERE "by" IS NOT NULL
GROUP BY "by"
ORDER BY posts DESC
LIMIT 20;

-- Average score by type
SELECT type, AVG(score) as avg_score, COUNT(*) as count
FROM hn
WHERE score IS NOT NULL
GROUP BY type;
```

## Data Exploration Results

**Dataset Size** (as of research date):
- 10,006 total items
- 1,017 stories
- 8,988 comments
- 1 job
- 4,755 unique users
- Date range: ~1 day of data (Dec 11-12, 2025)

**Story Stats**:
- Average score: 10.7
- Max score: 1,046 (GPT-5.2)
- Average comments: 5.4
- Max comments: 905

**Top Domains**:
| Domain | Posts | Avg Score |
|--------|-------|-----------|
| github.com | 73 | 6.5 |
| youtube.com | 29 | 2.6 |
| medium.com | 12 | 2.6 |
| theguardian.com | 10 | 5.7 |
| nytimes.com | 9 | 5.1 |
| reuters.com | 8 | 11.0 |
| bbc.com | 6 | 13.8 |

**Activity Pattern**: Peak hours are 18:00-21:00 UTC (evening)

## Recommended Dashboards (V1)

### 1. Overview Dashboard
Key metrics at a glance:
- Total stories / comments / users
- Stories today vs yesterday
- Average score trending
- Active hours heatmap

```sql
-- Example queries
SELECT type, COUNT(*) as count FROM hn GROUP BY type;
SELECT COUNT(DISTINCT "by") as users FROM hn WHERE "by" IS NOT NULL;
```

### 2. Top Content Dashboard
Two panels:
- **Top Stories by Score**: Title, score, author, time
- **Most Discussed**: Title, comment count, score

```sql
SELECT title, score, descendants, "by", time
FROM hn WHERE type = 'story'
ORDER BY score DESC LIMIT 20;

SELECT title, descendants, score
FROM hn WHERE type = 'story'
ORDER BY descendants DESC LIMIT 20;
```

### 3. User Leaderboard Dashboard
Three panels:
- **Top Story Authors**: By total score
- **Most Active Commenters**: By comment count
- **Prolific Posters**: By story count

```sql
SELECT "by", COUNT(*) as posts, SUM(score) as total_score
FROM hn WHERE type = 'story' AND "by" IS NOT NULL
GROUP BY "by" ORDER BY total_score DESC LIMIT 20;

SELECT "by", COUNT(*) as comments
FROM hn WHERE type = 'comment' AND "by" IS NOT NULL
GROUP BY "by" ORDER BY comments DESC LIMIT 20;
```

### 4. Domain Analysis Dashboard
Two panels:
- **Most Posted Domains**: Count + avg score
- **Highest Performing Domains**: By average score (min 3 posts)

```sql
SELECT REGEXP_EXTRACT(url, 'https?://([^/]+)', 1) as domain,
       COUNT(*) as count, AVG(score) as avg_score
FROM hn WHERE type = 'story' AND url IS NOT NULL
GROUP BY domain HAVING domain IS NOT NULL
ORDER BY count DESC LIMIT 20;
```

### 5. Activity Timeline Dashboard
- **Posts by Hour**: Bar chart
- **Activity Over Time**: Line chart of posts per hour

```sql
SELECT HOUR(time) as hour, COUNT(*) as posts
FROM hn WHERE type = 'story'
GROUP BY hour ORDER BY hour;

SELECT DATE_TRUNC('hour', time) as hour, COUNT(*) as posts
FROM hn GROUP BY 1 ORDER BY 1;
```

## Decisions Made

| Question | Decision |
|----------|----------|
| Chat backend (LLM) | User will implement later - build UI structure only |
| Idea tester algorithm | Needs follow-up research |
| Dashboard presets | 5 dashboards recommended above |
| Export features | Not for now |
| Sharing/URLs | Not for now, revisit with persistence |

## Open Questions

1. **Idea tester algorithm**: What metrics/model for predicting post performance? (follow-up research needed)
2. **Data freshness**: Is this a live sync or snapshot? Affects dashboard refresh strategy.
