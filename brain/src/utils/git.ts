/**
 * Check if a directory is a git repository
 */
export async function isGitRepo(path: string): Promise<boolean> {
  try {
    await Bun.$`git rev-parse --git-dir`.cwd(path).quiet();
    return true;
  } catch {
    return false;
  }
}

/**
 * Initialize a new git repository
 */
export async function initGitRepo(path: string): Promise<void> {
  await Bun.$`git init`.cwd(path).quiet();
}

/**
 * Stage files for commit
 */
export async function gitAdd(files: string[], cwd: string): Promise<void> {
  if (files.length === 0) return;
  await Bun.$`git add ${files}`.cwd(cwd).quiet();
}

/**
 * Create a git commit
 */
export async function gitCommit(message: string, cwd: string): Promise<void> {
  await Bun.$`git commit -m ${message}`.cwd(cwd).quiet();
}

/**
 * Stage and commit files in one step
 */
export async function autoCommit(files: string[], message: string, cwd: string): Promise<void> {
  await gitAdd(files, cwd);
  try {
    await gitCommit(message, cwd);
  } catch {
    // Commit might fail if no changes (already committed, etc.)
    // This is fine, we just skip it
  }
}

/**
 * Check if there are uncommitted changes to a file
 */
export async function hasChanges(filePath: string, cwd: string): Promise<boolean> {
  try {
    const result = await Bun.$`git status --porcelain ${filePath}`.cwd(cwd).quiet();
    return result.stdout.toString().trim().length > 0;
  } catch {
    return false;
  }
}
