import React from 'react';
import { Plus, Settings, BarChart3, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Tab } from '../../../shared/types';
import hiveLogo from '@/assets/hive_logo.png';

interface TopBarProps {
  tabs: Tab[];
  activeTab: string;
  projectNames: Record<string, string>;
  onTabChange: (id: string) => void;
  onNewTab: () => void;
  onCloseTab: (id: string) => void;
  onRenameTab: (id: string, newTitle: string) => void;
  editingTabId: string | null;
  onStartEditing: (id: string | null) => void;
  onSettings: () => void;
  onAnalytics: () => void;
}

// Format tab title with project name and session name
function formatTabTitle(projectName: string | undefined, sessionTitle: string, maxLength = 30): string {
  if (!projectName) return sessionTitle;

  const fullTitle = `${projectName} - ${sessionTitle}`;

  if (fullTitle.length <= maxLength) return fullTitle;

  // Calculate how much to truncate
  const separator = ' - ';
  const availableForProject = maxLength - sessionTitle.length - separator.length - 3; // 3 for "..."

  if (availableForProject > 3) {
    // Truncate project name
    return `${projectName.slice(0, availableForProject)}... - ${sessionTitle}`;
  }

  // Truncate the whole thing
  return fullTitle.slice(0, maxLength - 3) + '...';
}

export function TopBar({
  tabs,
  activeTab,
  projectNames,
  onTabChange,
  onNewTab,
  onCloseTab,
  onRenameTab,
  editingTabId,
  onStartEditing,
  onSettings,
  onAnalytics,
}: TopBarProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [editValue, setEditValue] = React.useState('');

  React.useEffect(() => {
    if (editingTabId && inputRef.current) {
      const tab = tabs.find(t => t.id === editingTabId);
      setEditValue(tab?.title || '');
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingTabId, tabs]);

  const handleKeyDown = (e: React.KeyboardEvent, tabId: string) => {
    if (e.key === 'Enter') {
      onRenameTab(tabId, editValue.trim() || 'Untitled');
    } else if (e.key === 'Escape') {
      onStartEditing(null);
    }
  };

  const handleBlur = (tabId: string) => {
    onRenameTab(tabId, editValue.trim() || 'Untitled');
  };

  return (
    <div
      className="h-12 flex items-center bg-[var(--sidebar)] border-b border-[var(--border)]"
      style={{ WebkitAppRegion: 'drag' }}
    >
      {/* Spacer for traffic lights on macOS */}
      <div className="w-20 flex-shrink-0" />

      {/* Tabs */}
      <div
        className="flex items-center gap-1 overflow-x-auto px-2"
        style={{ WebkitAppRegion: 'no-drag' }}
      >
        {tabs.map((tab) => {
          const projectName = projectNames[tab.id];
          const displayTitle = formatTabTitle(projectName, tab.title);
          const fullTitle = projectName ? `${projectName} - ${tab.title}` : tab.title;

          return (
            <div
              key={tab.id}
              role="button"
              tabIndex={0}
              onClick={() => {
                if (editingTabId !== tab.id) {
                  onTabChange(tab.id);
                }
              }}
              onDoubleClick={() => onStartEditing(tab.id)}
              onKeyDown={(e) => e.key === 'Enter' && editingTabId !== tab.id && onTabChange(tab.id)}
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 text-sm rounded-t cursor-pointer',
                'border border-b-0 border-[var(--border)] transition-colors',
                'min-w-[120px] max-w-[280px]',
                activeTab === tab.id
                  ? 'bg-[var(--background)] text-[var(--foreground)]'
                  : 'bg-transparent text-[var(--foreground-muted)] hover:bg-[var(--background)]/50'
              )}
            >
              {editingTabId === tab.id ? (
                <input
                  ref={inputRef}
                  type="text"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => handleKeyDown(e, tab.id)}
                  onBlur={() => handleBlur(tab.id)}
                  className="bg-transparent border-none outline-none flex-1 text-sm"
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span className="truncate flex-1" title={fullTitle}>{displayTitle}</span>
              )}
              {tabs.length > 1 && editingTabId !== tab.id && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseTab(tab.id);
                  }}
                  className="hover:bg-[var(--destructive)]/20 rounded p-0.5 flex-shrink-0"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          );
        })}

        <Button variant="ghost" size="icon" onClick={onNewTab} className="h-7 w-7">
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* Draggable spacer */}
      <div className="flex-1 h-full" />

      {/* Actions */}
      <div
        className="flex items-center gap-2 px-3"
        style={{ WebkitAppRegion: 'no-drag' }}
      >
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onAnalytics}>
          <BarChart3 className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onSettings}>
          <Settings className="h-4 w-4" />
        </Button>
        <img src={hiveLogo} alt="Hive" className="h-6 w-6 ml-1" />
      </div>
    </div>
  );
}
