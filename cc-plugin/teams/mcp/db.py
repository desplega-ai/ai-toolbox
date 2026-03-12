"""SQLite database module for desplega teams plugin.

Shared by both the session registry hook and the MCP server.
Uses WAL mode for concurrent access, 30s busy timeout.
"""

import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path

DB_DIR = Path.home() / ".desplega"
DB_PATH = DB_DIR / "desplega.db"
SCHEMA_VERSION = 1

_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS _meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
    session_id     TEXT PRIMARY KEY,
    slug           TEXT NOT NULL UNIQUE,
    directory      TEXT NOT NULL,
    tmux_pane      TEXT,
    vim_mode       INTEGER NOT NULL DEFAULT 0,
    model          TEXT,
    started_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    last_heartbeat TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_sessions_slug ON sessions(slug);
CREATE INDEX IF NOT EXISTS idx_sessions_tmux_pane ON sessions(tmux_pane);

CREATE TABLE IF NOT EXISTS messages (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id     TEXT NOT NULL,
    recipient_id  TEXT NOT NULL,
    type          TEXT NOT NULL DEFAULT 'info',
    content       TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    delivered_at  TEXT,
    read_at       TEXT,
    FOREIGN KEY (sender_id) REFERENCES sessions(session_id),
    FOREIGN KEY (recipient_id) REFERENCES sessions(session_id)
);

CREATE INDEX IF NOT EXISTS idx_messages_recipient ON messages(recipient_id);
CREATE INDEX IF NOT EXISTS idx_messages_unread ON messages(recipient_id, read_at);
"""


def _ensure_schema(conn):
    """Create tables if they don't exist, handle migrations."""
    conn.executescript(_SCHEMA_SQL)
    row = conn.execute(
        "SELECT value FROM _meta WHERE key = 'schema_version'"
    ).fetchone()
    if row is None:
        conn.execute(
            "INSERT INTO _meta (key, value) VALUES ('schema_version', ?)",
            (str(SCHEMA_VERSION),),
        )
        conn.commit()


@contextmanager
def get_db():
    """Context manager for database connections.

    Creates the database directory and file if needed.
    Enables WAL mode and 30s busy timeout.
    """
    DB_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH), timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=30000")
    _ensure_schema(conn)
    try:
        yield conn
    finally:
        conn.close()
