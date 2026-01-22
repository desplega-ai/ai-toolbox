---
date: 2026-01-22T12:00:00-08:00
topic: "AI Tracker Screenshot Export Implementation"
tags: [plan, ai-tracker, screenshot, png, clipboard]
status: draft
autonomy: autopilot
related_research: thoughts/taras/research/2026-01-22-ai-tracker-screenshot-export.md
---

# AI Tracker Screenshot Export Implementation Plan

## Overview

Implement PNG screenshot export functionality for the ai-tracker CLI with:
- `--screenshot` flag to copy output to clipboard (macOS only)
- `--path <path>` flag to save PNG to a specific file path

This enables users to easily share their AI vs human code statistics on social media.

## Current State Analysis

The ai-tracker CLI uses Rich library for terminal output with tables, panels, and ASCII charts. All display functions use a module-level `Console()` instance without recording enabled.

### Key Discoveries:
- Global console instance at `ai-tracker/src/ai_tracker/stats/display.py:9` - no parameters passed
- Display functions don't accept a console parameter - they use the module-level instance directly
- CLI command at `ai-tracker/src/ai_tracker/cli.py:15-33` has options but no screenshot support
- Dependencies in `ai-tracker/pyproject.toml:22-26` - rich, plotext, click only
- Rich supports `Console(record=True)` and `export_svg()` for capturing output

## Desired End State

Users can run:
```bash
# Copy stats screenshot to clipboard
ai-tracker stats --screenshot

# Save stats screenshot to file
ai-tracker stats --path ~/Desktop/stats.png

# Both: save to file AND copy to clipboard
ai-tracker stats --screenshot --path ~/Desktop/stats.png
```

When `--screenshot` or `--path` is used:
1. CLI executes successfully but suppresses rich terminal output (only status message shown)
2. Rich output is captured and converted to PNG
3. PNG is copied to clipboard and/or saved to file
4. Status message confirms action: "Screenshot copied to clipboard" or "Saved to ~/Desktop/stats.png"

Verification:
- `ai-tracker stats --screenshot` copies PNG to clipboard (paste in Preview/Notes to verify)
- `ai-tracker stats --path /tmp/test.png && ls -la /tmp/test.png` creates file
- `--screenshot --plain` shows error message (incompatible options)

## Quick Verification Reference

Common commands to verify the implementation:
- `cd ai-tracker && uv run ai-tracker stats --screenshot` - test clipboard
- `cd ai-tracker && uv run ai-tracker stats --path /tmp/test.png` - test file save
- `cd ai-tracker && uv run ai-tracker stats --screenshot --plain` - verify error handling

Key files to check:
- `ai-tracker/src/ai_tracker/cli.py` - CLI options
- `ai-tracker/src/ai_tracker/stats/display.py` - console and display functions
- `ai-tracker/src/ai_tracker/screenshot.py` - new module (to be created)
- `ai-tracker/pyproject.toml` - dependencies

## What We're NOT Doing

- Cross-platform clipboard support (Linux/Windows) - macOS only for `--screenshot`
- Exposing image quality settings as CLI flags (use sensible defaults)
- Adding `--screenshot` support for `--plain` mode (requires Rich formatting)
- Creating optional dependency group - adding cairosvg as a required dependency

## Implementation Approach

1. Add `cairosvg` dependency for SVG→PNG conversion
2. Modify display functions to accept an optional `console` parameter
3. Create `screenshot.py` module for export logic
4. Update CLI to handle new flags and coordinate screenshot flow
5. Use osascript for macOS clipboard integration (zero additional Python deps)

---

## Phase 1: Add CairoSVG Dependency

### Overview
Add the cairosvg package as a dependency for SVG to PNG conversion.

### Changes Required:

#### 1. Update pyproject.toml
**File**: `ai-tracker/pyproject.toml`
**Changes**: Add `cairosvg>=2.7.0` to dependencies list

