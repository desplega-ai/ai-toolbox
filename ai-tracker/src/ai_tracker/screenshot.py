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
