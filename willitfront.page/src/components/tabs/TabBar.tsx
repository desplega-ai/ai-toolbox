import { useState, useRef, useEffect } from 'react';
import { Plus, X } from 'lucide-react';
import type { Tab } from '@/types/tabs';

interface TabBarProps {
  tabs: Tab[];
  activeTabId: string | null;
  onTabSelect: (tabId: string | null) => void;
  onTabClose: (tabId: string) => void;
  onTabRename: (tabId: string, newTitle: string) => void;
}

export function TabBar({ tabs, activeTabId, onTabSelect, onTabClose, onTabRename }: TabBarProps) {
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingTabId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingTabId]);

  const handleDoubleClick = (tab: Tab) => {
    setEditingTabId(tab.id);
    setEditValue(tab.title);
  };

  const handleSave = () => {
    if (editingTabId && editValue.trim()) {
      onTabRename(editingTabId, editValue.trim());
    }
    setEditingTabId(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setEditingTabId(null);
    }
  };

  return (
    <div className="flex items-center bg-[var(--hn-orange)] px-2 h-10">
      {tabs.map(tab => (
        <div
          key={tab.id}
          className={`flex items-center px-3 py-1 mr-1 cursor-pointer rounded-t ${
            tab.id === activeTabId ? 'bg-[var(--hn-bg)]' : 'bg-orange-200 hover:bg-orange-100'
          }`}
          onClick={() => onTabSelect(tab.id)}
          onDoubleClick={() => handleDoubleClick(tab)}
        >
          {editingTabId === tab.id ? (
            <input
              ref={inputRef}
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={handleSave}
              onKeyDown={handleKeyDown}
              onClick={(e) => e.stopPropagation()}
              className="text-sm w-24 px-1 rounded border border-gray-300 outline-none"
            />
          ) : (
            <span className="text-sm truncate max-w-32">{tab.title}</span>
          )}
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
