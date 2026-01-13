#!/usr/bin/env python3
"""PreToolUse hook to capture file content before Write operations.

This hook caches the original file content so that PostToolUse can
compute an accurate diff of lines added/removed.

Receives JSON from Claude Code via stdin:
{
  "session_id": "abc123",
  "tool_name": "Write",
  "tool_input": {
    "file_path": "/path/to/file.ts",
    "content": "new content"
  },
  "cwd": "/project/root"
}
"""

import json
import os
import sys
from pathlib import Path


def is_binary_content(content: bytes) -> bool:
    """Check for binary content by looking for null bytes."""
    return b"\x00" in content[:8000]


def get_write_cache_path(session_id: str, file_path: str) -> Path:
    """Get the cache file path for Write tool pre-capture."""
    cache_dir = Path.home() / ".config" / "ai-tracker" / "cache"
    cache_dir.mkdir(parents=True, exist_ok=True)
    # Use a safe filename from session_id and file basename
    safe_name = f"{session_id}-{Path(file_path).name}".replace("/", "_")
    return cache_dir / f"{safe_name}.json"


def run_hook() -> None:
    """Run the PreToolUse hook logic. Called by CLI command."""
    try:
        data = json.load(sys.stdin)
    except json.JSONDecodeError as e:
        print(f"Error: Invalid JSON input: {e}", file=sys.stderr)
        return

    tool_name = data.get("tool_name")
    tool_input = data.get("tool_input", {})
    session_id = data.get("session_id", "unknown")

    # Only process Write tool
    if tool_name != "Write":
        return

    file_path = tool_input.get("file_path")
    if not file_path:
        return

    original_content = ""
    is_new_file = True

    if os.path.exists(file_path):
        is_new_file = False
        try:
            # Check if binary first
            with open(file_path, "rb") as f:
                raw_content = f.read()
                if is_binary_content(raw_content):
                    # Skip binary files
                    return

            # Read as text
            with open(file_path, encoding="utf-8", errors="replace") as f:
                original_content = f.read()
        except (OSError, IOError) as e:
            print(f"Warning: Could not read file {file_path}: {e}", file=sys.stderr)
            original_content = ""

    # Cache the original content for PostToolUse hook
    cache_path = get_write_cache_path(session_id, file_path)
    try:
        with open(cache_path, "w") as f:
            json.dump(
                {
                    "file_path": file_path,
                    "original_content": original_content,
                    "is_new_file": is_new_file,
                },
                f,
            )
    except (OSError, IOError) as e:
        print(f"Warning: Could not write cache file: {e}", file=sys.stderr)


def main() -> None:
    """Main entry point for the hook."""
    run_hook()
    sys.exit(0)


if __name__ == "__main__":
    main()
