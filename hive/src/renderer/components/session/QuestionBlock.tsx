import React from 'react';
import { MessageCircleQuestion, Check, X, Send, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { AskUserQuestionRequest, AskUserQuestion } from '../../../shared/sdk-types';

interface QuestionBlockProps {
  request: AskUserQuestionRequest;
  onSubmit: (answers: Record<string, string | string[]>) => void;
  onCancel: () => void;
}

export function QuestionBlock({ request, onSubmit, onCancel }: QuestionBlockProps) {
  // Active tab index
  const [activeTab, setActiveTab] = React.useState(0);
  // Store selected answers per question (key = question index as string)
  const [selectedAnswers, setSelectedAnswers] = React.useState<Record<string, string | string[]>>({});
  // Store "Other" text inputs per question
  const [otherText, setOtherText] = React.useState<Record<string, string>>({});
  // Track which questions have "Other" selected
  const [showOther, setShowOther] = React.useState<Record<string, boolean>>({});

  // Reset state when request changes
  React.useEffect(() => {
    setActiveTab(0);
    setSelectedAnswers({});
    setOtherText({});
    setShowOther({});
  }, [request.id]);

  const handleOptionSelect = (questionIdx: number, question: AskUserQuestion, optionLabel: string) => {
    const key = String(questionIdx);

    if (optionLabel === '__other__') {
      setShowOther(prev => ({ ...prev, [key]: true }));
      return;
    }

    setShowOther(prev => ({ ...prev, [key]: false }));

    if (question.multiSelect) {
      setSelectedAnswers(prev => {
        const current = (prev[key] as string[]) || [];
        if (current.includes(optionLabel)) {
          return { ...prev, [key]: current.filter(v => v !== optionLabel) };
        }
        return { ...prev, [key]: [...current, optionLabel] };
      });
    } else {
      setSelectedAnswers(prev => ({ ...prev, [key]: optionLabel }));
    }
  };

  const handleOtherSubmit = (questionIdx: number, question: AskUserQuestion) => {
    const key = String(questionIdx);
    const text = otherText[key]?.trim();
    if (text) {
      if (question.multiSelect) {
        setSelectedAnswers(prev => {
          const current = (prev[key] as string[]) || [];
          return { ...prev, [key]: [...current, text] };
        });
      } else {
        setSelectedAnswers(prev => ({ ...prev, [key]: text }));
      }
      setShowOther(prev => ({ ...prev, [key]: false }));
      setOtherText(prev => ({ ...prev, [key]: '' }));
    }
  };

  const handleSubmit = () => {
    // Convert from index-based keys to question-text-based keys for the API
    const answers: Record<string, string | string[]> = {};
    request.questions.forEach((q, idx) => {
      const answer = selectedAnswers[String(idx)];
      if (answer) {
        answers[q.question] = answer;
      }
    });
    onSubmit(answers);
  };

  // Check if a specific question has an answer
  const hasAnswer = (idx: number) => {
    const answer = selectedAnswers[String(idx)];
    if (Array.isArray(answer)) return answer.length > 0;
    return Boolean(answer);
  };

  // Check if all questions have at least one answer
  const allQuestionsAnswered = request.questions.every((_, idx) => hasAnswer(idx));

  const questions = request.questions;
  const hasTabs = questions.length > 1;

  return (
    <div className="bg-blue-500/5 border border-blue-500/20 mx-2 mb-2">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-blue-500/20 bg-blue-500/10">
        <MessageCircleQuestion className="w-4 h-4 text-blue-500" />
        <span className="text-sm font-medium">Claude has a question</span>
        {hasTabs && (
          <span className="text-xs text-[var(--foreground-muted)] ml-auto">
            {questions.filter((_, i) => hasAnswer(i)).length}/{questions.length} answered
          </span>
        )}
      </div>

      {/* Tabs (if multiple questions) */}
      {hasTabs && (
        <div className="flex border-b border-blue-500/20 bg-[var(--secondary)]">
          {questions.map((q, idx) => (
            <button
              key={idx}
              onClick={() => setActiveTab(idx)}
              className={cn(
                'px-3 py-2 text-xs font-medium transition-colors border-b-2 -mb-px',
                activeTab === idx
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400 bg-[var(--background)]'
                  : 'border-transparent text-[var(--foreground-muted)] hover:text-[var(--foreground)]'
              )}
            >
              <span className="flex items-center gap-1.5">
                {q.header || `Q${idx + 1}`}
                {hasAnswer(idx) && (
                  <Check className="w-3 h-3 text-green-500" />
                )}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Active Question Content */}
      <div className="p-3">
        {questions.map((q, qIdx) => (
          <div
            key={qIdx}
            className={cn('space-y-2', activeTab !== qIdx && 'hidden')}
          >
            {/* Question header badge (only if no tabs or different from tab label) */}
            {!hasTabs && q.header && (
              <div className="inline-block text-xs font-medium px-2 py-0.5 bg-blue-500/20 text-blue-600 dark:text-blue-400">
                {q.header}
              </div>
            )}

            {/* Question text */}
            <div className="text-sm font-medium">{q.question}</div>

            {/* Multi-select indicator */}
            {q.multiSelect && (
              <div className="text-xs text-[var(--foreground-muted)]">
                Select all that apply
              </div>
            )}

            {/* Options grid */}
            <div className="grid gap-1.5">
              {q.options.map((opt, optIdx) => {
                const key = String(qIdx);
                const isSelected = q.multiSelect
                  ? ((selectedAnswers[key] as string[]) || []).includes(opt.label)
                  : selectedAnswers[key] === opt.label;

                return (
                  <button
                    key={optIdx}
                    onClick={() => handleOptionSelect(qIdx, q, opt.label)}
                    className={cn(
                      'w-full text-left px-3 py-2 border text-sm transition-colors',
                      isSelected
                        ? 'border-blue-500 bg-blue-500/10'
                        : 'border-[var(--border)] hover:border-blue-500/50 hover:bg-[var(--secondary)]'
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <div className={cn(
                        'w-4 h-4 mt-0.5 border flex items-center justify-center flex-shrink-0',
                        isSelected ? 'border-blue-500 bg-blue-500' : 'border-[var(--border)]',
                        !q.multiSelect && 'rounded-full'
                      )}>
                        {isSelected && <Check className="w-3 h-3 text-white" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div>{opt.label}</div>
                        {opt.description && (
                          <div className="text-xs text-[var(--foreground-muted)] mt-0.5">
                            {opt.description}
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}

              {/* Other option */}
              <button
                onClick={() => handleOptionSelect(qIdx, q, '__other__')}
                className={cn(
                  'w-full text-left px-3 py-2 border text-sm transition-colors',
                  showOther[String(qIdx)]
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-[var(--border)] hover:border-blue-500/50 hover:bg-[var(--secondary)]'
                )}
              >
                <div className="flex items-center gap-2">
                  <div className={cn(
                    'w-4 h-4 border flex items-center justify-center',
                    showOther[String(qIdx)] ? 'border-blue-500 bg-blue-500' : 'border-[var(--border)]',
                    !q.multiSelect && 'rounded-full'
                  )}>
                    {showOther[String(qIdx)] && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <span>Other</span>
                </div>
              </button>

              {/* Other text input */}
              {showOther[String(qIdx)] && (
                <div className="flex gap-2 ml-6">
                  <input
                    type="text"
                    value={otherText[String(qIdx)] || ''}
                    onChange={(e) => setOtherText(prev => ({ ...prev, [String(qIdx)]: e.target.value }))}
                    placeholder="Enter your answer..."
                    className="flex-1 px-3 py-1.5 text-sm border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-1 focus:ring-blue-500"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleOtherSubmit(qIdx, q);
                      }
                    }}
                    autoFocus
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleOtherSubmit(qIdx, q)}
                    disabled={!otherText[String(qIdx)]?.trim()}
                  >
                    Add
                  </Button>
                </div>
              )}
            </div>

            {/* Selected answers for multi-select */}
            {q.multiSelect && (selectedAnswers[String(qIdx)] as string[])?.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {(selectedAnswers[String(qIdx)] as string[]).map((answer, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-blue-500/20 text-blue-600 dark:text-blue-400"
                  >
                    {answer}
                    <button
                      onClick={() => handleOptionSelect(qIdx, q, answer)}
                      className="hover:text-blue-800 dark:hover:text-blue-200"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Footer with actions */}
      <div className="flex items-center justify-between px-3 py-2 border-t border-blue-500/20 bg-[var(--secondary)]">
        {/* Navigation for tabs */}
        {hasTabs && (
          <div className="flex items-center gap-1 text-xs text-[var(--foreground-muted)]">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2"
              disabled={activeTab === 0}
              onClick={() => setActiveTab(prev => prev - 1)}
            >
              Prev
            </Button>
            <span>{activeTab + 1} / {questions.length}</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2"
              disabled={activeTab === questions.length - 1}
              onClick={() => setActiveTab(prev => prev + 1)}
            >
              Next
            </Button>
          </div>
        )}
        {!hasTabs && <div />}

        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Skip
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={!allQuestionsAnswered}
          >
            <Send className="h-3 w-3 mr-1" />
            Submit
          </Button>
        </div>
      </div>
    </div>
  );
}

// Submitted question block - shows answers in a collapsed, read-only format
interface SubmittedQuestionBlockProps {
  request: AskUserQuestionRequest;
  answers: Record<string, string | string[]>;
}

export function SubmittedQuestionBlock({ request, answers }: SubmittedQuestionBlockProps) {
  const [expanded, setExpanded] = React.useState(false);

  // Get answer display for a question
  const getAnswerDisplay = (question: AskUserQuestion): string => {
    const answer = answers[question.question];
    if (!answer) return 'Skipped';
    if (Array.isArray(answer)) return answer.join(', ');
    return answer;
  };

  return (
    <div className="bg-[var(--secondary)] border border-[var(--border)] mx-2 mb-2 opacity-75">
      {/* Collapsed header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[var(--background)] transition-colors"
      >
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-[var(--foreground-muted)]" />
        ) : (
          <ChevronRight className="w-4 h-4 text-[var(--foreground-muted)]" />
        )}
        <MessageCircleQuestion className="w-4 h-4 text-[var(--foreground-muted)]" />
        <span className="text-sm text-[var(--foreground-muted)]">
          Question answered
        </span>
        {!expanded && (
          <span className="text-xs text-[var(--foreground-muted)] ml-auto truncate max-w-[200px]">
            {request.questions.length === 1
              ? getAnswerDisplay(request.questions[0])
              : `${request.questions.length} questions`
            }
          </span>
        )}
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="px-3 pb-3 space-y-3 border-t border-[var(--border)]">
          {request.questions.map((q, idx) => (
            <div key={idx} className="pt-2">
              {q.header && (
                <div className="text-xs text-[var(--foreground-muted)] mb-1">
                  {q.header}
                </div>
              )}
              <div className="text-sm text-[var(--foreground-muted)]">{q.question}</div>
              <div className="text-sm font-medium mt-1 flex items-center gap-1">
                <Check className="w-3 h-3 text-green-500" />
                {getAnswerDisplay(q)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
