"""Async HTTP fetcher for HN API."""

import asyncio
from typing import AsyncIterator, Callable

import httpx

HN_API_BASE = "https://hacker-news.firebaseio.com/v0"


class HNFetcher:
    """Async fetcher for Hacker News API."""

    def __init__(self, concurrency: int = 35, timeout: float = 30.0, shutdown_event: asyncio.Event | None = None):
        self.concurrency = concurrency
        self.timeout = timeout
        self.semaphore = asyncio.Semaphore(concurrency)
        self._client: httpx.AsyncClient | None = None
        self._active_count = 0
        self._on_connection_start: Callable[[], None] | None = None
        self._on_connection_end: Callable[[], None] | None = None
        self._pending_tasks: set[asyncio.Task] = set()
        self._shutdown = False
        self._shutdown_event = shutdown_event

    def _is_shutdown(self) -> bool:
        """Check if shutdown has been requested."""
        return self._shutdown or (self._shutdown_event is not None and self._shutdown_event.is_set())

    def set_connection_callbacks(
        self,
        on_start: Callable[[], None] | None = None,
        on_end: Callable[[], None] | None = None,
    ):
        """Set callbacks for connection lifecycle events."""
        self._on_connection_start = on_start
        self._on_connection_end = on_end

    async def __aenter__(self) -> "HNFetcher":
        self._client = httpx.AsyncClient(
            timeout=httpx.Timeout(self.timeout),
            limits=httpx.Limits(
                max_connections=self.concurrency,
                max_keepalive_connections=self.concurrency,
            ),
        )
        self._shutdown = False
        return self

    async def __aexit__(self, *args) -> None:
        await self.shutdown()

    async def shutdown(self):
        """Cancel pending tasks and close the client."""
        self._shutdown = True
        # Cancel all pending tasks
        for task in self._pending_tasks:
            task.cancel()
        # Wait for tasks to complete cancellation
        if self._pending_tasks:
            await asyncio.gather(*self._pending_tasks, return_exceptions=True)
        self._pending_tasks.clear()
        # Close the client
        if self._client:
            await self._client.aclose()
            self._client = None

    async def get_max_item_id(self) -> int:
        """Get the current maximum item ID."""
        resp = await self._client.get(f"{HN_API_BASE}/maxitem.json")
        resp.raise_for_status()
        return resp.json()

    async def fetch_item(self, item_id: int) -> dict | None:
        """Fetch a single item by ID. Returns None if not found."""
        if self._is_shutdown():
            return None
        async with self.semaphore:
            if self._is_shutdown():
                return None
            if self._on_connection_start:
                self._on_connection_start()
            try:
                resp = await self._client.get(f"{HN_API_BASE}/item/{item_id}.json")
                resp.raise_for_status()
                return resp.json()  # Can be null for deleted items
            except httpx.HTTPStatusError as e:
                if e.response.status_code == 404:
                    return None
                raise
            except (httpx.TimeoutException, httpx.ReadError, httpx.ConnectError):
                if self._is_shutdown():
                    return None
                # Retry with backoff
                for attempt in range(3):
                    await asyncio.sleep(0.5 * (attempt + 1))
                    if self._is_shutdown():
                        return None
                    try:
                        resp = await self._client.get(f"{HN_API_BASE}/item/{item_id}.json")
                        resp.raise_for_status()
                        return resp.json()
                    except (httpx.TimeoutException, httpx.ReadError, httpx.ConnectError):
                        continue
                return None  # Give up after retries
            except (asyncio.CancelledError, RuntimeError):
                # Gracefully handle cancellation and client closed
                return None
            finally:
                if self._on_connection_end:
                    self._on_connection_end()

    async def fetch_items(
        self,
        item_ids: list[int],
        on_progress: Callable[[int], None] | None = None,
    ) -> AsyncIterator[tuple[int, dict | None]]:
        """Fetch multiple items concurrently. Yields (id, item) pairs."""

        async def fetch_one(item_id: int) -> tuple[int, dict | None]:
            item = await self.fetch_item(item_id)
            if on_progress:
                on_progress(1)
            return (item_id, item)

        # Create tasks for all items
        tasks = [asyncio.create_task(fetch_one(item_id)) for item_id in item_ids]
        self._pending_tasks.update(tasks)

        try:
            # Yield results as they complete
            for coro in asyncio.as_completed(tasks):
                if self._is_shutdown():
                    break
                try:
                    result = await coro
                    yield result
                except asyncio.CancelledError:
                    continue
        finally:
            # Clean up task references
            for task in tasks:
                self._pending_tasks.discard(task)

    async def fetch_range(
        self,
        start_id: int,
        end_id: int,
        batch_size: int = 10000,
        on_batch: callable = None,
    ) -> AsyncIterator[list[dict]]:
        """Fetch items in a range, yielding batches."""
        current = start_id

        while current <= end_id:
            batch_end = min(current + batch_size, end_id + 1)
            item_ids = list(range(current, batch_end))

            items = []
            async for item_id, item in self.fetch_items(item_ids):
                if item is not None:
                    items.append(item)

            if items:
                yield items

            if on_batch:
                on_batch(batch_end - 1)

            current = batch_end
