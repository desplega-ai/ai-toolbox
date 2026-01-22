---
date: 2026-01-22T10:00:00-08:00
researcher: Claude
git_commit: e05cce4
branch: main
repository: ai-toolbox
topic: "Implement PNG screenshot export for ai-tracker CLI"
tags: [research, ai-tracker, screenshot, clipboard, png, rich]
status: complete
autonomy: autopilot
last_updated: 2026-01-22
last_updated_by: Claude
---

# Research: Implement PNG Screenshot Export for ai-tracker CLI

**Date**: 2026-01-22
**Researcher**: Claude
**Git Commit**: e05cce4
**Branch**: main

## Research Question

How to implement PNG screenshot export functionality for the ai-tracker CLI with:
- `--screenshot` flag to copy output to clipboard
- `--path <path>` flag to save PNG to a specific file path

## Summary

The ai-tracker CLI uses Rich library for terminal output with tables, panels, and ASCII charts. Rich has built-in SVG export via `Console(record=True)` and `export_svg()`, which can then be converted to PNG using CairoSVG. For clipboard integration on macOS, the simplest approach is using `osascript` to avoid additional dependencies, or PyObjC for more control.

**Recommended approach:**
1. Add `cairosvg` as a new dependency (minimal, well-maintained)
2. Use Rich's native `export_svg()` method with `record=True`
3. Convert SVG → PNG via CairoSVG
4. For clipboard: use subprocess + osascript (zero additional dependencies)
5. For file save: write PNG directly to specified path

## Detailed Findings

### Current ai-tracker Architecture

The CLI uses Click for command handling and Rich for output:

- **Entry point**: `ai_tracker/cli.py:22-33` - `stats` command with options
- **Display module**: `ai_tracker/stats/display.py` - all Rich rendering
- **Console instance**: `display.py:9` - global `console = Console()` (no recording enabled)

Current dependencies in `pyproject.toml`:
```python
dependencies = [
    "rich>=13.0.0",
    "plotext>=5.0.0",  # Not actually used in display
    "click>=8.0.0",
]
```

### Rich SVG Export Capabilities

Rich Console has built-in SVG export when created with `record=True`:

```python
from rich.console import Console
from rich.terminal_theme import MONOKAI

console = Console(record=True, width=100)
console.print("[bold cyan]Hello[/]")

# Export to SVG string
svg_string = console.export_svg(title="Terminal", theme=MONOKAI)

# Or save directly
console.save_svg("output.svg", theme=MONOKAI)
```

**Available themes**: `DEFAULT_TERMINAL_THEME`, `MONOKAI`, `DIMMED_MONOKAI`, `NIGHT_OWLISH`, `SVG_EXPORT_THEME`

### SVG to PNG Conversion Options

| Library | Installation | Pros | Cons |
|---------|--------------|------|------|
| **CairoSVG** | `pip install cairosvg` | Fast, simple API, excellent SVG support | Requires Cairo C library |
| **svglib** | `pip install svglib reportlab` | Pure Python | Limited CSS support |
| **Wand** | `pip install wand` + ImageMagick | Feature-rich | Heavy dependency |

**CairoSVG is recommended** - it's lightweight and handles Rich's SVG output perfectly:

```python
import cairosvg

cairosvg.svg2png(
    bytestring=svg_string.encode('utf-8'),
    write_to='output.png',
    scale=2  # For high resolution
)
```

### macOS Clipboard Integration

| Approach | Dependencies | Recommendation |
|----------|--------------|----------------|
| osascript | None (built-in) | **Best for minimal deps** |
| PyObjC | `pyobjc-framework-Cocoa` | Best for control |
| pyperclipimg | `pyperclipimg` | Cross-platform |
| pasteboard | `pasteboard` | macOS-native |

**Recommended: osascript approach** (zero additional Python dependencies):

```python
import subprocess
import os

def copy_png_to_clipboard(png_path: str) -> bool:
    """Copy PNG file to clipboard using osascript."""
    abs_path = os.path.abspath(png_path)
    script = f'set the clipboard to (read (POSIX file "{abs_path}") as «class PNGf»)'
    result = subprocess.run(['osascript', '-e', script], capture_output=True)
    return result.returncode == 0
```

**Alternative with PyObjC** (if more control needed):

```python
from AppKit import NSPasteboard, NSPasteboardTypePNG
from Foundation import NSData

def copy_png_to_clipboard(png_path: str) -> bool:
    with open(png_path, 'rb') as f:
        data = f.read()
    pb = NSPasteboard.generalPasteboard()
    pb.clearContents()
    pb.declareTypes_owner_([NSPasteboardTypePNG], None)
    ns_data = NSData.dataWithBytes_length_(data, len(data))
    return pb.setData_forType_(ns_data, NSPasteboardTypePNG)
```

### Implementation Approach

#### 1. Modify display.py

Change the global console to support recording:

```python
# Create console factory function
def create_console(record: bool = False) -> Console:
    return Console(record=record, width=100)

console = create_console()  # Default non-recording for normal use
```

#### 2. Add screenshot module

Create `ai_tracker/screenshot.py`:

