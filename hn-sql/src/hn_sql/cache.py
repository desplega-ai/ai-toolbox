"""Simple TTL-based caching for dashboard endpoints."""

import time
from functools import wraps
from typing import Any, Callable

# Cache storage: {cache_key: (result, expiry_timestamp)}
_cache: dict[str, tuple[Any, float]] = {}

# Stats tracking
_stats: dict[str, dict[str, int]] = {}  # {cache_key: {hits: N, misses: N}}


def ttl_cache(ttl_seconds: int = 600):
    """Decorator to cache function results with TTL.

    Args:
        ttl_seconds: Time to live in seconds (default 10 minutes)
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(*args, **kwargs):
            # Create unique cache key from function name and args
            # Skip 'no_cache' kwarg when building key
            filtered_kwargs = {k: v for k, v in kwargs.items() if k != 'no_cache'}
            cache_key = f"{func.__name__}:{hash((args, tuple(sorted(filtered_kwargs.items()))))}"

            # Check if bypassing cache
            if kwargs.get('no_cache', False):
                return func(*args, **kwargs)

            # Initialize stats for this key
            if cache_key not in _stats:
                _stats[cache_key] = {'hits': 0, 'misses': 0}

            # Check cache
            now = time.time()
            if cache_key in _cache:
                result, expiry = _cache[cache_key]
                if now < expiry:
                    _stats[cache_key]['hits'] += 1
                    return result

            # Cache miss - execute function
            _stats[cache_key]['misses'] += 1
            result = func(*args, **kwargs)

            # Store in cache
            _cache[cache_key] = (result, now + ttl_seconds)

            return result

        # Attach cache key generator for testing
        wrapper._cache_key_prefix = func.__name__
        return wrapper

    return decorator


def clear_cache() -> int:
    """Clear all cached data.

    Returns:
        Number of entries cleared
    """
    count = len(_cache)
    _cache.clear()
    return count


def get_cache_stats() -> dict[str, Any]:
    """Get cache statistics for monitoring.

    Returns:
        Dict with cache statistics
    """
    now = time.time()
    active_entries = sum(1 for _, (_, expiry) in _cache.items() if expiry > now)
    expired_entries = len(_cache) - active_entries

    total_hits = sum(s['hits'] for s in _stats.values())
    total_misses = sum(s['misses'] for s in _stats.values())

    return {
        'total_entries': len(_cache),
        'active_entries': active_entries,
        'expired_entries': expired_entries,
        'total_hits': total_hits,
        'total_misses': total_misses,
        'hit_rate': total_hits / (total_hits + total_misses) if (total_hits + total_misses) > 0 else 0,
        'endpoints': {
            key.split(':')[0]: stats
            for key, stats in _stats.items()
        },
    }
