import React from 'react';
import { Command, User, FileText, Folder } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AutocompleteItem, CommandItem, AgentItem, FileItem } from '@/lib/autocomplete-store';

interface AutocompleteDropdownProps {
  items: AutocompleteItem[];
  selectedIndex: number;
  onSelect: (item: AutocompleteItem) => void;
  position: { top: number; left: number };
  visible: boolean;
}

export function AutocompleteDropdown({
  items,
  selectedIndex,
  onSelect,
  position,
  visible,
}: AutocompleteDropdownProps) {
  const listRef = React.useRef<HTMLDivElement>(null);

  // Scroll selected item into view
  React.useEffect(() => {
    if (listRef.current && selectedIndex >= 0) {
      const selectedEl = listRef.current.children[selectedIndex] as HTMLElement;
      if (selectedEl) {
        selectedEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  if (!visible || items.length === 0) return null;

  // Group items by type
  const commands = items.filter((i) => i.type === 'command');
  const agents = items.filter((i) => i.type === 'agent');
  const files = items.filter((i) => i.type === 'file');

  let currentIndex = 0;

  return (
    <div
      className="fixed z-50 min-w-[280px] max-w-[400px] max-h-[300px] overflow-auto bg-[var(--background)] border border-[var(--border)] shadow-lg"
      style={{
        bottom: `calc(100vh - ${position.top}px)`,
        left: position.left,
      }}
      ref={listRef}
    >
      {/* Commands Section */}
      {commands.length > 0 && (
        <>
          <div className="px-3 py-1.5 text-xs font-semibold text-[var(--foreground-muted)] bg-[var(--secondary)] border-b border-[var(--border)]">
            Commands
          </div>
          {commands.map((item) => {
            const idx = currentIndex++;
            return (
              <CommandItemRow
                key={`cmd-${item.item.name}`}
                item={item.item as CommandItem}
                selected={idx === selectedIndex}
                onClick={() => onSelect(item)}
              />
            );
          })}
        </>
      )}

      {/* Agents Section */}
      {agents.length > 0 && (
        <>
          <div className="px-3 py-1.5 text-xs font-semibold text-[var(--foreground-muted)] bg-[var(--secondary)] border-b border-[var(--border)]">
            Agents
          </div>
          {agents.map((item) => {
            const idx = currentIndex++;
            return (
              <AgentItemRow
                key={`agent-${item.item.name}`}
                item={item.item as AgentItem}
                selected={idx === selectedIndex}
                onClick={() => onSelect(item)}
              />
            );
          })}
        </>
      )}

      {/* Files Section */}
      {files.length > 0 && (
        <>
          <div className="px-3 py-1.5 text-xs font-semibold text-[var(--foreground-muted)] bg-[var(--secondary)] border-b border-[var(--border)]">
            Files
          </div>
          {files.map((item) => {
            const idx = currentIndex++;
            return (
              <FileItemRow
                key={`file-${item.item.path}`}
                item={item.item as FileItem}
                selected={idx === selectedIndex}
                onClick={() => onSelect(item)}
              />
            );
          })}
        </>
      )}
    </div>
  );
}

function CommandItemRow({
  item,
  selected,
  onClick,
}: {
  item: CommandItem;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 px-3 py-2 cursor-pointer',
        selected ? 'bg-[var(--primary)]/10' : 'hover:bg-[var(--secondary)]'
      )}
      onClick={onClick}
    >
      <Command className="h-4 w-4 text-[var(--primary)]" />
      <span className="font-mono text-sm">/{item.name}</span>
      {item.description && (
        <span className="text-xs text-[var(--foreground-muted)] ml-auto truncate max-w-[150px]">
          {item.description}
        </span>
      )}
    </div>
  );
}

function AgentItemRow({
  item,
  selected,
  onClick,
}: {
  item: AgentItem;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 px-3 py-2 cursor-pointer',
        selected ? 'bg-[var(--primary)]/10' : 'hover:bg-[var(--secondary)]'
      )}
      onClick={onClick}
    >
      <User className="h-4 w-4 text-[var(--accent)]" />
      <div className="flex-1 min-w-0">
        <span className="font-mono text-sm">@{item.name}</span>
        <p className="text-xs text-[var(--foreground-muted)] truncate">
          {item.description}
        </p>
      </div>
    </div>
  );
}

function FileItemRow({
  item,
  selected,
  onClick,
}: {
  item: FileItem;
  selected: boolean;
  onClick: () => void;
}) {
  const Icon = item.type === 'directory' ? Folder : FileText;

  return (
    <div
      className={cn(
        'flex items-center gap-2 px-3 py-2 cursor-pointer',
        selected ? 'bg-[var(--primary)]/10' : 'hover:bg-[var(--secondary)]'
      )}
      onClick={onClick}
    >
      <Icon className="h-4 w-4 text-[var(--foreground-muted)]" />
      <div className="flex-1 min-w-0">
        <span className="font-mono text-sm truncate">{item.name}</span>
        <p className="text-xs text-[var(--foreground-muted)] truncate">
          {item.path}
        </p>
      </div>
    </div>
  );
}
