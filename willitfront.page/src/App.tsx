import { useTabs } from '@/hooks/useTabs';
import { TabBar } from '@/components/tabs/TabBar';
import { NotebookQueryTab } from '@/components/notebook/NotebookQueryTab';
import { DashboardTab } from '@/components/tabs/DashboardTab';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Database, BarChart3, Lightbulb } from 'lucide-react';

const QUICK_ACTIONS = [
  { type: 'query' as const, title: 'Notebook', description: 'Interactive analysis with SQL (more languages coming soon)', icon: Database, disabled: false },
  { type: 'dashboard' as const, title: 'Analytics', description: 'Dashboards with key metrics and insights', icon: BarChart3, disabled: false },
  { type: null, title: 'Post Tester', description: 'Test your post titles before submitting', icon: Lightbulb, disabled: true },
];

function App() {
  const { tabs, activeTabId, activeTab, createTab, closeTab, setActiveTab, updateTab, resetTabs } = useTabs();

  return (
    <div className="h-screen flex flex-col bg-[var(--hn-bg)]">
      <TabBar
        tabs={tabs}
        activeTabId={activeTabId}
        onTabSelect={setActiveTab}
        onTabClose={closeTab}
        onTabRename={(tabId, title) => updateTab(tabId, { title })}
        onReset={resetTabs}
      />

      <main className="flex-1 overflow-hidden">
        {activeTab ? (
          activeTab.type === 'query' ? (
            <NotebookQueryTab key={activeTab.id} tab={activeTab} onUpdate={(u) => updateTab(activeTab.id, u)} />
          ) : (
            <DashboardTab />
          )
        ) : (
          <div className="h-full flex flex-col items-center justify-center p-8">
            <h1 className="text-2xl font-bold mb-2">Will it front page?</h1>
            <p className="text-gray-500 mb-8">Analyze what makes content go viral. Currently featuring Hacker News data, with Product Hunt and more coming soon.</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl w-full">
              {QUICK_ACTIONS.map((action) => (
                <Card
                  key={action.title}
                  className={`transition-all ${
                    action.disabled
                      ? 'opacity-60 cursor-not-allowed'
                      : 'cursor-pointer hover:border-[var(--hn-orange)] hover:shadow-md'
                  }`}
                  onClick={() => !action.disabled && action.type && createTab(action.type, action.title)}
                >
                  <CardHeader className="p-6">
                    <div className="flex flex-col gap-4">
                      <div className={`p-3 rounded-lg w-fit ${action.disabled ? 'bg-gray-100' : 'bg-orange-100'}`}>
                        <action.icon className={`h-7 w-7 ${action.disabled ? 'text-gray-400' : 'text-[var(--hn-orange)]'}`} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <CardTitle className="text-lg">{action.title}</CardTitle>
                          {action.disabled && (
                            <span className="text-xs bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded">Soon</span>
                          )}
                        </div>
                        <CardDescription>{action.description}</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                </Card>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
