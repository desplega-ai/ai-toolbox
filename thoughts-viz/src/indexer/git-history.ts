import { relative } from "node:path";
import type { TimelineCommit } from "../types.ts";

async function run(cmd: string[], cwd: string): Promise<string> {
  const proc = Bun.spawn(cmd, { cwd, stdout: "pipe", stderr: "pipe" });
  const stdout = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`Command failed: ${cmd.join(" ")}\n${stderr}`);
  }
  return stdout.trim();
}

export async function isGitRepo(dir: string): Promise<boolean> {
  try {
    await run(["git", "rev-parse", "--git-dir"], dir);
    return true;
  } catch {
    return false;
  }
}

export async function getGitRoot(dir: string): Promise<string> {
  return run(["git", "rev-parse", "--show-toplevel"], dir);
}

export async function getCommitsForPath(
  gitRoot: string,
  subdir: string,
  limit?: number,
): Promise<TimelineCommit[]> {
  const relPath = relative(gitRoot, subdir);
  const args = [
    "git",
    "log",
    "--reverse",
    "--format=%H%x00%s%x00%an%x00%aI%x00",
    "--diff-filter=ACDMR",
    "--",
    relPath,
  ];
  if (limit) args.splice(3, 0, `-n${limit}`);

  const output = await run(args, gitRoot);
  if (!output) return [];

  const commits: TimelineCommit[] = [];
  for (const line of output.split("\n")) {
    if (!line.trim()) continue;
    const parts = line.split("\0");
    if (parts.length < 4) continue;
    const [hash, message, author, date] = parts as [string, string, string, string];
    commits.push({
      hash: hash.slice(0, 7),
      message,
      author,
      date,
      filesChanged: 0, // filled in later by timeline builder
    });
  }
  return commits;
}

export async function getFilesAtCommit(
  gitRoot: string,
  subdir: string,
  hash: string,
): Promise<string[]> {
  const relPath = relative(gitRoot, subdir);
  const prefix = relPath ? `${relPath}/` : "";

  try {
    const output = await run(
      ["git", "ls-tree", "-r", "--name-only", hash, "--", relPath || "."],
      gitRoot,
    );
    if (!output) return [];
    return output
      .split("\n")
      .filter((f) => f.endsWith(".md"))
      .map((f) => (prefix && f.startsWith(prefix) ? f.slice(prefix.length) : f));
  } catch {
    return [];
  }
}

export async function getFileContentAtCommit(
  gitRoot: string,
  subdir: string,
  filePath: string,
  hash: string,
): Promise<string> {
  const relPath = relative(gitRoot, subdir);
  const fullPath = relPath ? `${relPath}/${filePath}` : filePath;
  return run(["git", "show", `${hash}:${fullPath}`], gitRoot);
}

export async function getChangedFilesBetween(
  gitRoot: string,
  subdir: string,
  fromHash: string,
  toHash: string,
): Promise<string[]> {
  const relPath = relative(gitRoot, subdir);
  const prefix = relPath ? `${relPath}/` : "";

  const output = await run(
    ["git", "diff", "--name-only", `${fromHash}..${toHash}`, "--", relPath || "."],
    gitRoot,
  );
  if (!output) return [];
  return output
    .split("\n")
    .filter((f) => f.endsWith(".md"))
    .map((f) => (prefix && f.startsWith(prefix) ? f.slice(prefix.length) : f));
}
