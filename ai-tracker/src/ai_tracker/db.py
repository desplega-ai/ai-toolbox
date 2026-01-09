"""SQLite database module for ai-tracker."""

import sqlite3
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from typing import Iterator

from .config import get_db_path

SCHEMA = """
-- Claude Code edits (before commit)
CREATE TABLE IF NOT EXISTS edits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    session_id TEXT NOT NULL,
    tool TEXT NOT NULL,  -- 'Edit' or 'Write'
    file_path TEXT NOT NULL,
    lines_added INTEGER NOT NULL,
    lines_removed INTEGER NOT NULL,
    cwd TEXT NOT NULL,
    committed INTEGER DEFAULT 0  -- 0=pending, 1=committed
);

-- Git commits with attribution
CREATE TABLE IF NOT EXISTS commits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    commit_sha TEXT NOT NULL,
    repo_name TEXT NOT NULL,
    repo_path TEXT NOT NULL,
    ai_lines_added INTEGER NOT NULL,
    ai_lines_removed INTEGER NOT NULL,
    human_lines_added INTEGER NOT NULL,
    human_lines_removed INTEGER NOT NULL
);

-- Per-file breakdown within each commit
CREATE TABLE IF NOT EXISTS commit_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    commit_id INTEGER NOT NULL,
    file_path TEXT NOT NULL,
    lines_added INTEGER NOT NULL,
    lines_removed INTEGER NOT NULL,
    ai_lines_added INTEGER NOT NULL,
    ai_lines_removed INTEGER NOT NULL,
    FOREIGN KEY (commit_id) REFERENCES commits(id)
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_edits_file ON edits(file_path);
CREATE INDEX IF NOT EXISTS idx_edits_timestamp ON edits(timestamp);
CREATE INDEX IF NOT EXISTS idx_edits_committed ON edits(committed);
CREATE INDEX IF NOT EXISTS idx_commits_timestamp ON commits(timestamp);
CREATE INDEX IF NOT EXISTS idx_commits_repo ON commits(repo_name);
"""


def init_db(db_path: Path | None = None) -> None:
    """Initialize the database with schema and WAL mode."""
    if db_path is None:
        db_path = get_db_path()

    with sqlite3.connect(db_path) as conn:
        # Enable WAL mode for better concurrent access
        conn.execute("PRAGMA journal_mode=WAL")
        conn.executescript(SCHEMA)
        conn.commit()


@contextmanager
def get_connection(db_path: Path | None = None) -> Iterator[sqlite3.Connection]:
    """Get a database connection context manager with WAL mode."""
    if db_path is None:
        db_path = get_db_path()

    # Ensure database exists
    if not db_path.exists():
        init_db(db_path)

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    # Ensure WAL mode is enabled (persists after first set)
    conn.execute("PRAGMA journal_mode=WAL")
    try:
        yield conn
    finally:
        conn.close()


def log_edit(
    session_id: str,
    tool: str,
    file_path: str,
    lines_added: int,
    lines_removed: int,
    cwd: str,
    db_path: Path | None = None,
) -> int:
    """Log a Claude Code edit operation."""
    with get_connection(db_path) as conn:
        cursor = conn.execute(
            """
            INSERT INTO edits (timestamp, session_id, tool, file_path, lines_added, lines_removed, cwd)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                datetime.utcnow().isoformat() + "Z",
                session_id,
                tool,
                file_path,
                lines_added,
                lines_removed,
                cwd,
            ),
        )
        conn.commit()
        return cursor.lastrowid


def get_uncommitted_edits_for_files(
    file_paths: list[str], db_path: Path | None = None
) -> list[dict]:
    """Get uncommitted edits for the given file paths."""
    if not file_paths:
        return []

    with get_connection(db_path) as conn:
        placeholders = ",".join("?" * len(file_paths))
        cursor = conn.execute(
            f"""
            SELECT id, file_path, lines_added, lines_removed
            FROM edits
            WHERE committed = 0 AND file_path IN ({placeholders})
            """,
            file_paths,
        )
        return [dict(row) for row in cursor.fetchall()]


def mark_edits_committed(edit_ids: list[int], db_path: Path | None = None) -> None:
    """Mark edits as committed."""
    if not edit_ids:
        return

    with get_connection(db_path) as conn:
        placeholders = ",".join("?" * len(edit_ids))
        conn.execute(
            f"UPDATE edits SET committed = 1 WHERE id IN ({placeholders})",
            edit_ids,
        )
        conn.commit()


def log_commit(
    commit_sha: str,
    repo_name: str,
    repo_path: str,
    ai_lines_added: int,
    ai_lines_removed: int,
    human_lines_added: int,
    human_lines_removed: int,
    file_stats: list[dict],
    db_path: Path | None = None,
) -> int:
    """Log a git commit with per-file breakdown."""
    with get_connection(db_path) as conn:
        cursor = conn.execute(
            """
            INSERT INTO commits (timestamp, commit_sha, repo_name, repo_path,
                                ai_lines_added, ai_lines_removed, human_lines_added, human_lines_removed)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                datetime.utcnow().isoformat() + "Z",
                commit_sha,
                repo_name,
                repo_path,
                ai_lines_added,
                ai_lines_removed,
                human_lines_added,
                human_lines_removed,
            ),
        )
        commit_id = cursor.lastrowid

        for file_stat in file_stats:
            conn.execute(
                """
                INSERT INTO commit_files (commit_id, file_path, lines_added, lines_removed,
                                         ai_lines_added, ai_lines_removed)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    commit_id,
                    file_stat["file_path"],
                    file_stat["lines_added"],
                    file_stat["lines_removed"],
                    file_stat["ai_lines_added"],
                    file_stat["ai_lines_removed"],
                ),
            )

        conn.commit()
        return commit_id
