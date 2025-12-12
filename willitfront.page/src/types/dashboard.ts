export interface DashboardConfig {
  id: string;
  name: string;
  description: string;
  queries: DashboardQuery[];
}

export interface DashboardQuery {
  id: string;
  title: string;
  sql: string;
  visualization: 'table' | 'bar' | 'line' | 'metric';
  // For metric visualization
  metricLabel?: string;
}
