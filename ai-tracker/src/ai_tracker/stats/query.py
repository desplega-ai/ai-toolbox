"""Query engine for ai-tracker statistics."""

from datetime import datetime, timedelta
from pathlib import Path

from ..db import get_connection


def get_stats(days: int = 30, repo: str | None = None, db_path: Path | None = None) -> dict:
    """Get aggregate statistics for the given time period.

    Args:
        days: Number of days to look back
        repo: Optional repository name to filter by
        db_path: Optional path to database (for testing)

    Returns:
        Dict with ai_lines_added, ai_lines_removed, human_lines_added,
        human_lines_removed, total_commits, and percentages
    """
    since = (datetime.utcnow() - timedelta(days=days)).isoformat() + "Z"

    with get_connection(db_path) as conn:
        if repo:
            cursor = conn.execute(
                """
                SELECT
                    COALESCE(SUM(ai_lines_added), 0) as ai_added,
                    COALESCE(SUM(ai_lines_removed), 0) as ai_removed,
                    COALESCE(SUM(human_lines_added), 0) as human_added,
                    COALESCE(SUM(human_lines_removed), 0) as human_removed,
                    COUNT(*) as total_commits
                FROM commits
                WHERE timestamp >= ? AND repo_name = ?
                """,
                (since, repo),
            )
        else:
            cursor = conn.execute(
                """
                SELECT
                    COALESCE(SUM(ai_lines_added), 0) as ai_added,
                    COALESCE(SUM(ai_lines_removed), 0) as ai_removed,
                    COALESCE(SUM(human_lines_added), 0) as human_added,
                    COALESCE(SUM(human_lines_removed), 0) as human_removed,
                    COUNT(*) as total_commits
                FROM commits
                WHERE timestamp >= ?
                """,
                (since,),
            )

        row = cursor.fetchone()

    ai_added = row["ai_added"]
    ai_removed = row["ai_removed"]
    human_added = row["human_added"]
    human_removed = row["human_removed"]
    total_commits = row["total_commits"]

    total_added = ai_added + human_added
    total_removed = ai_removed + human_removed

    return {
        "ai_lines_added": ai_added,
        "ai_lines_removed": ai_removed,
        "human_lines_added": human_added,
        "human_lines_removed": human_removed,
        "total_commits": total_commits,
        "ai_percent_added": (ai_added / total_added * 100) if total_added > 0 else 0,
        "ai_percent_removed": (ai_removed / total_removed * 100) if total_removed > 0 else 0,
        "human_percent_added": (human_added / total_added * 100) if total_added > 0 else 0,
        "human_percent_removed": (human_removed / total_removed * 100) if total_removed > 0 else 0,
        "days": days,
        "repo": repo,
    }


def get_per_repo_stats(days: int = 30, db_path: Path | None = None) -> list[dict]:
    """Get statistics broken down by repository.

    Args:
        days: Number of days to look back
        db_path: Optional path to database (for testing)

    Returns:
        List of dicts with repo_name and statistics
    """
    since = (datetime.utcnow() - timedelta(days=days)).isoformat() + "Z"

    with get_connection(db_path) as conn:
        cursor = conn.execute(
            """
            SELECT
                repo_name,
                COALESCE(SUM(ai_lines_added), 0) as ai_added,
                COALESCE(SUM(ai_lines_removed), 0) as ai_removed,
                COALESCE(SUM(human_lines_added), 0) as human_added,
                COALESCE(SUM(human_lines_removed), 0) as human_removed,
                COUNT(*) as total_commits
            FROM commits
            WHERE timestamp >= ?
            GROUP BY repo_name
            ORDER BY total_commits DESC
            """,
            (since,),
        )

        results = []
        for row in cursor.fetchall():
            ai_added = row["ai_added"]
            human_added = row["human_added"]
            total_added = ai_added + human_added

            results.append(
                {
                    "repo_name": row["repo_name"],
                    "ai_lines_added": ai_added,
                    "ai_lines_removed": row["ai_removed"],
                    "human_lines_added": human_added,
                    "human_lines_removed": row["human_removed"],
                    "total_commits": row["total_commits"],
                    "ai_percent": (ai_added / total_added * 100) if total_added > 0 else 0,
                }
            )

        return results


def get_time_series(
    days: int = 30, granularity: str = "day", db_path: Path | None = None
) -> list[dict]:
    """Get time series data for charting.

    Args:
        days: Number of days to look back
        granularity: 'day' or 'week'
        db_path: Optional path to database (for testing)

    Returns:
        List of dicts with date, ai_lines, human_lines
    """
    since = (datetime.utcnow() - timedelta(days=days)).isoformat() + "Z"

    if granularity == "week":
        date_format = "%Y-W%W"
        group_expr = "strftime('%Y-W%W', timestamp)"
    else:
        date_format = "%Y-%m-%d"
        group_expr = "date(timestamp)"

    with get_connection(db_path) as conn:
        cursor = conn.execute(
            f"""
            SELECT
                {group_expr} as period,
                COALESCE(SUM(ai_lines_added), 0) as ai_added,
                COALESCE(SUM(human_lines_added), 0) as human_added
            FROM commits
            WHERE timestamp >= ?
            GROUP BY period
            ORDER BY period
            """,
            (since,),
        )

        return [
            {
                "period": row["period"],
                "ai_lines": row["ai_added"],
                "human_lines": row["human_added"],
            }
            for row in cursor.fetchall()
        ]


def get_recent_commits(limit: int = 10, db_path: Path | None = None) -> list[dict]:
    """Get recent commits with attribution.

    Args:
        limit: Maximum number of commits to return
        db_path: Optional path to database (for testing)

    Returns:
        List of recent commits with their stats
    """
    with get_connection(db_path) as conn:
        cursor = conn.execute(
            """
            SELECT
                timestamp,
                commit_sha,
                repo_name,
                ai_lines_added,
                ai_lines_removed,
                human_lines_added,
                human_lines_removed
            FROM commits
            ORDER BY timestamp DESC
            LIMIT ?
            """,
            (limit,),
        )

        return [dict(row) for row in cursor.fetchall()]
