import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import type { SchemaResponse } from '@/types/api';

const SCHEMA_CACHE_KEY = 'hn-sql:schema';
const SCHEMA_TTL_MS = 60 * 60 * 1000; // 1 hour

interface CachedSchema {
  schema: SchemaResponse;
  timestamp: number;
}

export function useSchema() {
  const [schema, setSchema] = useState<SchemaResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchSchema() {
      // Check cache first
      const cached = localStorage.getItem(SCHEMA_CACHE_KEY);
      if (cached) {
        try {
          const { schema, timestamp }: CachedSchema = JSON.parse(cached);
          if (Date.now() - timestamp < SCHEMA_TTL_MS) {
            setSchema(schema);
            setIsLoading(false);
            return;
          }
        } catch {
          // Invalid cache, fetch fresh
        }
      }

      // Fetch fresh
      try {
        const data = await api.schema();
        setSchema(data);

        // Cache it
        localStorage.setItem(SCHEMA_CACHE_KEY, JSON.stringify({
          schema: data,
          timestamp: Date.now(),
        }));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch schema');
        // Fall back to cached if available
        if (cached) {
          try {
            setSchema(JSON.parse(cached).schema);
          } catch {
            // Ignore parse error
          }
        }
      } finally {
        setIsLoading(false);
      }
    }

    fetchSchema();
  }, []);

  return { schema, error, isLoading };
}
