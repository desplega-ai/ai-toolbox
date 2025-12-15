import ignore from 'ignore';
import fs from 'fs/promises';
import path from 'path';

export interface FileEntry {
  path: string;      // Relative path from project root
  name: string;      // Filename only
  type: 'file' | 'directory';
}

// Cache file index per project directory
const fileIndexCache = new Map<string, FileEntry[]>();

// Default patterns to always ignore
const DEFAULT_IGNORES = [
  '.git',
  'node_modules',
  '.DS_Store',
  '*.log',
  'dist',
  'build',
  '.next',
  '.cache',
  '.vite',
  '__pycache__',
  '*.pyc',
  '.env',
  '.env.*',
  'coverage',
  '.nyc_output',
];

export async function buildFileIndex(projectRoot: string): Promise<FileEntry[]> {
  const ig = ignore();

  // Load .gitignore if exists
  const gitignorePath = path.join(projectRoot, '.gitignore');
  try {
    const gitignoreContent = await fs.readFile(gitignorePath, 'utf-8');
    ig.add(gitignoreContent);
  } catch {
    // No .gitignore, continue
  }

  // Always ignore common patterns
  ig.add(DEFAULT_IGNORES);

  const files: FileEntry[] = [];

  async function walk(dir: string, relativePath = '') {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      // Directory not readable
      return;
    }

    for (const entry of entries) {
      const entryRelativePath = relativePath
        ? `${relativePath}/${entry.name}`
        : entry.name;

      // Check if ignored
      if (ig.ignores(entryRelativePath)) continue;

      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        // Add directory entry
        files.push({
          path: entryRelativePath,
          name: entry.name,
          type: 'directory',
        });
        await walk(fullPath, entryRelativePath);
      } else {
        files.push({
          path: entryRelativePath,
          name: entry.name,
          type: 'file',
        });
      }
    }
  }

  await walk(projectRoot);

  // Cache the result
  fileIndexCache.set(projectRoot, files);

  return files;
}

export function getFileIndex(projectRoot: string): FileEntry[] {
  return fileIndexCache.get(projectRoot) || [];
}

export function clearFileIndex(projectRoot: string): void {
  fileIndexCache.delete(projectRoot);
}
