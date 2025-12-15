import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkFrontmatter from 'remark-frontmatter';
import { visit } from 'unist-util-visit';
import type { Root, Html } from 'mdast';
import type { HiveComment } from '../shared/types';

const processor = unified()
  .use(remarkParse)
  .use(remarkFrontmatter, ['yaml']);

export function parseHiveComments(markdown: string): HiveComment[] {
  const tree = processor.parse(markdown) as Root;
  const comments: HiveComment[] = [];
  const openComments = new Map<string, { content: string; startLine: number }>();

  visit(tree, 'html', (node: Html) => {
    // Opening comment: <!-- hive-comment(id): content -->
    const openMatch = node.value.match(/<!--\s*hive-comment\(([^)]+)\):\s*(.+?)\s*-->/);
    if (openMatch) {
      const [, id, content] = openMatch;
      openComments.set(id, {
        content,
        startLine: node.position?.start.line ?? 0,
      });
      return;
    }

    // Closing comment: <!-- hive-comment(id) -->
    const closeMatch = node.value.match(/<!--\s*hive-comment\(([^)]+)\)\s*-->/);
    if (closeMatch) {
      const [, id] = closeMatch;
      const open = openComments.get(id);
      if (open) {
        comments.push({
          id,
          content: open.content,
          startLine: open.startLine,
          endLine: node.position?.end.line ?? 0,
        });
        openComments.delete(id);
      }
    }
  });

  return comments;
}

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
  // For now, wrap the single line
  if (line > 0 && line <= lines.length) {
    lines.splice(line - 1, 0, openTag);
    lines.splice(line + 1, 0, closeTag);
  }

  return lines.join('\n');
}

export function removeComment(markdown: string, commentId: string): string {
  // Remove both opening and closing tags
  const openPattern = new RegExp(`<!--\\s*hive-comment\\(${commentId}\\):[^>]*-->\\n?`, 'g');
  const closePattern = new RegExp(`<!--\\s*hive-comment\\(${commentId}\\)\\s*-->\\n?`, 'g');

  return markdown.replace(openPattern, '').replace(closePattern, '');
}
