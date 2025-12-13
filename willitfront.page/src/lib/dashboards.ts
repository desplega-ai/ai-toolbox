import type { DashboardConfig } from '@/types/dashboard';

export const dashboards: DashboardConfig[] = [
  {
    id: 'overview',
    name: 'Overview',
    description: 'Key metrics at a glance',
    queries: [
      {
        id: 'total-stories',
        title: 'Total Stories',
        endpoint: 'totalStories',
        visualization: 'metric',
        metricLabel: 'Stories',
      },
      {
        id: 'total-comments',
        title: 'Total Comments',
        endpoint: 'totalComments',
        visualization: 'metric',
        metricLabel: 'Comments',
      },
      {
        id: 'unique-users',
        title: 'Unique Users',
        endpoint: 'uniqueUsers',
        visualization: 'metric',
        metricLabel: 'Users',
      },
      {
        id: 'items-by-type',
        title: 'Items by Type',
        endpoint: 'itemsByType',
        visualization: 'bar',
      },
      {
        id: 'last-synced',
        title: 'Last Synced Item',
        endpoint: 'lastSynced',
        visualization: 'metric',
        metricLabel: 'Latest item timestamp',
      },
    ],
  },
  {
    id: 'top-content',
    name: 'Top Content',
    description: 'Highest performing stories and discussions',
    queries: [
      {
        id: 'most-discussed',
        title: 'Most Discussed',
        endpoint: 'mostDiscussed',
        visualization: 'table',
      },
    ],
  },
  {
    id: 'users',
    name: 'User Leaderboard',
    description: 'Most active and successful users',
    queries: [
      {
        id: 'top-authors',
        title: 'Top Story Authors (by total score)',
        endpoint: 'topAuthors',
        visualization: 'table',
      },
      {
        id: 'active-commenters',
        title: 'Most Active Commenters',
        endpoint: 'activeCommenters',
        visualization: 'bar',
      },
    ],
  },
  {
    id: 'domains',
    name: 'Domain Analysis',
    description: 'Most posted and best performing domains',
    queries: [
      {
        id: 'top-domains',
        title: 'Most Posted Domains',
        endpoint: 'topDomains',
        visualization: 'table',
      },
      {
        id: 'best-domains',
        title: 'Highest Avg Score (min 3 posts)',
        endpoint: 'bestDomains',
        visualization: 'bar',
      },
    ],
  },
  {
    id: 'activity',
    name: 'Activity Timeline',
    description: 'Posting patterns and trends',
    queries: [
      {
        id: 'posts-by-hour',
        title: 'Posts by Hour (UTC)',
        endpoint: 'postsByHour',
        visualization: 'bar',
      },
      {
        id: 'posts-by-day',
        title: 'Posts by Day of Week',
        endpoint: 'postsByDay',
        visualization: 'bar',
      },
      {
        id: 'activity-timeline',
        title: 'Activity Over Time (Monthly)',
        endpoint: 'timeline',
        visualization: 'line',
      },
    ],
  },
];

export function getDashboard(id: string): DashboardConfig | undefined {
  return dashboards.find(d => d.id === id);
}
