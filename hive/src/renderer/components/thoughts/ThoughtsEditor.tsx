import React from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import Editor, { type OnMount } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { Eye, Code, List, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MarkdownViewer } from './MarkdownViewer';
import { CommentsSidebar } from './CommentsSidebar';
import { AllCommentsPanel } from './AllCommentsPanel';
import { AddCommentDialog } from './AddCommentDialog';
import { useThemeStore } from '@/lib/store';
import { solarizedLight, solarizedDark } from '@/lib/monaco-themes';
import { insertCommentByText } from '@/lib/comment-utils';
import type { FileContent, ThoughtComment } from '../../../shared/types';

type ViewMode = 'rendered' | 'raw';

interface ThoughtsEditorProps {
  fileContent: FileContent;
  comments: ThoughtComment[];
  allProjectComments: ThoughtComment[];
  projectDirectory: string;
  onSave: (content: string) => void;
  onCreateComment: (content: string, selectedText: string, contextBefore: string, contextAfter: string) => Promise<ThoughtComment | null>;
  onDeleteComment: (commentId: string) => void;
  onSendComments: (commentIds: string[]) => void;
  onFileSelect: (filePath: string) => void;
}

export function ThoughtsEditor({
  fileContent,
  comments,
  allProjectComments,
  projectDirectory,
  onSave,
  onCreateComment,
  onDeleteComment,
  onSendComments,
  onFileSelect,
}: ThoughtsEditorProps) {
  const [content, setContent] = React.useState(fileContent.content);
  const [isDirty, setIsDirty] = React.useState(false);
  const [viewMode, setViewMode] = React.useState<ViewMode>('rendered');
  const [showAllComments, setShowAllComments] = React.useState(false);

  // Comment interaction state
  const [highlightedCommentId, setHighlightedCommentId] = React.useState<string | null>(null);
  const [selectedCommentIds, setSelectedCommentIds] = React.useState<Set<string>>(new Set());

  // Add comment dialog
  const [showCommentDialog, setShowCommentDialog] = React.useState(false);
  const [pendingSelection, setPendingSelection] = React.useState<{
    selectedText: string;
    contextBefore: string;
    contextAfter: string;
  } | null>(null);

  const { resolvedTheme } = useThemeStore();
  const editorRef = React.useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = React.useRef<typeof import('monaco-editor') | null>(null);

  // Sync content when file changes
  React.useEffect(() => {
    setContent(fileContent.content);
    setIsDirty(false);
  }, [fileContent.path, fileContent.content]);

  // Handle text selection in markdown viewer
  const handleTextSelect = (selectedText: string, contextBefore: string, contextAfter: string) => {
    setPendingSelection({ selectedText, contextBefore, contextAfter });
    setShowCommentDialog(true);
  };

  // Handle comment click - highlight the comment (toggle on/off)
  const handleCommentClick = (comment: ThoughtComment) => {
    setHighlightedCommentId(prev => prev === comment.id ? null : comment.id);
  };

  // Handle comment selection toggle
  const handleCommentSelect = (commentId: string, selected: boolean) => {
    setSelectedCommentIds(prev => {
      const next = new Set(prev);
      if (selected) {
        next.add(commentId);
      } else {
        next.delete(commentId);
      }
      return next;
    });
  };

  // Send selected comments
  const handleSendSelected = () => {
    const ids = Array.from(selectedCommentIds);
    if (ids.length > 0) {
      onSendComments(ids);
      setSelectedCommentIds(new Set());
    }
  };

  // Create new comment
  const handleCommentSubmit = async (commentContent: string) => {
    if (pendingSelection) {
      const comment = await onCreateComment(
        commentContent,
        pendingSelection.selectedText,
        pendingSelection.contextBefore,
        pendingSelection.contextAfter
      );

      // Insert comment tags into the markdown file
      if (comment) {
        const newContent = insertCommentByText(
          content,
          pendingSelection.selectedText,
          comment.id,
          commentContent
        );
        setContent(newContent);
        onSave(newContent);
      }

      setPendingSelection(null);
    }
  };

  // Save handler
  const handleSave = () => {
    onSave(content);
    setIsDirty(false);
  };

  // Monaco editor mount handler
  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Register Solarized themes
    monaco.editor.defineTheme('solarized-light', solarizedLight);
    monaco.editor.defineTheme('solarized-dark', solarizedDark);
    monaco.editor.setTheme(resolvedTheme === 'dark' ? 'solarized-dark' : 'solarized-light');

    // Add save keybinding
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, handleSave);
  };

  // Update theme when app theme changes
  React.useEffect(() => {
    if (monacoRef.current) {
      monacoRef.current.editor.setTheme(resolvedTheme === 'dark' ? 'solarized-dark' : 'solarized-light');
    }
  }, [resolvedTheme]);

  const pendingComments = comments.filter(c => c.status === 'pending');
  const allPendingCount = allProjectComments.filter(c => c.status === 'pending').length;

  // Show all comments panel
  if (showAllComments) {
    return (
      <AllCommentsPanel
        comments={allProjectComments}
        projectDirectory={projectDirectory}
        onCommentClick={handleCommentClick}
        onFileSelect={onFileSelect}
        onClose={() => setShowAllComments(false)}
      />
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border)] bg-[var(--background-secondary)]">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">
            {fileContent.path.split('/').pop()}
          </span>
          {isDirty && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--warning)]/20 text-[var(--warning)]">
              unsaved
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* View mode toggle */}
          <div className="flex items-center rounded border border-[var(--border)]">
            <Button
              variant={viewMode === 'rendered' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('rendered')}
              className="rounded-r-none gap-1 h-7 px-2"
            >
              <Eye className="h-3 w-3" />
              View
            </Button>
            <Button
              variant={viewMode === 'raw' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('raw')}
              className="rounded-l-none gap-1 h-7 px-2"
            >
              <Code className="h-3 w-3" />
              Edit
            </Button>
          </div>

          {/* All comments toggle */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowAllComments(true)}
            className="gap-1 h-7 px-2"
          >
            <List className="h-3 w-3" />
            All ({allPendingCount})
          </Button>

          {/* Save button (only in raw mode) */}
          {viewMode === 'raw' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSave}
              disabled={!isDirty}
              className="gap-1 h-7 px-2"
            >
              <Save className="h-3 w-3" />
              Save
            </Button>
          )}
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 overflow-hidden">
        <PanelGroup direction="horizontal" autoSaveId="hive-thoughts-editor-layout">
          {/* Content panel */}
          <Panel id="thoughts-content" defaultSize={70} minSize={40}>
            <div className="h-full">
              {viewMode === 'rendered' ? (
                <MarkdownViewer
                  content={content}
                  comments={comments}
                  highlightedCommentId={highlightedCommentId}
                  onTextSelect={handleTextSelect}
                />
              ) : (
                <Editor
                  height="100%"
                  language="markdown"
                  value={content}
                  onChange={(value) => {
                    if (value !== undefined) {
                      setContent(value);
                      setIsDirty(value !== fileContent.content);
                    }
                  }}
                  onMount={handleEditorMount}
                  theme={resolvedTheme === 'dark' ? 'solarized-dark' : 'solarized-light'}
                  options={{
                    fontFamily: 'Hack, "Fira Code", monospace',
                    fontSize: 14,
                    lineHeight: 1.6,
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    wordWrap: 'on',
                    lineNumbers: 'on',
                    renderLineHighlight: 'line',
                    scrollbar: {
                      verticalScrollbarSize: 8,
                      horizontalScrollbarSize: 8,
                    },
                    padding: { top: 8, bottom: 8 },
                  }}
                />
              )}
            </div>
          </Panel>

          <PanelResizeHandle className="w-1 bg-[var(--border)] hover:bg-[var(--primary)] transition-colors" />

          {/* Comments sidebar */}
          <Panel id="thoughts-comments" defaultSize={30} minSize={15} maxSize={50}>
            <CommentsSidebar
              comments={comments}
              selectedCommentIds={selectedCommentIds}
              highlightedCommentId={highlightedCommentId}
              onCommentClick={handleCommentClick}
              onCommentSelect={handleCommentSelect}
              onSelectAll={() => setSelectedCommentIds(new Set(pendingComments.map(c => c.id)))}
              onDeselectAll={() => setSelectedCommentIds(new Set())}
              onSendSelected={handleSendSelected}
              onDeleteComment={onDeleteComment}
            />
          </Panel>
        </PanelGroup>
      </div>

      {/* Add Comment Dialog */}
      <AddCommentDialog
        isOpen={showCommentDialog}
        onClose={() => {
          setShowCommentDialog(false);
          setPendingSelection(null);
        }}
        onSubmit={handleCommentSubmit}
        selectedText={pendingSelection?.selectedText}
      />
    </div>
  );
}
