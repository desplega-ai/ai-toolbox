import { join } from "node:path";

const POST_CHECKOUT_HOOK = `#!/bin/bash
# wts post-checkout hook
# Runs setup script after worktree checkout

# Only run on branch checkout (not file checkout)
if [ "$3" != "1" ]; then
  exit 0
fi

# Check if this is a wts-managed worktree
WTS_CONFIG="$GIT_DIR/../.wts-config.json"
if [ ! -f "$WTS_CONFIG" ]; then
  exit 0
fi

# Get setup script from config
SETUP_SCRIPT=$(cat "$WTS_CONFIG" | grep -o '"setupScript"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
if [ -z "$SETUP_SCRIPT" ]; then
  exit 0
fi

# Get worktree path
WORKTREE_PATH=$(git rev-parse --show-toplevel)
export WTS_WORKTREE_PATH="$WORKTREE_PATH"

# Run setup script
if [[ "$SETUP_SCRIPT" == *.ts ]]; then
  bun "$WORKTREE_PATH/$SETUP_SCRIPT"
elif [[ "$SETUP_SCRIPT" == *.sh ]]; then
  bash "$WORKTREE_PATH/$SETUP_SCRIPT"
fi
`;

/**
 * Check if a git hook exists
 */
export async function hasHook(hookName: string, gitRoot: string): Promise<boolean> {
  const hookPath = join(gitRoot, ".git", "hooks", hookName);
  const file = Bun.file(hookPath);
  return file.exists();
}

/**
 * Check if post-checkout hook is installed
 */
export async function hasPostCheckoutHook(gitRoot: string): Promise<boolean> {
  return hasHook("post-checkout", gitRoot);
}

/**
 * Install the post-checkout hook for automatic setup
 */
export async function installPostCheckoutHook(gitRoot: string): Promise<boolean> {
  const hookPath = join(gitRoot, ".git", "hooks", "post-checkout");

  try {
    // Check if hook already exists
    const file = Bun.file(hookPath);
    if (await file.exists()) {
      // Check if it's our hook or a different one
      const content = await file.text();
      if (content.includes("wts post-checkout hook")) {
        // Already installed
        return true;
      }
      // Different hook exists - don't overwrite
      return false;
    }

    // Write the hook
    await Bun.write(hookPath, POST_CHECKOUT_HOOK);

    // Make it executable
    await Bun.$`chmod +x ${hookPath}`;

    return true;
  } catch {
    return false;
  }
}

/**
 * Remove the post-checkout hook
 */
export async function removePostCheckoutHook(gitRoot: string): Promise<boolean> {
  const hookPath = join(gitRoot, ".git", "hooks", "post-checkout");

  try {
    const file = Bun.file(hookPath);
    if (!(await file.exists())) {
      return true; // Already gone
    }

    // Only remove if it's our hook
    const content = await file.text();
    if (!content.includes("wts post-checkout hook")) {
      return false; // Not our hook
    }

    await Bun.$`rm ${hookPath}`;
    return true;
  } catch {
    return false;
  }
}
