import { useTabs } from '@/hooks/useTabs';
import { TabBar } from '@/components/tabs/TabBar';
import { ChatNotebookTab } from '@/components/notebook/ChatNotebookTab';
import { DashboardTab } from '@/components/tabs/DashboardTab';
import { IdeaTesterTab } from '@/components/tabs/IdeaTesterTab';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MessageSquare, BarChart3, Lightbulb } from 'lucide-react';

const QUICK_ACTIONS = [
  { type: 'notebook' as const, title: 'Chat Analysis', description: 'Ask questions about HN data using natural language', icon: MessageSquare, disabled: false },
  { type: 'dashboard' as const, title: 'Analytics', description: 'Dashboards with key metrics and insights', icon: BarChart3, disabled: false },
  { type: 'idea-tester' as const, title: 'Post Tester', description: 'Test your post titles before submitting', icon: Lightbulb, disabled: false },
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
          activeTab.type === 'notebook' ? (
            <ChatNotebookTab key={activeTab.id} tab={activeTab} onUpdate={(u) => updateTab(activeTab.id, u)} />
          ) : activeTab.type === 'dashboard' ? (
            <DashboardTab />
          ) : (
            <IdeaTesterTab key={activeTab.id} tab={activeTab} onUpdate={(u) => updateTab(activeTab.id, u)} />
          )
        ) : (
          <div className="h-full flex flex-col items-center justify-center p-4 sm:p-8">
            <h1 className="text-xl sm:text-2xl font-bold mb-2 text-center">Will it front page?</h1>
            <p className="text-gray-500 mb-6 sm:mb-8 text-center text-sm sm:text-base max-w-lg">Analyze what makes content go viral. Currently featuring Hacker News data, with Product Hunt and more coming soon.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6 max-w-4xl w-full">
              {QUICK_ACTIONS.map((action) => (
                <Card
                  key={action.title}
                  className={`transition-all ${
                    action.disabled
                      ? 'opacity-60 cursor-not-allowed'
                      : 'cursor-pointer hover:border-[var(--hn-orange)] hover:shadow-md active:scale-[0.98]'
                  }`}
                  onClick={() => !action.disabled && action.type && createTab(action.type, action.title)}
                >
                  <CardHeader className="p-4 sm:p-6">
                    <div className="flex flex-col gap-3 sm:gap-4">
                      <div className={`p-2 sm:p-3 rounded-lg w-fit ${action.disabled ? 'bg-gray-100' : 'bg-orange-100'}`}>
                        <action.icon className={`h-5 w-5 sm:h-7 sm:w-7 ${action.disabled ? 'text-gray-400' : 'text-[var(--hn-orange)]'}`} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <CardTitle className="text-base sm:text-lg">{action.title}</CardTitle>
                          {action.disabled && (
                            <span className="text-xs bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded">Soon</span>
                          )}
                        </div>
                        <CardDescription className="text-sm">{action.description}</CardDescription>
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
