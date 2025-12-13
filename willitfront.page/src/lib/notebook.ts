// SQL Block utilities for the notebook

export interface SqlBlock {
  id: string;
  name: string; // e.g., q1, q2, etc.
  sql: string;
  createdAt: number; // timestamp for ordering in message flow
  result?: {
    columns: string[];
    rows: unknown[][];
    row_count: number;
    timing: { elapsed_seconds: number; elapsed_formatted: string };
    truncated: boolean;
  };
  error?: string;
  isLoading?: boolean;
  readonly?: boolean; // AI-generated blocks are read-only
  fromToolCallId?: string; // Link to the original tool call
}

export const generateBlockId = () => crypto.randomUUID();

export function generateBlockName(existingBlocks: SqlBlock[]): string {
  // Find the highest existing number
  let maxNum = 0;
  for (const block of existingBlocks) {
    const match = block.name.match(/^q(\d+)$/);
    if (match && match[1]) {
      maxNum = Math.max(maxNum, parseInt(match[1], 10));
    }
  }
  return `q${maxNum + 1}`;
}

export function createBlock(existingBlocks: SqlBlock[], sql = ''): SqlBlock {
  return {
    id: generateBlockId(),
    name: generateBlockName(existingBlocks),
    sql,
    createdAt: Date.now(),
  };
}

/**
 * Build a SQL query with previous blocks as CTEs so they can be referenced.
 * For example, if block q1 has "SELECT * FROM users" and block q2 wants to
 * reference it, the actual query becomes:
 * WITH q1 AS (SELECT * FROM users) SELECT * FROM q1 WHERE ...
 */
export function buildQueryWithCTEs(
  currentBlockIndex: number,
  blocks: SqlBlock[]
): string {
  const currentBlock = blocks[currentBlockIndex];
  if (!currentBlock) return '';

  // Get all previous blocks with content
  const previousBlocks = blocks
    .slice(0, currentBlockIndex)
    .filter((b) => b.sql.trim());

  if (previousBlocks.length === 0) {
    return currentBlock.sql;
  }

  // Check if current query references any previous block names
  const referencedBlocks = previousBlocks.filter((b) => {
    // Skip blocks without valid names
    if (!b.name || b.name.trim() === '') return false;
    // Simple check: does the current SQL contain the block name as a word?
    const regex = new RegExp(`\\b${b.name}\\b`, 'i');
    return regex.test(currentBlock.sql);
  });

  if (referencedBlocks.length === 0) {
    return currentBlock.sql;
  }

  // Build CTEs for referenced blocks
  const ctes = referencedBlocks
    .map((b) => `${b.name} AS (${b.sql.trim().replace(/;$/, '')})`)
    .join(',\n');

  return `WITH ${ctes}\n${currentBlock.sql}`;
}

/**
 * Format SQL blocks for inclusion in AI chat context.
 * This helps the AI understand what queries have been run and their results.
 */
export function formatBlocksForContext(blocks: SqlBlock[]): string {
  if (blocks.length === 0) return '';

  const blockDescriptions = blocks.map((block) => {
    let desc = `[${block.name}]: ${block.sql.trim()}`;
    if (block.result) {
      desc += `\n  → ${block.result.row_count} rows`;
      // Include first few rows as preview
      if (block.result.rows.length > 0) {
        const previewRows = block.result.rows.slice(0, 3);
        const columns = block.result.columns;
        desc += `\n  Columns: ${columns.join(', ')}`;
        desc += `\n  Preview: ${JSON.stringify(previewRows)}`;
      }
    } else if (block.error) {
      desc += `\n  → Error: ${block.error}`;
    }
    return desc;
  });

  return `\n\nSQL Blocks in this notebook:\n${blockDescriptions.join('\n\n')}`;
}
