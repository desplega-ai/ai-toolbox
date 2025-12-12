"""Parquet writer for HN data."""

from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq

from .schema import ITEM_SCHEMA, ITEM_SCHEMA_NO_PARTITION, item_to_row


class ParquetWriter:
    """Writes HN items to Parquet files.

    Supports two partition styles:
    - "flat": Numbered chunk files (chunk-00000.parquet, etc.)
    - "hive": Year/month directories (year=2024/month=12/data.parquet)
    """

    # DuckDB-optimized settings
    PARQUET_CONFIG = {
        "compression": "zstd",
        "compression_level": 3,
        "row_group_size": 100_000,
        "use_dictionary": True,
        "write_statistics": True,
        "version": "2.6",
    }

    def __init__(self, output_dir: str = "data/items", partition_style: str = "hive"):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.partition_style = partition_style
        self._buffer: list[dict] = []
        self._buffer_size = 50_000  # Flush when buffer reaches this size

    def add_item(self, item: dict) -> None:
        """Add an item to the buffer."""
        include_partitions = (self.partition_style == "hive")
        row = item_to_row(item, include_partitions=include_partitions)
        if row is None:
            return

        self._buffer.append(row)

        # Flush if buffer is large enough
        if len(self._buffer) >= self._buffer_size:
            self._flush()

    def add_items(self, items: list[dict]) -> None:
        """Add multiple items."""
        for item in items:
            self.add_item(item)

    def _flush(self) -> None:
        """Flush buffer to disk."""
        if not self._buffer:
            return

        if self.partition_style == "hive":
            self._flush_hive()
        else:
            self._flush_flat()

        # Clear buffer
        self._buffer = []

    def _flush_flat(self) -> None:
        """Write buffer as a flat chunk file."""
        existing = list(self.output_dir.glob("chunk-*.parquet"))
        next_num = len(existing)
        output_path = self.output_dir / f"chunk-{next_num:05d}.parquet"

        table = pa.Table.from_pylist(self._buffer, schema=ITEM_SCHEMA_NO_PARTITION)
        pq.write_table(table, output_path, **self.PARQUET_CONFIG)

    def _flush_hive(self) -> None:
        """Write buffer to hive-partitioned directories (year=X/month=Y/)."""
        from collections import defaultdict

        # Group items by year/month
        partitions = defaultdict(list)
        for row in self._buffer:
            year = row.get("year")
            month = row.get("month")
            if year is not None and month is not None:
                partitions[(year, month)].append(row)

        # Write each partition
        for (year, month), rows in partitions.items():
            partition_dir = self.output_dir / f"year={year}" / f"month={month}"
            partition_dir.mkdir(parents=True, exist_ok=True)

            # Find next available file number in this partition
            existing = list(partition_dir.glob("*.parquet"))
            next_num = len(existing)
            output_path = partition_dir / f"data-{next_num:05d}.parquet"

            table = pa.Table.from_pylist(rows, schema=ITEM_SCHEMA)
            pq.write_table(table, output_path, **self.PARQUET_CONFIG)

    def flush_all(self) -> None:
        """Flush buffer to disk."""
        self._flush()

    def get_stats(self) -> dict:
        """Get statistics about written data."""
        stats = {"partitions": 0, "files": 0, "total_size_mb": 0}

        # Count flat files (new format)
        for parquet_file in self.output_dir.glob("*.parquet"):
            stats["files"] += 1
            stats["total_size_mb"] += parquet_file.stat().st_size / (1024 * 1024)

        # Also count hive-partitioned files (old format, for backward compat)
        for partition_dir in self.output_dir.glob("year=*/month=*"):
            stats["partitions"] += 1
            for parquet_file in partition_dir.glob("*.parquet"):
                stats["files"] += 1
                stats["total_size_mb"] += parquet_file.stat().st_size / (1024 * 1024)

        return stats


# Backward compatibility alias
PartitionedWriter = ParquetWriter
