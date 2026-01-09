---
date: 2026-01-09T16:30:00-08:00
researcher: Taras
git_commit: e616532d713c40f206a01f26e6ae3f25c1edff27
branch: main
repository: ai-toolbox
topic: "Line Counting Accuracy for Claude Code Edit vs Write Tools"
tags: [research, claude-code, line-counting, diff, edit-tool, write-tool, attribution]
status: complete
last_updated: 2026-01-09
last_updated_by: Taras
---

# Research: Line Counting Accuracy for Claude Code Edit vs Write Tools

**Date**: 2026-01-09T16:30:00-08:00
**Researcher**: Taras
**Git Commit**: e616532d713c40f206a01f26e6ae3f25c1edff27
**Branch**: main
**Repository**: ai-toolbox

## Research Question

How to accurately count lines changed when Claude Code makes edits:
1. For Edit tool: How to count lines from old_string/new_string diff
2. For Write tool: How to handle full file writes (need before/after comparison)
3. Edge cases: binary files, empty files, file creation vs modification
4. Best approach to track accurate line-level attribution

## Summary

Line counting for Claude Code tools requires different strategies depending on the tool type:

- **Edit tool**: Count lines directly from `old_string` and `new_string` by counting newline characters
- **Write tool**: Requires storing file content BEFORE the write to compute a diff afterward
- **Edge cases**: Binary files should be excluded, empty files handled specially, and file creation tracked differently from modification

The recommended approach uses Claude Code's `PostToolUse` hooks to intercept tool calls and compute line-level statistics in real-time.

---

## Detailed Findings

### 1. Claude Code Tool Schemas

#### Edit Tool

The Edit tool performs exact string replacement with these parameters:

```typescript
interface EditTool {
  file_path: string;      // Absolute path (required)
  old_string: string;     // Exact text to find (required)
  new_string: string;     // Replacement text (required)
  replace_all?: boolean;  // Replace all occurrences (optional, default: false)
}
```

**Key characteristics:**
- Uses exact string matching (not regex)
- Requires prior read operation in current session
- Preserves file encoding and line endings
- Fails if `old_string` is not unique (unless `replace_all=true`)

#### Write Tool

The Write tool creates or overwrites files completely:

```typescript
interface WriteTool {
  file_path: string;      // Absolute path (required)
  content: string;        // Complete file content (required)
}
```

**Key characteristics:**
- Overwrites existing files completely (no partial updates)
- System enforces read-before-write validation for existing files
- Atomic operation - file either fully written or unchanged

### 2. Line Counting Algorithms

#### For Edit Tool: Direct Calculation

Since Edit provides both `old_string` and `new_string`, line counts can be calculated directly:

```python
def count_lines_edit(old_string: str, new_string: str) -> tuple[int, int]:
    """
    Count lines removed and added from an Edit operation.

    Returns: (lines_removed, lines_added)
    """
    # Count lines in each string
    # Add 1 because split('\\n') returns n+1 elements for n newlines
    # But handle empty strings specially

    if old_string == '':
        lines_removed = 0
    else:
        lines_removed = old_string.count('\\n') + 1

    if new_string == '':
        lines_added = 0
    else:
        lines_added = new_string.count('\\n') + 1

    return (lines_removed, lines_added)
```

**Alternative: Diff-based counting for more accuracy**

For cases where `old_string` and `new_string` have significant overlap (e.g., only one character changed on a line), a diff-based approach provides more accurate "changed lines" count:

```python
import difflib

def count_lines_edit_diff(old_string: str, new_string: str) -> dict:
    """
    Count actual line-level changes using unified diff.

    Returns dict with:
    - lines_removed: Lines present in old but not new
    - lines_added: Lines present in new but not old
    - lines_modified: Lines changed (approximation)
    """
    old_lines = old_string.splitlines(keepends=True)
    new_lines = new_string.splitlines(keepends=True)

    diff = list(difflib.unified_diff(old_lines, new_lines, lineterm=''))

    additions = 0
    deletions = 0

    for line in diff:
        if line.startswith('+') and not line.startswith('+++'):
            additions += 1
        elif line.startswith('-') and not line.startswith('---'):
            deletions += 1

    return {
        'lines_removed': deletions,
        'lines_added': additions,
        'net_change': additions - deletions
    }
```

#### For Write Tool: Before/After Comparison Required

Write tool only provides the new content, so the original must be captured BEFORE the write:

**Strategy 1: Pre-capture in PreToolUse hook**

```python
# In PreToolUse hook for Write tool
import json
import sys
import os

def capture_original_content():
    data = json.load(sys.stdin)
    file_path = data['tool_input']['file_path']

    original_content = ''
    if os.path.exists(file_path):
        try:
            with open(file_path, 'r') as f:
                original_content = f.read()
        except:
            original_content = ''  # Binary or unreadable

    # Store for PostToolUse hook
    cache_file = f'/tmp/write-cache-{os.getpid()}.json'
    with open(cache_file, 'w') as f:
        json.dump({
            'file_path': file_path,
            'original_content': original_content,
            'original_lines': original_content.count('\\n') + 1 if original_content else 0
        }, f)
```

