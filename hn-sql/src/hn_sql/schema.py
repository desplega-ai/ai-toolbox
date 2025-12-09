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
