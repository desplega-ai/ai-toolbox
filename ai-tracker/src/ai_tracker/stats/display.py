"""Display module for ai-tracker statistics using Rich and Plotext."""

from rich.console import Console
from rich.panel import Panel
from rich.table import Table

from .query import get_global_stats, get_per_repo_stats, get_stats, get_time_series

console = Console()


def display_stats(days: int = 30, repo: str | None = None, show_chart: bool = False) -> None:
    """Display AI vs human code statistics.

    Args:
        days: Number of days to show stats for
        repo: Optional repository name to filter by
        show_chart: Whether to show ASCII chart
    """
    stats = get_stats(days=days, repo=repo)

    # Check if we have any data
    if stats["total_commits"] == 0:
        console.print(
            Panel(
                f"[yellow]No commits tracked in the last {days} days.[/yellow]\n\n"
                "Make sure:\n"
                "1. Claude Code hooks are installed: [cyan]ai-tracker setup[/cyan]\n"
                "2. Git hooks are installed: [cyan]ai-tracker git-install[/cyan]\n"
                "3. You've made commits after installing the hooks",
                title="No Data",
                border_style="yellow",
            )
        )
        return

    # Summary panel
    title = f"AI vs Human Code Stats - Last {days} Days"
    if repo:
        title += f" ({repo})"

    # Create summary table
    summary = Table(show_header=True, header_style="bold", box=None)
    summary.add_column("Metric", style="dim")
    summary.add_column("AI", justify="right", style="cyan")
    summary.add_column("Human", justify="right", style="green")
    summary.add_column("Total", justify="right")

    total_added = stats["ai_lines_added"] + stats["human_lines_added"]
    total_removed = stats["ai_lines_removed"] + stats["human_lines_removed"]

    summary.add_row(
        "Lines Added",
        f"{stats['ai_lines_added']:,} ({stats['ai_percent_added']:.1f}%)",
        f"{stats['human_lines_added']:,} ({stats['human_percent_added']:.1f}%)",
        f"{total_added:,}",
    )
    summary.add_row(
        "Lines Removed",
        f"{stats['ai_lines_removed']:,} ({stats['ai_percent_removed']:.1f}%)",
        f"{stats['human_lines_removed']:,} ({stats['human_percent_removed']:.1f}%)",
        f"{total_removed:,}",
    )
    summary.add_row("", "", "", "")
    summary.add_row("Total Commits", "", "", f"{stats['total_commits']:,}")

    console.print(Panel(summary, title=title, border_style="blue"))

    # Per-repo breakdown (only if not filtering by repo)
    if not repo:
        repo_stats = get_per_repo_stats(days=days)
        if repo_stats:
            repo_table = Table(show_header=True, header_style="bold")
            repo_table.add_column("Repository")
            repo_table.add_column("Commits", justify="right")
            repo_table.add_column("AI Lines", justify="right", style="cyan")
            repo_table.add_column("Human Lines", justify="right", style="green")
            repo_table.add_column("AI %", justify="right")

            for r in repo_stats[:10]:  # Top 10 repos
                ai_bar = _make_bar(r["ai_percent"], 10)
                repo_table.add_row(
                    r["repo_name"],
                    str(r["total_commits"]),
                    f"{r['ai_lines_added']:,}",
                    f"{r['human_lines_added']:,}",
                    f"{ai_bar} {r['ai_percent']:3.0f}%",
                )

            console.print()
            console.print(Panel(repo_table, title="By Repository", border_style="dim"))

    # ASCII chart
    if show_chart:
        _display_chart(days=days)


def _make_bar(percent: float, width: int = 10) -> str:
    """Make a simple ASCII bar chart segment."""
    filled = int(percent / 100 * width)
    return "[cyan]" + "█" * filled + "[/cyan][dim]" + "░" * (width - filled) + "[/dim]"


