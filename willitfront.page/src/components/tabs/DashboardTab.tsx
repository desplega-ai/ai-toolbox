import { useState } from 'react';
import { dashboards, getDashboard } from '@/lib/dashboards';
import { DashboardPanel } from '@/components/dashboard/DashboardPanel';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart3, Users, Globe, Activity, TrendingUp } from 'lucide-react';

const DASHBOARD_ICONS: Record<string, typeof BarChart3> = {
  'overview': BarChart3,
  'top-content': TrendingUp,
  'users': Users,
  'domains': Globe,
  'activity': Activity,
};

export function DashboardTab() {
  const [activeDashboardId, setActiveDashboardId] = useState('overview');
  const dashboard = getDashboard(activeDashboardId);

  if (!dashboard) {
    return <div className="p-4 text-red-500">Dashboard not found: {activeDashboardId}</div>;
  }

  const hasMetrics = dashboard.queries.some(q => q.visualization === 'metric');
  const metrics = dashboard.queries.filter(q => q.visualization === 'metric');
  const otherQueries = dashboard.queries.filter(q => q.visualization !== 'metric');

  return (
    <div className="h-full flex flex-col">
      {/* Internal tab bar */}
      <div className="flex items-center border-b bg-gray-50 px-2 sm:px-4 overflow-x-auto scrollbar-hide">
        {dashboards.map(d => {
          const Icon = DASHBOARD_ICONS[d.id] || BarChart3;
          return (
            <button
              key={d.id}
              onClick={() => setActiveDashboardId(d.id)}
              className={`flex items-center gap-1 sm:gap-2 px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                d.id === activeDashboardId
                  ? 'border-[var(--hn-orange)] text-[var(--hn-orange)]'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Icon size={14} className="sm:w-4 sm:h-4" />
              <span className="hidden xs:inline sm:inline">{d.name}</span>
            </button>
          );
        })}
      </div>

      {/* Dashboard content */}
      <div className="flex-1 overflow-auto p-2 sm:p-4">
        <div className="mb-3 sm:mb-4">
          <h1 className="text-xl sm:text-2xl font-bold">{dashboard.name}</h1>
          <p className="text-gray-500 text-sm sm:text-base">{dashboard.description}</p>
        </div>

        {hasMetrics && (
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4 mb-4 sm:mb-6">
            {metrics.map(query => (
              <DashboardPanel key={query.id} query={query} />
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2">
          {otherQueries.map(query => (
            <Card key={query.id}>
              <CardHeader className="p-3 sm:p-6">
                <CardTitle className="text-base sm:text-lg">{query.title}</CardTitle>
              </CardHeader>
              <CardContent className="p-3 sm:p-6 pt-0">
                <DashboardPanel query={query} />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
