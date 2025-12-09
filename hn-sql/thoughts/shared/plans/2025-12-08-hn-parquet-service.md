# HN Data to Parquet Service Implementation Plan

## Overview

Build a Python service that fetches all historical data (~42M items) from the Hacker News Firebase API using async concurrent requests, and stores it in time-partitioned Parquet files optimized for DuckDB querying.

## Current State Analysis

- **Directory**: `/Users/taras/Documents/code/ai-toolbox/hn-sql/` (empty, new project)
- **Parent project pattern**: Python 3.13+ with `uv` package manager (see `dns/` sibling project)
- **HN API**: Firebase-based, no auth, no rate limits, ~42M items available
- **Target**: Local Parquet files with Hive-style partitioning (S3 upload deferred)

## Desired End State

A working CLI tool that:
1. Fetches all HN items (stories, comments, jobs, polls) via async HTTP
2. Writes time-partitioned Parquet files: `data/items/year=YYYY/month=MM/*.parquet`
3. Supports checkpoint/resume for reliability during long runs
4. Produces DuckDB-optimized Parquet files (zstd compression, 100k row groups)

### Verification:
```bash
# Run the fetcher
uv run hn-sql fetch --concurrency 200

# Query with DuckDB
duckdb -c "SELECT type, count(*) FROM read_parquet('data/items/**/*.parquet', hive_partitioning=true) GROUP BY type"
```

## What We're NOT Doing

- S3 upload (deferred to future phase)
- Real-time/streaming updates (batch fetch only)
- User data fetching (items only, users can be added later)
- Web UI or API server
- Data transformations beyond raw storage

## Implementation Approach

1. Set up Python project with `uv` and dependencies
2. Define PyArrow schema for HN items
3. Build async HTTP fetcher with concurrency control
4. Implement partitioned Parquet writer with batching
5. Add checkpoint/resume functionality
6. Create CLI interface

---

## Phase 1: Project Setup

### Overview
Initialize the Python project structure with all dependencies.

### Changes Required:

#### 1. Create `pyproject.toml`
**File**: `pyproject.toml`

```toml
[project]
name = "hn-sql"
version = "0.1.0"
description = "Fetch Hacker News data and store as Parquet for DuckDB"
readme = "README.md"
requires-python = ">=3.13"
dependencies = [
    "httpx>=0.28.0",
    "pyarrow>=18.0.0",
    "rich>=13.0.0",
    "click>=8.1.0",
]

[project.scripts]
hn-sql = "hn_sql.cli:main"

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"
```

#### 2. Create directory structure
```bash
mkdir -p src/hn_sql
touch src/hn_sql/__init__.py
mkdir -p data
echo "data/" >> .gitignore
echo "__pycache__/" >> .gitignore
echo "*.parquet" >> .gitignore
echo "checkpoint.json" >> .gitignore
```

#### 3. Create `README.md`
**File**: `README.md`

```markdown
# hn-sql

Fetch Hacker News data and store as Parquet files for DuckDB querying.

## Setup

```bash
uv sync
```

## Usage

```bash
# Fetch all HN items (will take many hours)
uv run hn-sql fetch --concurrency 200

# Resume interrupted fetch
uv run hn-sql fetch --resume

# Query with DuckDB
duckdb -c "SELECT type, count(*) FROM read_parquet('data/items/**/*.parquet', hive_partitioning=true) GROUP BY type"
```

## Data Schema

Items are stored with the following fields:
- `id` (int64): Item ID
- `type` (string): story, comment, job, poll, pollopt
- `by` (string): Author username
- `time` (timestamp): Creation time (UTC)
- `text` (string): Content (HTML)
- `url` (string): External URL (stories)
- `title` (string): Title (stories, jobs, polls)
- `score` (int32): Points
- `descendants` (int32): Comment count
- `parent` (int64): Parent item ID (comments)
- `kids` (list<int64>): Child comment IDs
- `dead` (bool): Flagged/dead
- `deleted` (bool): Deleted
```

### Success Criteria:

#### Automated Verification:
- [x] `uv sync` completes without errors
- [x] Directory structure exists: `ls src/hn_sql/__init__.py`
- [x] Project is importable: `uv run python -c "import hn_sql"`

#### Manual Verification:
- [ ] Review pyproject.toml dependencies are appropriate

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to the next phase.

---

## Phase 2: Schema Definition

### Overview
Define PyArrow schemas for HN items optimized for DuckDB.

### Changes Required:

#### 1. Create schema module
**File**: `src/hn_sql/schema.py`

