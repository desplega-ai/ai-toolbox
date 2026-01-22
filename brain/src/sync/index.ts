import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import chalk from "chalk";
import { upsertChunks } from "../db/chunks.ts";
import { getEntry, markEntryIndexed, upsertEntry } from "../db/entries.ts";
import { getEmbeddingProvider, isEmbeddingAvailable } from "../embeddings/openai.ts";
import { chunkContent } from "./chunker.ts";
import { hashContent } from "./hash.ts";

export interface SyncOptions {
  /** Re-embed everything regardless of hash */
  force?: boolean;
  /** Minimal output */
  quiet?: boolean;
}

export interface SyncResult {
  filesScanned: number;
  entriesUpdated: number;
  chunksEmbedded: number;
  errors: string[];
}

/**
 * Get all .md files in a directory recursively
 */
async function getMdFiles(dir: string, base: string = dir): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith(".")) {
      files.push(...(await getMdFiles(fullPath, base)));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(relative(base, fullPath));
    }
  }

  return files;
}

/**
 * Extract title from markdown content (first # heading)
 */
function extractTitle(content: string): string | undefined {
  const match = content.match(/^#\s+(.+)$/m);
  return match?.[1];
}

/**
 * Count words in text
 */
function countWords(text: string): number {
  return text.split(/\s+/).filter((w) => w.length > 0).length;
}

/**
 * Sync a single file to the database
 */
export async function syncFile(
  filePath: string,
  brainPath: string,
  options: SyncOptions = {},
): Promise<{ updated: boolean; chunksEmbedded: number; error?: string }> {
  const fullPath = join(brainPath, filePath);

  try {
    const file = Bun.file(fullPath);
    const content = await file.text();

    // Compute content hash
    const contentHash = await hashContent(content);

    // Check if already indexed with same hash
    if (!options.force) {
      const existing = await getEntry(filePath);
      if (existing?.content_hash === contentHash && existing.indexed_at) {
        return { updated: false, chunksEmbedded: 0 };
      }
    }

    // Extract metadata
    const title = extractTitle(content);
    const wordCount = countWords(content);

    // Upsert entry
    const entry = await upsertEntry({
      path: filePath,
      title,
      content,
      content_hash: contentHash,
      word_count: wordCount,
    });

    // Chunk content
    const chunks = chunkContent(content, filePath);

    // Generate embeddings if available
    let chunksEmbedded = 0;
    if (isEmbeddingAvailable()) {
      const provider = getEmbeddingProvider();

      // Hash chunks and prepare for embedding
      const chunkData = await Promise.all(
        chunks.map(async (chunk) => ({
          ...chunk,
          hash: await hashContent(chunk.content),
        })),
      );

      // Get texts that need embedding
      const textsToEmbed = chunkData.map((c) => c.content);

      // Batch embed
      const embeddings = await provider.embedBatch(textsToEmbed);

      // Prepare chunk inputs with embeddings
      const chunkInputs = chunkData.map((chunk, i) => ({
        chunk_index: chunk.index,
        chunk_type: chunk.type,
        content: chunk.content,
        content_hash: chunk.hash,
        embedding: embeddings[i],
        embedding_model: provider.name,
        start_line: chunk.startLine,
      }));

      await upsertChunks(entry.id, chunkInputs);
      chunksEmbedded = chunkInputs.length;
    } else {
      // Store chunks without embeddings
      const chunkData = await Promise.all(
        chunks.map(async (chunk) => ({
          ...chunk,
          hash: await hashContent(chunk.content),
        })),
      );

      const chunkInputs = chunkData.map((chunk) => ({
        chunk_index: chunk.index,
        chunk_type: chunk.type,
        content: chunk.content,
        content_hash: chunk.hash,
        start_line: chunk.startLine,
      }));

      await upsertChunks(entry.id, chunkInputs);
    }

    // Mark as indexed
    await markEntryIndexed(entry.id);

    return { updated: true, chunksEmbedded };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { updated: false, chunksEmbedded: 0, error: message };
  }
}

/**
 * Sync all files in the brain directory
 */
export async function syncBrain(brainPath: string, options: SyncOptions = {}): Promise<SyncResult> {
  const result: SyncResult = {
    filesScanned: 0,
    entriesUpdated: 0,
    chunksEmbedded: 0,
    errors: [],
  };

  // Get all .md files
  const files = await getMdFiles(brainPath);
  result.filesScanned = files.length;

  if (!options.quiet) {
    console.log(chalk.dim(`Found ${files.length} files to scan`));
  }

  // Warn if no API key
  if (!isEmbeddingAvailable()) {
    if (!options.quiet) {
      console.log(chalk.yellow("Note: OPENAI_API_KEY not set. Skipping embeddings."));
    }
  }

  // Process each file
  for (const filePath of files) {
    if (!options.quiet) {
      process.stdout.write(chalk.dim(`  ${filePath}... `));
    }

    const fileResult = await syncFile(filePath, brainPath, options);

    if (fileResult.error) {
      result.errors.push(`${filePath}: ${fileResult.error}`);
      if (!options.quiet) {
        console.log(chalk.red("error"));
      }
    } else if (fileResult.updated) {
      result.entriesUpdated++;
      result.chunksEmbedded += fileResult.chunksEmbedded;
      if (!options.quiet) {
        console.log(chalk.green("updated"));
      }
    } else {
      if (!options.quiet) {
        console.log(chalk.dim("skipped"));
      }
    }
  }

  return result;
}
