# cc-what

TypeScript SDK + CLI for analyzing Claude Code usage data from `~/.claude/`.

## Architecture

```
src/
├── index.ts              # Main exports
├── cli.ts                # CLI entry (commander)
├── config.ts             # Config & paths
├── pricing.ts            # Anthropic pricing (official + LiteLLM fallback)
├── types.ts              # All TypeScript interfaces
├── sources/              # Data readers (raw file access)
│   ├── stats-cache.ts    # stats-cache.json reader
│   ├── history.ts        # history.jsonl reader
│   ├── session.ts        # Session JSONL reader
│   └── session-index.ts  # sessions-index.json reader
├── queries/              # High-level query APIs
│   ├── stats.ts          # Aggregated stats
│   ├── sessions.ts       # Session queries with builder
│   ├── messages.ts       # Direct message access
│   ├── costs.ts          # Cost calculations
│   ├── projects.ts       # Project listings
│   ├── tools.ts          # Tool/skill usage & line changes
│   └── prompts.ts        # User prompt analysis & slash commands
└── utils/
    ├── dates.ts          # Date helpers
    └── paths.ts          # Path encoding/decoding
```

## Data Sources (from `~/.claude/`)

| File | Description |
|------|-------------|
| `stats-cache.json` | Pre-computed stats: daily activity, model usage, hourly patterns |
| `history.jsonl` | User prompts with timestamps and project paths |
| `projects/{encoded-path}/sessions-index.json` | Session metadata per project |
| `projects/{encoded-path}/{sessionId}.jsonl` | Full session messages |
| `projects/{path}/{sessionId}/subagents/` | Sub-agent conversation histories |

## Pricing Reference

Official Anthropic pricing (as of 2026-02). Source: https://www.anthropic.com/pricing

| Model | Input | Output | Cache Write (5m) | Cache Read |
|-------|-------|--------|------------------|------------|
| Opus 4.5 | $5/MTok | $25/MTok | $6.25/MTok | $0.50/MTok |
| Opus 4.1 | $15/MTok | $75/MTok | $18.75/MTok | $1.50/MTok |
| Opus 4 | $15/MTok | $75/MTok | $18.75/MTok | $1.50/MTok |
| Sonnet 4.5 | $3/MTok | $15/MTok | $3.75/MTok | $0.30/MTok |
| Sonnet 4 | $3/MTok | $15/MTok | $3.75/MTok | $0.30/MTok |
| Sonnet 3.7 | $3/MTok | $15/MTok | $3.75/MTok | $0.30/MTok |
| Haiku 4.5 | $1/MTok | $5/MTok | $1.25/MTok | $0.10/MTok |
| Haiku 3.5 | $0.80/MTok | $4/MTok | $1/MTok | $0.08/MTok |
| Haiku 3 | $0.25/MTok | $1.25/MTok | $0.30/MTok | $0.03/MTok |
| Opus 3 | $15/MTok | $75/MTok | $18.75/MTok | $1.50/MTok |

Model ID patterns in stats-cache:
- `claude-opus-4-5-*` → Opus 4.5
- `claude-opus-4-1-*` → Opus 4.1
- `claude-opus-4-*` → Opus 4
- `claude-sonnet-4-5-*` → Sonnet 4.5
- `claude-sonnet-4-*` → Sonnet 4
- `claude-haiku-4-5-*` → Haiku 4.5
- `claude-haiku-3-5-*` → Haiku 3.5

## Development

```bash
bun install                  # Install deps
bun run build                # Build everything
bun run dev                  # Watch mode
bun run lint                 # Check with biome
bun run lint:fix             # Auto-fix
```

## Using cc-what to Answer Questions

When Taras asks questions about his Claude Code usage, **use native TS imports** with bun:

```typescript
// Run with: bun -e "..."
import { stats, sessions, costs, projects, tools } from './src'

// Quick stats
const totals = await stats.totals()
const dailyActivity = await stats.daily()
const modelUsage = await stats.models()
const hourlyPattern = await stats.byHour()

// Sessions
const todaySessions = await sessions.today()
const recentSessions = await sessions.recent(10)
const filtered = await sessions.query()
  .after('2026-01-01')
  .minMessages(5)
  .get()

// Message breakdown by role
const yesterday = await sessions.yesterdayMessageBreakdown()  // { user, assistant, ratio, sessionsAnalyzed }
const specific = await sessions.messageBreakdownForDate('2026-01-24')  // same structure

// Session analytics
const ratio = await sessions.messageRatio(500)      // { user, assistant, ratio }
const content = await sessions.contentBreakdown(500) // { userPrompts, toolResults, assistantText, assistantToolCalls }
const ctx = await sessions.contextMetrics(500, 200000) // { avgInputTokens, avgUtilization, sessionsNearLimit, ... }

// Costs
const total = await costs.computedTotal()
const summary = await costs.summary()  // { total, byModel }

// Projects
const topProjects = await projects.byMessageCount(5)

// Tool usage & line changes
const topTools = await tools.topTools(10)           // Most used tools
const allToolUsage = await tools.usage()            // All tools with counts
const todayTools = await tools.todayUsage()         // Today's tool usage
const skillStats = await tools.skillUsage()         // Skill/Task agent usage

const lines = await tools.lineChanges()             // { added, removed, modified, filesChanged }
const todayLines = await tools.todayLineChanges()   // Today's line changes
const fileDetails = await tools.fileChanges()       // Per-file breakdown

// With date filters
const janTools = await tools.usage('2026-01-01', '2026-01-31')
const janLines = await tools.lineChanges('2026-01-01', '2026-01-31')

// User prompts & slash commands (from history.jsonl)
const topCmds = await prompts.topCommands(10)       // Most used slash commands
const allCmds = await prompts.commands()            // All commands with counts
const res = await prompts.researches()              // { total, byVariant, byMonth }
const plans = await prompts.plans()                 // Plan command usage
const commits = await prompts.commits()             // Commit command usage

// Custom command pattern
const custom = await prompts.commandsMatching(/\/my-cmd/i)

// Prompt stats
const pstats = await prompts.stats()                // { total, byMonth, byProject, avgLength }
const byProj = await prompts.byProject()            // Prompts per project
const byMo = await prompts.byMonth()                // Prompts per month
const range = await prompts.dateRange()             // { from, to, days }

// Search prompts
const found = await prompts.search('some text')
```

