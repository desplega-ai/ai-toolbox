/**
 * Insert hive-comment tags around selected text in markdown.
 * For multi-block selections (text with \n\n), wraps each block separately.
 */
export function insertCommentByText(
  markdown: string,
  selectedText: string,
  commentId: string,
  commentContent: string
): string {
  // Split selected text into blocks (paragraphs/lines)
  const blocks = selectedText.split(/\n\n+/).map(b => b.trim()).filter(Boolean);

  let result = markdown;

  for (const block of blocks) {
    // Find the block in the markdown
    // We need to find a line that contains this text
    const lines = result.split('\n');
    let found = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Check if this line contains the block text (accounting for markdown formatting)
      // Strip common markdown formatting for comparison
      const strippedLine = line
        .replace(/^#+\s*/, '') // headers
        .replace(/^\s*[-*+]\s*/, '') // list items
        .replace(/^\s*\d+\.\s*/, '') // numbered lists
        .replace(/\*\*([^*]+)\*\*/g, '$1') // bold
        .replace(/\*([^*]+)\*/g, '$1') // italic
        .replace(/`([^`]+)`/g, '$1') // inline code
        .trim();

      if (strippedLine === block || line.includes(block)) {
        // Insert comment tags
        const openTag = `<!-- hive-comment(${commentId}): ${commentContent} -->`;
        const closeTag = `<!-- hive-comment(${commentId}) -->`;

        lines.splice(i + 1, 0, closeTag);
        lines.splice(i, 0, openTag);
        result = lines.join('\n');
        found = true;
        break;
      }
    }

    // If exact match not found, try fuzzy match (first few words)
    if (!found && block.length > 20) {
      const firstWords = block.slice(0, 30);
      const lines = result.split('\n');

      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(firstWords)) {
          const openTag = `<!-- hive-comment(${commentId}): ${commentContent} -->`;
          const closeTag = `<!-- hive-comment(${commentId}) -->`;

          lines.splice(i + 1, 0, closeTag);
          lines.splice(i, 0, openTag);
          result = lines.join('\n');
          break;
        }
      }
    }
  }

  return result;
}

// Legacy line-based insert (kept for compatibility)
export function insertComment(
  markdown: string,
  line: number,
  commentId: string,
  commentContent: string
): string {
  const lines = markdown.split('\n');
  const openTag = `<!-- hive-comment(${commentId}): ${commentContent} -->`;
  const closeTag = `<!-- hive-comment(${commentId}) -->`;

  // Insert opening tag before the line, closing tag after
  if (line > 0 && line <= lines.length) {
    // Insert after the current line
    lines.splice(line, 0, closeTag);
    lines.splice(line - 1, 0, openTag);
  }

  return lines.join('\n');
}

export function removeComment(markdown: string, commentId: string): string {
  const openPattern = new RegExp(`<!--\\s*hive-comment\\(${commentId}\\):[^>]*-->\\n?`, 'g');
  const closePattern = new RegExp(`<!--\\s*hive-comment\\(${commentId}\\)\\s*-->\\n?`, 'g');

  return markdown.replace(openPattern, '').replace(closePattern, '');
}

export function formatCommentsForClaude(comments: Array<{ id: string; content: string; startLine: number; endLine: number }>): string {
  if (comments.length === 0) return '';

  const header = 'Please review and address the following comments:\n\n';
  const commentsList = comments.map((c, i) =>
    `${i + 1}. [Lines ${c.startLine}-${c.endLine}] ${c.content}`
  ).join('\n');

  return header + commentsList;
}

// Format ThoughtComment[] for sending to the agent
export function formatCommentsForAgent(comments: Array<{
  filePath: string;
  content: string;
  selectedText: string;
}>): string {
  if (comments.length === 0) return '';

  const header = 'Please review and address the following feedback:\n\n';
  const commentsList = comments.map((c, i) => {
    const fileName = c.filePath.split('/').pop() || c.filePath;
    const textSnippet = c.selectedText.length > 60
      ? c.selectedText.slice(0, 60) + '…'
      : c.selectedText;
    return `${i + 1}. **${fileName}** ("${textSnippet}"):\n   ${c.content}`;
  }).join('\n\n');

  return header + commentsList;
}