```python
"""Screenshot export functionality for ai-tracker."""
import subprocess
import tempfile
from pathlib import Path
from rich.console import Console
from rich.terminal_theme import MONOKAI

def export_to_png(console: Console, output_path: Path | None = None,
                  clipboard: bool = False, scale: float = 2.0) -> Path | None:
    """Export recorded console output to PNG.

    Args:
        console: Rich Console with record=True that has content
        output_path: Path to save PNG (optional if clipboard=True)
        clipboard: Copy to clipboard instead of/in addition to file
        scale: Scale factor for image quality

    Returns:
        Path to PNG file if saved, None if only clipboard
    """
    import cairosvg

    svg_content = console.export_svg(title="AI Tracker", theme=MONOKAI)

    if clipboard and output_path is None:
        # Temp file for clipboard
        with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as f:
            temp_path = Path(f.name)
        cairosvg.svg2png(bytestring=svg_content.encode(),
                        write_to=str(temp_path), scale=scale)
        copy_to_clipboard(temp_path)
        temp_path.unlink()  # Clean up
        return None

    if output_path:
        cairosvg.svg2png(bytestring=svg_content.encode(),
                        write_to=str(output_path), scale=scale)
        if clipboard:
            copy_to_clipboard(output_path)
        return output_path

    return None

def copy_to_clipboard(png_path: Path) -> bool:
    """Copy PNG to macOS clipboard."""
    script = f'set the clipboard to (read (POSIX file "{png_path.absolute()}") as «class PNGf»)'
    result = subprocess.run(['osascript', '-e', script], capture_output=True)
    return result.returncode == 0
```

#### 3. Update CLI

Modify `cli.py` to add flags:

```python
@main.command()
@click.option("--days", default=30, help="Number of days to show stats for")
@click.option("--repo", default=None, help="Filter by repository name")
@click.option("--chart", is_flag=True, help="Show ASCII chart")
@click.option("--graph", is_flag=True, help="Show ASCII chart for last 7 days")
@click.option("--global", "show_global", is_flag=True, help="Show all-time global statistics")
@click.option("--plain", is_flag=True, help="Plain output without borders")
@click.option("--screenshot", is_flag=True, help="Copy output as PNG to clipboard")
@click.option("--path", "output_path", type=click.Path(), help="Save output as PNG to path")
def stats(days: int, repo: str | None, chart: bool, graph: bool,
          show_global: bool, plain: bool, screenshot: bool, output_path: str | None) -> None:
    """Show AI vs human code statistics."""
    from .stats.display import display_global_stats, display_stats, create_console

    # Determine if we need recording
    needs_export = screenshot or output_path
    console = create_console(record=needs_export)

    if graph:
        days = 7
        chart = True

    if show_global:
        display_global_stats(console=console, plain=plain)
    else:
        display_stats(console=console, days=days, repo=repo, show_chart=chart, plain=plain)

    # Handle export
    if needs_export:
        from .screenshot import export_to_png
        from pathlib import Path

        path = Path(output_path) if output_path else None
        export_to_png(console, output_path=path, clipboard=screenshot)

        if screenshot:
            click.echo("Screenshot copied to clipboard")
        if output_path:
            click.echo(f"Saved to {output_path}")
```

#### 4. Update dependencies

Add to `pyproject.toml`:

```toml
dependencies = [
    "rich>=13.0.0",
    "plotext>=5.0.0",
    "click>=8.0.0",
    "cairosvg>=2.7.0",  # For PNG export
]
```

## Code References

| File | Line | Description |
|------|------|-------------|
| `ai-tracker/src/ai_tracker/cli.py` | 22-33 | `stats` command definition with current options |
| `ai-tracker/src/ai_tracker/stats/display.py` | 9 | Global Console instance |
| `ai-tracker/src/ai_tracker/stats/display.py` | 12-78 | `display_stats()` function rendering stats |
| `ai-tracker/src/ai_tracker/stats/display.py` | 121-170 | `_display_stats_rich()` with Table/Panel rendering |
| `ai-tracker/src/ai_tracker/stats/display.py` | 178-256 | `_display_chart()` ASCII chart rendering |
| `ai-tracker/pyproject.toml` | 22-26 | Current dependencies |

## Architecture Documentation

### Current Flow
1. CLI command invoked → `cli.py:stats()`
2. Display functions called → `display.py:display_stats()` or `display_global_stats()`
3. Rich Console prints tables, panels, charts to stdout
4. Output displayed in terminal

### Proposed Flow with Screenshot
1. CLI command invoked with `--screenshot` or `--path`
2. Console created with `record=True`
3. Display functions render to recording Console (terminal output suppressed)
4. After rendering, `export_svg()` captures content
5. CairoSVG converts SVG → PNG
6. PNG copied to clipboard or saved to file
7. Print only status message: "Screenshot copied to clipboard" or "Saved to {path}"

**Note**: When screenshot mode is active, the rich stats output should NOT be printed to terminal - only the final status message should be displayed.

## Historical Context (from thoughts/)

No previous research found on this topic in the thoughts/ directory.

## Related Research

None currently available.

## Open Questions

1. **Cairo system dependency**: CairoSVG requires the Cairo C library.
   - **Decision**: Make it an optional dependency (`pip install cc-ai-tracker[screenshot]`)
   - Include installation instructions in error message if user tries --screenshot without the dependency

2. **Cross-platform support**: The osascript approach is macOS-only.
   - **Decision**: macOS-only for clipboard (`--screenshot`) is acceptable
   - For Linux/Windows users: show message directing them to use `--path` instead
   - Error message: "Clipboard support is only available on macOS. Use --path to save to a file."

3. **Image quality settings**: Use sensible defaults optimized for social media (X, LinkedIn, etc.)
   - **Scale**: 2.0 (high DPI for retina displays)
   - **Console width**: 100 columns (readable without wrapping)
   - **Theme**: MONOKAI (dark theme with good contrast)
   - Do not expose these as CLI flags initially - keep it simple

4. **Conflict with `--plain`**: Screenshot requires Rich formatting.
   - **Decision**: Show error message if both `--plain` and `--screenshot` are used together
   - Error message: "Cannot use --screenshot with --plain. Screenshots require Rich formatting."
