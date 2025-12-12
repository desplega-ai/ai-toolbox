import type { NotebookBlock, Tab } from '@/types/tabs';

export const generateBlockId = () => Math.random().toString(36).substr(2, 9);

export function createBlock(type: 'sql' = 'sql', content = '', name = ''): NotebookBlock {
  return {
    id: generateBlockId(),
    type,
    content,
    name,
    collapsed: false,
  };
}

export function generateBlockName(existingBlocks: NotebookBlock[]): string {
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

/**
 * Build a SQL query with previous blocks as CTEs so they can be referenced.
 * For example, if block q1 has "SELECT * FROM users" and block q2 wants to
 * reference it, the actual query becomes:
 * WITH q1 AS (SELECT * FROM users) SELECT * FROM q1 WHERE ...
 */
export function buildQueryWithCTEs(
  currentBlockIndex: number,
  blocks: NotebookBlock[]
): string {
  const currentBlock = blocks[currentBlockIndex];
  if (!currentBlock) return '';

  // Get all previous blocks with content
  const previousBlocks = blocks
    .slice(0, currentBlockIndex)
    .filter((b) => b.type === 'sql' && b.content.trim());

  if (previousBlocks.length === 0) {
    return currentBlock.content;
  }

  // Check if current query references any previous block names
  const referencedBlocks = previousBlocks.filter((b) => {
    // Skip blocks without valid names
    if (!b.name || b.name.trim() === '') return false;
    // Simple check: does the current SQL contain the block name as a word?
    const regex = new RegExp(`\\b${b.name}\\b`, 'i');
    return regex.test(currentBlock.content);
  });

  if (referencedBlocks.length === 0) {
    return currentBlock.content;
  }

  // Build CTEs for referenced blocks
  const ctes = referencedBlocks
    .map((b) => `${b.name} AS (${b.content.trim().replace(/;$/, '')})`)
    .join(',\n');

  return `WITH ${ctes}\n${currentBlock.content}`;
}

export function migrateTabToNotebook(tab: Tab): Tab {
  // If tab already has blocks, ensure they all have names
  if (tab.blocks && tab.blocks.length > 0) {
    const blocksWithNames = tab.blocks.map((block, index) => {
      if (block.name) return block;
      return { ...block, name: `q${index + 1}` };
    });
    return { ...tab, blocks: blocksWithNames };
  }

  // Migrate legacy sql field to blocks
  if (tab.sql) {
    return {
      ...tab,
      blocks: [createBlock('sql', tab.sql, 'q1')],
      sql: undefined,
    };
  }

  // New tab with empty block
  return {
    ...tab,
    blocks: [createBlock('sql', '', 'q1')],
  };
}

export function getTabBlocks(tab: Tab): NotebookBlock[] {
  const migrated = migrateTabToNotebook(tab);
  return migrated.blocks || [createBlock('sql', '', 'q1')];
}