```python
"""PyArrow schemas for HN data."""

import pyarrow as pa

# Schema for HN items (stories, comments, jobs, polls, pollopts)
ITEM_SCHEMA = pa.schema([
    pa.field("id", pa.int64(), nullable=False),
    pa.field("type", pa.string()),
    pa.field("by", pa.string()),
    pa.field("time", pa.timestamp("s", tz="UTC")),
    pa.field("text", pa.large_string()),  # Can be very long
    pa.field("url", pa.string()),
    pa.field("title", pa.string()),
    pa.field("score", pa.int32()),
    pa.field("descendants", pa.int32()),
    pa.field("parent", pa.int64()),
    pa.field("kids", pa.list_(pa.int64())),
    pa.field("dead", pa.bool_()),
    pa.field("deleted", pa.bool_()),
    pa.field("poll", pa.int64()),  # For pollopts
    pa.field("parts", pa.list_(pa.int64())),  # For polls
    # Partition columns (added during write)
    pa.field("year", pa.int16()),
    pa.field("month", pa.int8()),
])

# Schema without partition columns (for data processing)
ITEM_SCHEMA_NO_PARTITION = pa.schema([
    f for f in ITEM_SCHEMA if f.name not in ("year", "month")
])


def item_to_row(item: dict) -> dict:
    """Convert HN API item dict to schema-compatible row."""
    from datetime import datetime, timezone

    if item is None:
        return None

    # Handle deleted/dead items with minimal data
    if item.get("deleted") or item.get("dead"):
        ts = item.get("time")
        dt = datetime.fromtimestamp(ts, tz=timezone.utc) if ts else None
        return {
            "id": item.get("id"),
            "type": item.get("type"),
            "by": item.get("by"),
            "time": dt,
            "text": None,
            "url": None,
            "title": None,
            "score": None,
            "descendants": None,
            "parent": item.get("parent"),
            "kids": None,
            "dead": item.get("dead", False),
            "deleted": item.get("deleted", False),
            "poll": None,
            "parts": None,
            "year": dt.year if dt else None,
            "month": dt.month if dt else None,
        }

    ts = item.get("time")
    dt = datetime.fromtimestamp(ts, tz=timezone.utc) if ts else None

    return {
        "id": item.get("id"),
        "type": item.get("type"),
        "by": item.get("by"),
        "time": dt,
        "text": item.get("text"),
        "url": item.get("url"),
        "title": item.get("title"),
        "score": item.get("score"),
        "descendants": item.get("descendants"),
        "parent": item.get("parent"),
        "kids": item.get("kids"),
        "dead": item.get("dead", False),
        "deleted": item.get("deleted", False),
        "poll": item.get("poll"),
        "parts": item.get("parts"),
        "year": dt.year if dt else None,
        "month": dt.month if dt else None,
    }
```

### Success Criteria:

#### Automated Verification:
- [x] Schema imports correctly: `uv run python -c "from hn_sql.schema import ITEM_SCHEMA; print(ITEM_SCHEMA)"`
- [x] Conversion function works: `uv run python -c "from hn_sql.schema import item_to_row; print(item_to_row({'id': 1, 'type': 'story', 'time': 1234567890}))"`

#### Manual Verification:
- [ ] Schema fields match HN API documentation

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to the next phase.

---

## Phase 3: Async HTTP Fetcher

### Overview
Build the async HTTP client for fetching items from HN API with concurrency control.

### Changes Required:

#### 1. Create fetcher module
**File**: `src/hn_sql/fetcher.py`

