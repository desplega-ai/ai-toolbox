"""Partitioned Parquet writer for HN data."""

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
