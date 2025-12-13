import type { SchemaResponse } from '@/types/api';

export interface SqlBlockInfo {
  name: string;
  sql: string;
}

interface SystemPromptOptions {
  schema: SchemaResponse | null | undefined;
  sqlBlocks?: SqlBlockInfo[];
}

const DUCKDB_SYNTAX_TIPS = `
## DuckDB SQL Syntax (Important!)
This database uses DuckDB, which has some differences from PostgreSQL/MySQL:

### Convenient Shortcuts
- GROUP BY ALL: Automatically groups by all non-aggregated columns in SELECT
- ORDER BY ALL: Sorts by all columns left to right
- SELECT * EXCLUDE (col1, col2): Select all columns except specified ones
- SELECT * REPLACE (expr AS col): Transform a column while selecting all

### String Functions
- Use || for concatenation (not CONCAT)
- strftime(format, timestamp) for date formatting
- regexp_matches(string, pattern) for regex

### Date/Time Functions
- date_trunc('month', timestamp) - truncate to period
- date_part('year', timestamp) or year(timestamp) - extract parts
- epoch(timestamp) - get unix timestamp
- now() - current timestamp

### Aggregations
- list(column) - collect values into an array
- string_agg(column, separator ORDER BY x) - concatenate strings
- approx_count_distinct(column) - fast approximate distinct count
- median(column), mode(column) - statistical functions

### Other Tips
- "by" is a reserved word - always quote it: "by"
- Use ILIKE for case-insensitive LIKE
- Use :: for casting (e.g., '2024-01-01'::DATE)
`;

export function buildSystemPrompt({ schema, sqlBlocks }: SystemPromptOptions): string {
  const tableDescriptions = schema?.tables?.map((table) => {
    const columns = table.columns.map((col) =>
      `  - ${col.name} (${col.type})${col.nullable ? ', nullable' : ''}${col.description ? `: ${col.description}` : ''}`
    ).join('\n');
    return `Table: ${table.name}\n${columns}`;
  }).join('\n\n') || 'Schema not available';

  const functions = schema?.functions?.join(', ') || 'COUNT, SUM, AVG, MIN, MAX, etc.';

  const currentDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  let prompt = `You are a helpful assistant for analyzing Hacker News data.
You have access to tools to query the database using SQL.

**Today's date: ${currentDate}**

## Database Schema
${tableDescriptions}

## IMPORTANT: Query Guidelines
- ONLY use tables listed above in the schema. The main table is "hn" - do NOT use "stories", "comments", "items", or other table names.
- The "by" column is a reserved word - MUST quote it as "by" in SQL queries
- Results are truncated by default (first 10 rows, 100 char cells)
- Full results are cached on the frontend - user can expand them in the UI
- Filter by type column: 'story', 'comment', 'job', 'poll', 'pollopt'

## Available SQL Functions
${functions}

${DUCKDB_SYNTAX_TIPS}`;

  if (sqlBlocks && sqlBlocks.length > 0) {
    // Show full SQL for each block so LLM can understand and reuse them
    const blocksInfo = sqlBlocks.map(b => {
      const sql = b.sql.trim();
      return `### ${b.name}
\`\`\`sql
${sql}
\`\`\``;
    }).join('\n\n');

    prompt += `

## Available SQL Blocks (REUSE THESE!)
The user has created SQL blocks in their notebook. **You should actively reuse these blocks** by referencing them in your queries (e.g., \`SELECT * FROM ${sqlBlocks[0]?.name || 'q1'}\`).

When you reference a block name, the system automatically wraps your query with CTEs containing the block's SQL.

**Benefits of reusing blocks:**
- Builds on work the user has already done
- Keeps queries simple and readable
- Avoids repeating complex logic

${blocksInfo}

**Example usage:** If ${sqlBlocks[0]?.name || 'q1'} contains a filtered dataset, you can do:
\`SELECT COUNT(*), type FROM ${sqlBlocks[0]?.name || 'q1'} GROUP BY type\``;
  }

  return prompt;
}