```toml
dependencies = [
    "rich>=13.0.0",
    "plotext>=5.0.0",
    "click>=8.0.0",
    "cairosvg>=2.7.0",
]
```

### Success Criteria:

#### Automated Verification:
- [ ] Dependency installs: `cd ai-tracker && uv sync`
- [ ] Import works: `cd ai-tracker && uv run python -c "import cairosvg; print('ok')"`

#### Manual Verification:
- [ ] `uv.lock` updated with cairosvg and its dependencies

**Implementation Note**: After completing this phase, pause for manual confirmation.

---

## Phase 2: Modify Display Functions to Accept Console Parameter

### Overview
Update all display functions to accept an optional `console` parameter, enabling external control of the Console instance for recording.

### Changes Required:

#### 1. Update display.py function signatures
**File**: `ai-tracker/src/ai_tracker/stats/display.py`
**Changes**:
- Add `console: Console | None = None` parameter to `display_stats()`, `display_global_stats()`, and `_display_chart()`
- Use `console or _console` pattern to fall back to module-level console
- Rename module-level console to `_console` to indicate it's private

**Updated function signatures:**

```python
# Module-level (private)
_console = Console()

def display_stats(
    days: int = 30,
    repo: str | None = None,
    show_chart: bool = False,
    plain: bool = False,
    console: Console | None = None,
) -> None:
    c = console or _console
    # ... use c instead of console throughout

def display_global_stats(
    db_path=None,
    plain: bool = False,
    console: Console | None = None,
) -> None:
    c = console or _console
    # ... use c instead of console throughout

def _display_chart(days: int = 30, console: Console | None = None) -> None:
    c = console or _console
    # ... use c instead of console throughout
```

**Also update:**
- `_display_stats_plain()` - add console parameter
- `_display_stats_rich()` - add console parameter
- `_display_global_stats_plain()` - add console parameter
- `_display_global_stats_rich()` - add console parameter

### Success Criteria:

#### Automated Verification:
- [ ] Normal usage still works: `cd ai-tracker && uv run ai-tracker stats`
- [ ] Chart works: `cd ai-tracker && uv run ai-tracker stats --chart --days 7`
- [ ] Global stats work: `cd ai-tracker && uv run ai-tracker stats --global`
- [ ] Plain mode works: `cd ai-tracker && uv run ai-tracker stats --plain`

#### Manual Verification:
- [ ] Output looks identical to before the changes
- [ ] No Python warnings or errors

**Implementation Note**: This is a refactor phase - behavior should be identical. After completing, pause for verification that existing functionality is preserved.

---

## Phase 3: Create Screenshot Module

### Overview
Create a new `screenshot.py` module with functions for SVG export, PNG conversion, and clipboard integration.

### Changes Required:

#### 1. Create screenshot.py
**File**: `ai-tracker/src/ai_tracker/screenshot.py`
**Changes**: New file with screenshot export functionality

