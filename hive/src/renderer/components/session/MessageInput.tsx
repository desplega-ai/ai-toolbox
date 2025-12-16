import React from 'react';
import { Send, Square, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useDraftsStore } from '@/lib/store';
import { useAutocomplete } from '@/hooks/useAutocomplete';
import { AutocompleteDropdown } from './AutocompleteDropdown';

// Line height in pixels (14px font * 1.5 line-height ≈ 21px)
const LINE_HEIGHT = 21;
const PADDING_Y = 16; // py-2 = 0.5rem * 2 = 16px
const BORDER_Y = 2;   // border on top and bottom
const MIN_LINES = 2;
const MAX_LINES = 10;
const MIN_HEIGHT = MIN_LINES * LINE_HEIGHT + PADDING_Y + BORDER_Y;
const MAX_HEIGHT = MAX_LINES * LINE_HEIGHT + PADDING_Y + BORDER_Y;

// Render highlighted text for commands, agents, and files
function HighlightedText({ text }: { text: string }) {
  if (!text) return null;

  // Find all tokens and their positions
  const tokens: Array<{ start: number; end: number; type: 'command' | 'agent' | 'file'; text: string }> = [];

  // Find commands
  let match;
  const commandRegex = /(?:^|\s)(\/[\w:-]+)/g;
  while ((match = commandRegex.exec(text)) !== null) {
    const tokenStart = match.index + (match[0].length - match[1].length);
    tokens.push({
      start: tokenStart,
      end: tokenStart + match[1].length,
      type: 'command',
      text: match[1],
    });
  }

  // Find agents and files (both start with @)
  const atRegex = /(?:^|\s)(@[\w.\/\\:-]+)/g;
  while ((match = atRegex.exec(text)) !== null) {
    const tokenStart = match.index + (match[0].length - match[1].length);
    const tokenText = match[1];
    // If it contains a dot with extension, it's likely a file
    const isFile = /\.\w+$/.test(tokenText);
    tokens.push({
      start: tokenStart,
      end: tokenStart + tokenText.length,
      type: isFile ? 'file' : 'agent',
      text: tokenText,
    });
  }

  // Sort by position
  tokens.sort((a, b) => a.start - b.start);

  // Build highlighted segments
  const segments: React.ReactNode[] = [];
  let lastEnd = 0;

  tokens.forEach((token, i) => {
    // Add text before token
    if (token.start > lastEnd) {
      segments.push(text.slice(lastEnd, token.start));
    }

    // Add highlighted token
    const colorClass = token.type === 'command'
      ? 'text-[var(--primary)]'
      : token.type === 'agent'
        ? 'text-[var(--accent)]'
        : 'text-emerald-500';

    segments.push(
      <span key={i} className={colorClass}>
        {token.text}
      </span>
    );

    lastEnd = token.end;
  });

  // Add remaining text
  if (lastEnd < text.length) {
    segments.push(text.slice(lastEnd));
  }

  return <>{segments}</>;
}

interface MessageInputProps {
  onSend: (message: string) => void;
  onInterrupt: () => void;
  isRunning: boolean;
  disabled?: boolean;
  sessionId: string;
  projectId: string;
}

