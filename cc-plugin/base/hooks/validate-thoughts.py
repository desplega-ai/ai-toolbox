#!/usr/bin/env python3
"""PreToolUse hook to validate writes to thoughts directories.

This hook intercepts Write and Edit operations targeting thoughts directories
and validates:
1. Path structure: thoughts/{agentId|shared}/{research|plans}/YYYY-MM-DD-topic.md
2. File format: Must have YAML frontmatter (for Write operations)

Exit codes:
- 0: Allow operation
- 2: Block operation (stderr fed to Claude for correction)
"""

import json
import re
import sys


def validate_path(file_path: str) -> tuple[bool, str]:
    """Validate that the file path matches expected thoughts directory patterns.

    Args:
        file_path: The file path being written to

    Returns:
        Tuple of (is_valid, error_message)
    """
    # Pattern for valid thoughts paths
    # thoughts/{agentId|shared}/{research|plans}/YYYY-MM-DD-topic-slug.md
    research_pattern = r'thoughts/[^/]+/research/\d{4}-\d{2}-\d{2}-[\w-]+\.md$'
    plans_pattern = r'thoughts/[^/]+/plans/\d{4}-\d{2}-\d{2}-[\w-]+\.md$'

    if "/research/" in file_path:
        if not re.search(research_pattern, file_path):
            return False, (
                "Invalid research path format.\n"
                "Expected: thoughts/{agentId|shared}/research/YYYY-MM-DD-topic-slug.md\n"
                f"Got: {file_path}"
            )
    elif "/plans/" in file_path:
        if not re.search(plans_pattern, file_path):
            return False, (
                "Invalid plan path format.\n"
                "Expected: thoughts/{agentId|shared}/plans/YYYY-MM-DD-topic-slug.md\n"
                f"Got: {file_path}"
            )
    else:
        return False, (
            "Invalid thoughts subdirectory.\n"
            "Thoughts files must be in either 'research' or 'plans' subdirectory.\n"
            f"Got: {file_path}"
        )

    return True, ""


def validate_frontmatter(content: str) -> tuple[bool, str]:
    """Validate that the content has proper YAML frontmatter.

    Args:
        content: The file content being written

    Returns:
        Tuple of (is_valid, error_message)
    """
    if not content.strip().startswith("---"):
        return False, (
            "Thoughts files must start with YAML frontmatter.\n"
            "Expected format:\n"
            "---\n"
            "date: YYYY-MM-DDTHH:MM:SSZ\n"
            "topic: \"Topic Title\"\n"
            "...\n"
            "---\n"
            "\n"
            "# Content here"
        )

    # Check for closing frontmatter delimiter
    lines = content.split('\n')
    if len(lines) < 3:
        return False, "Frontmatter must have at least opening and closing delimiters (---)"

    # Find the closing delimiter (skip the first line which is the opening ---)
    found_closing = False
    for i, line in enumerate(lines[1:], start=1):
        if line.strip() == "---":
            found_closing = True
            break

    if not found_closing:
        return False, "Frontmatter must have a closing delimiter (---)"

    return True, ""


def main():
    """Main hook entry point."""
    try:
        data = json.load(sys.stdin)
    except json.JSONDecodeError:
        # If we can't parse the input, allow the operation
        # (fail open for non-standard inputs)
        sys.exit(0)

    tool_name = data.get("tool_name")
    tool_input = data.get("tool_input", {})

    # Only process Write and Edit operations
    if tool_name not in ("Write", "Edit"):
        sys.exit(0)

    file_path = tool_input.get("file_path", "")

    # Only validate thoughts directory writes
    if "/thoughts/" not in file_path:
        sys.exit(0)

    # Validate path structure
    is_valid, error_msg = validate_path(file_path)
    if not is_valid:
        print(error_msg, file=sys.stderr)
        sys.exit(2)

    # For Write operations, also validate frontmatter
    if tool_name == "Write":
        content = tool_input.get("content", "")
        is_valid, error_msg = validate_frontmatter(content)
        if not is_valid:
            print(error_msg, file=sys.stderr)
            sys.exit(2)

    # All validations passed
    sys.exit(0)


if __name__ == "__main__":
    main()