```python
"""Async HTTP fetcher for HN API."""

import asyncio
from typing import AsyncIterator

import httpx

HN_API_BASE = "https://hacker-news.firebaseio.com/v0"


class HNFetcher:
    """Async fetcher for Hacker News API."""

    def __init__(self, concurrency: int = 100, timeout: float = 30.0):
        self.concurrency = concurrency
        self.timeout = timeout
        self.semaphore = asyncio.Semaphore(concurrency)
        self._client: httpx.AsyncClient | None = None

    async def __aenter__(self) -> "HNFetcher":
        self._client = httpx.AsyncClient(
            timeout=httpx.Timeout(self.timeout),
            limits=httpx.Limits(
                max_connections=self.concurrency,
                max_keepalive_connections=self.concurrency,
            ),
        )
        return self

    async def __aexit__(self, *args) -> None:
        if self._client:
            await self._client.aclose()

    async def get_max_item_id(self) -> int:
        """Get the current maximum item ID."""
        resp = await self._client.get(f"{HN_API_BASE}/maxitem.json")
        resp.raise_for_status()
        return resp.json()

    async def fetch_item(self, item_id: int) -> dict | None:
        """Fetch a single item by ID. Returns None if not found."""
        async with self.semaphore:
            try:
                resp = await self._client.get(f"{HN_API_BASE}/item/{item_id}.json")
                resp.raise_for_status()
                return resp.json()  # Can be null for deleted items
            except httpx.HTTPStatusError as e:
                if e.response.status_code == 404:
                    return None
                raise
            except httpx.TimeoutException:
                # Retry once on timeout
                await asyncio.sleep(1)
                resp = await self._client.get(f"{HN_API_BASE}/item/{item_id}.json")
                resp.raise_for_status()
                return resp.json()

    async def fetch_items(
        self,
        item_ids: list[int],
        on_progress: callable = None,
    ) -> AsyncIterator[tuple[int, dict | None]]:
        """Fetch multiple items concurrently. Yields (id, item) pairs."""

        async def fetch_one(item_id: int) -> tuple[int, dict | None]:
            item = await self.fetch_item(item_id)
            if on_progress:
                on_progress(1)
            return (item_id, item)

        # Create tasks for all items
        tasks = [fetch_one(item_id) for item_id in item_ids]

        # Yield results as they complete
        for coro in asyncio.as_completed(tasks):
            yield await coro

    async def fetch_range(
        self,
        start_id: int,
        end_id: int,
        batch_size: int = 10000,
        on_batch: callable = None,
    ) -> AsyncIterator[list[dict]]:
        """Fetch items in a range, yielding batches."""
        current = start_id

        while current <= end_id:
            batch_end = min(current + batch_size, end_id + 1)
            item_ids = list(range(current, batch_end))

            items = []
            async for item_id, item in self.fetch_items(item_ids):
                if item is not None:
                    items.append(item)

            if items:
                yield items

            if on_batch:
                on_batch(batch_end - 1)

            current = batch_end
```

### Success Criteria:

#### Automated Verification:
- [x] Fetcher imports: `uv run python -c "from hn_sql.fetcher import HNFetcher"`
- [x] Can fetch max item ID:
  ```bash
  uv run python -c "
  import asyncio
  from hn_sql.fetcher import HNFetcher
  async def test():
      async with HNFetcher() as f:
          print(await f.get_max_item_id())
  asyncio.run(test())
  "
  ```
- [x] Can fetch a single item:
  ```bash
  uv run python -c "
  import asyncio
  from hn_sql.fetcher import HNFetcher
  async def test():
      async with HNFetcher() as f:
          print(await f.fetch_item(1))
  asyncio.run(test())
  "
  ```

#### Manual Verification:
- [ ] Fetched item matches expected HN API format

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to the next phase.

---

## Phase 4: Parquet Writer

### Overview
Implement the partitioned Parquet writer with batching and compression.

### Changes Required:

#### 1. Create writer module
**File**: `src/hn_sql/writer.py`

```python
"""Partitioned Parquet writer for HN data."""

import os
from pathlib import Path
from collections import defaultdict

import pyarrow as pa
import pyarrow.parquet as pq

from .schema import ITEM_SCHEMA, item_to_row


class PartitionedWriter:
    """Writes HN items to time-partitioned Parquet files."""

    # DuckDB-optimized settings
    PARQUET_CONFIG = {
        "compression": "zstd",
        "compression_level": 3,
        "row_group_size": 100_000,
        "use_dictionary": True,
        "write_statistics": True,
        "version": "2.6",
    }

    def __init__(self, output_dir: str = "data/items"):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self._buffers: dict[tuple[int, int], list[dict]] = defaultdict(list)
        self._buffer_size = 50_000  # Flush when buffer reaches this size

    def add_item(self, item: dict) -> None:
        """Add an item to the appropriate partition buffer."""
        row = item_to_row(item)
        if row is None or row.get("year") is None:
            return

        key = (row["year"], row["month"])
        self._buffers[key].append(row)

        # Flush if buffer is large enough
        if len(self._buffers[key]) >= self._buffer_size:
            self._flush_partition(key)

    def add_items(self, items: list[dict]) -> None:
        """Add multiple items."""
        for item in items:
            self.add_item(item)

    def _flush_partition(self, key: tuple[int, int]) -> None:
        """Flush a partition buffer to disk."""
        if key not in self._buffers or not self._buffers[key]:
            return

        year, month = key
        partition_dir = self.output_dir / f"year={year}" / f"month={month:02d}"
        partition_dir.mkdir(parents=True, exist_ok=True)

        # Find next available file number
        existing = list(partition_dir.glob("part-*.parquet"))
        next_num = len(existing)
        output_path = partition_dir / f"part-{next_num:05d}.parquet"

        # Convert to PyArrow table
        rows = self._buffers[key]
        table = pa.Table.from_pylist(rows, schema=ITEM_SCHEMA)

        # Write with optimized settings
        pq.write_table(table, output_path, **self.PARQUET_CONFIG)

        # Clear buffer
        self._buffers[key] = []

    def flush_all(self) -> None:
        """Flush all partition buffers to disk."""
        for key in list(self._buffers.keys()):
            self._flush_partition(key)

    def get_stats(self) -> dict:
        """Get statistics about written data."""
        stats = {"partitions": 0, "files": 0, "total_size_mb": 0}

        for partition_dir in self.output_dir.glob("year=*/month=*"):
            stats["partitions"] += 1
            for parquet_file in partition_dir.glob("*.parquet"):
                stats["files"] += 1
                stats["total_size_mb"] += parquet_file.stat().st_size / (1024 * 1024)

        return stats
```

