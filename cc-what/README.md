# cc-what

TypeScript SDK for analyzing Claude Code usage data from `~/.claude/`.

## Installation

```bash
npm install @desplega.ai/cc-what
# or
bun add @desplega.ai/cc-what
```

## Quick Start

```typescript
import { stats, sessions, costs, projects } from '@desplega.ai/cc-what'

// Quick access to pre-computed stats
const daily = await stats.daily()
const models = await stats.models()
const totals = await stats.totals()

console.log(`Total: ${totals.sessions} sessions, ${totals.messages} messages`)
console.log(`Cost: $${await stats.totalCost()}`)
```

## API

### Stats

```typescript
import { stats } from '@desplega.ai/cc-what'

// Daily activity
const daily = await stats.daily()           // All daily activity
const today = await stats.todayActivity()   // Today only
const week = await stats.thisWeekActivity() // This week

// Model usage
const models = await stats.models()         // All models
const sonnet = await stats.model('claude-sonnet-4-20250514')

// Patterns
const hours = await stats.byHour()          // { "0": 123, "1": 45, ... }
const peak = await stats.peakHour()         // { hour: 14, count: 1234 }

// Totals
const totals = await stats.totals()         // { sessions, messages }
const cost = await stats.totalCost()        // Total USD
const tokens = await stats.totalTokens()    // { input, output, cacheRead, cacheCreation }
```

### Sessions

```typescript
import { sessions } from '@desplega.ai/cc-what'

// Quick access
const today = await sessions.today()
const week = await sessions.thisWeek()
const recent = await sessions.recent(10)
const forProject = await sessions.forProject('/path/to/repo')

// Get full session with messages
const session = await sessions.get('session-uuid')
const msgs = await session.messages()       // All messages
const subagents = await session.subagents() // Subagent histories

// Query builder
const filtered = await sessions.query()
  .after('2026-01-01')
  .before('2026-01-25')
  .inProject('/path/to/repo')
  .withBranch('main')
  .minMessages(10)
  .searchPrompt('refactor')
  .limit(20)
  .get()

// Get sessions with subagents only
const withSubagents = await sessions.query()
  .withSubagents()
  .get()
```

### Costs

```typescript
import { costs } from '@desplega.ai/cc-what'

const total = costs.total()                 // Total USD
const byModel = costs.byModel()             // { model: cost }
const byDay = costs.byDay()                 // { date: cost }
const byProject = await costs.byProject()  // { project: cost }

// Time periods
const today = costs.forToday()
const week = costs.forThisWeek()
const month = costs.forThisMonth()

// Full breakdown
const breakdown = await costs.breakdown()
```

### Projects

```typescript
import { projects } from '@desplega.ai/cc-what'

const all = await projects.all()
const top = await projects.byMessageCount(5)
const recent = await projects.recent(5)
const found = await projects.search('toolbox')
```

### Messages (Direct DB Access)

```typescript
import { messages } from '@desplega.ai/cc-what'

const recent = messages.recent(50)
const bySession = messages.forSession('uuid')
const byModel = messages.byModel('claude-sonnet-4-20250514', 50)
```

## CLI

```bash
# Summary
cc-what

# Stats
cc-what stats
cc-what stats --daily
cc-what stats --models
cc-what stats --hours

# Sessions
cc-what sessions --today
cc-what sessions --week
cc-what sessions --recent 20
cc-what sessions --project /path/to/repo

# Costs
cc-what costs
cc-what costs --models
cc-what costs --daily
cc-what costs --projects

# Projects
cc-what projects
cc-what projects --messages
cc-what projects --sessions
cc-what projects --recent
```

## Data Sources

| Source | Content |
|--------|---------|
| `stats-cache.json` | Pre-computed daily stats, model usage, hourly patterns |
| `__store.db` | SQLite with messages, costs, models, durations |
| `history.jsonl` | User prompts with timestamps, projects |
| `projects/{path}/sessions-index.json` | Session metadata index |
| `projects/{path}/{sessionId}.jsonl` | Full session messages |
| `projects/{path}/{sessionId}/subagents/` | Sub-agent histories |

## License

MIT
