// File tree of a cwd at a point in time: git (rev-list / ls-tree / ls-files)
// with an fs-walk fallback. All git invocations use argv arrays — never shell
// strings. Inputs are validated before being passed to git.

import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export interface TreeResult {
  root: string;
  source: "git" | "fs" | "missing";
  sha?: string;
  files: string[];
  truncated: boolean;
}

const BRANCH_RE = /^[A-Za-z0-9._\/-]+$/;
// ISO-8601 date or datetime, e.g. 2026-07-01 or 2026-07-01T00:00:00.000Z
const ISO_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;

const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  ".venv",
  "venv",
  "__pycache__",
  "dist",
  "build",
  "target",
  ".next",
  ".cache",
]);
const MAX_DEPTH = 12;
const MAX_FILES = 30_000;

export function getTree(cwd: string, branch: string | null, before: string | null): TreeResult {
  let isDir = false;
  try {
    isDir = existsSync(cwd) && statSync(cwd).isDirectory();
  } catch {
    isDir = false;
  }
  if (!isDir) return { root: cwd, source: "missing", files: [], truncated: false };

  if (isGitWorkTree(cwd)) {
    const validBranch = branch && BRANCH_RE.test(branch) && !branch.startsWith("-") ? branch : null;
    const validBefore = before && ISO_RE.test(before) ? before : null;

    let sha: string | null = null;
    if (validBranch) sha = revList(cwd, validBranch, validBefore);
    if (!sha) sha = revList(cwd, "HEAD", validBefore);

    if (sha) {
      const files = gitLines(cwd, ["ls-tree", "-r", "--name-only", sha]);
      if (files !== null) return { root: cwd, source: "git", sha, files, truncated: false };
    }
    const files = gitLines(cwd, ["ls-files"]);
    if (files !== null) return { root: cwd, source: "git", files, truncated: false };
    // git present but commands failed — fall through to fs walk
  }

  return fsWalk(cwd);
}

function isGitWorkTree(cwd: string): boolean {
  const out = runGit(cwd, ["rev-parse", "--is-inside-work-tree"]);
  return out !== null && out.trim() === "true";
}

function revList(cwd: string, ref: string, before: string | null): string | null {
  const args = ["rev-list", "--max-count=1"];
  if (before) args.push(`--before=${before}`);
  args.push(ref);
  const out = runGit(cwd, args);
  const sha = out?.trim();
  return sha && /^[0-9a-f]{7,64}$/.test(sha) ? sha : null;
}

function gitLines(cwd: string, args: string[]): string[] | null {
  const out = runGit(cwd, args);
  if (out === null) return null;
  return out.split("\n").filter((l) => l.length > 0);
}

function runGit(cwd: string, args: string[]): string | null {
  try {
    // core.quotepath=off: without it, ls-tree/ls-files C-quote non-ASCII paths
    // (e.g. "caf\303\251.txt"), which would never match event file paths.
    const proc = Bun.spawnSync(["git", "-C", cwd, "-c", "core.quotepath=off", ...args], {
      stdout: "pipe",
      stderr: "pipe",
    });
    if (proc.exitCode !== 0) return null;
    return proc.stdout.toString();
  } catch {
    return null;
  }
}

function fsWalk(root: string): TreeResult {
  const files: string[] = [];
  let truncated = false;

  const walk = (dir: string, rel: string, depth: number): void => {
    if (truncated || depth > MAX_DEPTH) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (truncated) return;
      const name = entry.name;
      const relPath = rel ? `${rel}/${name}` : name;
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(name)) continue;
        walk(join(dir, name), relPath, depth + 1);
      } else if (entry.isFile()) {
        files.push(relPath);
        if (files.length >= MAX_FILES) {
          truncated = true;
          return;
        }
      }
      // symlinks and other entry types are skipped (avoid cycles)
    }
  };

  walk(root, "", 1);
  return { root, source: "fs", files, truncated };
}