**Strategy 2: Diff after the fact**

If pre-capture isn't possible, use git to get the original:

```python
import subprocess

def get_original_from_git(file_path: str, cwd: str) -> str:
    """Get file content from HEAD commit."""
    try:
        result = subprocess.run(
            ['git', 'show', f'HEAD:{file_path}'],
            cwd=cwd,
            capture_output=True,
            text=True
        )
        return result.stdout if result.returncode == 0 else ''
    except:
        return ''

def count_lines_write(file_path: str, new_content: str, cwd: str) -> dict:
    """Count lines changed for a Write operation."""
    original = get_original_from_git(file_path, cwd)

    if not original:
        # New file - all lines are additions
        return {
            'lines_removed': 0,
            'lines_added': new_content.count('\\n') + 1 if new_content else 0,
            'is_new_file': True
        }

    # Use diff-based counting
    old_lines = original.splitlines(keepends=True)
    new_lines = new_content.splitlines(keepends=True)

    import difflib
    diff = list(difflib.unified_diff(old_lines, new_lines))

    additions = sum(1 for line in diff if line.startswith('+') and not line.startswith('+++'))
    deletions = sum(1 for line in diff if line.startswith('-') and not line.startswith('---'))

    return {
        'lines_removed': deletions,
        'lines_added': additions,
        'is_new_file': False
    }
```

### 3. Edge Cases

#### Binary Files

Binary files should be detected and handled specially:

```python
def is_binary_file(file_path: str) -> bool:
    """Check if file is binary by looking for null bytes."""
    try:
        with open(file_path, 'rb') as f:
            chunk = f.read(8000)
            return b'\\x00' in chunk
    except:
        return False

def count_lines_safe(tool_name: str, tool_input: dict) -> dict:
    """Safe line counting with binary detection."""
    file_path = tool_input.get('file_path')

    if is_binary_file(file_path):
        return {
            'lines_removed': 0,
            'lines_added': 0,
            'is_binary': True,
            'skipped': True
        }

    # Continue with normal counting...
```

#### Empty Files

Handle empty files explicitly:

```python
def count_lines_string(content: str) -> int:
    """Count lines in a string, handling empty case."""
    if not content:
        return 0
    if content == '\\n':
        return 1
    # A string with no newlines is 1 line
    # A string ending with newline has N lines where N = newline count
    # A string not ending with newline has N+1 lines
    return content.count('\\n') + (0 if content.endswith('\\n') else 1)
```

#### File Creation vs Modification

Track whether a file was created or modified:

```python
def categorize_change(tool_name: str, tool_input: dict, tool_response: dict) -> dict:
    """Categorize the type of change made."""
    file_path = tool_input.get('file_path')

    if tool_name == 'Write':
        # Check if file existed before
        # This info should come from PreToolUse capture
        is_new = not os.path.exists(file_path + '.pre-write-backup')
        return {
            'change_type': 'create' if is_new else 'modify',
            'tool': 'Write'
        }

    elif tool_name == 'Edit':
        # Edit always modifies existing files
        return {
            'change_type': 'modify',
            'tool': 'Edit'
        }
```

### 4. Recommended Implementation Architecture

Based on the existing research in this codebase (`2026-01-09-ai-vs-human-code-tracking.md`), here is the recommended architecture:

#### Hook Configuration

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write",
        "hooks": [
          {
            "type": "command",
            "command": "python3 ~/.config/ai-tracker/capture-before-write.py"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "python3 ~/.config/ai-tracker/log-line-changes.py"
          }
        ]
      }
    ]
  }
}
```

#### Complete Line Counting Implementation

```python
#!/usr/bin/env python3
"""
log-line-changes.py - PostToolUse hook to track line-level changes
"""
import json
import sys
import os
import difflib
from datetime import datetime

def count_lines(content: str) -> int:
    """Count lines in content."""
    if not content:
        return 0
    return content.count('\\n') + (0 if content.endswith('\\n') else 1)

def is_binary(content: bytes) -> bool:
    """Check for binary content."""
    return b'\\x00' in content[:8000]

def compute_diff_stats(old: str, new: str) -> dict:
    """Compute line-level diff statistics."""
    if not old and not new:
        return {'added': 0, 'removed': 0}

    old_lines = old.splitlines(keepends=True) if old else []
    new_lines = new.splitlines(keepends=True) if new else []

    diff = list(difflib.unified_diff(old_lines, new_lines))

    added = sum(1 for line in diff if line.startswith('+') and not line.startswith('+++'))
    removed = sum(1 for line in diff if line.startswith('-') and not line.startswith('---'))

    return {'added': added, 'removed': removed}

