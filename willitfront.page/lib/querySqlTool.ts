import { tool } from 'ai';
import { z } from 'zod';
import { HN_SQL_API } from './constants';
import type { SqlBlockInfo } from './systemPrompt';

const MAX_PREVIEW_ROWS = 10;
const MAX_CELL_LENGTH = 100;

const querySqlParams = z.object({
  sql: z.string().describe('The SQL query to execute'),
  limit: z.number().optional().describe('Max rows to return (default 1000, max 10000)'),
});

type QuerySqlParams = z.infer<typeof querySqlParams>;

function buildQueryWithCTEs(sql: string, sqlBlocks: SqlBlockInfo[]): { query: string; expanded: boolean } {
  if (!sqlBlocks || sqlBlocks.length === 0) {
    return { query: sql, expanded: false };
  }

  const referencedBlocks = sqlBlocks.filter((block) => {
    if (!block.name || block.name.trim() === '') return false;
    const regex = new RegExp(`\\b${block.name}\\b`, 'i');
    return regex.test(sql);
  });

  if (referencedBlocks.length === 0) {
    return { query: sql, expanded: false };
  }

  const ctes = referencedBlocks
    .map((block) => `${block.name} AS (${block.sql.trim().replace(/;$/, '')})`)
    .join(',\n');

  return {
    query: `WITH ${ctes}\n${sql}`,
    expanded: true,
  };
}

export function createQuerySqlTool(sqlBlocks?: SqlBlockInfo[]) {
  return tool({
    description: `Execute a SQL query against the Hacker News database.
Returns truncated preview in the response. Full results are included for the frontend to cache.
Remember to quote the "by" column in SQL queries as it's a reserved word.
You can reference user's saved SQL blocks by name (e.g., q1, q2) - they will be automatically included as CTEs.`,
    inputSchema: querySqlParams,
    execute: async ({ sql, limit }: QuerySqlParams) => {
      try {
        const { query: expandedSql, expanded } = buildQueryWithCTEs(sql, sqlBlocks || []);

        const response = await fetch(`${HN_SQL_API}/query`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sql: expandedSql, limit: limit || 1000 }),
        });

        if (!response.ok) {
          const error = await response.json();
          return {
            success: false as const,
            error: error.error || 'Query failed',
            errorDetails: error.detail || error.details,
            sql,
            expandedSql: expanded ? expandedSql : undefined,
          };
        }

        const data = await response.json();
        const blockId = crypto.randomUUID();

        const truncatedRows = data.rows.slice(0, MAX_PREVIEW_ROWS).map((row: unknown[]) =>
          row.map((cell: unknown) => {
            if (cell === null) return null;
            const str = String(cell);
            return str.length > MAX_CELL_LENGTH ? str.slice(0, MAX_CELL_LENGTH) + '...' : str;
          })
        );

        const isTruncated = data.rows.length > MAX_PREVIEW_ROWS ||
          data.rows.some((row: unknown[]) =>
            row.some((cell: unknown) => cell !== null && String(cell).length > MAX_CELL_LENGTH)
          );

        return {
          success: true as const,
          blockId,
          sql,
          expandedSql: expanded ? expandedSql : undefined,
          columns: data.columns as string[],
          preview: {
            rows: truncatedRows as unknown[][],
            rowCount: truncatedRows.length,
          },
          fullData: {
            rows: data.rows as unknown[][],
            rowCount: data.row_count as number,
          },
          timing: data.timing as { elapsed_seconds: number; elapsed_formatted: string },
          isTruncated,
        };
      } catch (error) {
        return {
          success: false as const,
          error: error instanceof Error ? error.message : 'Unknown error',
          sql,
        };
      }
    },
  });
}
