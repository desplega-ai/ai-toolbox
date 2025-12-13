import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ModelSelector } from '@/components/ModelSelector';

const DEFAULT_SYNTHESIS_MODEL = 'anthropic/claude-3-5-haiku-latest';

interface IdeaTesterFormProps {
  onSubmit: (input: {
    title: string;
    url?: string;
    type: 'story' | 'show_hn' | 'ask_hn';
    plannedTime?: string;
    model?: string;
  }) => void;
  isLoading: boolean;
  initialValues?: {
    title: string;
    url?: string;
    type: 'story' | 'show_hn' | 'ask_hn';
    plannedTime?: string;
    model?: string;
  };
}

export function IdeaTesterForm({ onSubmit, isLoading, initialValues }: IdeaTesterFormProps) {
  const [title, setTitle] = useState(initialValues?.title || '');
  const [url, setUrl] = useState(initialValues?.url || '');
  const [type, setType] = useState<'story' | 'show_hn' | 'ask_hn'>(initialValues?.type || 'story');
  const [timeMode, setTimeMode] = useState<'now' | 'best' | 'custom'>('now');
  const [customTime, setCustomTime] = useState('');
  const [model, setModel] = useState(initialValues?.model || DEFAULT_SYNTHESIS_MODEL);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    let plannedTime: string | undefined;
    if (timeMode === 'custom' && customTime) {
      plannedTime = new Date(customTime).toISOString();
    } else if (timeMode === 'now') {
      plannedTime = new Date().toISOString();
    }
    // 'best' leaves plannedTime undefined - LLM will suggest

    onSubmit({
      title,
      url: url || undefined,
      type,
      plannedTime,
      model,
    });
  };

  const charCount = title.length;
  const isOverLimit = charCount > 80;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Title */}
      <div>
        <label className="block text-sm font-medium mb-1">Title</label>
        <Input
          value={title}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)}
          placeholder="Show HN: A SQL interface for HN data analysis"
          maxLength={200}
          required
        />
        <div className={`text-xs mt-1 ${isOverLimit ? 'text-red-500' : 'text-gray-500'}`}>
          {charCount}/80 characters {isOverLimit && '(exceeds recommended limit)'}
        </div>
      </div>

      {/* URL */}
      <div>
        <label className="block text-sm font-medium mb-1">URL (optional)</label>
        <Input
          type="url"
          value={url}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUrl(e.target.value)}
          placeholder="https://myblog.com/my-project"
        />
        <div className="text-xs text-gray-500 mt-1">
          Leave empty for Ask HN posts
        </div>
      </div>

      {/* Type */}
      <div>
        <label className="block text-sm font-medium mb-1">Post Type</label>
        <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="story">Story</SelectItem>
            <SelectItem value="show_hn">Show HN</SelectItem>
            <SelectItem value="ask_hn">Ask HN</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Timing */}
      <div>
        <label className="block text-sm font-medium mb-1">Planned Time</label>
        <div className="flex gap-2 flex-wrap">
          <Button
            type="button"
            variant={timeMode === 'now' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTimeMode('now')}
          >
            Now
          </Button>
          <Button
            type="button"
            variant={timeMode === 'best' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTimeMode('best')}
          >
            Best time
          </Button>
          <Button
            type="button"
            variant={timeMode === 'custom' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTimeMode('custom')}
          >
            Custom
          </Button>
        </div>
        {timeMode === 'custom' && (
          <Input
            type="datetime-local"
            value={customTime}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCustomTime(e.target.value)}
            className="mt-2"
          />
        )}
      </div>

      {/* Model */}
      <div>
        <label className="block text-sm font-medium mb-1">Model</label>
        <ModelSelector value={model} onChange={setModel} className="w-full" />
      </div>

      {/* Submit */}
      <Button type="submit" disabled={!title || isLoading} className="w-full">
        {isLoading ? 'Analyzing...' : 'Analyze Post Idea'}
      </Button>
    </form>
  );
}
