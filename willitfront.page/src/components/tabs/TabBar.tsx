import { useState, useRef, useEffect } from 'react';
import { Plus, X, RotateCcw } from 'lucide-react';

// Served via static route in index.ts
const faviconUrl = '/public/favicon-32x32.png';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { Tab } from '@/types/tabs';

interface TabBarProps {
  tabs: Tab[];
  activeTabId: string | null;
  onTabSelect: (tabId: string | null) => void;
  onTabClose: (tabId: string) => void;
  onTabRename: (tabId: string, newTitle: string) => void;
  onReset: () => void;
}

export function TabBar({ tabs, activeTabId, onTabSelect, onTabClose, onTabRename, onReset }: TabBarProps) {
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [tabToClose, setTabToClose] = useState<Tab | null>(null);
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

  const handleReset = () => {
    onReset();
    setShowResetConfirm(false);
  };

  const handleCloseClick = (e: React.MouseEvent, tab: Tab) => {
    e.stopPropagation();
    if (tab.type === 'dashboard') {
      onTabClose(tab.id);
    } else {
      setTabToClose(tab);
    }
  };

  const handleConfirmClose = () => {
    if (tabToClose) {
      onTabClose(tabToClose.id);
      setTabToClose(null);
    }
  };

  return (
    <>
      <div className="flex items-center bg-[var(--hn-orange)] px-2 h-10 overflow-hidden">
        {/* Logo */}
        <button
          onClick={() => onTabSelect(null)}
          className="flex items-center gap-2 px-2 py-1 mr-2 text-white font-bold text-sm hover:bg-orange-600 rounded transition-colors shrink-0"
          title="Home"
        >
          <img src={faviconUrl} alt="WIFP" className="w-6 h-6" />
          <span className="hidden sm:inline">WIFP</span>
        </button>

        <div className="w-px h-6 bg-orange-400 mr-2 shrink-0" />

        {/* Scrollable tabs container */}
        <div className="flex-1 flex items-center overflow-x-auto scrollbar-hide min-w-0">
          {tabs.map(tab => (
            <div
              key={tab.id}
              className={`flex items-center px-2 sm:px-3 py-1 mr-1 cursor-pointer rounded-t shrink-0 ${
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
                  className="text-sm w-20 sm:w-24 px-1 rounded border border-gray-300 outline-none"
                />
              ) : (
                <span className="text-xs sm:text-sm truncate max-w-20 sm:max-w-32">{tab.title}</span>
              )}
              <button
                className="ml-1 sm:ml-2 hover:bg-gray-200 rounded p-0.5"
                onClick={(e) => handleCloseClick(e, tab)}
              >
                <X size={12} className="sm:hidden" />
                <X size={14} className="hidden sm:block" />
              </button>
            </div>
          ))}
        </div>

        <button
          className="p-1.5 hover:bg-orange-600 rounded ml-1 cursor-pointer transition-colors shrink-0"
          onClick={() => onTabSelect(null)}
          title="New tab"
        >
          <Plus size={18} className="text-white" />
        </button>

        {/* Reset button */}
        <button
          className="p-1.5 hover:bg-orange-600 rounded cursor-pointer transition-colors flex items-center gap-1 text-white text-xs shrink-0"
          onClick={() => setShowResetConfirm(true)}
          title="Reset all tabs"
        >
          <RotateCcw size={14} />
          <span className="hidden sm:inline">Reset</span>
        </button>
      </div>

      {/* Reset confirmation dialog */}
      <Dialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset all tabs?</DialogTitle>
            <DialogDescription>
              This will close all tabs and clear your saved queries. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResetConfirm(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleReset}>
              Reset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Close tab confirmation dialog */}
      <Dialog open={tabToClose !== null} onOpenChange={(open) => !open && setTabToClose(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Close tab?</DialogTitle>
            <DialogDescription>
              Are you sure you want to close "{tabToClose?.title}"? Your conversation and queries will be lost.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTabToClose(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirmClose}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
