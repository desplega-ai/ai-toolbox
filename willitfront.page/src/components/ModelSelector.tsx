import { useState, useMemo, useRef, useEffect } from 'react';
import Fuse from 'fuse.js';
import { useAvailableModels } from '@/hooks/useAvailableModels';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { ChevronDown, Search, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Model } from '@/types/api';

interface ModelSelectorProps {
  value: string;
  onChange: (modelId: string) => void;
  showInheritOption?: boolean;
  inheritLabel?: string;
  disabled?: boolean;
  className?: string;
}

const MAX_RESULTS = 10;

export function ModelSelector({
  value,
  onChange,
  showInheritOption,
  inheritLabel,
  disabled,
  className,
}: ModelSelectorProps) {
  const { models, loading, error } = useAvailableModels();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus search input when popover opens
  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  // Create fuse instance for fuzzy search
  const fuse = useMemo(() => {
    return new Fuse(models, {
      keys: [
        { name: 'name', weight: 2 },
        { name: 'id', weight: 1.5 },
        { name: 'provider', weight: 1 },
        { name: 'description', weight: 0.5 },
      ],
      threshold: 0.4,
      includeScore: true,
    });
  }, [models]);

  // Get filtered and limited results
  const filteredModels = useMemo(() => {
    if (!search.trim()) {
      return models.slice(0, MAX_RESULTS);
    }
    return fuse.search(search).slice(0, MAX_RESULTS).map(r => r.item);
  }, [search, fuse, models]);

  // Get display name for current value
  const selectedModel = models.find(m => m.id === value);
  const displayValue = selectedModel
    ? selectedModel.name
    : value
      ? value.split('/').pop() || value
      : 'Select model';

  const handleSelect = (modelId: string) => {
    onChange(modelId);
    setOpen(false);
    setSearch('');
  };

  if (loading) {
    return (
      <Button variant="outline" className={cn("w-full sm:w-[280px] justify-between bg-white shrink-0", className)} disabled>
        <span className="text-muted-foreground">Loading...</span>
        <Loader2 className="h-4 w-4 animate-spin" />
      </Button>
    );
  }

  if (error && models.length === 0) {
    return (
      <Button variant="outline" className={cn("w-full sm:w-[280px] justify-between bg-white shrink-0", className)} disabled>
        <span className="text-muted-foreground">Error loading</span>
      </Button>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full sm:w-[280px] justify-between bg-white shrink-0", className)}
          disabled={disabled}
        >
          <span className="truncate">{displayValue}</span>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[calc(100vw-2rem)] sm:w-[400px] p-0 bg-white" align="start">
        {/* Search input */}
        <div className="flex items-center border-b px-3 py-2">
          <Search className="h-4 w-4 shrink-0 opacity-50 mr-2" />
          <input
            ref={inputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, id, or provider..."
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>

        {/* Results list */}
        <div className="max-h-[300px] overflow-y-auto">
          {showInheritOption && (
            <button
              onClick={() => handleSelect('')}
              className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-100 ${
                value === '' ? 'bg-gray-50' : ''
              }`}
            >
              {inheritLabel || 'Use notebook default'}
            </button>
          )}

          {filteredModels.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              No models found
            </div>
          ) : (
            filteredModels.map((model) => (
              <ModelItem
                key={model.id}
                model={model}
                isSelected={model.id === value}
                onSelect={handleSelect}
              />
            ))
          )}

          {!search && models.length > MAX_RESULTS && (
            <div className="px-3 py-2 text-xs text-muted-foreground border-t">
              Showing {MAX_RESULTS} of {models.length} models. Type to search.
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ModelItem({
  model,
  isSelected,
  onSelect,
}: {
  model: Model;
  isSelected: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      onClick={() => onSelect(model.id)}
      className={`w-full px-3 py-2 text-left hover:bg-gray-100 ${
        isSelected ? 'bg-gray-50' : ''
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-mono">
          {model.provider}
        </span>
        <span className="text-sm font-medium truncate">{model.name}</span>
      </div>
      <div className="text-xs text-muted-foreground truncate mt-0.5">
        {model.id}
      </div>
    </button>
  );
}