### Success Criteria:

#### Automated Verification:
- [x] Writer imports: `uv run python -c "from hn_sql.writer import PartitionedWriter"`
- [x] Can write sample data:
  ```bash
  uv run python -c "
  from hn_sql.writer import PartitionedWriter
  w = PartitionedWriter('data/test')
  w.add_item({'id': 1, 'type': 'story', 'time': 1704067200, 'title': 'Test'})
  w.flush_all()
  print(w.get_stats())
  " && ls -la data/test/year=*/month=*/
  ```
- [x] Parquet file is readable by DuckDB:
  ```bash
  uv run python -c "
  import duckdb
  print(duckdb.query(\"SELECT * FROM read_parquet('data/test/**/*.parquet', hive_partitioning=true)\").fetchall())
  "
  ```

#### Manual Verification:
- [ ] Partition directory structure is correct (year=YYYY/month=MM)
- [ ] Parquet files use zstd compression

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to the next phase.

---

## Phase 5: Checkpoint/Resume Support

### Overview
Add checkpoint functionality to track progress and enable resuming interrupted fetches.

### Changes Required:

#### 1. Create checkpoint module
**File**: `src/hn_sql/checkpoint.py`

```python
"""Checkpoint management for resumable fetching."""

import json
from pathlib import Path
from datetime import datetime, timezone
from dataclasses import dataclass, asdict


@dataclass
class Checkpoint:
    """Represents fetch progress state."""
    last_fetched_id: int
    max_item_id: int
    items_fetched: int
    items_written: int
    started_at: str
    updated_at: str

    @classmethod
    def new(cls, max_item_id: int) -> "Checkpoint":
        now = datetime.now(timezone.utc).isoformat()
        return cls(
            last_fetched_id=0,
            max_item_id=max_item_id,
            items_fetched=0,
            items_written=0,
            started_at=now,
            updated_at=now,
        )

    def update(self, last_id: int, fetched: int, written: int) -> None:
        self.last_fetched_id = last_id
        self.items_fetched += fetched
        self.items_written += written
        self.updated_at = datetime.now(timezone.utc).isoformat()

    @property
    def progress_pct(self) -> float:
        if self.max_item_id == 0:
            return 0.0
        return (self.last_fetched_id / self.max_item_id) * 100


class CheckpointManager:
    """Manages checkpoint persistence."""

    def __init__(self, path: str = "checkpoint.json"):
        self.path = Path(path)

    def exists(self) -> bool:
        return self.path.exists()

    def load(self) -> Checkpoint | None:
        if not self.exists():
            return None
        data = json.loads(self.path.read_text())
        return Checkpoint(**data)

    def save(self, checkpoint: Checkpoint) -> None:
        self.path.write_text(json.dumps(asdict(checkpoint), indent=2))

    def delete(self) -> None:
        if self.exists():
            self.path.unlink()
```

### Success Criteria:

#### Automated Verification:
- [x] Checkpoint imports: `uv run python -c "from hn_sql.checkpoint import Checkpoint, CheckpointManager"`
- [x] Can create and save checkpoint:
  ```bash
  uv run python -c "
  from hn_sql.checkpoint import Checkpoint, CheckpointManager
  cp = Checkpoint.new(42000000)
  cp.update(1000, 1000, 950)
  mgr = CheckpointManager('test_checkpoint.json')
  mgr.save(cp)
  loaded = mgr.load()
  print(f'Progress: {loaded.progress_pct:.2f}%')
  mgr.delete()
  "
  ```

