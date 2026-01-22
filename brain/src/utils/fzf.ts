/**
 * Check if fzf is available on the system
 */
export async function isFzfAvailable(): Promise<boolean> {
  try {
    await Bun.$`which fzf`.quiet();
    return true;
  } catch {
    return false;
  }
}

export interface FzfOptions {
  /** Prompt string shown in fzf */
  prompt?: string;
  /** Header text shown above results */
  header?: string;
  /** Preview command */
  preview?: string;
  /** Allow multiple selections */
  multi?: boolean;
  /** Height of the fzf window (e.g., "50%", "20") */
  height?: string;
  /** Initial query string */
  query?: string;
}

/**
 * Run fzf with provided items and return selected item(s)
 * Returns undefined if user cancels (Ctrl-C or Escape)
 */
export async function fzfSelect(
  items: string[],
  options: FzfOptions = {},
): Promise<string[] | undefined> {
  const args: string[] = [];

  if (options.prompt) {
    args.push("--prompt", options.prompt);
  }
  if (options.header) {
    args.push("--header", options.header);
  }
  if (options.preview) {
    args.push("--preview", options.preview);
  }
  if (options.multi) {
    args.push("--multi");
  }
  if (options.height) {
    args.push("--height", options.height);
  }
  if (options.query) {
    args.push("--query", options.query);
  }

  // Add some nice defaults
  args.push("--border", "--reverse");

  try {
    const input = items.join("\n");
    const proc = Bun.spawn(["fzf", ...args], {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "inherit",
    });

    // Write items to stdin
    proc.stdin.write(input);
    proc.stdin.end();

    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      // User cancelled
      return undefined;
    }

    return output
      .trim()
      .split("\n")
      .filter((s) => s.length > 0);
  } catch {
    return undefined;
  }
}

/**
 * Interactive file selection using fzf
 * Returns the selected file path or undefined if cancelled
 */
export async function selectFile(
  files: string[],
  options: { prompt?: string; brainPath?: string } = {},
): Promise<string | undefined> {
  if (files.length === 0) {
    return undefined;
  }

  // Build preview command
  const preview = options.brainPath
    ? `cat "${options.brainPath}/{}" 2>/dev/null | head -30`
    : "cat {} 2>/dev/null | head -30";

  const result = await fzfSelect(files, {
    prompt: options.prompt ?? "Select file > ",
    preview,
    height: "50%",
  });

  if (!result || result.length === 0) {
    return undefined;
  }

  return result[0];
}

/**
 * Filter items with fzf
 * Returns all matching items
 */
export async function fzfFilter(items: string[], query: string): Promise<string[]> {
  if (items.length === 0) {
    return [];
  }

  const result = await fzfSelect(items, {
    query,
    multi: true,
  });

  return result ?? [];
}
