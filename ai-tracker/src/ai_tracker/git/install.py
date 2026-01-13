"""Install global git hooks for ai-tracker."""

import os
import subprocess
import sys
from pathlib import Path

from ..config import get_git_hooks_dir


def _is_uvx_install() -> bool:
    """Check if running from uvx cache."""
    return ".cache/uv" in str(Path(__file__).resolve())


def _get_post_commit_command() -> str:
    """Get the appropriate command based on install method."""
    if _is_uvx_install():
        return "uvx cc-ai-tracker git-post-commit"
    else:
        return "ai-tracker git-post-commit"


# The post-commit hook script that delegates to local hooks
POST_COMMIT_HOOK_TEMPLATE = '''#!/bin/bash
# ai-tracker global post-commit hook
# This hook tracks commits and delegates to local hooks

# Run ai-tracker post-commit hook
{command} 2>/dev/null || true

# Delegate to local hooks (supports Husky, pre-commit, and standard git hooks)
REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)

if [ -n "$REPO_ROOT" ]; then
    # Standard .git/hooks/post-commit
    if [ -x "$REPO_ROOT/.git/hooks/post-commit" ]; then
        "$REPO_ROOT/.git/hooks/post-commit"
    fi

    # Husky v4 style
    if [ -x "$REPO_ROOT/.husky/post-commit" ]; then
        "$REPO_ROOT/.husky/post-commit"
    fi

    # Husky v8+ style (uses .husky/_/husky.sh)
    if [ -f "$REPO_ROOT/.husky/_/husky.sh" ] && [ -f "$REPO_ROOT/.husky/post-commit" ]; then
        . "$REPO_ROOT/.husky/_/husky.sh"
        sh "$REPO_ROOT/.husky/post-commit"
    fi
fi
'''


def install_git_hooks(global_install: bool = True) -> None:
    """Install git hooks for ai-tracker.

    Args:
        global_install: If True, install as global hooks via core.hooksPath.
                       If False, install to current repo only.
    """
    if not global_install:
        print("Local installation not yet implemented. Use --global.")
        sys.exit(1)

    hooks_dir = get_git_hooks_dir()
    post_commit_path = hooks_dir / "post-commit"

    # Get the appropriate command based on installation method
    command = _get_post_commit_command()

    # Write the post-commit hook
    hook_content = POST_COMMIT_HOOK_TEMPLATE.format(command=command)
    post_commit_path.write_text(hook_content)
    os.chmod(post_commit_path, 0o755)

    print(f"Created post-commit hook: {post_commit_path}")
    print(f"Using command: {command}")

    # Set global git hooks path
    try:
        subprocess.run(
            ["git", "config", "--global", "core.hooksPath", str(hooks_dir)],
            check=True,
            capture_output=True,
        )
        print(f"Set global git hooksPath: {hooks_dir}")
    except subprocess.CalledProcessError as e:
        print(f"Error setting global hooksPath: {e.stderr.decode()}", file=sys.stderr)
        sys.exit(1)

    print("\nGlobal git hooks installed successfully!")
    print("All git commits will now be tracked by ai-tracker.")
    print("\nNote: Local hooks (Husky, .git/hooks) will still be executed.")


def uninstall_git_hooks() -> None:
    """Remove ai-tracker global git hooks."""
    hooks_dir = get_git_hooks_dir()

    # Check if we're the current hooksPath
    try:
        result = subprocess.run(
            ["git", "config", "--global", "--get", "core.hooksPath"],
            capture_output=True,
            text=True,
        )
        current_path = result.stdout.strip()

        if current_path == str(hooks_dir):
            # Unset the global hooksPath
            subprocess.run(
                ["git", "config", "--global", "--unset", "core.hooksPath"],
                check=True,
                capture_output=True,
            )
            print("Removed global git hooksPath configuration.")
        else:
            print(f"Global hooksPath ({current_path}) is not ai-tracker, skipping.")
    except subprocess.CalledProcessError:
        pass  # No hooksPath set

    # Remove our hooks
    post_commit_path = hooks_dir / "post-commit"
    if post_commit_path.exists():
        post_commit_path.unlink()
        print(f"Removed: {post_commit_path}")

    print("\nGlobal git hooks uninstalled.")


if __name__ == "__main__":
    install_git_hooks(global_install=True)
