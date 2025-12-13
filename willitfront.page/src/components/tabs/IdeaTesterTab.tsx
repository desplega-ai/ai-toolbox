import { useState, useEffect, useRef, useCallback } from 'react';
import { experimental_useObject as useObject } from '@ai-sdk/react';
import type { Tab } from '@/types/tabs';
import { ideaTestReportSchema } from '@/../lib/ideaTester/types';
import { IdeaTesterForm } from '@/components/idea-tester/IdeaTesterForm';
import { IdeaTesterResults } from '@/components/idea-tester/IdeaTesterResults';

interface IdeaTesterTabProps {
  tab: Tab;
  onUpdate: (updates: Partial<Tab>) => void;
}

function generateTabTitle(input: { title: string; type: string }): string {
  const maxLen = 25;
  let title = input.title;
  if (title.length > maxLen) {
    title = title.slice(0, maxLen - 3) + '...';
  }
  return title || 'Post Tester';
}

export function IdeaTesterTab({ tab, onUpdate }: IdeaTesterTabProps) {
  const [hasSubmitted, setHasSubmitted] = useState(!!tab.ideaTesterResult);
  const persistedResult = useRef<Record<string, unknown> | null>(tab.ideaTesterResult || null);
  const hasSavedResult = useRef(false);

  const { object, submit, isLoading, error } = useObject({
    api: '/api/analyze-idea',
    schema: ideaTestReportSchema,
  });

  // Use persisted result if available and not currently loading
  const displayResult = object || (hasSubmitted && !isLoading ? persistedResult.current : null);

  // Persist result when streaming completes - only once per submission
  useEffect(() => {
    if (object && !isLoading && !hasSavedResult.current) {
      hasSavedResult.current = true;
      persistedResult.current = object as Record<string, unknown>;
      onUpdate({
        ideaTesterResult: object as Record<string, unknown>,
      });
    }
  }, [object, isLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = useCallback((input: {
    title: string;
    url?: string;
    type: 'story' | 'show_hn' | 'ask_hn';
    plannedTime?: string;
    model?: string;
  }) => {
    setHasSubmitted(true);
    hasSavedResult.current = false; // Reset for new submission
    persistedResult.current = null;
    submit(input);

    const newTitle = generateTabTitle(input);
    onUpdate({
      ideaTesterInput: input,
      ideaTesterResult: undefined,
      title: newTitle,
    });
  }, [submit, onUpdate]);

  return (
    <div className="h-full flex flex-col lg:flex-row overflow-hidden">
      {/* Form Column - scrollable independently */}
      <div className="w-full lg:w-[40%] lg:max-w-md lg:flex-shrink-0 overflow-y-auto p-4 lg:p-6 lg:border-r">
        <div className="mb-6">
          <h1 className="text-2xl font-bold mb-2">Post Tester</h1>
          <p className="text-gray-500 text-sm">
            Test your Hacker News post idea before submitting.
          </p>
        </div>
        <div className="bg-white border rounded-lg p-4 shadow-sm">
          <IdeaTesterForm
            onSubmit={handleSubmit}
            isLoading={isLoading}
            initialValues={tab.ideaTesterInput}
          />
        </div>
      </div>

      {/* Results Column - scrollable independently */}
      <div className="flex-1 min-w-0 overflow-y-auto p-4 lg:p-6">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
            <p className="text-red-700">{error.message}</p>
          </div>
        )}

        {hasSubmitted && (
          <div className="bg-white border rounded-lg p-4 shadow-sm">
            {displayResult ? (
              <IdeaTesterResults report={displayResult} isStreaming={isLoading} />
            ) : isLoading ? (
              <div className="text-center py-8 text-gray-500">
                <div className="animate-spin h-8 w-8 border-2 border-orange-500 border-t-transparent rounded-full mx-auto mb-2" />
                Running analysis...
              </div>
            ) : null}
          </div>
        )}

        {!hasSubmitted && (
          <div className="text-center py-12 text-gray-400">
            <p>Enter your post idea and click "Analyze" to get started</p>
          </div>
        )}
      </div>
    </div>
  );
}
