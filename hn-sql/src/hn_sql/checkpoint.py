"""Checkpoint management for resumable fetching."""

import json
from pathlib import Path
from datetime import datetime, timezone
from dataclasses import dataclass, asdict


@dataclass
class Checkpoint:
    """Represents fetch progress state."""
    last_fetched_id: int
    max_item_id: int
    items_fetched: int
    items_written: int
    started_at: str
    updated_at: str

    @classmethod
    def new(cls, max_item_id: int) -> "Checkpoint":
        now = datetime.now(timezone.utc).isoformat()
        return cls(
            last_fetched_id=0,
            max_item_id=max_item_id,
            items_fetched=0,
            items_written=0,
            started_at=now,
            updated_at=now,
        )

    def update(self, last_id: int, fetched: int, written: int) -> None:
        self.last_fetched_id = last_id
        self.items_fetched += fetched
        self.items_written += written
        self.updated_at = datetime.now(timezone.utc).isoformat()

    @property
    def progress_pct(self) -> float:
        if self.max_item_id == 0:
            return 0.0
        return (self.last_fetched_id / self.max_item_id) * 100


class CheckpointManager:
    """Manages checkpoint persistence."""

    def __init__(self, path: str = "checkpoint.json"):
        self.path = Path(path)

    def exists(self) -> bool:
        return self.path.exists()

    def load(self) -> Checkpoint | None:
        if not self.exists():
            return None
        data = json.loads(self.path.read_text())
        return Checkpoint(**data)

    def save(self, checkpoint: Checkpoint) -> None:
        self.path.write_text(json.dumps(asdict(checkpoint), indent=2))

    def delete(self) -> None:
        if self.exists():
            self.path.unlink()
