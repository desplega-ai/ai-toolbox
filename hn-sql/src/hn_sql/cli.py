"""Command-line interface for hn-sql."""

import asyncio
import signal
import time
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
@click.option("--concurrency", "-c", default=100, help="Number of concurrent requests")
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
        # Preserve partition_style from existing checkpoint if present
        existing_style = None
        if checkpoint_mgr.exists():
            existing_cp = checkpoint_mgr.load()
            existing_style = existing_cp.partition_style

        if start is not None:
            # Handle negative start (relative to max)
            if start < 0:
                start_id = max(1, api_max_id + start)
                console.print(f"[green]Starting from {start_id:,} (max - {abs(start)})[/green]")
            else:
                start_id = start
                console.print(f"[green]Starting from {start_id:,}[/green]")
            checkpoint = Checkpoint.new(max_id, partition_style=existing_style or "hive")
        elif resume and checkpoint_mgr.exists():
            checkpoint = checkpoint_mgr.load()
            start_id = checkpoint.last_fetched_id + 1
            checkpoint.max_item_id = max_id
            console.print(f"[yellow]Resuming from item {start_id:,}[/yellow]")
        else:
            checkpoint = Checkpoint.new(max_id, partition_style=existing_style or "hive")
            start_id = 1
            console.print("[green]Starting fresh fetch[/green]")

        # Create writer with checkpoint's partition style
        writer = PartitionedWriter(output, partition_style=checkpoint.partition_style)

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
        console.print(f"  Partition style: {cp.partition_style}")
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


MIGRATE_HELP = """
Consolidate all data into a single sorted Parquet file.

This handles both old hive-partitioned data (year/month) and new flat
chunk files, consolidating everything into one sorted file for optimal
query performance.

\b
The migration:
  1. Reads all existing data (hive partitions + flat chunks)
  2. Sorts by ID (correlates with time, enables zonemap filtering)
  3. Writes a single consolidated hn.parquet file
  4. Optionally swaps old and new directories

Run with --dry-run first to see what would happen.
"""


@main.command(help=MIGRATE_HELP)
@click.option("--swap", "-s", is_flag=True, help="Swap old/new directories after migration")
@click.option("--dry-run", "-n", is_flag=True, help="Show what would be done without doing it")
@click.option("--yes", "-y", is_flag=True, help="Skip confirmation prompt")
def migrate(swap: bool, dry_run: bool, yes: bool):
    """Consolidate data into a single sorted Parquet file."""
    import shutil

    old_dir = Path("data/items")
    new_dir = Path("data/items_v2")
    backup_dir = Path("data/items_old")

    # Check for different data formats
    hive_files = list(old_dir.glob("year=*/month=*/*.parquet")) if old_dir.exists() else []
    flat_files = list(old_dir.glob("*.parquet")) if old_dir.exists() else []

    if not hive_files and not flat_files:
        console.print("[yellow]No data found in data/items/[/yellow]")
        console.print("[dim]Looking for: data/items/*.parquet or data/items/year=*/month=*/*.parquet[/dim]")
        return

    # Build query to read all formats
    conn = duckdb.connect()
    sources = []

    if hive_files:
        sources.append(f"""
            SELECT * EXCLUDE (year, month)
            FROM read_parquet('data/items/year=*/month=*/*.parquet', hive_partitioning=true)
        """)

    if flat_files:
        sources.append(f"""
            SELECT * FROM read_parquet('data/items/*.parquet')
        """)

    union_query = " UNION ALL ".join(sources)

    try:
        result = conn.execute(f"""
            SELECT count(*) as total,
                   min(id) as min_id,
                   max(id) as max_id
            FROM ({union_query})
        """).fetchone()
        total_items, min_id, max_id = result
    except Exception as e:
        console.print(f"[red]Error reading data:[/red] {e}")
        return

    # Get file stats
    all_files = hive_files + flat_files
    old_size_mb = sum(f.stat().st_size for f in all_files) / (1024 * 1024)

    console.print("\n[bold cyan]═══ Migration Plan ═══[/bold cyan]\n")
    console.print("[bold]Source data:[/bold]")
    if hive_files:
        console.print(f"  Hive partitions: {len(hive_files)} files")
    if flat_files:
        console.print(f"  Flat files: {len(flat_files)} files")
    console.print(f"  Total items: {total_items:,}")
    console.print(f"  ID range: {min_id:,} → {max_id:,}")
    console.print(f"  Size: {old_size_mb:.1f} MB")

    console.print(f"\n[bold]Target:[/bold]")
    console.print(f"  Output: {new_dir}/hn.parquet")
    console.print(f"  Sorted by: id (ascending)")

    if swap:
        console.print(f"\n[bold]After migration:[/bold]")
        console.print(f"  {old_dir}/ → {backup_dir}/ (backup)")
        console.print(f"  {new_dir}/ → {old_dir}/ (active)")

    if dry_run:
        console.print("\n[yellow]Dry run - no changes made[/yellow]")
        return

    if not yes:
        console.print()
        if not click.confirm("Proceed with migration?"):
            console.print("[dim]Cancelled.[/dim]")
            return

    # Create new directory
    new_dir.mkdir(parents=True, exist_ok=True)

    console.print(f"\n[bold]Migrating...[/bold]")
    start_time = time.time()

    # Export sorted data using DuckDB
    output_file = new_dir / "hn.parquet"
    try:
        conn.execute(f"""
            COPY (
                SELECT * FROM ({union_query}) ORDER BY id
            ) TO '{output_file}' (
                FORMAT PARQUET,
                COMPRESSION ZSTD,
                COMPRESSION_LEVEL 3,
                ROW_GROUP_SIZE 100000
            )
        """)

        elapsed = time.time() - start_time
        console.print(f"[green]✓ Data exported in {_format_time(elapsed)}[/green]")

        new_size_mb = output_file.stat().st_size / (1024 * 1024)
        console.print(f"  Output: {output_file}")
        console.print(f"  Size: {new_size_mb:.1f} MB")

    except Exception as e:
        console.print(f"[red]Error during migration:[/red] {e}")
        return

    # Swap directories if requested
    if swap:
        console.print(f"\n[bold]Swapping directories...[/bold]")
        try:
            # Move old to backup
            if backup_dir.exists():
                shutil.rmtree(backup_dir)
            old_dir.rename(backup_dir)
            console.print(f"[green]✓ {old_dir}/ → {backup_dir}/[/green]")

            # Move new to active
            new_dir.rename(old_dir)
            console.print(f"[green]✓ {new_dir}/ → {old_dir}/[/green]")

            console.print(f"\n[dim]Old data backed up to {backup_dir}/[/dim]")
            console.print(f"[dim]Run 'rm -rf {backup_dir}' to delete backup[/dim]")

            # Update checkpoint to use flat partition style
            checkpoint_mgr = CheckpointManager()
            if checkpoint_mgr.exists():
                cp = checkpoint_mgr.load()
                cp.partition_style = "flat"
                checkpoint_mgr.save(cp)
                console.print(f"[green]✓ Checkpoint updated to flat partition style[/green]")
        except Exception as e:
            console.print(f"[red]Error swapping directories:[/red] {e}")
            return

    console.print(f"\n[bold green]Migration complete![/bold green]")

    if not swap:
        console.print(f"\n[dim]New data is in {new_dir}/[/dim]")
        console.print(f"[dim]To use it, run: hn-sql migrate --swap[/dim]")
        console.print(f"[dim]Or query directly: SELECT * FROM read_parquet('{new_dir}/*.parquet')[/dim]")


