import type { QueryRequest, QueryResponse, SchemaResponse } from '@/types/api';

const API_BASE = import.meta.env.VITE_API_URL || 'https://api.willitfront.page';

class ApiError extends Error {
  constructor(public status: number, public detail: string) {
    super(detail);
    this.name = 'ApiError';
  }
}

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new ApiError(response.status, error.error || error.detail || 'Request failed');
  }

  return response.json();
}

export const api = {
  query: (sql: string, limit?: number): Promise<QueryResponse> =>
    request<QueryResponse>('/query', {
      method: 'POST',
      body: JSON.stringify({ sql, limit } as QueryRequest),
    }),

  schema: (): Promise<SchemaResponse> =>
    request<SchemaResponse>('/schema'),

  health: (): Promise<{ status: string }> =>
    request<{ status: string }>('/health'),
};