```python
"""Screenshot export functionality for ai-tracker."""

import subprocess
import sys
import tempfile
from pathlib import Path

from rich.console import Console
from rich.terminal_theme import MONOKAI


def export_to_png(
    console: Console,
    output_path: Path | None = None,
    clipboard: bool = False,
    scale: float = 2.0,
) -> Path | None:
    """Export recorded console output to PNG.

    Args:
        console: Rich Console with record=True that has content
        output_path: Path to save PNG (optional if clipboard=True)
        clipboard: Copy to clipboard instead of/in addition to file
        scale: Scale factor for image quality (2.0 = high DPI)

    Returns:
        Path to PNG file if saved, None if only clipboard
    """
    import cairosvg

    svg_content = console.export_svg(title="AI Tracker", theme=MONOKAI)

    if clipboard and output_path is None:
        # Create temp file for clipboard operation
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f:
            temp_path = Path(f.name)

        cairosvg.svg2png(
            bytestring=svg_content.encode("utf-8"),
            write_to=str(temp_path),
            scale=scale,
        )
        _copy_to_clipboard(temp_path)
        temp_path.unlink()  # Clean up temp file
        return None

    if output_path:
        cairosvg.svg2png(
            bytestring=svg_content.encode("utf-8"),
            write_to=str(output_path),
            scale=scale,
        )
        if clipboard:
            _copy_to_clipboard(output_path)
        return output_path

    return None


def _copy_to_clipboard(png_path: Path) -> bool:
    """Copy PNG file to macOS clipboard using osascript.

    Args:
        png_path: Path to PNG file

    Returns:
        True if successful, False otherwise
    """
    if sys.platform != "darwin":
        return False

    script = f'set the clipboard to (read (POSIX file "{png_path.absolute()}") as «class PNGf»)'
    result = subprocess.run(
        ["osascript", "-e", script],
        capture_output=True,
    )
    return result.returncode == 0


def check_platform_support(clipboard: bool) -> str | None:
    """Check if the current platform supports the requested operation.

    Args:
        clipboard: Whether clipboard operation is requested

    Returns:
        Error message if not supported, None if supported
    """
    if clipboard and sys.platform != "darwin":
        return "Clipboard support is only available on macOS. Use --path to save to a file."
    return None
```

### Success Criteria:

#### Automated Verification:
- [ ] Module imports: `cd ai-tracker && uv run python -c "from ai_tracker.screenshot import export_to_png; print('ok')"`
- [ ] Module file exists: `ls ai-tracker/src/ai_tracker/screenshot.py`

#### Manual Verification:
- [ ] File contains all three functions: `export_to_png`, `_copy_to_clipboard`, `check_platform_support`

**Implementation Note**: This phase creates the module but doesn't integrate it yet. After completing, pause for manual confirmation.

---

## Phase 4: Update CLI with Screenshot Options

### Overview
Add `--screenshot` and `--path` CLI options and integrate with the screenshot module.

### Changes Required:

#### 1. Update cli.py
**File**: `ai-tracker/src/ai_tracker/cli.py`
**Changes**:
- Add `--screenshot` flag option
- Add `--path` option for file output
- Create recording console when needed
- Call export functions after display
- Handle error cases (--plain + --screenshot, non-macOS clipboard)

```python
@main.command()
@click.option("--days", default=30, help="Number of days to show stats for")
@click.option("--repo", default=None, help="Filter by repository name")
@click.option("--chart", is_flag=True, help="Show ASCII chart")
@click.option("--graph", is_flag=True, help="Show ASCII chart for last 7 days (shortcut for --chart --days 7)")
@click.option("--global", "show_global", is_flag=True, help="Show all-time global statistics")
@click.option("--plain", is_flag=True, help="Plain output without borders (easier to read in pipes)")
@click.option("--screenshot", is_flag=True, help="Copy output as PNG to clipboard (macOS only)")
@click.option("--path", "output_path", type=click.Path(), help="Save output as PNG to specified path")
def stats(
    days: int,
    repo: str | None,
    chart: bool,
    graph: bool,
    show_global: bool,
    plain: bool,
    screenshot: bool,
    output_path: str | None,
) -> None:
    """Show AI vs human code statistics."""
    from pathlib import Path

    from rich.console import Console

    from .stats.display import display_global_stats, display_stats

    # Validate options
    needs_export = screenshot or output_path
    if needs_export and plain:
        click.echo("Error: Cannot use --screenshot or --path with --plain. Screenshots require Rich formatting.", err=True)
        raise SystemExit(1)

    # Check platform support for clipboard
    if screenshot:
        from .screenshot import check_platform_support

        error = check_platform_support(clipboard=True)
        if error:
            click.echo(f"Error: {error}", err=True)
            raise SystemExit(1)

    if graph:
        days = 7
        chart = True

    # Create console - with recording if we need to export
    console = Console(record=True, width=100) if needs_export else None

    if show_global:
        display_global_stats(plain=plain, console=console)
    else:
        display_stats(days=days, repo=repo, show_chart=chart, plain=plain, console=console)

    # Handle export
    if needs_export:
        from .screenshot import export_to_png

        path = Path(output_path) if output_path else None
        export_to_png(console, output_path=path, clipboard=screenshot)

        if screenshot:
            click.echo("Screenshot copied to clipboard")
        if output_path:
            click.echo(f"Saved to {output_path}")
```

