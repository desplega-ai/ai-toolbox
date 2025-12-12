import { Plus, X } from 'lucide-react';
import type { Tab } from '@/types/tabs';

interface TabBarProps {
  tabs: Tab[];
  activeTabId: string | null;
  onTabSelect: (tabId: string | null) => void;
  onTabClose: (tabId: string) => void;
}

export function TabBar({ tabs, activeTabId, onTabSelect, onTabClose }: TabBarProps) {
  return (
    <div className="flex items-center bg-[var(--hn-orange)] px-2 h-10">
      {tabs.map(tab => (
        <div
          key={tab.id}
          className={`flex items-center px-3 py-1 mr-1 cursor-pointer rounded-t ${
            tab.id === activeTabId ? 'bg-[var(--hn-bg)]' : 'bg-orange-200 hover:bg-orange-100'
          }`}
          onClick={() => onTabSelect(tab.id)}
        >
          <span className="text-sm truncate max-w-32">{tab.title}</span>
          <button
            className="ml-2 hover:bg-gray-200 rounded p-0.5"
            onClick={(e) => { e.stopPropagation(); onTabClose(tab.id); }}
          >
            <X size={14} />
          </button>
        </div>
      ))}

      <button
        className="p-1.5 hover:bg-orange-600 rounded ml-1 cursor-pointer transition-colors"
        onClick={() => onTabSelect(null)}
        title="New tab"
      >
        <Plus size={18} className="text-white" />
      </button>
    </div>
  );
}
