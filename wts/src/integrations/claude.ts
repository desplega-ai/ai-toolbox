import { sendKeys } from "./tmux.ts";

/**
 * Check if Claude Code CLI is available
 */
export async function isClaudeAvailable(): Promise<boolean> {
  try {
    await Bun.$`which claude`.quiet();
    return true;
  } catch {
    return false;
  }
}

/**
 * Launch Claude Code in the current tmux pane
 * Uses tmux send-keys to type 'claude' and press Enter
 */
export async function launchClaude(target?: string): Promise<boolean> {
  return sendKeys("claude", target);
}

/**
 * Launch Claude Code with a specific working directory
 * This creates a new tmux window at the path and launches Claude
 */
export async function launchClaudeInDirectory(
  windowName: string,
  workingDir: string,
): Promise<boolean> {
  try {
    // Create new window at the directory
    await Bun.$`tmux new-window -n ${windowName} -c ${workingDir}`;

    // Small delay to let the window initialize
    await Bun.sleep(100);

    // Launch Claude in the new window
    return sendKeys("claude", windowName);
  } catch {
    return false;
  }
}
