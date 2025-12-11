"""Command-line interface for hn-sql."""

import asyncio
import signal
from pathlib import Path

import click
import duckdb
from rich.console import Console
from rich.table import Table

from .fetcher import HNFetcher
from .writer import PartitionedWriter
from .checkpoint import Checkpoint, CheckpointManager
from .progress import MatrixProgress

console = Console()

# Default data path
DATA_PATH = "data/items/**/*.parquet"


@click.group()
def main():
    """HN data fetcher and Parquet writer."""
    pass


@main.command()
@click.option("--concurrency", "-c", default=35, help="Number of concurrent requests (default: 35, optimal for HN API)")
@click.option("--batch-size", "-b", default=10000, help="Items per batch")
@click.option("--resume/--no-resume", default=True, help="Resume from checkpoint")
@click.option("--output", "-o", default="data/items", help="Output directory")
@click.option("--start", "-s", type=int, default=None, help="Start from this item ID (overrides resume)")
@click.option("--end", "-e", type=int, default=None, help="Stop at this item ID (for testing)")
def fetch(concurrency: int, batch_size: int, resume: bool, output: str, start: int | None, end: int | None):
    """Fetch HN items and write to Parquet.

    Examples:

      # Fetch everything from the beginning
      hn-sql fetch

      # Fetch items 1000-2000 for testing
      hn-sql fetch --start 1000 --end 2000

      # Fetch recent items (last 10000)
      hn-sql fetch --start -10000

      # Resume from checkpoint
      hn-sql fetch --resume
    """
    asyncio.run(_fetch(concurrency, batch_size, resume, output, start, end))


async def _fetch(concurrency: int, batch_size: int, resume: bool, output: str, start: int | None, end: int | None):
    """Async fetch implementation."""
    checkpoint_mgr = CheckpointManager()
    writer = PartitionedWriter(output)

    # Set up signal handler for clean shutdown
    shutdown_event = asyncio.Event()
    loop = asyncio.get_running_loop()

    def signal_handler():
        shutdown_event.set()

    # Register signal handler (only works on Unix)
    try:
        loop.add_signal_handler(signal.SIGINT, signal_handler)
    except NotImplementedError:
        # Windows doesn't support add_signal_handler
        pass

    async with HNFetcher(concurrency=concurrency, shutdown_event=shutdown_event) as fetcher:
        # Get current max item ID
        api_max_id = await fetcher.get_max_item_id()
        console.print(f"[bold]Max item ID (API):[/bold] {api_max_id:,}")

        # Determine end point
        max_id = end if end is not None else api_max_id

        # Determine start point
        if start is not None:
            # Handle negative start (relative to max)
            if start < 0:
                start_id = max(1, api_max_id + start)
                console.print(f"[green]Starting from {start_id:,} (max - {abs(start)})[/green]")
            else:
                start_id = start
                console.print(f"[green]Starting from {start_id:,}[/green]")
            checkpoint = Checkpoint.new(max_id)
        elif resume and checkpoint_mgr.exists():
            checkpoint = checkpoint_mgr.load()
            start_id = checkpoint.last_fetched_id + 1
            checkpoint.max_item_id = max_id
            console.print(f"[yellow]Resuming from item {start_id:,}[/yellow]")
        else:
            checkpoint = Checkpoint.new(max_id)
            start_id = 1
            console.print("[green]Starting fresh fetch[/green]")

        total_items = max_id - start_id + 1
        console.print(f"[cyan]Fetching {total_items:,} items ({start_id:,} → {max_id:,})[/cyan]\n")

        # Create progress display
        progress = MatrixProgress(console)
        progress.start(
            total_start=start_id,
            total_end=max_id,
            max_connections=concurrency,
        )

        # Wire up connection callbacks
        fetcher.set_connection_callbacks(
            on_start=progress.connection_started,
            on_end=progress.connection_ended,
        )

        interrupted = False
        try:
            current_pos = start_id
            while current_pos <= max_id and not shutdown_event.is_set():
                batch_end = min(current_pos + batch_size, max_id + 1)
                item_ids = list(range(current_pos, batch_end))

                # Signal batch start
                progress.start_batch(current_pos, batch_end)

                batch_items = []
                async for item_id, item in fetcher.fetch_items(item_ids):
                    # Check for shutdown after each item
                    if shutdown_event.is_set():
                        break
                    had_data = item is not None
                    if had_data:
                        batch_items.append(item)
                    progress.item_completed(had_data)

                if batch_items:
                    writer.add_items(batch_items)

                # Update checkpoint
                checkpoint.update(batch_end - 1, len(batch_items), len(batch_items))
                writer.flush_all()
                checkpoint_mgr.save(checkpoint)

                current_pos = batch_end

            # Check if we were interrupted
            if shutdown_event.is_set():
                interrupted = True
                progress.stop()
                await fetcher.shutdown()
                console.print("\n[yellow]Interrupted! Saving progress...[/yellow]")
                writer.flush_all()
                checkpoint_mgr.save(checkpoint)
            else:
                # Final flush and save checkpoint
                progress.stop()
                writer.flush_all()
                checkpoint_mgr.save(checkpoint)

        except KeyboardInterrupt:
            # Fallback for platforms without signal handler support
            interrupted = True
            progress.stop()
            await fetcher.shutdown()
            console.print("\n[yellow]Interrupted! Saving progress...[/yellow]")
            writer.flush_all()
            checkpoint_mgr.save(checkpoint)
        finally:
            # Clean up signal handler
            try:
                loop.remove_signal_handler(signal.SIGINT)
            except (NotImplementedError, ValueError):
                pass
            # Always restore cursor in case of any error
            console.show_cursor(True)

    if interrupted:
        console.print("[green]Progress saved. Run 'hn-sql fetch' to resume.[/green]")
        raise SystemExit(0)

    # Print stats
    file_stats = writer.get_stats()
    console.print("\n[bold green]Fetch complete![/bold green]")
    console.print(f"  Partitions: {file_stats['partitions']}")
    console.print(f"  Files: {file_stats['files']}")
    console.print(f"  Total size: {file_stats['total_size_mb']:.1f} MB")
    console.print(f"  Last ID: {checkpoint.last_fetched_id:,}")
    console.print(f"\n[dim]Run 'hn-sql fetch' again to sync new items[/dim]")


