import type {
  QueryRequest,
  QueryResponse,
  SchemaResponse,
  MetricResponse,
  DashboardTableResponse,
  DashboardChartResponse,
} from '@/types/api';

// Use relative paths - same-origin requests
const API_BASE = '/api';

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

// Dashboard endpoints are proxied through /api/dashboard/* and /api/stats/*
async function dashboardRequest<T>(endpoint: string): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: { 'Content-Type': 'application/json' },
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

  // Dashboard endpoints (proxied through /api/dashboard/*)
  dashboard: {
    // Overview metrics
    totalStories: (): Promise<MetricResponse> =>
      dashboardRequest<MetricResponse>('/dashboard/overview/total-stories'),
    totalComments: (): Promise<MetricResponse> =>
      dashboardRequest<MetricResponse>('/dashboard/overview/total-comments'),
    uniqueUsers: (): Promise<MetricResponse> =>
      dashboardRequest<MetricResponse>('/dashboard/overview/unique-users'),
    lastSynced: (): Promise<MetricResponse> =>
      dashboardRequest<MetricResponse>('/dashboard/overview/last-synced'),

    // Content
    mostDiscussed: (limit = 20): Promise<DashboardTableResponse> =>
      dashboardRequest<DashboardTableResponse>(`/dashboard/content/most-discussed?limit=${limit}`),

    // Users
    topAuthors: (limit = 20): Promise<DashboardTableResponse> =>
      dashboardRequest<DashboardTableResponse>(`/dashboard/users/top-authors?limit=${limit}`),
    activeCommenters: (limit = 20): Promise<DashboardChartResponse> =>
      dashboardRequest<DashboardChartResponse>(`/dashboard/users/active-commenters?limit=${limit}`),

    // Domains
    topDomains: (limit = 20): Promise<DashboardTableResponse> =>
      dashboardRequest<DashboardTableResponse>(`/dashboard/domains/top-domains?limit=${limit}`),
    bestDomains: (limit = 20, minPosts = 3): Promise<DashboardChartResponse> =>
      dashboardRequest<DashboardChartResponse>(`/dashboard/domains/best-domains?limit=${limit}&min_posts=${minPosts}`),

    // Activity
    postsByHour: (): Promise<DashboardChartResponse> =>
      dashboardRequest<DashboardChartResponse>('/dashboard/activity/posts-by-hour'),
    postsByDay: (): Promise<DashboardChartResponse> =>
      dashboardRequest<DashboardChartResponse>('/dashboard/activity/posts-by-day'),
    timeline: (): Promise<DashboardChartResponse> =>
      dashboardRequest<DashboardChartResponse>('/dashboard/activity/timeline'),

    // Stats (existing endpoint)
    itemsByType: (): Promise<DashboardChartResponse> =>
      dashboardRequest<{ stats: Array<{ type: string; count: number }>; timing: { elapsed_seconds: number; elapsed_formatted: string } }>('/stats/types')
        .then(res => ({
          data: res.stats.map(s => ({ type: s.type, count: s.count })),
          count: res.stats.length,
          timing: res.timing,
        })),
  },
};