#### Manual Verification:
- [ ] Checkpoint JSON is human-readable

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to the next phase.

---

## Phase 6: CLI Interface

### Overview
Create the command-line interface using Click with progress display.

### Changes Required:

#### 1. Create CLI module
**File**: `src/hn_sql/cli.py`

```python
"""Command-line interface for hn-sql."""

import asyncio

import click
from rich.console import Console
from rich.progress import Progress, SpinnerColumn, TextColumn, BarColumn, TaskProgressColumn, TimeRemainingColumn

from .fetcher import HNFetcher
from .writer import PartitionedWriter
from .checkpoint import Checkpoint, CheckpointManager

console = Console()


@click.group()
def main():
    """HN data fetcher and Parquet writer."""
    pass


@main.command()
@click.option("--concurrency", "-c", default=200, help="Number of concurrent requests")
@click.option("--batch-size", "-b", default=10000, help="Items per batch")
@click.option("--resume/--no-resume", default=True, help="Resume from checkpoint")
@click.option("--output", "-o", default="data/items", help="Output directory")
def fetch(concurrency: int, batch_size: int, resume: bool, output: str):
    """Fetch all HN items and write to Parquet."""
    asyncio.run(_fetch(concurrency, batch_size, resume, output))


async def _fetch(concurrency: int, batch_size: int, resume: bool, output: str):
    """Async fetch implementation."""
    checkpoint_mgr = CheckpointManager()
    writer = PartitionedWriter(output)

    async with HNFetcher(concurrency=concurrency) as fetcher:
        # Get current max item ID
        max_id = await fetcher.get_max_item_id()
        console.print(f"[bold]Max item ID:[/bold] {max_id:,}")

        # Load or create checkpoint
        if resume and checkpoint_mgr.exists():
            checkpoint = checkpoint_mgr.load()
            start_id = checkpoint.last_fetched_id + 1
            # Update max_id in case it increased
            checkpoint.max_item_id = max_id
            console.print(f"[yellow]Resuming from item {start_id:,}[/yellow]")
        else:
            checkpoint = Checkpoint.new(max_id)
            start_id = 1
            console.print("[green]Starting fresh fetch[/green]")

        # Progress display
        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            BarColumn(),
            TaskProgressColumn(),
            TimeRemainingColumn(),
            console=console,
        ) as progress:
            task = progress.add_task(
                f"Fetching items...",
                total=max_id,
                completed=start_id - 1,
            )

            try:
                async for batch in fetcher.fetch_range(
                    start_id=start_id,
                    end_id=max_id,
                    batch_size=batch_size,
                ):
                    # Write batch
                    writer.add_items(batch)

                    # Update checkpoint
                    last_id = max(item["id"] for item in batch)
                    checkpoint.update(last_id, len(batch), len(batch))
                    checkpoint_mgr.save(checkpoint)

                    # Update progress
                    progress.update(task, completed=last_id)

                # Final flush
                writer.flush_all()
                checkpoint_mgr.delete()

            except KeyboardInterrupt:
                console.print("\n[yellow]Interrupted! Progress saved.[/yellow]")
                writer.flush_all()
                raise SystemExit(0)

    # Print stats
    stats = writer.get_stats()
    console.print("\n[bold green]Fetch complete![/bold green]")
    console.print(f"  Partitions: {stats['partitions']}")
    console.print(f"  Files: {stats['files']}")
    console.print(f"  Total size: {stats['total_size_mb']:.1f} MB")


@main.command()
def stats():
    """Show statistics about fetched data."""
    writer = PartitionedWriter()
    stats = writer.get_stats()

    if stats["files"] == 0:
        console.print("[yellow]No data found. Run 'hn-sql fetch' first.[/yellow]")
        return

    console.print("[bold]Data Statistics:[/bold]")
    console.print(f"  Partitions: {stats['partitions']}")
    console.print(f"  Files: {stats['files']}")
    console.print(f"  Total size: {stats['total_size_mb']:.1f} MB")

    # Show checkpoint status if exists
    checkpoint_mgr = CheckpointManager()
    if checkpoint_mgr.exists():
        cp = checkpoint_mgr.load()
        console.print(f"\n[bold]Checkpoint:[/bold]")
        console.print(f"  Progress: {cp.progress_pct:.1f}%")
        console.print(f"  Last ID: {cp.last_fetched_id:,}")
        console.print(f"  Items fetched: {cp.items_fetched:,}")


@main.command()
def reset():
    """Reset checkpoint and optionally delete data."""
    checkpoint_mgr = CheckpointManager()

    if checkpoint_mgr.exists():
        checkpoint_mgr.delete()
        console.print("[green]Checkpoint deleted.[/green]")
    else:
        console.print("[yellow]No checkpoint found.[/yellow]")


if __name__ == "__main__":
    main()
```

