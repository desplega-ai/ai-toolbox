#!/usr/bin/env python3
"""PostToolUse hook to log Claude Code Edit/Write operations.

Receives JSON from Claude Code via stdin:
{
  "session_id": "abc123",
  "tool_name": "Edit",
  "tool_input": {
    "file_path": "/path/to/file.ts",
    "old_string": "original",
    "new_string": "replacement"
  },
  "cwd": "/project/root"
}

For Write tool:
{
  "session_id": "abc123",
  "tool_name": "Write",
  "tool_input": {
    "file_path": "/path/to/file.ts",
    "content": "full file content"
  },
  "cwd": "/project/root"
}
"""

import difflib
import json
import os
import sys
from pathlib import Path

# Add parent to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from ai_tracker.db import log_edit


def count_lines(content: str) -> int:
    """Count lines in content, handling empty strings."""
    if not content:
        return 0
    return content.count("\n") + (0 if content.endswith("\n") else 1)


def is_binary_content(content: bytes) -> bool:
    """Check for binary content by looking for null bytes."""
    return b"\x00" in content[:8000]


def is_binary_file(file_path: str) -> bool:
    """Check if a file is binary."""
    try:
        with open(file_path, "rb") as f:
            return is_binary_content(f.read(8000))
    except (OSError, IOError):
        return False


def compute_diff_stats(old: str, new: str) -> tuple[int, int]:
    """Compute line-level diff statistics.

    Returns: (lines_added, lines_removed)
    """
    if not old and not new:
        return 0, 0

    old_lines = old.splitlines(keepends=True) if old else []
    new_lines = new.splitlines(keepends=True) if new else []

    diff = list(difflib.unified_diff(old_lines, new_lines))

    added = sum(1 for line in diff if line.startswith("+") and not line.startswith("+++"))
    removed = sum(1 for line in diff if line.startswith("-") and not line.startswith("---"))

    return added, removed


def get_write_cache_path(session_id: str, file_path: str) -> Path:
    """Get the cache file path for Write tool pre-capture."""
    cache_dir = Path.home() / ".config" / "ai-tracker" / "cache"
    cache_dir.mkdir(parents=True, exist_ok=True)
    # Use a safe filename from session_id and file basename
    safe_name = f"{session_id}-{Path(file_path).name}".replace("/", "_")
    return cache_dir / f"{safe_name}.json"


def main() -> None:
    """Main entry point for the hook."""
    try:
        data = json.load(sys.stdin)
    except json.JSONDecodeError as e:
        print(f"Error: Invalid JSON input: {e}", file=sys.stderr)
        sys.exit(0)  # Don't fail the hook

    tool_name = data.get("tool_name")
    tool_input = data.get("tool_input", {})
    session_id = data.get("session_id", "unknown")
    cwd = data.get("cwd", os.getcwd())

    # Only process Edit and Write tools
    if tool_name not in ("Edit", "Write"):
        sys.exit(0)

    file_path = tool_input.get("file_path")
    if not file_path:
        sys.exit(0)

    # Skip binary files
    if os.path.exists(file_path) and is_binary_file(file_path):
        sys.exit(0)

    lines_added = 0
    lines_removed = 0

    if tool_name == "Edit":
        old_string = tool_input.get("old_string", "")
        new_string = tool_input.get("new_string", "")
        lines_added, lines_removed = compute_diff_stats(old_string, new_string)

    elif tool_name == "Write":
        new_content = tool_input.get("content", "")

        # Try to get cached original from PreToolUse
        cache_path = get_write_cache_path(session_id, file_path)
        if cache_path.exists():
            try:
                with open(cache_path) as f:
                    cache = json.load(f)
                original = cache.get("original_content", "")
                lines_added, lines_removed = compute_diff_stats(original, new_content)
                # Clean up cache file
                cache_path.unlink(missing_ok=True)
            except (json.JSONDecodeError, OSError):
                # Fallback: count new content as all additions
                lines_added = count_lines(new_content)
                lines_removed = 0
        else:
            # Fallback: count new content as all additions (new file)
            lines_added = count_lines(new_content)
            lines_removed = 0

    # Log the edit to SQLite database
    try:
        log_edit(
            session_id=session_id,
            tool=tool_name,
            file_path=file_path,
            lines_added=lines_added,
            lines_removed=lines_removed,
            cwd=cwd,
        )
    except Exception as e:
        print(f"Error logging edit: {e}", file=sys.stderr)

    sys.exit(0)


if __name__ == "__main__":
    main()