@main.command()
@click.option("--tree", "-t", is_flag=True, help="Show partition tree")
def stats(tree: bool):
    """Show statistics about fetched data."""
    import asyncio
    from rich.tree import Tree

    writer = PartitionedWriter()
    file_stats = writer.get_stats()

    # Get current max item ID from API
    async def get_max():
        async with HNFetcher() as f:
            return await f.get_max_item_id()

    try:
        current_max = asyncio.run(get_max())
    except Exception:
        current_max = None

    # Display header
    console.print("\n[bold cyan]═══ HN Data Statistics ═══[/bold cyan]\n")

    # Show API info first
    if current_max:
        console.print(f"[bold]HN API:[/bold]")
        console.print(f"  Current max item ID: {current_max:,}")
        console.print()

    if file_stats["files"] == 0:
        console.print("[yellow]No local data yet. Run 'hn-sql fetch' to start downloading.[/yellow]")
        console.print()
        console.print("[dim]Example: hn-sql fetch --start -1000  # fetch last 1000 items[/dim]")
        return

    # Count total items using DuckDB
    try:
        conn = duckdb.connect()
        result = conn.execute(f"""
            SELECT count(*) as total,
                   min(id) as min_id,
                   max(id) as max_id
            FROM read_parquet('data/items/**/*.parquet', hive_partitioning=true)
        """).fetchone()
        total_items, min_id, max_id = result
    except Exception:
        total_items, min_id, max_id = None, None, None

    console.print("[bold]Storage:[/bold]")
    console.print(f"  Partitions: {file_stats['partitions']}")
    console.print(f"  Files: {file_stats['files']}")
    console.print(f"  Total size: {file_stats['total_size_mb']:.1f} MB")
    if total_items and file_stats['files']:
        avg_items = total_items / file_stats['files']
        console.print(f"  Avg items/file: {avg_items:,.0f}")

    if total_items:
        console.print(f"\n[bold]Data Coverage:[/bold]")
        console.print(f"  Total items: {total_items:,}")
        console.print(f"  ID range: {min_id:,} - {max_id:,}")
        if current_max:
            remaining = current_max - max_id
            pct = (max_id / current_max) * 100
            console.print(f"  Coverage: {pct:.2f}% ({remaining:,} items remaining)")

    # Show checkpoint status if exists
    checkpoint_mgr = CheckpointManager()
    if checkpoint_mgr.exists():
        cp = checkpoint_mgr.load()
        console.print(f"\n[bold]Active Checkpoint:[/bold]")
        console.print(f"  Last fetched ID: {cp.last_fetched_id:,}")
        console.print(f"  Items fetched: {cp.items_fetched:,}")
        console.print(f"  Started: {cp.started_at}")

    # Show partition tree if requested
    if tree:
        console.print(f"\n[bold]Partition Tree:[/bold]")
        data_tree = Tree("[bold]data/items[/bold]")

        partitions = sorted(Path("data/items").glob("year=*/month=*"))
        years = {}
        for p in partitions:
            year = p.parent.name
            month = p.name
            if year not in years:
                years[year] = []
            files = list(p.glob("*.parquet"))
            size_mb = sum(f.stat().st_size for f in files) / (1024 * 1024)
            years[year].append((month, len(files), size_mb))

        year_list = sorted(years.keys())
        # Show first 3, middle indicator, last 3
        if len(year_list) > 7:
            show_years = year_list[:3] + ["..."] + year_list[-3:]
        else:
            show_years = year_list

        for year in show_years:
            if year == "...":
                data_tree.add(f"[dim]... ({len(year_list) - 6} more years)[/dim]")
                continue

            year_branch = data_tree.add(f"[blue]{year}[/blue]")
            months = years[year]
            # Show first 2 and last 2 months if many
            if len(months) > 5:
                show_months = months[:2] + [("...", 0, 0)] + months[-2:]
            else:
                show_months = months

            for month, file_count, size_mb in show_months:
                if month == "...":
                    year_branch.add(f"[dim]... ({len(months) - 4} more months)[/dim]")
                else:
                    year_branch.add(f"{month} ({file_count} files, {size_mb:.1f} MB)")

        console.print(data_tree)


