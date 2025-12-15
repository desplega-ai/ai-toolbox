import simpleGit, { SimpleGit } from 'simple-git';
import path from 'path';

export interface FileDiff {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  oldPath?: string; // For renamed files
  additions: number;
  deletions: number;
}

export interface DiffContent {
  path: string;
  original: string;
  modified: string;
  language: string;
}

export interface GitStatus {
  isRepo: boolean;
  branch: string | null;
  changedFiles: FileDiff[];
  error?: string;
}

// Detect language from file extension
function getLanguageFromPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const langMap: Record<string, string> = {
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.json': 'json',
    '.md': 'markdown',
    '.css': 'css',
    '.scss': 'scss',
    '.html': 'html',
    '.py': 'python',
    '.rs': 'rust',
    '.go': 'go',
    '.java': 'java',
    '.c': 'c',
    '.cpp': 'cpp',
    '.h': 'c',
    '.hpp': 'cpp',
    '.rb': 'ruby',
    '.php': 'php',
    '.swift': 'swift',
    '.kt': 'kotlin',
    '.sql': 'sql',
    '.sh': 'shell',
    '.bash': 'shell',
    '.zsh': 'shell',
    '.yml': 'yaml',
    '.yaml': 'yaml',
    '.toml': 'toml',
    '.xml': 'xml',
    '.svg': 'xml',
  };
  return langMap[ext] || 'plaintext';
}

/**
 * Get the current HEAD commit hash for a directory.
 * Returns null if not a git repo or on error.
 */
export async function getHeadCommit(cwd: string): Promise<string | null> {
  try {
    const git = simpleGit(cwd);
    const isRepo = await git.checkIsRepo();
    if (!isRepo) return null;
    const result = await git.revparse(['HEAD']);
    return result.trim() || null;
  } catch {
    return null;
  }
}

export class GitService {
  private git: SimpleGit;
  private cwd: string;

  constructor(cwd: string) {
    this.cwd = cwd;
    this.git = simpleGit(cwd);
  }

  /**
   * Get the status of the git repository including all changed files.
   */
  async getStatus(): Promise<GitStatus> {
    try {
      const isRepo = await this.git.checkIsRepo();
      if (!isRepo) {
        return { isRepo: false, branch: null, changedFiles: [] };
      }

      const [status, diffSummary] = await Promise.all([
        this.git.status(),
        this.git.diffSummary(['HEAD']),
      ]);

      const changedFiles: FileDiff[] = [];

      // Process status for unstaged and untracked files
      for (const file of status.files) {
        let fileStatus: FileDiff['status'];

        // Determine status from git status codes
        if (file.index === '?' || file.working_dir === '?') {
          fileStatus = 'added';
        } else if (file.index === 'D' || file.working_dir === 'D') {
          fileStatus = 'deleted';
        } else if (file.index === 'R' || file.working_dir === 'R') {
          fileStatus = 'renamed';
        } else {
          fileStatus = 'modified';
        }

        // Find diff stats for this file
        const diffFile = diffSummary.files.find(f => f.file === file.path);

        // Extract insertions/deletions from diff file (only text files have these)
        let additions = 0;
        let deletions = 0;
        if (diffFile && 'insertions' in diffFile) {
          additions = diffFile.insertions;
        }
        if (diffFile && 'deletions' in diffFile) {
          deletions = diffFile.deletions;
        }

        changedFiles.push({
          path: file.path,
          status: fileStatus,
          additions,
          deletions,
        });
      }

      return {
        isRepo: true,
        branch: status.current || null,
        changedFiles,
      };
    } catch (error) {
      console.error('[GitService] Error getting status:', error);
      return {
        isRepo: false,
        branch: null,
        changedFiles: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Check if a file is binary by looking for null bytes in the first 8000 bytes.
   */
  private async isBinary(filePath: string): Promise<boolean> {
    try {
      const fs = await import('fs/promises');
      const buffer = await fs.readFile(filePath);
      // Check first 8000 bytes for null bytes (common binary indicator)
      const chunk = buffer.slice(0, 8000);
      for (let i = 0; i < chunk.length; i++) {
        if (chunk[i] === 0) return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Get diff content for a specific file.
   * Returns original (HEAD) and modified (working tree) content.
   */
  async getFileDiff(filePath: string): Promise<DiffContent | null> {
    try {
      const fullPath = path.join(this.cwd, filePath);
      const fs = await import('fs/promises');

      // Check if file is binary
      const isBinaryFile = await this.isBinary(fullPath);
      if (isBinaryFile) {
        return {
          path: filePath,
          original: '(Binary file)',
          modified: '(Binary file)',
          language: 'plaintext',
        };
      }

      // Get the original content from HEAD
      let original = '';
      try {
        original = await this.git.show([`HEAD:${filePath}`]);
      } catch {
        // File is new (not in HEAD)
        original = '';
      }

      // Get the current working tree content
      let modified = '';
      try {
        modified = await fs.readFile(fullPath, 'utf-8');
      } catch {
        // File was deleted
        modified = '';
      }

      return {
        path: filePath,
        original,
        modified,
        language: getLanguageFromPath(filePath),
      };
    } catch (error) {
      console.error(`[GitService] Error getting diff for ${filePath}:`, error);
      return null;
    }
  }

}
