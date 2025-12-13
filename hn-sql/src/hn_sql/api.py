"""FastAPI server for hn-sql queries."""

import os
import time
from pathlib import Path
from typing import Any

import duckdb
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# Default configuration
DEFAULT_LIMIT = 1000
MAX_LIMIT = 10000
DATA_PATH = "data/items/**/*.parquet"

app = FastAPI(
    title="HN-SQL API",
    description="Query Hacker News data with SQL",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Response Models ---

class TimingInfo(BaseModel):
    """Execution timing information."""
    elapsed_seconds: float = Field(..., description="Query execution time in seconds")
    elapsed_formatted: str = Field(..., description="Human-readable execution time")


class QueryRequest(BaseModel):
    """SQL query request."""
    sql: str = Field(..., description="SQL query to execute", min_length=1)
    limit: int = Field(DEFAULT_LIMIT, description="Maximum rows to return", ge=1, le=MAX_LIMIT)


class QueryResponse(BaseModel):
    """SQL query response."""
    columns: list[str] = Field(..., description="Column names")
    rows: list[list[Any]] = Field(..., description="Result rows")
    row_count: int = Field(..., description="Number of rows returned")
    truncated: bool = Field(..., description="Whether results were truncated by limit")
    timing: TimingInfo


class StoryItem(BaseModel):
    """Story item for REST endpoints."""
    id: int
    title: str | None
    url: str | None
    score: int | None
    by: str | None
    time: str | None
    descendants: int | None


class CommentItem(BaseModel):
    """Comment item for REST endpoints."""
    id: int
    text: str | None
    by: str | None
    time: str | None
    parent: int | None


class JobItem(BaseModel):
    """Job item for REST endpoints."""
    id: int
    title: str | None
    url: str | None
    text: str | None
    by: str | None
    time: str | None


class TypeCount(BaseModel):
    """Type count for stats."""
    type: str
    count: int


class UserCount(BaseModel):
    """User post count for stats."""
    user: str
    count: int


class ListResponse(BaseModel):
    """Generic list response with timing."""
    items: list[Any]
    count: int
    timing: TimingInfo


class StatsResponse(BaseModel):
    """Stats response with timing."""
    stats: list[Any]
    timing: TimingInfo


class ColumnInfo(BaseModel):
    """Column information for schema endpoint."""
    name: str = Field(..., description="Column name")
    type: str = Field(..., description="Column data type")
    nullable: bool = Field(..., description="Whether the column can be null")
    description: str | None = Field(None, description="Column description")


class TableInfo(BaseModel):
    """Table information for schema endpoint."""
    name: str = Field(..., description="Table name")
    columns: list[ColumnInfo] = Field(..., description="Table columns")


class SchemaResponse(BaseModel):
    """Database schema response for editor autocompletion."""
    tables: list[TableInfo] = Field(..., description="Available tables")
    keywords: list[str] = Field(..., description="SQL keywords")
    functions: list[str] = Field(..., description="Available SQL functions")


# --- Helper Functions ---

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


def _get_system_memory_gb() -> int:
    """Get system memory in GB using platform-specific methods."""
    try:
        # macOS/Linux
        pages = os.sysconf('SC_PHYS_PAGES')
        page_size = os.sysconf('SC_PAGE_SIZE')
        return (pages * page_size) // (1024**3)
    except (ValueError, AttributeError, OSError):
        return 8  # Default fallback


def _configure_duckdb(conn: duckdb.DuckDBPyConnection) -> None:
    """Auto-configure DuckDB based on available system resources."""
    # Use 75% of total memory
    total_gb = _get_system_memory_gb()
    memory_gb = max(1, int(total_gb * 0.75))

    # Get CPU cores
    cpu_count = os.cpu_count() or 4

    conn.execute(f"SET memory_limit='{memory_gb}GB'")
    conn.execute(f"SET threads={cpu_count}")


def _get_connection(data_path: str = DATA_PATH, updates_path: str = "data/updates/**/*.parquet") -> duckdb.DuckDBPyConnection:
    """Create a DuckDB connection with the HN data as a view.

    Automatically deduplicates items, preferring updates over original data.
    Also auto-configures memory and threads based on system resources.
    """
    conn = duckdb.connect()
    _configure_duckdb(conn)

    # Check if updates directory has any files
    updates_dir = Path("data/updates")
    has_updates = updates_dir.exists() and any(updates_dir.glob("**/*.parquet"))

    if has_updates:
        # Deduplicate: updates (source=1) take precedence over items (source=0)
        conn.execute(f"""
            CREATE VIEW hn AS
            WITH all_data AS (
                SELECT *, 0 as _source FROM read_parquet('{data_path}', hive_partitioning=true, union_by_name=true)
                UNION ALL
                SELECT *, 1 as _source FROM read_parquet('{updates_path}', hive_partitioning=true, union_by_name=true)
            ),
            deduped AS (
                SELECT *, ROW_NUMBER() OVER (PARTITION BY id ORDER BY _source DESC) as _rn
                FROM all_data
            )
            SELECT id, type, "by", time, text, url, title, score, descendants,
                   parent, kids, dead, deleted, poll, parts
            FROM deduped WHERE _rn = 1
        """)
    else:
        # No updates, use simple view
        conn.execute(f"""
            CREATE VIEW hn AS
            SELECT id, type, "by", time, text, url, title, score, descendants,
                   parent, kids, dead, deleted, poll, parts
            FROM read_parquet('{data_path}', hive_partitioning=true, union_by_name=true)
        """)
    return conn


def _execute_query(sql: str, limit: int = DEFAULT_LIMIT) -> QueryResponse:
    """Execute SQL and return structured response with timing."""
    conn = _get_connection()

    start_time = time.perf_counter()
    try:
        result = conn.execute(sql)
        columns = [col[0] for col in result.description]
        all_rows = result.fetchall()
    except duckdb.Error as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()

    elapsed = time.perf_counter() - start_time

    # Apply limit
    truncated = len(all_rows) > limit
    rows = all_rows[:limit]

    # Convert rows to lists (from tuples)
    rows_as_lists = [list(row) for row in rows]

    return QueryResponse(
        columns=columns,
        rows=rows_as_lists,
        row_count=len(rows_as_lists),
        truncated=truncated,
        timing=TimingInfo(
            elapsed_seconds=elapsed,
            elapsed_formatted=_format_time(elapsed),
        ),
    )


# --- Endpoints ---

@app.post("/query", response_model=QueryResponse)
def execute_query(request: QueryRequest) -> QueryResponse:
    """
    Execute a SQL query against the HN data.

    The data is available as a table called `hn` with columns:
    id, type, "by", time, text, url, title, score, descendants,
    parent, kids, dead, deleted, poll, parts, year, month

    Note: "by" must be quoted as it's a reserved word.
    """
    return _execute_query(request.sql, request.limit)


@app.get("/health")
def health_check():
    """Health check endpoint."""
    return {"status": "ok"}


@app.get("/schema", response_model=SchemaResponse)
def get_schema() -> SchemaResponse:
    """
    Get database schema for editor autocompletion.

    Returns table definitions, SQL keywords, and common functions
    useful for building SQL query autocompletion in editors like Monaco.
    """
    # Column definitions with descriptions
    columns = [
        ColumnInfo(name="id", type="int64", nullable=False, description="Item ID"),
        ColumnInfo(name="type", type="string", nullable=True, description="Item type: story, comment, job, poll, pollopt"),
        ColumnInfo(name="by", type="string", nullable=True, description="Author username (quote as \"by\" in SQL)"),
        ColumnInfo(name="time", type="timestamp", nullable=True, description="Creation time (UTC)"),
        ColumnInfo(name="title", type="string", nullable=True, description="Title (stories/jobs/polls)"),
        ColumnInfo(name="url", type="string", nullable=True, description="External URL"),
        ColumnInfo(name="text", type="string", nullable=True, description="Content (HTML)"),
        ColumnInfo(name="score", type="int32", nullable=True, description="Points/score"),
        ColumnInfo(name="descendants", type="int32", nullable=True, description="Comment count"),
        ColumnInfo(name="parent", type="int64", nullable=True, description="Parent item ID"),
        ColumnInfo(name="kids", type="list<int64>", nullable=True, description="Child comment IDs"),
        ColumnInfo(name="dead", type="bool", nullable=True, description="Dead/flagged item"),
        ColumnInfo(name="deleted", type="bool", nullable=True, description="Deleted item"),
        ColumnInfo(name="poll", type="int64", nullable=True, description="Parent poll (for pollopts)"),
        ColumnInfo(name="parts", type="list<int64>", nullable=True, description="Poll option IDs (for polls)"),
    ]

    tables = [TableInfo(name="hn", columns=columns)]

    # Common SQL keywords for autocompletion
    keywords = [
        "SELECT", "FROM", "WHERE", "AND", "OR", "NOT", "IN", "LIKE", "ILIKE",
        "BETWEEN", "IS", "NULL", "ORDER", "BY", "ASC", "DESC", "LIMIT", "OFFSET",
        "GROUP", "HAVING", "DISTINCT", "AS", "JOIN", "LEFT", "RIGHT", "INNER",
        "OUTER", "FULL", "ON", "UNION", "ALL", "EXCEPT", "INTERSECT", "CASE",
        "WHEN", "THEN", "ELSE", "END", "CAST", "TRUE", "FALSE", "NULLS", "FIRST", "LAST",
    ]

    # Common DuckDB functions
    functions = [
        # Aggregates
        "COUNT", "SUM", "AVG", "MIN", "MAX", "FIRST", "LAST",
        "COUNT_DISTINCT", "APPROX_COUNT_DISTINCT", "LIST", "STRING_AGG",
        # String
        "LENGTH", "LOWER", "UPPER", "TRIM", "LTRIM", "RTRIM", "SUBSTR", "SUBSTRING",
        "REPLACE", "CONCAT", "CONCAT_WS", "SPLIT_PART", "REGEXP_MATCHES",
        "REGEXP_REPLACE", "REGEXP_EXTRACT", "CONTAINS", "STARTS_WITH", "ENDS_WITH",
        # Date/Time
        "DATE_TRUNC", "DATE_PART", "DATE_DIFF", "EXTRACT", "STRFTIME",
        "YEAR", "MONTH", "DAY", "HOUR", "MINUTE", "SECOND",
        "CURRENT_DATE", "CURRENT_TIMESTAMP", "NOW",
        # Numeric
        "ABS", "ROUND", "CEIL", "FLOOR", "POWER", "SQRT", "LOG", "LN",
        # Conditional
        "COALESCE", "NULLIF", "IFNULL", "IF",
        # List
        "LIST_VALUE", "LIST_AGGREGATE", "UNNEST", "ARRAY_LENGTH", "LEN",
        # Type conversion
        "CAST", "TRY_CAST",
    ]

    return SchemaResponse(tables=tables, keywords=keywords, functions=functions)


@app.get("/stories", response_model=ListResponse)
def list_stories(
    limit: int = Query(DEFAULT_LIMIT, ge=1, le=MAX_LIMIT, description="Maximum items to return"),
    offset: int = Query(0, ge=0, description="Number of items to skip"),
    sort: str = Query("time", description="Sort field: time, score, descendants"),
    order: str = Query("desc", description="Sort order: asc, desc"),
    by: str | None = Query(None, description="Filter by author username"),
    min_score: int | None = Query(None, description="Minimum score filter"),
) -> ListResponse:
    """
    List stories with filtering and pagination.

    Returns story items sorted by the specified field.
    """
    # Validate sort field
    valid_sorts = {"time", "score", "descendants", "id"}
    if sort not in valid_sorts:
        raise HTTPException(status_code=400, detail=f"Invalid sort field. Must be one of: {valid_sorts}")

    # Validate order
    if order not in {"asc", "desc"}:
        raise HTTPException(status_code=400, detail="Invalid order. Must be 'asc' or 'desc'")

    # Build query
    conditions = ["type = 'story'"]
    if by:
        conditions.append(f"\"by\" = '{by}'")
    if min_score is not None:
        conditions.append(f"score >= {min_score}")

    where_clause = " AND ".join(conditions)
    sql = f"""
        SELECT id, title, url, score, "by", time::varchar as time, descendants
        FROM hn
        WHERE {where_clause}
        ORDER BY {sort} {order.upper()}
        LIMIT {limit} OFFSET {offset}
    """

    conn = _get_connection()
    start_time = time.perf_counter()
    try:
        result = conn.execute(sql)
        rows = result.fetchall()
    except duckdb.Error as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()

    elapsed = time.perf_counter() - start_time

    items = [
        StoryItem(
            id=row[0],
            title=row[1],
            url=row[2],
            score=row[3],
            by=row[4],
            time=row[5],
            descendants=row[6],
        )
        for row in rows
    ]

    return ListResponse(
        items=items,
        count=len(items),
        timing=TimingInfo(
            elapsed_seconds=elapsed,
            elapsed_formatted=_format_time(elapsed),
        ),
    )


@app.get("/comments", response_model=ListResponse)
def list_comments(
    limit: int = Query(DEFAULT_LIMIT, ge=1, le=MAX_LIMIT, description="Maximum items to return"),
    offset: int = Query(0, ge=0, description="Number of items to skip"),
    sort: str = Query("time", description="Sort field: time, id"),
    order: str = Query("desc", description="Sort order: asc, desc"),
    by: str | None = Query(None, description="Filter by author username"),
    parent: int | None = Query(None, description="Filter by parent item ID"),
) -> ListResponse:
    """
    List comments with filtering and pagination.

    Returns comment items sorted by the specified field.
    """
    valid_sorts = {"time", "id"}
    if sort not in valid_sorts:
        raise HTTPException(status_code=400, detail=f"Invalid sort field. Must be one of: {valid_sorts}")

    if order not in {"asc", "desc"}:
        raise HTTPException(status_code=400, detail="Invalid order. Must be 'asc' or 'desc'")

    conditions = ["type = 'comment'"]
    if by:
        conditions.append(f"\"by\" = '{by}'")
    if parent is not None:
        conditions.append(f"parent = {parent}")

    where_clause = " AND ".join(conditions)
    sql = f"""
        SELECT id, text, "by", time::varchar as time, parent
        FROM hn
        WHERE {where_clause}
        ORDER BY {sort} {order.upper()}
        LIMIT {limit} OFFSET {offset}
    """

    conn = _get_connection()
    start_time = time.perf_counter()
    try:
        result = conn.execute(sql)
        rows = result.fetchall()
    except duckdb.Error as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()

    elapsed = time.perf_counter() - start_time

    items = [
        CommentItem(
            id=row[0],
            text=row[1],
            by=row[2],
            time=row[3],
            parent=row[4],
        )
        for row in rows
    ]

    return ListResponse(
        items=items,
        count=len(items),
        timing=TimingInfo(
            elapsed_seconds=elapsed,
            elapsed_formatted=_format_time(elapsed),
        ),
    )


@app.get("/jobs", response_model=ListResponse)
def list_jobs(
    limit: int = Query(DEFAULT_LIMIT, ge=1, le=MAX_LIMIT, description="Maximum items to return"),
    offset: int = Query(0, ge=0, description="Number of items to skip"),
    sort: str = Query("time", description="Sort field: time, id"),
    order: str = Query("desc", description="Sort order: asc, desc"),
) -> ListResponse:
    """
    List job postings with pagination.

    Returns job items sorted by the specified field.
    """
    valid_sorts = {"time", "id"}
    if sort not in valid_sorts:
        raise HTTPException(status_code=400, detail=f"Invalid sort field. Must be one of: {valid_sorts}")

    if order not in {"asc", "desc"}:
        raise HTTPException(status_code=400, detail="Invalid order. Must be 'asc' or 'desc'")

    sql = f"""
        SELECT id, title, url, text, "by", time::varchar as time
        FROM hn
        WHERE type = 'job'
        ORDER BY {sort} {order.upper()}
        LIMIT {limit} OFFSET {offset}
    """

    conn = _get_connection()
    start_time = time.perf_counter()
    try:
        result = conn.execute(sql)
        rows = result.fetchall()
    except duckdb.Error as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()

    elapsed = time.perf_counter() - start_time

    items = [
        JobItem(
            id=row[0],
            title=row[1],
            url=row[2],
            text=row[3],
            by=row[4],
            time=row[5],
        )
        for row in rows
    ]

    return ListResponse(
        items=items,
        count=len(items),
        timing=TimingInfo(
            elapsed_seconds=elapsed,
            elapsed_formatted=_format_time(elapsed),
        ),
    )


@app.get("/stats/types", response_model=StatsResponse)
def stats_by_type() -> StatsResponse:
    """
    Get item counts grouped by type.

    Returns counts for story, comment, job, poll, and pollopt types.
    """
    sql = """
        SELECT type, count(*) as count
        FROM hn
        GROUP BY type
        ORDER BY count DESC
    """

    conn = _get_connection()
    start_time = time.perf_counter()
    try:
        result = conn.execute(sql)
        rows = result.fetchall()
    except duckdb.Error as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()

    elapsed = time.perf_counter() - start_time

    stats = [TypeCount(type=row[0] or "unknown", count=row[1]) for row in rows]

    return StatsResponse(
        stats=stats,
        timing=TimingInfo(
            elapsed_seconds=elapsed,
            elapsed_formatted=_format_time(elapsed),
        ),
    )


@app.get("/stats/users", response_model=StatsResponse)
def stats_top_users(
    limit: int = Query(100, ge=1, le=1000, description="Number of top users to return"),
) -> StatsResponse:
    """
    Get top users by post count.

    Returns users ranked by total number of posts (stories + comments).
    """
    sql = f"""
        SELECT "by" as user, count(*) as count
        FROM hn
        WHERE "by" IS NOT NULL
        GROUP BY "by"
        ORDER BY count DESC
        LIMIT {limit}
    """

    conn = _get_connection()
    start_time = time.perf_counter()
    try:
        result = conn.execute(sql)
        rows = result.fetchall()
    except duckdb.Error as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()

    elapsed = time.perf_counter() - start_time

    stats = [UserCount(user=row[0], count=row[1]) for row in rows]

    return StatsResponse(
        stats=stats,
        timing=TimingInfo(
            elapsed_seconds=elapsed,
            elapsed_formatted=_format_time(elapsed),
        ),
    )


@app.get("/top/stories", response_model=ListResponse)
def top_stories(
    limit: int = Query(100, ge=1, le=1000, description="Number of top stories to return"),
    min_score: int = Query(0, ge=0, description="Minimum score filter"),
) -> ListResponse:
    """
    Get top stories by score.

    Returns stories ranked by score (highest first).
    """
    sql = f"""
        SELECT id, title, url, score, "by", time::varchar as time, descendants
        FROM hn
        WHERE type = 'story' AND score >= {min_score}
        ORDER BY score DESC NULLS LAST
        LIMIT {limit}
    """

    conn = _get_connection()
    start_time = time.perf_counter()
    try:
        result = conn.execute(sql)
        rows = result.fetchall()
    except duckdb.Error as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()

    elapsed = time.perf_counter() - start_time

    items = [
        StoryItem(
            id=row[0],
            title=row[1],
            url=row[2],
            score=row[3],
            by=row[4],
            time=row[5],
            descendants=row[6],
        )
        for row in rows
    ]

    return ListResponse(
        items=items,
        count=len(items),
        timing=TimingInfo(
            elapsed_seconds=elapsed,
            elapsed_formatted=_format_time(elapsed),
        ),
    )