def _display_chart(days: int = 30) -> None:
    """Display ASCII time series chart using plotext."""
    try:
        import plotext as plt
    except ImportError:
        console.print("[yellow]plotext not installed, skipping chart[/yellow]")
        return

    time_data = get_time_series(days=days)
    if not time_data:
        return

    periods = [d["period"] for d in time_data]
    ai_lines = [d["ai_lines"] for d in time_data]
    human_lines = [d["human_lines"] for d in time_data]

    plt.clear_figure()
    plt.theme("dark")
    plt.title("Lines Added Over Time")
    plt.xlabel("Date")
    plt.ylabel("Lines")

    # Use simple bar chart with stacked appearance
    plt.bar(periods, ai_lines, label="AI", color="cyan")
    plt.bar(periods, human_lines, label="Human", color="green")

    plt.show()


def display_global_stats(db_path=None) -> None:
    """Display all-time global statistics.

    Args:
        db_path: Optional path to database (for testing)
    """
    stats = get_global_stats(db_path=db_path)

    # Check if we have any data
    if stats["total_commits"] == 0:
        console.print(
            Panel(
                "[yellow]No commits tracked yet.[/yellow]\n\n"
                "Make sure:\n"
                "1. Claude Code hooks are installed: [cyan]ai-tracker setup[/cyan]\n"
                "2. Git hooks are installed: [cyan]ai-tracker git-install[/cyan]\n"
                "3. You've made commits after installing the hooks",
                title="No Data",
                border_style="yellow",
            )
        )
        return

    # Format the tracking period
    earliest = stats["earliest_commit"]
    if earliest:
        earliest_date = earliest[:10]  # Extract YYYY-MM-DD
    else:
        earliest_date = "N/A"

    # Create the stats table
    table = Table(show_header=False, box=None, padding=(0, 2))
    table.add_column("Metric", style="dim")
    table.add_column("Value", justify="right")

    # Totals section
    table.add_row("Total Commits", f"[bold]{stats['total_commits']:,}[/bold]")
    table.add_row("Tracking Since", earliest_date)
    table.add_row("", "")

    # Lines breakdown
    total_added = stats["total_ai_lines_added"] + stats["total_human_lines_added"]
    total_removed = stats["total_ai_lines_removed"] + stats["total_human_lines_removed"]

    table.add_row(
        "Lines Added (AI)",
        f"[cyan]{stats['total_ai_lines_added']:,}[/cyan] ({stats['ai_percent_added']:.1f}%)",
    )
    table.add_row(
        "Lines Added (Human)",
        f"[green]{stats['total_human_lines_added']:,}[/green] ({stats['human_percent_added']:.1f}%)",
    )
    table.add_row(
        "Lines Removed (AI)",
        f"[cyan]{stats['total_ai_lines_removed']:,}[/cyan] ({stats['ai_percent_removed']:.1f}%)",
    )
    table.add_row(
        "Lines Removed (Human)",
        f"[green]{stats['total_human_lines_removed']:,}[/green] ({stats['human_percent_removed']:.1f}%)",
    )
    table.add_row("", "")

    # Commit breakdown
    table.add_row("[bold]Commit Breakdown[/bold]", "")
    table.add_row(
        "  100% AI",
        f"{stats['ai_only_commits']:,} ({stats['percent_ai_only']:.1f}%)",
    )
    table.add_row(
        "  100% Human",
        f"{stats['human_only_commits']:,} ({stats['percent_human_only']:.1f}%)",
    )
    table.add_row(
        "  Mixed",
        f"{stats['mixed_commits']:,} ({stats['percent_mixed']:.1f}%)",
    )
    table.add_row("", "")

    # Summary metrics
    table.add_row(
        "Commits with AI",
        f"[bold cyan]{stats['ai_only_commits'] + stats['mixed_commits']:,}[/bold cyan] ({stats['percent_commits_with_ai']:.1f}%)",
    )
    table.add_row(
        "Avg AI % per commit",
        f"[bold]{stats['avg_ai_percent_per_commit']:.1f}%[/bold]",
    )

    console.print(Panel(table, title="Global Stats (All Time)", border_style="blue"))
