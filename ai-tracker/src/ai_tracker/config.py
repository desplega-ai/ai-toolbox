"""Configuration and path management for ai-tracker."""

import os
from pathlib import Path


def get_config_dir() -> Path:
    """Get the ai-tracker config directory, creating it if needed."""
    config_dir = Path.home() / ".config" / "ai-tracker"
    config_dir.mkdir(parents=True, exist_ok=True)
    return config_dir


def get_db_path() -> Path:
    """Get the path to the SQLite database.

    Supports configurable path via AI_TRACKER_DB_PATH env var for
    multi-agent deployments (e.g., agent-swarm workers).
    """
    if custom_path := os.environ.get("AI_TRACKER_DB_PATH"):
        path = Path(custom_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        return path

    # Default: ~/.config/ai-tracker/tracker.db
    return get_config_dir() / "tracker.db"


def get_git_hooks_dir() -> Path:
    """Get the directory for global git hooks."""
    hooks_dir = get_config_dir() / "git-hooks"
    hooks_dir.mkdir(parents=True, exist_ok=True)
    return hooks_dir


def get_claude_settings_path() -> Path:
    """Get the path to Claude Code settings.json."""
    return Path.home() / ".claude" / "settings.json"
