"""Parquet writer for HN data."""

from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq

from .schema import ITEM_SCHEMA_NO_PARTITION, item_to_row


class ParquetWriter:
    """Writes HN items to flat Parquet files (no hive partitioning).

    Files are written as numbered chunks when the buffer fills up.
    This provides better query performance for general queries since
    DuckDB doesn't need to traverse partition directories.
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

    def __init__(self, output_dir: str = "data/items"):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self._buffer: list[dict] = []
        self._buffer_size = 50_000  # Flush when buffer reaches this size

    def add_item(self, item: dict) -> None:
        """Add an item to the buffer."""
        row = item_to_row(item, include_partitions=False)
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

        # Find next available file number
        existing = list(self.output_dir.glob("chunk-*.parquet"))
        next_num = len(existing)
        output_path = self.output_dir / f"chunk-{next_num:05d}.parquet"

        # Convert to PyArrow table
        table = pa.Table.from_pylist(self._buffer, schema=ITEM_SCHEMA_NO_PARTITION)

        # Write with optimized settings
        pq.write_table(table, output_path, **self.PARQUET_CONFIG)

        # Clear buffer
        self._buffer = []

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
