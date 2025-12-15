import * as React from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
  description?: string;
  icon?: React.ReactNode;
}

interface SelectProps<T extends string = string> {
  value: T;
  onChange: (value: T) => void;
  options: SelectOption<T>[];
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  triggerClassName?: string;
  /** Render style variant */
  variant?: 'default' | 'compact' | 'pill';
  /** Custom render for trigger label */
  renderLabel?: (option: SelectOption<T> | undefined) => React.ReactNode;
  /** Show description in dropdown */
  showDescriptions?: boolean;
}

export function Select<T extends string = string>({
  value,
  onChange,
  options,
  disabled = false,
  placeholder = 'Select...',
  className,
  triggerClassName,
  variant = 'default',
  renderLabel,
  showDescriptions = false,
}: SelectProps<T>) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [highlightedIndex, setHighlightedIndex] = React.useState(-1);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  // Close on outside click
  React.useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Reset highlighted index when opening
  React.useEffect(() => {
    if (isOpen) {
      const currentIndex = options.findIndex((opt) => opt.value === value);
      setHighlightedIndex(currentIndex >= 0 ? currentIndex : 0);
    }
  }, [isOpen, value, options]);

  // Scroll highlighted item into view
  React.useEffect(() => {
    if (isOpen && listRef.current && highlightedIndex >= 0) {
      const items = listRef.current.querySelectorAll('[data-select-item]');
      const item = items[highlightedIndex] as HTMLElement;
      item?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightedIndex, isOpen]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;

    switch (e.key) {
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (isOpen && highlightedIndex >= 0) {
          onChange(options[highlightedIndex].value);
          setIsOpen(false);
        } else {
          setIsOpen(true);
        }
        break;
      case 'ArrowDown':
        e.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
        } else {
          setHighlightedIndex((prev) => (prev + 1) % options.length);
        }
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
        } else {
          setHighlightedIndex((prev) => (prev - 1 + options.length) % options.length);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        break;
      case 'Tab':
        setIsOpen(false);
        break;
    }
  };

  const handleSelect = (option: SelectOption<T>) => {
    onChange(option.value);
    setIsOpen(false);
  };

  const triggerVariants = {
    default: cn(
      'flex items-center justify-between gap-2 px-3 py-1.5 text-sm rounded-md border border-[var(--border)]',
      'bg-[var(--background)] text-[var(--foreground)]',
      'hover:bg-[var(--secondary)] transition-colors',
      'focus:outline-none focus:ring-2 focus:ring-[var(--ring)] focus:ring-offset-1',
      disabled && 'opacity-50 cursor-not-allowed',
      !disabled && 'cursor-pointer'
    ),
    compact: cn(
      'flex items-center justify-between gap-1.5 px-2 py-0.5 text-xs rounded-md',
      'bg-[var(--secondary)] text-[var(--secondary-foreground)]',
      'hover:bg-[var(--secondary)]/80 transition-colors',
      'focus:outline-none focus:ring-2 focus:ring-[var(--ring)]',
      disabled && 'opacity-50 cursor-not-allowed',
      !disabled && 'cursor-pointer'
    ),
    pill: cn(
      'flex items-center justify-between gap-1.5 px-2.5 py-0.5 text-xs rounded-full',
      'bg-[var(--secondary)] text-[var(--secondary-foreground)]',
      'hover:bg-[var(--secondary)]/80 transition-colors',
      'focus:outline-none focus:ring-2 focus:ring-[var(--ring)]',
      disabled && 'opacity-50 cursor-not-allowed',
      !disabled && 'cursor-pointer'
    ),
  };

  return (
    <div ref={containerRef} className={cn('relative inline-block', className)}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        className={cn(triggerVariants[variant], triggerClassName)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className="flex items-center gap-2 truncate">
          {selectedOption?.icon}
          {renderLabel
            ? renderLabel(selectedOption)
            : selectedOption?.label || placeholder}
        </span>
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 text-[var(--foreground-muted)] transition-transform',
            isOpen && 'rotate-180'
          )}
        />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div
          ref={listRef}
          role="listbox"
          className={cn(
            'absolute z-50 mt-1 min-w-full max-h-60 overflow-auto',
            'bg-[var(--background)] border border-[var(--border)] rounded-md shadow-lg',
            'animate-in fade-in-0 zoom-in-95 duration-100'
          )}
        >
          {options.map((option, index) => (
            <div
              key={option.value}
              data-select-item
              role="option"
              aria-selected={option.value === value}
              onClick={() => handleSelect(option)}
              onMouseEnter={() => setHighlightedIndex(index)}
              className={cn(
                'flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors',
                highlightedIndex === index && 'bg-[var(--secondary)]',
                option.value === value && 'text-[var(--primary)]'
              )}
            >
              {option.icon && <span className="shrink-0">{option.icon}</span>}
              <div className="flex-1 min-w-0">
                <div className="text-sm truncate">{option.label}</div>
                {showDescriptions && option.description && (
                  <div className="text-xs text-[var(--foreground-muted)] truncate">
                    {option.description}
                  </div>
                )}
              </div>
              {option.value === value && (
                <Check className="h-4 w-4 shrink-0 text-[var(--primary)]" />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
