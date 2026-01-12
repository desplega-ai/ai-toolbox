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


def get_global_stats(db_path: Path | None = None) -> dict:
    """Get all-time global statistics across all repositories.

    Args:
        db_path: Optional path to database (for testing)

    Returns:
        Dict with all-time totals, commit type breakdown, and percentages
    """
    with get_connection(db_path) as conn:
        # Get totals and time range
        cursor = conn.execute(
            """
            SELECT
                COUNT(*) as total_commits,
                COALESCE(SUM(ai_lines_added), 0) as ai_added,
                COALESCE(SUM(ai_lines_removed), 0) as ai_removed,
                COALESCE(SUM(human_lines_added), 0) as human_added,
                COALESCE(SUM(human_lines_removed), 0) as human_removed,
                MIN(timestamp) as earliest,
                MAX(timestamp) as latest
            FROM commits
            """
        )
        totals = cursor.fetchone()

        # Get commit type breakdown
        cursor = conn.execute(
            """
            SELECT
                SUM(CASE WHEN (human_lines_added + human_lines_removed) = 0
                         AND (ai_lines_added + ai_lines_removed) > 0 THEN 1 ELSE 0 END) as ai_only,
                SUM(CASE WHEN (ai_lines_added + ai_lines_removed) = 0
                         AND (human_lines_added + human_lines_removed) > 0 THEN 1 ELSE 0 END) as human_only,
                SUM(CASE WHEN (ai_lines_added + ai_lines_removed) > 0
                         AND (human_lines_added + human_lines_removed) > 0 THEN 1 ELSE 0 END) as mixed
            FROM commits
            """
        )
        breakdown = cursor.fetchone()

        # Get average AI percentage per commit
        cursor = conn.execute(
            """
            SELECT AVG(
                CASE
                    WHEN (ai_lines_added + ai_lines_removed + human_lines_added + human_lines_removed) > 0
                    THEN (ai_lines_added + ai_lines_removed) * 100.0 /
                         (ai_lines_added + ai_lines_removed + human_lines_added + human_lines_removed)
                    ELSE 0
                END
            ) as avg_ai_percent
            FROM commits
            """
        )
        avg_row = cursor.fetchone()

    total_commits = totals["total_commits"]
    ai_added = totals["ai_added"]
    ai_removed = totals["ai_removed"]
    human_added = totals["human_added"]
    human_removed = totals["human_removed"]

    total_added = ai_added + human_added
    total_removed = ai_removed + human_removed

    ai_only = breakdown["ai_only"] or 0
    human_only = breakdown["human_only"] or 0
    mixed = breakdown["mixed"] or 0
    commits_with_ai = ai_only + mixed

    return {
        # Totals
        "total_commits": total_commits,
        "total_ai_lines_added": ai_added,
        "total_ai_lines_removed": ai_removed,
        "total_human_lines_added": human_added,
        "total_human_lines_removed": human_removed,
        # Line percentages
        "ai_percent_added": (ai_added / total_added * 100) if total_added > 0 else 0,
        "ai_percent_removed": (ai_removed / total_removed * 100) if total_removed > 0 else 0,
        "human_percent_added": (human_added / total_added * 100) if total_added > 0 else 0,
        "human_percent_removed": (human_removed / total_removed * 100) if total_removed > 0 else 0,
        # Commit breakdown
        "ai_only_commits": ai_only,
        "human_only_commits": human_only,
        "mixed_commits": mixed,
        # Commit percentages
        "percent_ai_only": (ai_only / total_commits * 100) if total_commits > 0 else 0,
        "percent_human_only": (human_only / total_commits * 100) if total_commits > 0 else 0,
        "percent_mixed": (mixed / total_commits * 100) if total_commits > 0 else 0,
        "percent_commits_with_ai": (commits_with_ai / total_commits * 100) if total_commits > 0 else 0,
        # Average
        "avg_ai_percent_per_commit": avg_row["avg_ai_percent"] or 0,
        # Time range
        "earliest_commit": totals["earliest"],
        "latest_commit": totals["latest"],
    }


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