export function MessageInput({ onSend, onInterrupt, isRunning, disabled, sessionId, projectId }: MessageInputProps) {
  const [input, setInput] = React.useState('');
  const [editorFileId, setEditorFileId] = React.useState<string | null>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const backdropRef = React.useRef<HTMLDivElement>(null);

  const getDraftForSession = useDraftsStore((state) => state.getDraftForSession);
  const saveDraft = useDraftsStore((state) => state.saveDraft);
  const deleteDraft = useDraftsStore((state) => state.deleteDraft);

  // Autocomplete hook
  const autocomplete = useAutocomplete(input);

  // Load draft on mount or session change
  React.useEffect(() => {
    const draft = getDraftForSession(sessionId);
    if (draft) {
      setInput(draft.text);
    } else {
      setInput('');
    }
  }, [sessionId, getDraftForSession]);

  // Save draft on change (debounced)
  React.useEffect(() => {
    const timer = setTimeout(() => {
      saveDraft(projectId, sessionId, input);
    }, 500);
    return () => clearTimeout(timer);
  }, [input, projectId, sessionId, saveDraft]);

  // Listen for focus-message-input event (triggered by Cmd+N)
  React.useEffect(() => {
    const handler = () => {
      textareaRef.current?.focus();
    };
    window.addEventListener('focus-message-input', handler);
    return () => window.removeEventListener('focus-message-input', handler);
  }, []);

  // Listen for file changes from editor
  React.useEffect(() => {
    if (!editorFileId) return;

    const unsub = window.electronAPI.on('prompt-file:changed', (data: unknown) => {
      const { fileId, content } = data as { fileId: string; content: string };
      if (fileId === editorFileId) {
        setInput(content);
      }
    });

    return () => {
      unsub();
      // Cleanup: stop watching and delete temp file
      window.electronAPI.invoke('prompt-file:close', { fileId: editorFileId });
      setEditorFileId(null);
    };
  }, [editorFileId]);

  // Sync input changes back to editor file (debounced)
  React.useEffect(() => {
    if (!editorFileId) return;

    const timer = setTimeout(() => {
      window.electronAPI.invoke('prompt-file:update', { fileId: editorFileId, content: input });
    }, 300);

    return () => clearTimeout(timer);
  }, [input, editorFileId]);

  // Handle input change with autocomplete trigger detection
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setInput(newValue);

    // Notify autocomplete of change
    if (textareaRef.current) {
      autocomplete.handleInputChange(
        newValue,
        e.target.selectionStart,
        textareaRef.current
      );
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isRunning && !disabled) {
      onSend(input.trim());
      setInput('');
      deleteDraft(sessionId); // Clear draft after sending
      autocomplete.dismiss();
      // Close editor file if open
      if (editorFileId) {
        window.electronAPI.invoke('prompt-file:close', { fileId: editorFileId });
        setEditorFileId(null);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Let autocomplete handle first
    if (autocomplete.visible) {
      const handled = autocomplete.handleKeyDown(e);
      if (handled) {
        // Handle Enter/Tab selection
        if (e.key === 'Enter' || e.key === 'Tab') {
          const selectedItem = autocomplete.items[autocomplete.selectedIndex];
          if (selectedItem) {
            const newValue = autocomplete.handleSelect(selectedItem);
            setInput(newValue);
          }
        }
        return;
      }
    }

    // Default Enter behavior (send message) - only when not running
    if (e.key === 'Enter' && !e.shiftKey) {
      if (!isRunning && !disabled && input.trim()) {
        e.preventDefault();
        handleSubmit(e);
      } else if (!isRunning && !input.trim()) {
        e.preventDefault(); // Prevent empty submission
      }
      // When running, allow newline (don't prevent default) for drafting
    }
    // Ctrl+G: Open in editor
    if (e.key === 'g' && e.ctrlKey) {
      e.preventDefault();
      handleOpenInEditor();
    }
  };

  const handleAutocompleteSelect = (item: (typeof autocomplete.items)[0]) => {
    const newValue = autocomplete.handleSelect(item);
    setInput(newValue);
    textareaRef.current?.focus();
  };

  const handleOpenInEditor = async () => {
    if (editorFileId) {
      // Already open, just focus the editor
      await window.electronAPI.invoke('prompt-file:focus', { fileId: editorFileId });
      return;
    }

    try {
      const result = await window.electronAPI.invoke<{ fileId: string; filePath: string }>('prompt-file:open', {
        content: input,
        sessionId,
      });
      setEditorFileId(result.fileId);
    } catch (error) {
      console.error('Failed to open in editor:', error);
    }
  };

  // Auto-resize textarea (min 2 lines, max 10 lines)
  React.useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // For empty input, just use minimum height (no need to measure)
    if (!input.trim()) {
      textarea.style.height = `${MIN_HEIGHT}px`;
      textarea.style.overflow = 'hidden';
      if (backdropRef.current) {
        backdropRef.current.style.height = `${MIN_HEIGHT}px`;
      }
      return;
    }

    // For non-empty input, measure scrollHeight
    const prevOverflow = textarea.style.overflow;
    textarea.style.overflow = 'hidden';
    textarea.style.height = `${MIN_HEIGHT}px`;

    const scrollHeight = textarea.scrollHeight;
    const newHeight = Math.max(MIN_HEIGHT, Math.min(scrollHeight, MAX_HEIGHT));

    textarea.style.height = `${newHeight}px`;
    textarea.style.overflow = newHeight >= MAX_HEIGHT ? 'auto' : prevOverflow;

    if (backdropRef.current) {
      backdropRef.current.style.height = `${newHeight}px`;
    }
  }, [input]);

  // Sync scroll position between textarea and highlight backdrop
  const handleScroll = React.useCallback(() => {
    if (textareaRef.current && backdropRef.current) {
      backdropRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  }, []);

  return (
    <form onSubmit={handleSubmit} className="p-4 border-t border-[var(--border)] relative">
      <div className="flex gap-2 items-end">
        <div className="flex-1 relative">
          {/* Highlight backdrop - renders colored tokens */}
          <div
            ref={backdropRef}
            className="absolute top-0 left-0 right-0 px-3 py-2 border border-transparent bg-[var(--background)] text-[var(--foreground)] font-mono text-sm leading-[21px] whitespace-pre-wrap break-words overflow-y-auto pointer-events-none scrollbar-none"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', height: MIN_HEIGHT }}
            aria-hidden="true"
          >
            <HighlightedText text={input} />
          </div>
          {/* Actual textarea - transparent text, visible caret */}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onScroll={handleScroll}
            onBlur={() => {
              // Delay dismiss to allow click on dropdown
              setTimeout(() => autocomplete.dismiss(), 200);
            }}
            placeholder={
              disabled
                ? "Approve or deny pending actions..."
                : isRunning
                  ? "Claude is working... (draft your next message)"
                  : "Type a message... (/ for commands, @ for files)"
            }
            disabled={disabled}
            rows={MIN_LINES}
            style={{ height: MIN_HEIGHT }}
            className="relative w-full px-3 py-2 border border-[var(--border)] bg-transparent text-transparent caret-[var(--foreground)] placeholder:text-[var(--foreground-muted)] disabled:opacity-50 resize-none font-mono text-sm leading-[21px] selection:bg-[var(--primary)]/30 selection:text-transparent"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleOpenInEditor}
                disabled={isRunning || disabled}
                className={editorFileId ? 'border-[var(--primary)] text-[var(--primary)]' : ''}
              >
                <ExternalLink className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <span>Edit in external editor (Ctrl+G)</span>
            </TooltipContent>
          </Tooltip>
          {isRunning ? (
            <Button type="button" variant="destructive" size="icon" onClick={onInterrupt}>
              <Square className="h-4 w-4" />
            </Button>
          ) : (
            <Button type="submit" size="icon" disabled={!input.trim() || disabled}>
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Autocomplete Dropdown */}
      <AutocompleteDropdown
        items={autocomplete.items}
        selectedIndex={autocomplete.selectedIndex}
        onSelect={handleAutocompleteSelect}
        position={autocomplete.position}
        visible={autocomplete.visible}
      />
    </form>
  );
}
