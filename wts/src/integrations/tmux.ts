/**
 * Check if currently inside a tmux session
 */
export function isInsideTmux(): boolean {
  return !!process.env.TMUX;
}

/**
 * Check if tmux is available on the system
 */
export async function isTmuxAvailable(): Promise<boolean> {
  try {
    await Bun.$`which tmux`.quiet();
    return true;
  } catch {
    return false;
  }
}

/**
 * Get current tmux session name
 */
export async function getCurrentSession(): Promise<string | undefined> {
  if (!isInsideTmux()) {
    return undefined;
  }

  try {
    const result = await Bun.$`tmux display-message -p '#S'`.quiet();
    return result.stdout.toString().trim();
  } catch {
    return undefined;
  }
}

/**
 * Get current tmux window name
 */
export async function getCurrentWindow(): Promise<string | undefined> {
  if (!isInsideTmux()) {
    return undefined;
  }

  try {
    const result = await Bun.$`tmux display-message -p '#W'`.quiet();
    return result.stdout.toString().trim();
  } catch {
    return undefined;
  }
}

/**
 * Check if a window with the given name exists in current session
 */
export async function windowExists(name: string): Promise<boolean> {
  try {
    const result = await Bun.$`tmux list-windows -F '#W'`.quiet();
    const windows = result.stdout.toString().trim().split("\n");
    return windows.includes(name);
  } catch {
    return false;
  }
}

/**
 * Create a new tmux window
 */
export async function createWindow(name: string, cwd: string): Promise<boolean> {
  try {
    await Bun.$`tmux new-window -n ${name} -c ${cwd}`;
    return true;
  } catch {
    return false;
  }
}

/**
 * Create a new tmux pane (split horizontally)
 */
export async function createPane(cwd: string): Promise<boolean> {
  try {
    await Bun.$`tmux split-window -h -c ${cwd}`;
    return true;
  } catch {
    return false;
  }
}

/**
 * Switch to an existing tmux window
 */
export async function switchToWindow(name: string): Promise<boolean> {
  try {
    await Bun.$`tmux select-window -t ${name}`;
    return true;
  } catch {
    return false;
  }
}

/**
 * Send keys to a tmux pane
 */
export async function sendKeys(keys: string, target?: string): Promise<boolean> {
  try {
    if (target) {
      await Bun.$`tmux send-keys -t ${target} ${keys} Enter`;
    } else {
      await Bun.$`tmux send-keys ${keys} Enter`;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve window name template
 * Supports {project} and {alias} placeholders
 */
export function resolveWindowName(template: string, project: string, alias: string): string {
  return template.replace("{project}", project).replace("{alias}", alias);
}

/**
 * Create a tmux window for a worktree and optionally launch Claude
 */
export async function createWorktreeWindow(options: {
  windowName: string;
  worktreePath: string;
  launchClaude?: boolean;
}): Promise<boolean> {
  const { windowName, worktreePath, launchClaude } = options;

  // Check if window already exists
  const exists = await windowExists(windowName);
  if (exists) {
    // Just switch to it
    return switchToWindow(windowName);
  }

  // Create new window
  const created = await createWindow(windowName, worktreePath);
  if (!created) {
    return false;
  }

  // Launch Claude if requested
  if (launchClaude) {
    // Small delay to let the window initialize
    await Bun.sleep(100);
    await sendKeys("claude");
  }

  return true;
}
