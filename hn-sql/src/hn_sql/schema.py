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


def item_to_row(item: dict, include_partitions: bool = False) -> dict:
    """Convert HN API item dict to schema-compatible row.

    Args:
        item: Raw item dict from HN API
        include_partitions: If True, include year/month columns (for legacy hive partitioning)
    """
    from datetime import datetime, timezone

    if item is None:
        return None

    ts = item.get("time")
    dt = datetime.fromtimestamp(ts, tz=timezone.utc) if ts else None

    # Sanitize boolean fields - HN API sometimes returns unexpected types
    dead = item.get("dead")
    deleted = item.get("deleted")
    is_dead = dead is True or dead == 1
    is_deleted = deleted is True or deleted == 1

    # Handle deleted/dead items with minimal data
    if is_deleted or is_dead:
        row = {
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
            "dead": is_dead,
            "deleted": is_deleted,
            "poll": None,
            "parts": None,
        }
    else:
        row = {
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
            "dead": is_dead,
            "deleted": is_deleted,
            "poll": item.get("poll"),
            "parts": item.get("parts"),
        }

    if include_partitions:
        row["year"] = dt.year if dt else None
        row["month"] = dt.month if dt else None

    return row


def items_to_table(items: list[dict]) -> pa.Table:
    """Convert a list of HN API items to a PyArrow table."""
    rows = [item_to_row(item) for item in items if item is not None]
    if not rows:
        return pa.table({}, schema=ITEM_SCHEMA_NO_PARTITION)

    # Build columns
    columns = {field.name: [] for field in ITEM_SCHEMA_NO_PARTITION}
    for row in rows:
        for field in ITEM_SCHEMA_NO_PARTITION:
            columns[field.name].append(row.get(field.name))

    return pa.table(columns, schema=ITEM_SCHEMA_NO_PARTITION)
