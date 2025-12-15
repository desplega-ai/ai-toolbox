import React from 'react';
import getCaretCoordinates from 'textarea-caret';
import { useAutocompleteStore, type AutocompleteItem } from '@/lib/autocomplete-store';

interface TriggerState {
  active: boolean;
  trigger: '/' | '@' | null;
  query: string;
  startIndex: number;
}

interface AutocompleteHookResult {
  // State
  items: AutocompleteItem[];
  selectedIndex: number;
  position: { top: number; left: number };
  visible: boolean;

  // Handlers
  handleInputChange: (value: string, cursorPosition: number, textarea: HTMLTextAreaElement) => void;
  handleKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => boolean; // Returns true if event was handled
  handleSelect: (item: AutocompleteItem) => string; // Returns new input value
  dismiss: () => void;
}

export function useAutocomplete(currentInput: string): AutocompleteHookResult {
  const [triggerState, setTriggerState] = React.useState<TriggerState>({
    active: false,
    trigger: null,
    query: '',
    startIndex: 0,
  });
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const [position, setPosition] = React.useState({ top: 0, left: 0 });

  const searchCommands = useAutocompleteStore((s) => s.searchCommands);
  const searchAgents = useAutocompleteStore((s) => s.searchAgents);
  const searchFiles = useAutocompleteStore((s) => s.searchFiles);

  // Compute items based on trigger
  const items = React.useMemo((): AutocompleteItem[] => {
    if (!triggerState.active || !triggerState.trigger) return [];

    if (triggerState.trigger === '/') {
      return searchCommands(triggerState.query).map((item) => ({
        type: 'command' as const,
        item,
      }));
    }

    if (triggerState.trigger === '@') {
      const agents = searchAgents(triggerState.query, 5);
      const files = searchFiles(triggerState.query, 10);

      const result: AutocompleteItem[] = [];

      // Add agents first (if query is short or matches agents)
      if (triggerState.query.length <= 3 || agents.length > 0) {
        agents.forEach((item) => result.push({ type: 'agent', item }));
      }

      // Add files
      files.forEach((item) => result.push({ type: 'file', item }));

      return result;
    }

    return [];
  }, [triggerState, searchCommands, searchAgents, searchFiles]);

  // Reset selected index when items change
  React.useEffect(() => {
    setSelectedIndex(0);
  }, [items]);

  const handleInputChange = (
    value: string,
    cursorPosition: number,
    textarea: HTMLTextAreaElement
  ) => {
    // Find if we're in a trigger context
    const textBeforeCursor = value.slice(0, cursorPosition);

    // Look for trigger character
    let triggerIndex = -1;
    let trigger: '/' | '@' | null = null;

    // Check for @ trigger (more recent takes precedence)
    const atIndex = textBeforeCursor.lastIndexOf('@');
    if (atIndex >= 0) {
      // Verify it's a valid trigger position (start of input or after whitespace)
      if (atIndex === 0 || /\s/.test(textBeforeCursor[atIndex - 1])) {
        const query = textBeforeCursor.slice(atIndex + 1);
        // Valid if no spaces in query
        if (!/\s/.test(query)) {
          triggerIndex = atIndex;
          trigger = '@';
        }
      }
    }

    // Check for / trigger (only at start of input or after newline)
    const slashIndex = textBeforeCursor.lastIndexOf('/');
    if (slashIndex >= 0 && (slashIndex === 0 || textBeforeCursor[slashIndex - 1] === '\n')) {
      const query = textBeforeCursor.slice(slashIndex + 1);
      if (!/\s/.test(query)) {
        // / takes precedence if it's more recent
        if (slashIndex > atIndex || trigger === null) {
          triggerIndex = slashIndex;
          trigger = '/';
        }
      }
    }

    if (trigger && triggerIndex >= 0) {
      const query = textBeforeCursor.slice(triggerIndex + 1);

      // Calculate dropdown position (above the textarea)
      const coords = getCaretCoordinates(textarea, triggerIndex);
      const rect = textarea.getBoundingClientRect();

      // Position above: use bottom of dropdown anchored to top of caret
      // We'll set a CSS transform in the component to flip it
      setPosition({
        top: rect.top + coords.top - 8, // Position above caret
        left: rect.left + coords.left,
      });

      setTriggerState({
        active: true,
        trigger,
        query,
        startIndex: triggerIndex,
      });
    } else {
      setTriggerState({ active: false, trigger: null, query: '', startIndex: 0 });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): boolean => {
    if (!triggerState.active || items.length === 0) return false;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, items.length - 1));
        return true;

      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
        return true;

      case 'Tab':
      case 'Enter':
        e.preventDefault();
        return true; // Handled in parent by calling handleSelect

      case 'Escape':
        e.preventDefault();
        setTriggerState({ active: false, trigger: null, query: '', startIndex: 0 });
        return true;

      default:
        return false;
    }
  };

  const handleSelect = (item: AutocompleteItem): string => {
    const beforeTrigger = currentInput.slice(0, triggerState.startIndex);
    const afterCursor = currentInput.slice(
      triggerState.startIndex + 1 + triggerState.query.length
    );

    let insertText = '';
    if (item.type === 'command') {
      insertText = `/${item.item.name} `;
    } else if (item.type === 'agent') {
      insertText = `@${item.item.name} `;
    } else if (item.type === 'file') {
      insertText = `@${item.item.path} `;
    }

    // Dismiss autocomplete
    setTriggerState({ active: false, trigger: null, query: '', startIndex: 0 });

    return beforeTrigger + insertText + afterCursor;
  };

  const dismiss = () => {
    setTriggerState({ active: false, trigger: null, query: '', startIndex: 0 });
  };

  return {
    items,
    selectedIndex,
    position,
    visible: triggerState.active && items.length > 0,
    handleInputChange,
    handleKeyDown,
    handleSelect,
    dismiss,
  };
}
