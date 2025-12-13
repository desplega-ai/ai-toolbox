import { tool } from 'ai';
import { z } from 'zod';
import type { SqlBlockInfo } from '../buildSystemPrompt';

const MAX_PREVIEW_ROWS = 10;
const MAX_CELL_LENGTH = 100;

const HN_SQL_API = process.env.HN_SQL_API_URL || 'http://localhost:3123';

const querySqlParams = z.object({
  sql: z.string().describe('The SQL query to execute'),
  limit: z.number().optional().describe('Max rows to return (default 1000, max 10000)'),
});

type QuerySqlParams = z.infer<typeof querySqlParams>;

/**
 * Build SQL query with CTEs for any referenced block names.
 * If the query references q1, q2, etc., wrap it with the appropriate CTEs.
 */
function buildQueryWithCTEs(sql: string, sqlBlocks: SqlBlockInfo[]): { query: string; expanded: boolean } {
  if (!sqlBlocks || sqlBlocks.length === 0) {
    return { query: sql, expanded: false };
  }

  // Find which blocks are referenced in the query
  const referencedBlocks = sqlBlocks.filter((block) => {
    if (!block.name || block.name.trim() === '') return false;
    // Check if the block name appears as a word in the query
    const regex = new RegExp(`\\b${block.name}\\b`, 'i');
    return regex.test(sql);
  });

  if (referencedBlocks.length === 0) {
    return { query: sql, expanded: false };
  }

  // Build CTEs for referenced blocks
  const ctes = referencedBlocks
    .map((block) => `${block.name} AS (${block.sql.trim().replace(/;$/, '')})`)
    .join(',\n');

  return {
    query: `WITH ${ctes}\n${sql}`,
    expanded: true,
  };
}

/**
 * Create a querySql tool with access to SQL blocks for CTE expansion.
 */
export function createQuerySqlTool(sqlBlocks?: SqlBlockInfo[]) {
  return tool({
    description: `Execute a SQL query against the Hacker News database.
Returns truncated preview in the response. Full results are included for the frontend to cache.
Remember to quote the "by" column in SQL queries as it's a reserved word.
You can reference user's saved SQL blocks by name (e.g., q1, q2) - they will be automatically included as CTEs.`,
    inputSchema: querySqlParams,
    execute: async ({ sql, limit }: QuerySqlParams) => {
      try {
        // Expand query with CTEs if it references any blocks
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
            errorDetails: error.detail || error.details, // Include detailed error info
            sql,
            expandedSql: expanded ? expandedSql : undefined,
          };
        }

        const data = await response.json();
        const blockId = crypto.randomUUID();

        // Truncate for AI context (preview)
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
          sql, // Original SQL (what the AI wrote)
          expandedSql: expanded ? expandedSql : undefined, // Expanded SQL with CTEs
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

// Default tool without SQL blocks (for backward compatibility)
export const querySqlTool = createQuerySqlTool();