### Success Criteria:

#### Automated Verification:
- [ ] Help shows new options: `cd ai-tracker && uv run ai-tracker stats --help | grep -E "(screenshot|path)"`
- [ ] Error on plain+screenshot: `cd ai-tracker && uv run ai-tracker stats --plain --screenshot 2>&1 | grep -q "Error"` (should exit non-zero)
- [ ] File export works: `cd ai-tracker && uv run ai-tracker stats --path /tmp/test-stats.png && ls /tmp/test-stats.png`

#### Manual Verification:
- [ ] `ai-tracker stats --screenshot` copies PNG to clipboard (paste in Preview to verify)
- [ ] `ai-tracker stats --path /tmp/test.png` creates valid PNG file (open in Preview)
- [ ] `ai-tracker stats --screenshot --path /tmp/test.png` does both
- [ ] `ai-tracker stats --global --screenshot` works with global stats
- [ ] `ai-tracker stats --chart --screenshot` works with chart

**Implementation Note**: This is the main integration phase. After completing, pause for thorough manual testing of all screenshot scenarios.

---

## Phase 5: Suppress Terminal Output in Screenshot Mode

### Overview
When screenshot mode is active, suppress the rich output to terminal - only show the final status message.

### Changes Required:

#### 1. Update Console creation for silent recording
**File**: `ai-tracker/src/ai_tracker/cli.py`
**Changes**: Create console with `file=StringIO()` to suppress terminal output when exporting

```python
# In stats() function, update console creation:
if needs_export:
    from io import StringIO
    # Record to memory, don't output to terminal
    console = Console(record=True, width=100, file=StringIO(), force_terminal=True)
else:
    console = None
```

### Success Criteria:

#### Automated Verification:
- [ ] Normal mode shows output: `cd ai-tracker && uv run ai-tracker stats 2>&1 | grep -q "Lines Added"` (should match)
- [ ] Screenshot mode suppresses output: `cd ai-tracker && uv run ai-tracker stats --screenshot 2>&1 | grep -q "Lines Added"` (should NOT match, only shows "Screenshot copied to clipboard")

#### Manual Verification:
- [ ] `ai-tracker stats` shows normal rich output
- [ ] `ai-tracker stats --screenshot` only shows "Screenshot copied to clipboard"
- [ ] `ai-tracker stats --path /tmp/test.png` only shows "Saved to /tmp/test.png"
- [ ] PNG content is identical whether or not terminal output is suppressed

**Implementation Note**: After completing this phase, pause to verify the user experience is clean.

---

## Testing Strategy

### Unit Tests
No unit tests required for this feature - the functionality is straightforward and easily tested manually.

### Integration Tests
Manual testing scenarios:
1. `ai-tracker stats --screenshot` - clipboard with normal stats
2. `ai-tracker stats --global --screenshot` - clipboard with global stats
3. `ai-tracker stats --chart --screenshot` - clipboard with chart
4. `ai-tracker stats --path /tmp/test.png` - file save
5. `ai-tracker stats --screenshot --path /tmp/test.png` - both
6. `ai-tracker stats --plain --screenshot` - error case
7. On Linux: `ai-tracker stats --screenshot` - error case (platform not supported)

### Manual Verification
1. Open saved PNG in Preview - verify it looks correct
2. Paste clipboard contents in Notes - verify PNG renders
3. Share on X/Twitter - verify it displays well

## References

- Research: `thoughts/taras/research/2026-01-22-ai-tracker-screenshot-export.md`
- Rich Console recording: https://rich.readthedocs.io/en/stable/console.html#recording
- CairoSVG documentation: https://cairosvg.org/documentation/
