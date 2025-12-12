import { useState, useCallback } from 'react';
import { api } from '@/lib/api';
import type { QueryResponse } from '@/types/api';

interface QueryState {
  data: QueryResponse | null;
  error: string | null;
  isLoading: boolean;
}

export function useQuery() {
  const [state, setState] = useState<QueryState>({
    data: null,
    error: null,
    isLoading: false,
  });

  const execute = useCallback(async (sql: string, limit?: number) => {
    setState({ data: null, error: null, isLoading: true });
    try {
      const data = await api.query(sql, limit);
      setState({ data, error: null, isLoading: false });
      return data;
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Query failed';
      setState({ data: null, error, isLoading: false });
      throw err;
    }
  }, []);

  const clear = useCallback(() => {
    setState({ data: null, error: null, isLoading: false });
  }, []);

  return { ...state, execute, clear };
}