#### 2. Update `__init__.py`
**File**: `src/hn_sql/__init__.py`

```python
"""HN data fetcher and Parquet writer."""

__version__ = "0.1.0"
```

### Success Criteria:

#### Automated Verification:
- [x] CLI is accessible: `uv run hn-sql --help`
- [x] Fetch command exists: `uv run hn-sql fetch --help`
- [x] Stats command exists: `uv run hn-sql stats --help`
- [x] Short test fetch works:
  ```bash
  uv run python -c "
  import asyncio
  from hn_sql.fetcher import HNFetcher
  from hn_sql.writer import PartitionedWriter
  from hn_sql.schema import item_to_row

  async def test():
      w = PartitionedWriter('data/items')
      async with HNFetcher(concurrency=50) as f:
          async for batch in f.fetch_range(1, 100, batch_size=100):
              w.add_items(batch)
              print(f'Fetched {len(batch)} items')
      w.flush_all()
      print(w.get_stats())

  asyncio.run(test())
  "
  ```

#### Manual Verification:
- [ ] Progress bar displays correctly during fetch
- [ ] Ctrl+C gracefully saves progress
- [ ] `hn-sql stats` shows correct information

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to the next phase.

---

## Phase 7: Testing and Verification

### Overview
Run end-to-end tests and verify DuckDB compatibility.

### Changes Required:

#### 1. Test DuckDB queries
```bash
# Install duckdb CLI if needed: brew install duckdb

# Basic query
duckdb -c "SELECT type, count(*) as cnt FROM read_parquet('data/items/**/*.parquet', hive_partitioning=true) GROUP BY type ORDER BY cnt DESC"

# Query with partition pruning
duckdb -c "SELECT * FROM read_parquet('data/items/**/*.parquet', hive_partitioning=true) WHERE year = 2024 AND month = 1 LIMIT 10"

# Check compression
duckdb -c "SELECT file_name, compression FROM parquet_metadata('data/items/year=*/month=*/part-00000.parquet')"
```

### Success Criteria:

#### Automated Verification:
- [x] DuckDB can read the files: `duckdb -c "SELECT count(*) FROM read_parquet('data/items/**/*.parquet', hive_partitioning=true)"`
- [x] Partition pruning works (check query plan)
- [x] All item types are present

#### Manual Verification:
- [ ] Query performance is acceptable
- [ ] Data looks correct (spot check some items against HN website)

---

## Testing Strategy

### Unit Tests:
- Schema conversion handles all item types (story, comment, job, poll, pollopt)
- Schema handles null/missing fields gracefully
- Checkpoint serialization/deserialization roundtrip
- Writer creates correct partition structure

### Integration Tests:
- Fetch a small range (items 1-1000) and verify parquet output
- Resume works after simulated interruption
- DuckDB can query partitioned data with filters

### Manual Testing Steps:
1. Run `uv run hn-sql fetch -c 200` and let it run for 5-10 minutes
2. Press Ctrl+C and verify checkpoint is saved
3. Run `uv run hn-sql fetch` again and verify it resumes
4. Query data with DuckDB and verify results make sense
5. Compare a few items with the live HN website

## Performance Considerations

- **Concurrency**: Default 200, can go up to 500 without issues (no rate limits)
- **Memory**: Buffering ~50k items per partition before flush (~100-500MB RAM)
- **Disk**: Expect ~10-15GB for all ~42M items (zstd compressed)
- **Time**: ~500 items/sec = ~23 hours for full fetch

## Future Enhancements (Out of Scope)

1. S3 upload support with boto3
2. Incremental sync (only fetch new items)
3. User data fetching
4. Separate tables for different item types
5. Delta/append mode for updates

## References

- HN API: https://github.com/HackerNews/API
- PyArrow Parquet: https://arrow.apache.org/docs/python/parquet.html
- DuckDB Parquet: https://duckdb.org/docs/data/parquet/overview
