import { readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import chalk from "chalk";
import { Command } from "commander";
import { getBrainPath } from "../config/index.ts";

interface FileInfo {
  path: string;
  mtime: Date;
}

/**
 * Recursively get all .md files with their modification times
 */
async function getMdFilesWithMtime(dir: string, base: string = dir): Promise<FileInfo[]> {
  const files: FileInfo[] = [];
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith(".")) {
      files.push(...(await getMdFilesWithMtime(fullPath, base)));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      const stats = await stat(fullPath);
      files.push({
        path: relative(base, fullPath),
        mtime: stats.mtime,
      });
    }
  }

  return files;
}

/**
 * Build tree structure from file paths
 */
function buildTree(files: FileInfo[]): Map<string, FileInfo[]> {
  const tree = new Map<string, FileInfo[]>();

  for (const file of files) {
    const parts = file.path.split("/");
    const dir = parts.slice(0, -1).join("/") || ".";

    const existing = tree.get(dir);
    if (existing) {
      existing.push(file);
    } else {
      tree.set(dir, [file]);
    }
  }

  return tree;
}

/**
 * Print tree view
 */
function printTree(tree: Map<string, FileInfo[]>): void {
  const sortedDirs = Array.from(tree.keys()).sort();

  for (const dir of sortedDirs) {
    const files = tree.get(dir);
    if (!files) continue;
    files.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

    console.log(chalk.bold.cyan(dir === "." ? "root" : dir));
    for (const file of files) {
      const fileName = file.path.split("/").pop() ?? file.path;
      const date = file.mtime.toLocaleDateString();
      console.log(`  ${chalk.dim(date)} ${fileName}`);
    }
  }
}

export const listCommand = new Command("list")
  .alias("ls")
  .description("List brain entries")
  .option("-n, --number <count>", "Number of entries to show", "10")
  .option("-t, --tree", "Show hierarchical tree view")
  .option("-s, --search <query>", "Fuzzy filter on filenames")
  .option("-a, --all", "Show all entries (no limit)")
  .action(async (options: { number?: string; tree?: boolean; search?: string; all?: boolean }) => {
    const brainPath = await getBrainPath();
    if (!brainPath) {
      console.error(chalk.red("Error: Brain not initialized. Run 'brain init' first."));
      process.exit(1);
    }

    let files = await getMdFilesWithMtime(brainPath);

    // Filter by search query if provided
    if (options.search) {
      const query = options.search.toLowerCase();
      files = files.filter((f) => f.path.toLowerCase().includes(query));
    }

    if (files.length === 0) {
      console.log(chalk.yellow("No entries found"));
      if (options.search) {
        console.log(chalk.dim(`Search: "${options.search}"`));
      }
      return;
    }

    if (options.tree) {
      // Tree view
      const tree = buildTree(files);
      printTree(tree);
      console.log(chalk.dim(`\n${files.length} entries total`));
    } else {
      // Flat list sorted by mtime
      files.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

      const limit = options.all ? files.length : parseInt(options.number ?? "10", 10);
      const displayFiles = files.slice(0, limit);

      for (const file of displayFiles) {
        const date = file.mtime.toLocaleDateString();
        const time = file.mtime.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });
        console.log(`${chalk.dim(`${date} ${time}`)} ${file.path}`);
      }

      if (files.length > limit) {
        console.log(chalk.dim(`\n... and ${files.length - limit} more (use -a to show all)`));
      }
    }
  });
