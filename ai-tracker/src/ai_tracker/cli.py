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
def stats(days: int, repo: str | None, chart: bool) -> None:
    """Show AI vs human code statistics."""
    from .stats.display import display_stats

    display_stats(days=days, repo=repo, show_chart=chart)


@main.command()
def setup() -> None:
    """Install Claude Code hooks."""
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


if __name__ == "__main__":
    main()
