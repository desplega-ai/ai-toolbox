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
        sql: `SELECT COUNT(*) as count FROM hn WHERE type = 'story'`,
        visualization: 'metric',
        metricLabel: 'Stories',
      },
      {
        id: 'total-comments',
        title: 'Total Comments',
        sql: `SELECT COUNT(*) as count FROM hn WHERE type = 'comment'`,
        visualization: 'metric',
        metricLabel: 'Comments',
      },
      {
        id: 'unique-users',
        title: 'Unique Users',
        sql: `SELECT COUNT(DISTINCT "by") as count FROM hn WHERE "by" IS NOT NULL`,
        visualization: 'metric',
        metricLabel: 'Users',
      },
      {
        id: 'items-by-type',
        title: 'Items by Type',
        sql: `SELECT type, COUNT(*) as count FROM hn GROUP BY type ORDER BY count DESC`,
        visualization: 'bar',
      },
      {
        id: 'last-synced',
        title: 'Last Synced Item',
        sql: `SELECT MAX(time) as last_sync FROM hn`,
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
        id: 'top-stories',
        title: 'Top Stories by Score',
        sql: `SELECT title, score, "by", time FROM hn WHERE type = 'story' ORDER BY score DESC LIMIT 20`,
        visualization: 'table',
      },
      {
        id: 'most-discussed',
        title: 'Most Discussed',
        sql: `SELECT title, descendants as comments, score, "by" FROM hn WHERE type = 'story' AND descendants IS NOT NULL ORDER BY descendants DESC LIMIT 20`,
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
        sql: `SELECT "by", COUNT(*) as stories, SUM(score) as total_score FROM hn WHERE type = 'story' AND "by" IS NOT NULL GROUP BY "by" ORDER BY total_score DESC LIMIT 20`,
        visualization: 'table',
      },
      {
        id: 'active-commenters',
        title: 'Most Active Commenters',
        sql: `SELECT "by", COUNT(*) as comments FROM hn WHERE type = 'comment' AND "by" IS NOT NULL GROUP BY "by" ORDER BY comments DESC LIMIT 20`,
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
        sql: `SELECT REGEXP_EXTRACT(url, 'https?://([^/]+)', 1) as domain, COUNT(*) as posts, ROUND(AVG(score), 1) as avg_score FROM hn WHERE type = 'story' AND url IS NOT NULL GROUP BY domain HAVING domain IS NOT NULL ORDER BY posts DESC LIMIT 20`,
        visualization: 'table',
      },
      {
        id: 'best-domains',
        title: 'Highest Avg Score (min 3 posts)',
        sql: `SELECT REGEXP_EXTRACT(url, 'https?://([^/]+)', 1) as domain, COUNT(*) as posts, ROUND(AVG(score), 1) as avg_score FROM hn WHERE type = 'story' AND url IS NOT NULL GROUP BY domain HAVING domain IS NOT NULL AND posts >= 3 ORDER BY avg_score DESC LIMIT 20`,
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
        sql: `SELECT HOUR(time) as hour, COUNT(*) as posts FROM hn WHERE type = 'story' GROUP BY hour ORDER BY hour`,
        visualization: 'bar',
      },
      {
        id: 'posts-by-day',
        title: 'Posts by Day of Week',
        sql: `SELECT DAYOFWEEK(time) as day, COUNT(*) as posts FROM hn WHERE type = 'story' GROUP BY day ORDER BY day`,
        visualization: 'bar',
      },
      {
        id: 'activity-timeline',
        title: 'Activity Over Time (Monthly)',
        sql: `SELECT DATE_TRUNC('month', time) as month, COUNT(*) as items FROM hn GROUP BY month ORDER BY month`,
        visualization: 'line',
      },
    ],
  },
];

export function getDashboard(id: string): DashboardConfig | undefined {
  return dashboards.find(d => d.id === id);
}
