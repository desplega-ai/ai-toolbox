export interface Chunk {
  index: number;
  type: "timestamp-block" | "header-section" | "whole-file";
  content: string;
  startLine: number;
}

/**
 * Timestamp pattern for daily files: [YYYY-MM-DD-HHMMSS]
 */
const TIMESTAMP_PATTERN = /^\[(\d{4}-\d{2}-\d{2}-\d{6})\]/;

/**
 * Header pattern for markdown sections
 */
const HEADER_PATTERN = /^##\s+/;

/**
 * Chunk a daily file by timestamp blocks
 * Each block starts with [YYYY-MM-DD-HHMMSS] and ends at the next timestamp
 */
export function chunkDailyFile(content: string): Chunk[] {
  const lines = content.split("\n");
  const chunks: Chunk[] = [];
  let currentChunk: string[] = [];
  let currentStartLine = 0;
  let chunkIndex = 0;
  let foundTimestamp = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";

    if (TIMESTAMP_PATTERN.test(line)) {
      foundTimestamp = true;
      // Save previous chunk if exists
      if (currentChunk.length > 0) {
        const chunkContent = currentChunk.join("\n").trim();
        if (chunkContent.length > 0) {
          chunks.push({
            index: chunkIndex++,
            type: "timestamp-block",
            content: chunkContent,
            startLine: currentStartLine,
          });
        }
      }
      // Start new chunk
      currentChunk = [line];
      currentStartLine = i;
    } else {
      currentChunk.push(line);
    }
  }

  // Save final chunk
  if (currentChunk.length > 0) {
    const chunkContent = currentChunk.join("\n").trim();
    if (chunkContent.length > 0) {
      chunks.push({
        index: chunkIndex,
        type: foundTimestamp ? "timestamp-block" : "whole-file",
        content: chunkContent,
        startLine: currentStartLine,
      });
    }
  }

  // If no content at all
  if (chunks.length === 0 && content.trim().length > 0) {
    return [
      {
        index: 0,
        type: "whole-file",
        content: content.trim(),
        startLine: 0,
      },
    ];
  }

  return chunks;
}

/**
 * Chunk a named file by ## headers or as whole file if short
 * Short files (< 1000 chars) are kept as single chunk
 */
export function chunkNamedFile(content: string): Chunk[] {
  // For short files, keep as single chunk
  if (content.length < 1000) {
    return [
      {
        index: 0,
        type: "whole-file",
        content: content.trim(),
        startLine: 0,
      },
    ];
  }

  const lines = content.split("\n");
  const chunks: Chunk[] = [];
  let currentChunk: string[] = [];
  let currentStartLine = 0;
  let chunkIndex = 0;
  let foundHeader = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";

    if (HEADER_PATTERN.test(line) && currentChunk.length > 0) {
      foundHeader = true;
      // Save previous chunk
      const chunkContent = currentChunk.join("\n").trim();
      if (chunkContent.length > 0) {
        chunks.push({
          index: chunkIndex++,
          type: "header-section",
          content: chunkContent,
          startLine: currentStartLine,
        });
      }
      // Start new chunk
      currentChunk = [line];
      currentStartLine = i;
    } else {
      currentChunk.push(line);
    }
  }

  // Save final chunk
  if (currentChunk.length > 0) {
    const chunkContent = currentChunk.join("\n").trim();
    if (chunkContent.length > 0) {
      chunks.push({
        index: chunkIndex,
        type: foundHeader ? "header-section" : "whole-file",
        content: chunkContent,
        startLine: currentStartLine,
      });
    }
  }

  // If no content at all
  if (chunks.length === 0 && content.trim().length > 0) {
    return [
      {
        index: 0,
        type: "whole-file",
        content: content.trim(),
        startLine: 0,
      },
    ];
  }

  return chunks;
}

/**
 * Determine if a path looks like a daily file (YYYY/MM/DD.md pattern)
 */
export function isDailyFile(path: string): boolean {
  return /^\d{4}\/\d{2}\/\d{2}\.md$/.test(path);
}

/**
 * Chunk content based on file type
 */
export function chunkContent(content: string, path: string): Chunk[] {
  if (isDailyFile(path)) {
    return chunkDailyFile(content);
  }
  return chunkNamedFile(content);
}

/**
 * Estimate token count (rough approximation: ~4 chars per token)
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