Or run the CLI directly:

```bash
bun /Users/taras/Documents/code/ai-toolbox/cc-what/src/cli.ts stats
bun /Users/taras/Documents/code/ai-toolbox/cc-what/src/cli.ts stats --daily
bun /Users/taras/Documents/code/ai-toolbox/cc-what/src/cli.ts costs --detailed
```

## ASCII Visualizations

When presenting data, use ASCII art/graphs for clarity. Examples:

### Hourly Distribution (Bar Chart)
```
Hour   Messages
00:00  ██ (150)
01:00  █ (80)
...
14:00  ████████████ (1,234)
15:00  ██████████ (980)
...
23:00  ███ (290)
```

### Daily Trend (Sparkline-style)
```
Messages per day (last 7 days):
Mon   Tue   Wed   Thu   Fri   Sat   Sun
 █     ██    █    ███   ████  ██     █
 245   512   189  789   1024  567   156
```

### Model Usage (Pie-ish breakdown)
```
Model Distribution
─────────────────────────────────────────
sonnet-4       ████████████████████ 68%  $45.23
opus-4         ████████             28%  $89.12
haiku-3.5      ██                    4%   $1.45
─────────────────────────────────────────
TOTAL                              100%  $135.80
```

### Session Timeline
```
Today's Sessions
────────────────────────────────────────────────────────
09:15  ├─ fix-auth-bug (45 msgs)
10:30  │  └─ [Task: code-reviewer] (12 msgs)
11:00  ├─ add-dark-mode (23 msgs)
14:00  ├─ refactor-api (89 msgs)
14:45  │  ├─ [Task: Explore] (8 msgs)
14:52  │  └─ [Task: test-runner] (15 msgs)
16:30  └─ write-docs (12 msgs)
────────────────────────────────────────────────────────
```

### Cost Breakdown Table
```
┌─────────────────────┬──────────┬──────────┬──────────┐
│ Model               │ Input    │ Output   │ Total    │
├─────────────────────┼──────────┼──────────┼──────────┤
│ claude-sonnet-4     │ $12.34   │ $32.89   │ $45.23   │
│ claude-opus-4       │ $34.56   │ $54.56   │ $89.12   │
├─────────────────────┼──────────┼──────────┼──────────┤
│ TOTAL               │ $46.90   │ $87.45   │ $134.35  │
└─────────────────────┴──────────┴──────────┴──────────┘
```

### Tool Usage
```
Top Tools (all time)
─────────────────────────────────────────
Edit              ████████████████ 4,940
Read              ███████████████  4,697
Bash              █████████████    4,159
TodoWrite         ██████           1,872
Grep              █████            1,571
Write             ███                940
Task              ██                 686
─────────────────────────────────────────
```

### Skill/Agent Usage
```
Most Used Skills & Agents
─────────────────────────────────────────
Task:Explore                  ████████ 288
Task:codebase-analyzer        ███       69
Task:Plan                     ██        42
/file-review:file-review      ██        32
/desplega:planning            █         23
─────────────────────────────────────────
```

### Line Changes
```
Line Changes (All Time)
═══════════════════════════════════════════
  Added:    +273,228 lines  ████████████████
  Removed:    -5,673 lines  █
  Files:         959 unique files modified
═══════════════════════════════════════════

Today's Changes
───────────────────────────────────────────
  Added:      +1,234 lines
  Removed:      -156 lines
  Net:        +1,078 lines
───────────────────────────────────────────
```

### Slash Commands (User Prompts)
```
Top Commands (All Time)
─────────────────────────────────────────────────
 1. /clear                     █████████████ 351
 2. /desplega:implement-plan   ███            64
 3. /base:implement-plan       ██             61
 4. /base:create-plan          ██             53
 5. /base:research             ██             53
 6. /desplega:research         ██             49
─────────────────────────────────────────────────
```

### Research Commands
```
Research Commands (All Time)
═══════════════════════════════════════════
  Total: 253

By variant:
  /research             ███████████████ 151
  /base:research        ██████           53
  /desplega:research    █████            49

By month:
  2025-10  █████████                      35
  2025-11  █                               2
  2025-12  ██████████████████████         89
  2026-01  ██████████████████████████████ 127
═══════════════════════════════════════════
```

### Guidelines for ASCII Graphs

1. **Bar charts**: Use `█` for filled, scale appropriately (e.g., 1 block = 100 msgs)
2. **Tables**: Use box-drawing chars (`┌─┬─┐`, `├─┼─┤`, `└─┴─┘`) for clean tables
3. **Trees/timelines**: Use `├`, `└`, `│` for hierarchy
4. **Separators**: Use `─────` or `═════` for section breaks
5. **Percentages**: Show visual + number: `████████ 42%`

When answering questions, prefer ASCII visualizations over plain text lists when:
- Comparing quantities (use bars)
- Showing time series (use sparklines or timeline)
- Breaking down proportions (use table with visual indicators)
- Showing hierarchy (use tree structure)
