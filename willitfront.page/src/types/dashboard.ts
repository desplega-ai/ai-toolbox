export interface DashboardConfig {
  id: string;
  name: string;
  description: string;
  queries: DashboardQuery[];
}

// API method names from api.dashboard.*
export type DashboardEndpoint =
  | 'totalStories'
  | 'totalComments'
  | 'uniqueUsers'
  | 'lastSynced'
  | 'itemsByType'
  | 'mostDiscussed'
  | 'topAuthors'
  | 'activeCommenters'
  | 'topDomains'
  | 'bestDomains'
  | 'postsByHour'
  | 'postsByDay'
  | 'timeline';

export interface DashboardQuery {
  id: string;
  title: string;
  endpoint: DashboardEndpoint;
  visualization: 'table' | 'bar' | 'line' | 'metric';
  // For metric visualization
  metricLabel?: string;
}