@main.command()
@click.option("--data", "-d", is_flag=True, help="Also delete all downloaded data")
@click.option("--yes", "-y", is_flag=True, help="Skip confirmation prompt")
def reset(data: bool, yes: bool):
    """Reset checkpoint and optionally delete all data.

    Examples:

      # Delete checkpoint only
      hn-sql reset

      # Delete checkpoint and all data (with confirmation)
      hn-sql reset --data

      # Delete everything without confirmation
      hn-sql reset --data --yes
    """
    import shutil

    checkpoint_mgr = CheckpointManager()
    data_dir = Path("data/items")

    # Show what will be deleted
    has_checkpoint = checkpoint_mgr.exists()
    has_data = data_dir.exists() and any(data_dir.glob("**/*.parquet"))

    if not has_checkpoint and not (data and has_data):
        console.print("[yellow]Nothing to reset.[/yellow]")
        return

    console.print("[bold]Will delete:[/bold]")
    if has_checkpoint:
        console.print("  - Checkpoint file")
    if data and has_data:
        # Count files and size
        files = list(data_dir.glob("**/*.parquet"))
        size_mb = sum(f.stat().st_size for f in files) / (1024 * 1024)
        console.print(f"  - Data directory ({len(files)} files, {size_mb:.1f} MB)")

    if not yes:
        if not click.confirm("\nProceed?"):
            console.print("[dim]Cancelled.[/dim]")
            return

    # Delete checkpoint
    if has_checkpoint:
        checkpoint_mgr.delete()
        console.print("[green]✓ Checkpoint deleted[/green]")

    # Delete data
    if data and has_data:
        shutil.rmtree(data_dir)
        console.print("[green]✓ Data deleted[/green]")


def _get_connection(data_path: str) -> duckdb.DuckDBPyConnection:
    """Create a DuckDB connection with the HN data as a view."""
    conn = duckdb.connect()
    conn.execute(f"""
        CREATE VIEW hn AS
        SELECT * FROM read_parquet('{data_path}', hive_partitioning=true)
    """)
    return conn


def _print_result(result, limit: int | None = None):
    """Print query results as a rich table."""
    columns = result.description
    rows = result.fetchall()

    if not rows:
        console.print("[dim]No results[/dim]")
        return

    table = Table(show_header=True, header_style="bold")
    for col in columns:
        table.add_column(col[0])

    display_rows = rows[:limit] if limit else rows
    for row in display_rows:
        table.add_row(*[str(v) if v is not None else "[dim]NULL[/dim]" for v in row])

    console.print(table)

    if limit and len(rows) > limit:
        console.print(f"[dim]... showing {limit} of {len(rows)} rows[/dim]")


