"""Matrix-style progress display for fetch operations."""

import time
from dataclasses import dataclass, field

from rich.console import Console, Group
from rich.live import Live
from rich.panel import Panel
from rich.progress import BarColumn, Progress, TextColumn, TaskID
from rich.text import Text


@dataclass
class FetchProgress:
    """Tracks fetch progress state."""

    batch_start: int = 0
    batch_end: int = 0
    batch_completed: int = 0
    total_start: int = 0
    total_end: int = 0
    total_fetched: int = 0
    max_connections: int = 200
    active_connections: int = 0
    start_time: float = field(default_factory=time.time)

    @property
    def batch_size(self) -> int:
        return self.batch_end - self.batch_start

    @property
    def batch_pct(self) -> float:
        if self.batch_size == 0:
            return 0
        return (self.batch_completed / self.batch_size) * 100

    @property
    def total_pct(self) -> float:
        total = self.total_end - self.total_start + 1
        if total == 0:
            return 0
        done = self.batch_start - self.total_start + self.batch_completed
        return (done / total) * 100

    @property
    def elapsed(self) -> float:
        return time.time() - self.start_time

    @property
    def rate(self) -> float:
        if self.elapsed == 0:
            return 0
        return self.total_fetched / self.elapsed

    @property
    def eta_seconds(self) -> float | None:
        if self.rate == 0:
            return None
        remaining = self.total_end - (self.batch_start + self.batch_completed)
        if remaining <= 0:
            return 0
        return remaining / self.rate


def format_duration(seconds: float | None) -> str:
    """Format seconds as human-readable duration."""
    if seconds is None:
        return "—"
    if seconds < 60:
        return f"{seconds:.0f}s"
    if seconds < 3600:
        mins = int(seconds // 60)
        secs = int(seconds % 60)
        return f"{mins}m {secs}s"
    hours = int(seconds // 3600)
    mins = int((seconds % 3600) // 60)
    return f"{hours}h {mins}m"


def format_number(n: int) -> str:
    """Format number with commas."""
    return f"{n:,}"


class MatrixProgress:
    """Matrix-style progress display using Rich Live."""

    def __init__(self, console: Console | None = None):
        self.console = console or Console()
        self.state = FetchProgress()
        self._live: Live | None = None

    def _build_connection_bar(self) -> Text:
        """Build the connection activity indicator."""
        max_dots = 40
        active = self.state.active_connections
        total = self.state.max_connections

        # Scale to display width
        if total > 0:
            filled = int((active / total) * max_dots)
        else:
            filled = 0

        bar = Text()
        bar.append("●" * filled, style="green bold")
        bar.append("○" * (max_dots - filled), style="dim")
        return bar

    def _build_batch_bar(self) -> Text:
        """Build the batch progress bar."""
        width = 48
        pct = self.state.batch_pct / 100
        filled = int(pct * width)

        bar = Text()
        bar.append("█" * filled, style="cyan bold")
        bar.append("░" * (width - filled), style="dim")
        return bar

    def _render(self) -> Panel:
        """Render the progress display."""
        s = self.state

        # Header line
        header = Text()
        header.append("Batch ", style="dim")
        header.append(format_number(s.batch_start), style="bold")
        header.append(" → ", style="dim")
        header.append(format_number(s.batch_end), style="bold")
        header.append(f"  of {format_number(s.total_end)}", style="dim")

        # Batch progress bar
        batch_bar = self._build_batch_bar()
        batch_stats = Text()
        batch_stats.append(f"{format_number(s.batch_completed)} / {format_number(s.batch_size)}", style="bold")
        batch_stats.append(f"  {s.batch_pct:5.1f}%", style="cyan")

        # Connection indicator
        conn_bar = self._build_connection_bar()
        conn_text = Text()
        conn_text.append("Connections ", style="dim")
        conn_text.append(conn_bar)
        conn_text.append(f" {s.active_connections}/{s.max_connections}", style="bold")

        # Stats line
        stats = Text()
        stats.append(f"{format_number(int(s.rate))}/s", style="green bold")
        stats.append(" │ ", style="dim")
        stats.append(f"{format_duration(s.elapsed)}", style="dim")
        stats.append(" │ ", style="dim")
        eta_str = format_duration(s.eta_seconds)
        if s.eta_seconds and s.eta_seconds > 0:
            stats.append(f"ETA {eta_str}", style="yellow")
        else:
            stats.append("ETA —", style="dim")
        stats.append(" │ ", style="dim")
        stats.append(f"{format_number(s.total_fetched)} items", style="bold")

        # Overall progress
        overall = Text()
        overall.append(f"Overall: {s.total_pct:.1f}%", style="bold cyan")

        # Combine into panel
        content = Group(
            header,
            Text(""),
            batch_bar,
            batch_stats,
            Text(""),
            conn_text,
            Text(""),
            stats,
            overall,
        )

        return Panel(
            content,
            title="[bold]HN Fetch Progress[/bold]",
            border_style="blue",
            padding=(0, 1),
        )

    def start(
        self,
        total_start: int,
        total_end: int,
        max_connections: int,
    ) -> "MatrixProgress":
        """Start the live display."""
        self.state = FetchProgress(
            total_start=total_start,
            total_end=total_end,
            max_connections=max_connections,
            start_time=time.time(),
        )
        self._live = Live(
            self._render(),
            console=self.console,
            refresh_per_second=10,
            transient=False,
        )
        self._live.start()
        return self

    def stop(self):
        """Stop the live display and restore terminal state."""
        if self._live:
            self._live.stop()
            self._live = None
        # Always restore cursor visibility
        self.console.show_cursor(True)

    def __enter__(self) -> "MatrixProgress":
        return self

    def __exit__(self, *args):
        self.stop()

    def start_batch(self, start: int, end: int):
        """Signal start of a new batch."""
        self.state.batch_start = start
        self.state.batch_end = end
        self.state.batch_completed = 0
        self._refresh()

    def item_completed(self, had_data: bool = True):
        """Signal an item fetch completed."""
        self.state.batch_completed += 1
        if had_data:
            self.state.total_fetched += 1
        self._refresh()

    def set_active_connections(self, count: int):
        """Update active connection count."""
        self.state.active_connections = count
        self._refresh()

    def connection_started(self):
        """Signal a connection started."""
        self.state.active_connections += 1
        self._refresh()

    def connection_ended(self):
        """Signal a connection ended."""
        self.state.active_connections = max(0, self.state.active_connections - 1)
        self._refresh()

    def _refresh(self):
        """Refresh the display."""
        if self._live:
            self._live.update(self._render())
