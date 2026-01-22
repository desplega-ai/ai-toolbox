"""Display module for ai-tracker statistics using Rich and Plotext."""

from rich.console import Console
from rich.panel import Panel
from rich.table import Table

from .query import get_global_stats, get_per_repo_stats, get_stats, get_time_series

_console = Console()


def display_stats(
    days: int = 30,
    repo: str | None = None,
    show_chart: bool = False,
    plain: bool = False,
    console: Console | None = None,
) -> None:
    """Display AI vs human code statistics.

    Args:
        days: Number of days for chart and per-repo breakdown
        repo: Optional repository name to filter by
        show_chart: Whether to show ASCII chart
        plain: Whether to use plain output without borders
        console: Optional Console instance for recording output
    """
    c = console or _console
    # Use all-time stats for summary, time-windowed for chart/repos
    global_stats = get_global_stats()

    # Check if we have any data
    if global_stats["total_commits"] == 0:
        if plain:
            c.print("No commits tracked yet.")
            c.print()
            c.print("Make sure:")
            c.print("1. Claude Code hooks are installed: ai-tracker setup")
            c.print("2. Git hooks are installed: ai-tracker git-install")
            c.print("3. You've made commits after installing the hooks")
        else:
            c.print(
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

    # Convert global stats format to match display functions
    stats = {
        "ai_lines_added": global_stats["total_ai_lines_added"],
        "ai_lines_removed": global_stats["total_ai_lines_removed"],
        "human_lines_added": global_stats["total_human_lines_added"],
        "human_lines_removed": global_stats["total_human_lines_removed"],
        "total_commits": global_stats["total_commits"],
        "ai_percent_added": global_stats["ai_percent_added"],
        "ai_percent_removed": global_stats["ai_percent_removed"],
        "human_percent_added": global_stats["human_percent_added"],
        "human_percent_removed": global_stats["human_percent_removed"],
    }

    # Summary panel - all time
    title = "AI vs Human Code Stats (All Time)"
    if repo:
        # If filtering by repo, use time-windowed stats instead
        stats = get_stats(days=days, repo=repo)
        title = f"AI vs Human Code Stats - {repo}"

    total_added = stats["ai_lines_added"] + stats["human_lines_added"]
    total_removed = stats["ai_lines_removed"] + stats["human_lines_removed"]

    if plain:
        _display_stats_plain(title, stats, total_added, total_removed, days, repo, console=c)
    else:
        _display_stats_rich(title, stats, total_added, total_removed, days, repo, console=c)

    # ASCII chart
    if show_chart:
        _display_chart(days=days, console=c)


def _display_stats_plain(
    title: str,
    stats: dict,
    total_added: int,
    total_removed: int,
    days: int,
    repo: str | None,
    console: Console | None = None,
) -> None:
    """Display stats in plain text format."""
    c = console or _console
    c.print(title)
    c.print("=" * len(title))
    c.print()
    c.print(f"{'Metric':<16} {'AI':>24} {'Human':>24} {'Total':>12}")
    c.print("-" * 80)
    c.print(
        f"{'Lines Added':<16} "
        f"{stats['ai_lines_added']:>14,} ({stats['ai_percent_added']:>4.1f}%) "
        f"{stats['human_lines_added']:>14,} ({stats['human_percent_added']:>4.1f}%) "
        f"{total_added:>12,}"
    )
    c.print(
        f"{'Lines Removed':<16} "
        f"{stats['ai_lines_removed']:>14,} ({stats['ai_percent_removed']:>4.1f}%) "
        f"{stats['human_lines_removed']:>14,} ({stats['human_percent_removed']:>4.1f}%) "
        f"{total_removed:>12,}"
    )
    c.print()
    c.print(f"Total Commits: {stats['total_commits']:,}")

    # Per-repo breakdown (only if not filtering by repo)
    if not repo:
        repo_stats = get_per_repo_stats(days=days)
        if repo_stats:
            c.print()
            c.print("By Repository")
            c.print("-" * 70)
            c.print(f"{'Repository':<30} {'Commits':>8} {'AI Lines':>12} {'Human Lines':>12} {'AI %':>8}")
            c.print("-" * 70)
            for r in repo_stats[:10]:
                c.print(
                    f"{r['repo_name']:<30} "
                    f"{r['total_commits']:>8} "
                    f"{r['ai_lines_added']:>12,} "
                    f"{r['human_lines_added']:>12,} "
                    f"{r['ai_percent']:>7.0f}%"
                )


def _display_stats_rich(
    title: str,
    stats: dict,
    total_added: int,
    total_removed: int,
    days: int,
    repo: str | None,
    console: Console | None = None,
) -> None:
    """Display stats with Rich formatting."""
    c = console or _console
    # Create summary table
    summary = Table(show_header=True, header_style="bold", box=None)
    summary.add_column("Metric", style="dim")
    summary.add_column("AI", justify="right", style="cyan")
    summary.add_column("Human", justify="right", style="green")
    summary.add_column("Total", justify="right")

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

    c.print(Panel(summary, title=title, border_style="blue"))

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

            c.print()
            c.print(Panel(repo_table, title="By Repository", border_style="dim"))


def _make_bar(percent: float, width: int = 10) -> str:
    """Make a simple ASCII bar chart segment."""
    filled = int(percent / 100 * width)
    return "[cyan]" + "█" * filled + "[/cyan][dim]" + "░" * (width - filled) + "[/dim]"


def _display_chart(days: int = 30, console: Console | None = None) -> None:
    """Display simple vertical ASCII bar chart."""
    c = console or _console
    time_data = get_time_series(days=days)
    if not time_data:
        return

    c.print()
    c.print("[bold]Lines Added Over Time[/bold]")
    c.print()

    # Chart dimensions
    height = 10
    col_width = 7

    # Find max for scaling
    max_lines = max((d["ai_lines"] + d["human_lines"]) for d in time_data) or 1

    # Build columns for each day
    columns = []
    for d in time_data:
        ai = d["ai_lines"]
        human = d["human_lines"]
        total = ai + human

        # Calculate heights
        total_height = int((total / max_lines) * height)
        ai_height = int((ai / max_lines) * height) if total > 0 else 0
        human_height = total_height - ai_height

        columns.append({
            "date": d["period"][5:],  # MM-DD
            "ai_height": ai_height,
            "human_height": human_height,
            "ai": ai,
            "human": human,
        })

    # Y-axis label width
    y_label_width = len(f"{max_lines:,}") + 1

    # Render rows from top to bottom
    for row in range(height, 0, -1):
        # Y-axis label (show at top, middle, bottom)
        if row == height:
            y_label = f"{max_lines:>,}"
        elif row == height // 2:
            y_label = f"{max_lines // 2:>,}"
        elif row == 1:
            y_label = "0"
        else:
            y_label = ""

        line = f"{y_label:>{y_label_width}} │ "

        for col in columns:
            ai_h = col["ai_height"]
            human_h = col["human_height"]

            if row <= ai_h:
                line += "[cyan]█████[/cyan]  "
            elif row <= ai_h + human_h:
                line += "[green]░░░░░[/green]  "
            else:
                line += "       "
        c.print(line)

    # X-axis line
    c.print(" " * y_label_width + " └─" + "─" * (len(columns) * col_width))

    # Date labels
    date_line = " " * y_label_width + "   "
    for col in columns:
        date_line += f"{col['date']}  "
    c.print(date_line)

    # Legend
    c.print()
    c.print(" " * y_label_width + "   [cyan]█[/cyan] AI  [green]░[/green] Human")


def display_global_stats(db_path=None, plain: bool = False, console: Console | None = None) -> None:
    """Display all-time global statistics.

    Args:
        db_path: Optional path to database (for testing)
        plain: Whether to use plain output without borders
        console: Optional Console instance for recording output
    """
    c = console or _console
    stats = get_global_stats(db_path=db_path)

    # Check if we have any data
    if stats["total_commits"] == 0:
        if plain:
            c.print("No commits tracked yet.")
            c.print()
            c.print("Make sure:")
            c.print("1. Claude Code hooks are installed: ai-tracker setup")
            c.print("2. Git hooks are installed: ai-tracker git-install")
            c.print("3. You've made commits after installing the hooks")
        else:
            c.print(
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

    if plain:
        _display_global_stats_plain(stats, earliest_date, console=c)
    else:
        _display_global_stats_rich(stats, earliest_date, console=c)


def _display_global_stats_plain(stats: dict, earliest_date: str, console: Console | None = None) -> None:
    """Display global stats in plain text format."""
    c = console or _console
    c.print("Global Stats (All Time)")
    c.print("=" * 40)
    c.print()
    c.print(f"Total Commits:    {stats['total_commits']:,}")
    c.print(f"Tracking Since:   {earliest_date}")
    c.print()
    c.print(f"Lines Added (AI):       {stats['total_ai_lines_added']:>10,} ({stats['ai_percent_added']:.1f}%)")
    c.print(f"Lines Added (Human):    {stats['total_human_lines_added']:>10,} ({stats['human_percent_added']:.1f}%)")
    c.print(f"Lines Removed (AI):     {stats['total_ai_lines_removed']:>10,} ({stats['ai_percent_removed']:.1f}%)")
    c.print(f"Lines Removed (Human):  {stats['total_human_lines_removed']:>10,} ({stats['human_percent_removed']:.1f}%)")
    c.print()
    c.print("Commit Breakdown")
    c.print(f"  100% AI:        {stats['ai_only_commits']:>6,} ({stats['percent_ai_only']:.1f}%)")
    c.print(f"  100% Human:     {stats['human_only_commits']:>6,} ({stats['percent_human_only']:.1f}%)")
    c.print(f"  Mixed:          {stats['mixed_commits']:>6,} ({stats['percent_mixed']:.1f}%)")
    c.print()
    c.print(f"Commits with AI:        {stats['ai_only_commits'] + stats['mixed_commits']:,} ({stats['percent_commits_with_ai']:.1f}%)")
    c.print(f"Avg AI % per commit:    {stats['avg_ai_percent_per_commit']:.1f}%")


def _display_global_stats_rich(stats: dict, earliest_date: str, console: Console | None = None) -> None:
    """Display global stats with Rich formatting."""
    c = console or _console
    # Create the stats table
    table = Table(show_header=False, box=None, padding=(0, 2))
    table.add_column("Metric", style="dim")
    table.add_column("Value", justify="right")

    # Totals section
    table.add_row("Total Commits", f"[bold]{stats['total_commits']:,}[/bold]")
    table.add_row("Tracking Since", earliest_date)
    table.add_row("", "")

    # Lines breakdown
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

    c.print(Panel(table, title="Global Stats (All Time)", border_style="blue"))
