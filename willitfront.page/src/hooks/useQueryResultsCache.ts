import { useCallback } from 'react';

const QUERY_RESULTS_PREFIX = 'queryResults:';
const MAX_CACHED_RESULTS = 50;

interface CachedQueryResult {
  columns: string[];
  rows: unknown[][];
  sql: string;
  timestamp: number;
}

export function useQueryResultsCache() {
  const cacheResult = useCallback((blockId: string, data: Omit<CachedQueryResult, 'timestamp'>) => {
    try {
      localStorage.setItem(
        `${QUERY_RESULTS_PREFIX}${blockId}`,
        JSON.stringify({ ...data, timestamp: Date.now() })
      );
    } catch {
      // LocalStorage full - clear old entries
      clearOldQueryResults();
      try {
        localStorage.setItem(
          `${QUERY_RESULTS_PREFIX}${blockId}`,
          JSON.stringify({ ...data, timestamp: Date.now() })
        );
      } catch {
        // Still failed, ignore
      }
    }
  }, []);

  const getResult = useCallback((blockId: string): CachedQueryResult | null => {
    const stored = localStorage.getItem(`${QUERY_RESULTS_PREFIX}${blockId}`);
    return stored ? JSON.parse(stored) : null;
  }, []);

  return { cacheResult, getResult };
}

function clearOldQueryResults() {
  const keys = Object.keys(localStorage)
    .filter(k => k.startsWith(QUERY_RESULTS_PREFIX));

  if (keys.length > MAX_CACHED_RESULTS) {
    // Get all with timestamps, sort by age, remove oldest
    const withTimestamps = keys.map(key => {
      try {
        const data = JSON.parse(localStorage.getItem(key) || '{}');
        return { key, timestamp: data.timestamp || 0 };
      } catch {
        return { key, timestamp: 0 };
      }
    });

    withTimestamps.sort((a, b) => a.timestamp - b.timestamp);

    // Remove oldest half
    const toRemove = withTimestamps.slice(0, Math.floor(keys.length / 2));
    toRemove.forEach(({ key }) => localStorage.removeItem(key));
  }
}