def main():
    data = json.load(sys.stdin)
    tool_name = data['tool_name']
    tool_input = data['tool_input']
    tool_response = data.get('tool_response', {})

    file_path = tool_input.get('file_path')
    if not file_path:
        return

    # Check for binary
    if os.path.exists(file_path):
        try:
            with open(file_path, 'rb') as f:
                if is_binary(f.read(8000)):
                    return  # Skip binary files
        except:
            pass

    stats = {}

    if tool_name == 'Edit':
        old_string = tool_input.get('old_string', '')
        new_string = tool_input.get('new_string', '')
        stats = compute_diff_stats(old_string, new_string)
        stats['method'] = 'edit_direct'

    elif tool_name == 'Write':
        new_content = tool_input.get('content', '')

        # Try to get cached original from PreToolUse
        cache_file = f'/tmp/write-cache-{data["session_id"]}-{os.path.basename(file_path)}.json'
        if os.path.exists(cache_file):
            with open(cache_file, 'r') as f:
                cache = json.load(f)
                original = cache.get('original_content', '')
            os.remove(cache_file)
            stats = compute_diff_stats(original, new_content)
            stats['method'] = 'write_cached'
        else:
            # Fallback: count new content as all additions
            stats = {
                'added': count_lines(new_content),
                'removed': 0,
                'method': 'write_fallback'
            }

    # Log the result
    log_entry = {
        'timestamp': datetime.utcnow().isoformat() + 'Z',
        'session_id': data['session_id'],
        'tool': tool_name,
        'file': file_path,
        'lines_added': stats.get('added', 0),
        'lines_removed': stats.get('removed', 0),
        'method': stats.get('method', 'unknown'),
        'cwd': data.get('cwd', '')
    }

    log_file = os.path.expanduser('~/.config/ai-tracker/line-changes.jsonl')
    os.makedirs(os.path.dirname(log_file), exist_ok=True)
    with open(log_file, 'a') as f:
        f.write(json.dumps(log_entry) + '\\n')

if __name__ == '__main__':
    main()
```

### 5. Accuracy Considerations

#### Simple Counting vs Diff-Based Counting

| Approach | Pros | Cons |
|----------|------|------|
| **Simple newline counting** | Fast, deterministic, easy to implement | Overcounts when lines are merely modified |
| **Diff-based (unified diff)** | More accurate for actual changes | Slower, depends on diff algorithm |
| **Git numstat** | Standard, well-tested | Requires git, only works post-commit |

#### Recommendation

Use **simple counting** for real-time tracking during edits, then **reconcile with git numstat** at commit time for accurate final numbers.

```python
# Real-time: simple counting
lines_added = new_string.count('\\n') + 1
lines_removed = old_string.count('\\n') + 1

# At commit time: git reconciliation
# git diff --numstat HEAD~1
```

---

## Code References

### Existing Codebase

- `/Users/taras/Documents/code/ai-toolbox/thoughts/shared/research/2026-01-09-ai-vs-human-code-tracking.md` - Related research on AI vs human change tracking
- `/Users/taras/Documents/code/ai-toolbox/hive/src/renderer/components/session/ToolGroupBlock.tsx` - Shows Edit tool UI rendering with old_string/new_string
- `/Users/taras/Documents/code/ai-toolbox/hive/src/renderer/components/session/DiffTab.tsx` - Monaco DiffEditor integration for viewing file diffs

### External References

- [Claude Code Hooks Documentation](https://docs.anthropic.com/en/docs/claude-code/hooks) - Official hook system docs
- [Text Editor Tool Documentation](https://platform.claude.com/docs/en/agents-and-tools/tool-use/text-editor-tool) - Official API text editor tool
- [Myers Diff Algorithm](https://blog.jcoglan.com/2017/02/12/the-myers-diff-algorithm-part-1/) - The algorithm used by jsdiff and most diff tools
- [jsdiff Library](https://github.com/kpdecker/jsdiff) - JavaScript diff implementation
- [Git diff-options](https://git-scm.com/docs/diff-options) - Git's `--numstat` and `--shortstat` options
- [Internal Claude Code Tools](https://gist.github.com/bgauryy/0cdb9aa337d01ae5bd0c803943aa36bd) - Unofficial tool schema documentation

---

## Architecture Summary

| Component | Purpose | Implementation |
|-----------|---------|----------------|
| PreToolUse hook (Write) | Capture original file content | Python script caching to /tmp |
| PostToolUse hook (Edit/Write) | Compute and log line changes | Python script with diff calculation |
| Line counting algorithm | Count additions/removals | Simple newline counting or unified diff |
| Binary detection | Skip non-text files | Check for null bytes in first 8KB |
| Storage | Persist line-level data | JSONL append-only log file |

## Data Model

Each logged change includes:

```json
{
  "timestamp": "2026-01-09T16:30:00Z",
  "session_id": "abc123",
  "tool": "Edit",
  "file": "/absolute/path/to/file.ts",
  "lines_added": 15,
  "lines_removed": 3,
  "method": "edit_direct",
  "cwd": "/project/root"
}
```

## Open Questions

1. **Replace_all handling**: When `replace_all=true` on Edit, should each replacement be counted separately?
2. **Multi-file operations**: Should batch operations (like Bash `sed` commands) be tracked?
3. **Accuracy threshold**: Is simple counting "good enough" or should diff-based be default?
4. **Storage format**: JSONL vs SQLite for better querying?

## Related Research

- [2026-01-09-ai-vs-human-code-tracking.md](/thoughts/shared/research/2026-01-09-ai-vs-human-code-tracking.md) - Comprehensive guide on tracking AI vs human code changes