def _format_time(seconds: float) -> str:
    """Format execution time in a human-readable way."""
    if seconds < 0.001:
        return f"{seconds * 1_000_000:.0f}µs"
    elif seconds < 1:
        return f"{seconds * 1000:.1f}ms"
    elif seconds < 60:
        return f"{seconds:.2f}s"
    else:
        mins = int(seconds // 60)
        secs = seconds % 60
        return f"{mins}m {secs:.1f}s"


def _get_connection(data_path: str) -> duckdb.DuckDBPyConnection:
    """Create a DuckDB connection with the HN data as a view."""
    conn = duckdb.connect()
    # union_by_name handles schema differences between old (with year/month) and new (without) files
    conn.execute(f"""
        CREATE VIEW hn AS
        SELECT id, type, "by", time, text, url, title, score, descendants,
               parent, kids, dead, deleted, poll, parts
        FROM read_parquet('{data_path}', hive_partitioning=true, union_by_name=true)
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
            start_time = time.perf_counter()
            result = conn.execute(sql)
            _print_result(result, display_limit)
            elapsed = time.perf_counter() - start_time
            console.print(f"[dim]Executed in {_format_time(elapsed)}[/dim]")
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
                start_time = time.perf_counter()
                result = conn.execute(sql)
                _print_result(result, limit)
                elapsed = time.perf_counter() - start_time
                console.print(f"[dim]Executed in {_format_time(elapsed)}[/dim]")
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


@main.command()
@click.option("--port", "-p", default=8000, help="Port to run the API server on")
@click.option("--host", "-h", default="127.0.0.1", help="Host to bind the server to")
@click.option("--reload", "-r", is_flag=True, help="Enable auto-reload for development")
@click.option("--data", "-d", default=DATA_PATH, help="Path to parquet files")
def api(port: int, host: str, reload: bool, data: str):
    """Start the FastAPI server for remote SQL execution.

    Examples:

      # Start on default port 8000
      hn-sql api

      # Start on custom port
      hn-sql api --port 8080

      # Allow external connections
      hn-sql api --host 0.0.0.0

      # Development mode with auto-reload
      hn-sql api --reload
    """
    import uvicorn
    from pathlib import Path

    # Check data exists
    data_dir = Path(data).parent.parent if "**" in data else Path(data).parent
    if not data_dir.exists() or not list(data_dir.glob("**/*.parquet")):
        console.print("[yellow]No data found. Run 'hn-sql fetch' first.[/yellow]")
        return

    # Update the data path in the API module
    from hn_sql import api as api_module
    api_module.DATA_PATH = data

    console.print(f"[bold green]Starting HN-SQL API server[/bold green]")
    console.print(f"  Host: {host}")
    console.print(f"  Port: {port}")
    console.print(f"  Data: {data}")
    console.print(f"  Docs: http://{host}:{port}/docs")
    console.print()

    uvicorn.run(
        "hn_sql.api:app",
        host=host,
        port=port,
        reload=reload,
    )


if __name__ == "__main__":
    main()