QUERY_HELP = """
Query HN data using SQL. The data is available as a table called 'hn'.

\b
Examples:
  hn-sql query "SELECT count(*) FROM hn"
  hn-sql query "SELECT type, count(*) as cnt FROM hn GROUP BY type"
  hn-sql query "SELECT title, score FROM hn WHERE type='story' ORDER BY score DESC LIMIT 10"
  hn-sql query 'SELECT "by", count(*) as posts FROM hn GROUP BY "by" ORDER BY posts DESC LIMIT 10'
  hn-sql query -i  # Interactive mode

\b
Available columns:
  id, type, "by" (quoted - reserved word), time, text, url, title, score,
  descendants, parent, kids, dead, deleted, poll, parts, year, month
"""


@main.command(help=QUERY_HELP)
@click.argument("sql", required=False)
@click.option("--interactive", "-i", is_flag=True, help="Start interactive SQL shell")
@click.option("--limit", "-l", default=100, help="Max rows to display (default 100, 0 for unlimited)")
@click.option("--data", "-d", default=DATA_PATH, help="Path to parquet files")
def query(sql: str | None, interactive: bool, limit: int, data: str):
    """Query HN data with SQL."""
    # Check data exists
    data_dir = Path(data).parent.parent if "**" in data else Path(data).parent
    if not data_dir.exists() or not list(data_dir.glob("**/*.parquet")):
        console.print("[yellow]No data found. Run 'hn-sql fetch' first.[/yellow]")
        return

    conn = _get_connection(data)
    display_limit = limit if limit > 0 else None

    if interactive:
        _interactive_shell(conn, display_limit)
    elif sql:
        try:
            result = conn.execute(sql)
            _print_result(result, display_limit)
        except duckdb.Error as e:
            console.print(f"[red]Error:[/red] {e}")
    else:
        # No SQL and not interactive - show help
        ctx = click.get_current_context()
        click.echo(ctx.get_help())


def _interactive_shell(conn: duckdb.DuckDBPyConnection, limit: int | None):
    """Run an interactive SQL shell."""
    console.print("[bold]HN SQL Interactive Shell[/bold]")
    console.print("Type SQL queries to execute. Special commands:")
    console.print("  [cyan].help[/cyan]    - Show example queries")
    console.print("  [cyan].schema[/cyan]  - Show table schema")
    console.print("  [cyan].tables[/cyan]  - Show available tables")
    console.print("  [cyan].quit[/cyan]    - Exit (or Ctrl+D)")
    console.print()

    while True:
        try:
            sql = console.input("[bold green]hn>[/bold green] ").strip()

            if not sql:
                continue

            # Handle special commands
            if sql.lower() in (".quit", ".exit", "quit", "exit"):
                break
            elif sql.lower() == ".help":
                _show_help()
                continue
            elif sql.lower() == ".schema":
                result = conn.execute("DESCRIBE hn")
                _print_result(result)
                continue
            elif sql.lower() == ".tables":
                result = conn.execute("SHOW TABLES")
                _print_result(result)
                continue

            # Execute SQL
            try:
                result = conn.execute(sql)
                _print_result(result, limit)
            except duckdb.Error as e:
                console.print(f"[red]Error:[/red] {e}")

        except (EOFError, KeyboardInterrupt):
            console.print("\n[dim]Goodbye![/dim]")
            break


def _show_help():
    """Show example queries."""
    console.print("\n[bold]Example Queries:[/bold]\n")
    examples = [
        ("Count items by type", "SELECT type, count(*) as cnt FROM hn GROUP BY type ORDER BY cnt DESC"),
        ("Top stories by score", 'SELECT title, score, "by" FROM hn WHERE type=\'story\' ORDER BY score DESC LIMIT 10'),
        ("Most active users", 'SELECT "by", count(*) as posts FROM hn WHERE "by" IS NOT NULL GROUP BY "by" ORDER BY posts DESC LIMIT 10'),
        ("Stories per year", "SELECT year, count(*) FROM hn WHERE type='story' GROUP BY year ORDER BY year"),
        ("Recent comments", 'SELECT text, "by", time FROM hn WHERE type=\'comment\' ORDER BY time DESC LIMIT 5'),
        ("Search titles", "SELECT title, url FROM hn WHERE title ILIKE '%python%' LIMIT 10"),
    ]
    for desc, sql in examples:
        console.print(f"[cyan]-- {desc}[/cyan]")
        console.print(f"{sql};\n")


if __name__ == "__main__":
    main()
