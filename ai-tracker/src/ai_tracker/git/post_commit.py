#!/usr/bin/env python3
"""Git post-commit hook to track commits and attribute changes.

This hook runs after every git commit and:
1. Gets the list of changed files from the commit
2. Queries the edits table for uncommitted Claude Code edits
3. Attributes lines to AI or human based on the edit log
4. Logs the commit with attribution to the database
"""

import os
import subprocess
import sys
from pathlib import Path

# Add parent to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from ai_tracker.db import (
    get_uncommitted_edits_for_files,
    log_commit,
    mark_edits_committed,
)


def run_git_command(args: list[str], cwd: str | None = None) -> str:
    """Run a git command and return stdout."""
    try:
        result = subprocess.run(
            ["git"] + args,
            cwd=cwd,
            capture_output=True,
            text=True,
            check=True,
        )
        return result.stdout.strip()
    except subprocess.CalledProcessError:
        return ""


def get_commit_sha(cwd: str | None = None) -> str:
    """Get the SHA of the current HEAD commit."""
    return run_git_command(["rev-parse", "HEAD"], cwd)


def get_repo_name(cwd: str | None = None) -> str:
    """Get the repository name from the remote or directory."""
    # Try to get from remote
    remote_url = run_git_command(["remote", "get-url", "origin"], cwd)
    if remote_url:
        # Extract repo name from URL (handles both HTTPS and SSH)
        # e.g., https://github.com/user/repo.git -> repo
        # e.g., git@github.com:user/repo.git -> repo
        name = remote_url.rstrip("/").split("/")[-1]
        if name.endswith(".git"):
            name = name[:-4]
        return name

    # Fallback to directory name
    repo_root = run_git_command(["rev-parse", "--show-toplevel"], cwd)
    if repo_root:
        return Path(repo_root).name

    return "unknown"


def get_repo_path(cwd: str | None = None) -> str:
    """Get the absolute path to the repository root."""
    return run_git_command(["rev-parse", "--show-toplevel"], cwd) or cwd or os.getcwd()


def get_commit_file_stats(cwd: str | None = None) -> list[dict]:
    """Get per-file line statistics from the current commit.

    Returns list of dicts with:
    - file_path: relative path to file
    - lines_added: number of lines added
    - lines_removed: number of lines removed
    """
    # git show --numstat --format="" HEAD gives:
    # <added>\t<removed>\t<file_path>
    output = run_git_command(["show", "--numstat", "--format=", "HEAD"], cwd)
    if not output:
        return []

    stats = []
    repo_root = get_repo_path(cwd)

    for line in output.split("\n"):
        if not line.strip():
            continue

        parts = line.split("\t")
        if len(parts) != 3:
            continue

        added, removed, file_path = parts

        # Skip binary files (shown as '-' in numstat)
        if added == "-" or removed == "-":
            continue

        try:
            stats.append(
                {
                    "file_path": file_path,
                    "abs_path": os.path.join(repo_root, file_path),
                    "lines_added": int(added),
                    "lines_removed": int(removed),
                }
            )
        except ValueError:
            continue

    return stats


def attribute_changes(file_stats: list[dict]) -> dict:
    """Attribute file changes to AI or human based on edit log.

    Returns dict with:
    - ai_lines_added: total AI lines added
    - ai_lines_removed: total AI lines removed
    - human_lines_added: total human lines added
    - human_lines_removed: total human lines removed
    - file_stats: list of per-file stats with AI attribution
    - edit_ids: list of edit IDs to mark as committed
    """
    # Get absolute paths for all files
    abs_paths = [f["abs_path"] for f in file_stats]

    # Query for uncommitted Claude edits to these files
    edits = get_uncommitted_edits_for_files(abs_paths)

    # Build a map of file_path -> edit stats
    edit_map: dict[str, dict] = {}
    edit_ids: list[int] = []

    for edit in edits:
        path = edit["file_path"]
        edit_ids.append(edit["id"])

        if path not in edit_map:
            edit_map[path] = {"lines_added": 0, "lines_removed": 0}

        edit_map[path]["lines_added"] += edit["lines_added"]
        edit_map[path]["lines_removed"] += edit["lines_removed"]

    # Attribute each file's changes
    ai_lines_added = 0
    ai_lines_removed = 0
    human_lines_added = 0
    human_lines_removed = 0
    attributed_stats = []

    for file_stat in file_stats:
        abs_path = file_stat["abs_path"]
        added = file_stat["lines_added"]
        removed = file_stat["lines_removed"]

        if abs_path in edit_map:
            # File was edited by Claude - attribute to AI
            # Use min() to not over-attribute if git stats differ from our tracking
            ai_added = min(edit_map[abs_path]["lines_added"], added)
            ai_removed = min(edit_map[abs_path]["lines_removed"], removed)
        else:
            # File was not edited by Claude - all human
            ai_added = 0
            ai_removed = 0

        ai_lines_added += ai_added
        ai_lines_removed += ai_removed
        human_lines_added += added - ai_added
        human_lines_removed += removed - ai_removed

        attributed_stats.append(
            {
                "file_path": file_stat["file_path"],
                "lines_added": added,
                "lines_removed": removed,
                "ai_lines_added": ai_added,
                "ai_lines_removed": ai_removed,
            }
        )

    return {
        "ai_lines_added": ai_lines_added,
        "ai_lines_removed": ai_lines_removed,
        "human_lines_added": human_lines_added,
        "human_lines_removed": human_lines_removed,
        "file_stats": attributed_stats,
        "edit_ids": edit_ids,
    }


def main() -> None:
    """Main entry point for the post-commit hook."""
    cwd = os.getcwd()

    # Get commit info
    commit_sha = get_commit_sha(cwd)
    if not commit_sha:
        # Not in a git repo or no commits
        sys.exit(0)

    repo_name = get_repo_name(cwd)
    repo_path = get_repo_path(cwd)

    # Get file statistics from the commit
    file_stats = get_commit_file_stats(cwd)
    if not file_stats:
        # No file changes (e.g., empty commit)
        sys.exit(0)

    # Attribute changes to AI vs human
    attribution = attribute_changes(file_stats)

    # Log the commit
    try:
        log_commit(
            commit_sha=commit_sha,
            repo_name=repo_name,
            repo_path=repo_path,
            ai_lines_added=attribution["ai_lines_added"],
            ai_lines_removed=attribution["ai_lines_removed"],
            human_lines_added=attribution["human_lines_added"],
            human_lines_removed=attribution["human_lines_removed"],
            file_stats=attribution["file_stats"],
        )

        # Mark edits as committed
        mark_edits_committed(attribution["edit_ids"])
    except Exception as e:
        print(f"ai-tracker: Error logging commit: {e}", file=sys.stderr)

    sys.exit(0)


if __name__ == "__main__":
    main()
