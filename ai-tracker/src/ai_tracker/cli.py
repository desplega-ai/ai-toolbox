"""CLI entry point for ai-tracker."""

import click

from . import __version__


@click.group()
@click.version_option(version=__version__)
def main() -> None:
    """AI Tracker - Track AI-generated vs human-made code changes."""
    pass


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
    if needs_export:
        from io import StringIO
        # Record to memory, don't output to terminal
        console = Console(record=True, width=100, file=StringIO(), force_terminal=True)
    else:
        console = None

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


@main.command()
def install() -> None:
    """Install all hooks (Claude Code + git)."""
    from .git.install import install_git_hooks
    from .setup import install_claude_hooks

    print("=== Installing Claude Code hooks ===\n")
    install_claude_hooks()
    print("\n=== Installing git hooks ===\n")
    install_git_hooks(global_install=True)


@main.command()
def uninstall() -> None:
    """Uninstall all hooks (Claude Code + git)."""
    from .git.install import uninstall_git_hooks
    from .setup import uninstall_claude_hooks

    print("=== Removing Claude Code hooks ===\n")
    uninstall_claude_hooks()
    print("\n=== Removing git hooks ===\n")
    uninstall_git_hooks()


@main.command()
def setup() -> None:
    """Install Claude Code hooks only."""
    from .setup import install_claude_hooks

    install_claude_hooks()


@main.command("git-install")
@click.option("--global", "global_install", is_flag=True, default=True, help="Install globally")
def git_install(global_install: bool) -> None:
    """Install git hooks."""
    from .git.install import install_git_hooks

    install_git_hooks(global_install=global_install)


@main.command("git-uninstall")
def git_uninstall() -> None:
    """Uninstall git hooks."""
    from .git.install import uninstall_git_hooks

    uninstall_git_hooks()


@main.command("git-post-commit")
def git_post_commit() -> None:
    """Run post-commit hook (called by git)."""
    from .git.post_commit import run_post_commit

    run_post_commit()


@main.command("hook-post-tool")
def hook_post_tool() -> None:
    """Run PostToolUse hook (called by Claude Code)."""
    from .hooks.log_claude_edit import run_hook

    run_hook()


@main.command("hook-pre-tool")
def hook_pre_tool() -> None:
    """Run PreToolUse hook (called by Claude Code)."""
    from .hooks.capture_before_write import run_hook

    run_hook()


if __name__ == "__main__":
    main()
