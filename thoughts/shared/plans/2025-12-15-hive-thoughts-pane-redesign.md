# Hive Thoughts Pane Redesign Implementation Plan

## Overview

Redesign the Thoughts tab to provide a Google Docs-like experience with rendered markdown, a comments sidebar, comment lifecycle management, and direct agent integration for sending comments.

## Current State Analysis

**Current Implementation:**
- `ThoughtsPane.tsx`: Split panel with file tree (left) and Monaco editor (right)
- `ThoughtsEditor.tsx`: Raw Monaco markdown editor with bottom comments panel
- Comments stored inline as `<!-- hive-comment(id): content -->` HTML comments
- `comment-parser.ts`: Parses comments using remark/unified
- "Send Comments" copies to clipboard via `formatCommentsForClaude()`

**Key Files:**
- `hive/src/renderer/components/thoughts/ThoughtsPane.tsx`
- `hive/src/renderer/components/thoughts/ThoughtsEditor.tsx`
- `hive/src/renderer/components/thoughts/AddCommentDialog.tsx`
- `hive/src/renderer/components/thoughts/FileTree.tsx`
- `hive/src/renderer/lib/comment-utils.ts`
- `hive/src/main/comment-parser.ts`
- `hive/src/main/database.ts`

## Desired End State

1. **Markdown Rendering**: Files display as rendered markdown by default with toggle for raw view
2. **Comments Sidebar**: Google Docs-style right panel showing comments aligned with their target text
3. **Interactive Highlighting**: Clicking a comment highlights the relevant text and scrolls to it
4. **Comment Navigation**: "All Comments" view to see and navigate to all comments
5. **Agent Integration**: Send comments directly to agent session with prefilled input
6. **Comment Lifecycle**: pending → sent status with history preserved in database
7. **Git Integration**: Store commit hash when comment is created for historical context

### Verification:
- Comments appear in right sidebar aligned with their position in the document
- Clicking a comment highlights the target text and scrolls to it
- Can toggle between rendered markdown and raw editor view
- Can select comments and send to agent tab with prefilled input
- Comments transition from "pending" to "sent" when sent to agent
- Comment history persists in database with commit reference
- Past comments viewable even after removed from document

## What We're NOT Doing

- Real-time collaborative editing (no multi-user support)
- Comment replies/threads (single-level comments only)
- Rich text comments (plain text only)
- Inline comment editing in rendered view (must switch to raw view)
- Comment resolution workflows beyond pending/sent

## Implementation Approach

Use a three-panel layout: file tree | markdown content | comments sidebar. The markdown viewer will use `react-markdown` with custom components to inject comment anchors. Comments will be stored both inline (for portability) and in the database (for lifecycle tracking).

---

## Phase 1: Database Schema for Comments

### Overview
Add database table to track comment lifecycle and history, including git commit reference.

### Changes Required:

#### 1. Database Schema
**File**: `hive/src/main/database.ts`
**Changes**: Add `thought_comments` table

```sql
CREATE TABLE IF NOT EXISTS thought_comments (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  content TEXT NOT NULL,
  start_line INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'sent', 'archived')),
  git_commit TEXT,
  sent_to_session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
  sent_at INTEGER,
  created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
  updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
);

CREATE INDEX IF NOT EXISTS idx_thought_comments_project ON thought_comments(project_id);
CREATE INDEX IF NOT EXISTS idx_thought_comments_file ON thought_comments(file_path);
CREATE INDEX IF NOT EXISTS idx_thought_comments_status ON thought_comments(status);
```

#### 2. Database API
**File**: `hive/src/main/database.ts`
**Changes**: Add prepared statements and API methods

```typescript
// Add to statements object
getCommentsByProject: db.prepare(`
  SELECT id, project_id as projectId, file_path as filePath, content,
         start_line as startLine, end_line as endLine, status,
         git_commit as gitCommit, sent_to_session_id as sentToSessionId,
         sent_at as sentAt, created_at as createdAt, updated_at as updatedAt
  FROM thought_comments WHERE project_id = ? ORDER BY created_at DESC
`),
getCommentsByFile: db.prepare(`
  SELECT id, project_id as projectId, file_path as filePath, content,
         start_line as startLine, end_line as endLine, status,
         git_commit as gitCommit, sent_to_session_id as sentToSessionId,
         sent_at as sentAt, created_at as createdAt, updated_at as updatedAt
  FROM thought_comments WHERE file_path = ? AND status != 'archived' ORDER BY start_line ASC
`),
getPendingCommentsByProject: db.prepare(`
  SELECT id, project_id as projectId, file_path as filePath, content,
         start_line as startLine, end_line as endLine, status,
         git_commit as gitCommit, sent_to_session_id as sentToSessionId,
         sent_at as sentAt, created_at as createdAt, updated_at as updatedAt
  FROM thought_comments WHERE project_id = ? AND status = 'pending' ORDER BY created_at ASC
`),
insertComment: db.prepare(`
  INSERT INTO thought_comments (id, project_id, file_path, content, start_line, end_line, git_commit)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`),
updateCommentStatus: db.prepare(`
  UPDATE thought_comments SET status = ?, sent_to_session_id = ?, sent_at = ?, updated_at = ? WHERE id = ?
`),
deleteComment: db.prepare(`DELETE FROM thought_comments WHERE id = ?`),

// Add to database export
thoughtComments: {
  listByProject(projectId: string): ThoughtComment[] { ... },
  listByFile(filePath: string): ThoughtComment[] { ... },
  listPendingByProject(projectId: string): ThoughtComment[] { ... },
  create(data: CreateThoughtComment): ThoughtComment { ... },
  updateStatus(id: string, status: string, sessionId?: string): void { ... },
  delete(id: string): void { ... },
}
```

#### 3. Types
**File**: `hive/src/shared/types.ts`
**Changes**: Add ThoughtComment type

```typescript
export interface ThoughtComment {
  id: string;
  projectId: string;
  filePath: string;
  content: string;
  startLine: number;
  endLine: number;
  status: 'pending' | 'sent' | 'archived';
  gitCommit: string | null;
  sentToSessionId: string | null;
  sentAt: number | null;
  createdAt: number;
  updatedAt: number;
}
```

#### 4. IPC Handlers
**File**: `hive/src/main/ipc-handlers.ts`
**Changes**: Add handlers for comment CRUD operations

```typescript
ipcMain.handle('db:thought-comments:list-by-project', async (_, { projectId }) => {
  return database.thoughtComments.listByProject(projectId);
});

ipcMain.handle('db:thought-comments:list-by-file', async (_, { filePath }) => {
  return database.thoughtComments.listByFile(filePath);
});

ipcMain.handle('db:thought-comments:list-pending', async (_, { projectId }) => {
  return database.thoughtComments.listPendingByProject(projectId);
});

ipcMain.handle('db:thought-comments:create', async (_, data) => {
  // Get current git commit
  const gitCommit = await getHeadCommit(data.projectDirectory);
  return database.thoughtComments.create({ ...data, gitCommit });
});

ipcMain.handle('db:thought-comments:update-status', async (_, { id, status, sessionId }) => {
  return database.thoughtComments.updateStatus(id, status, sessionId);
});

ipcMain.handle('db:thought-comments:delete', async (_, { id }) => {
  return database.thoughtComments.delete(id);
});
```

### Success Criteria:

#### Automated Verification:
- [x] App starts without database errors
- [x] TypeScript compiles: `pnpm exec tsc --noEmit`
- [x] Can create/read/update comments via IPC in dev tools console

#### Manual Verification:
- [x] Comments table created in ~/.hive/hive.db
- [x] CRUD operations work correctly

**Implementation Note**: After completing this phase, pause for manual verification before proceeding.

---

## Phase 2: Markdown Viewer Component

### Overview
Create a new markdown viewer component with comment anchor support, replacing Monaco for the default view.

### Changes Required:

#### 1. Install Dependencies
```bash
pnpm add react-markdown remark-gfm rehype-raw rehype-slug
```

#### 2. Create MarkdownViewer Component
**File**: `hive/src/renderer/components/thoughts/MarkdownViewer.tsx`
**Changes**: New file

```tsx
import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSlug from 'rehype-slug';
import { cn } from '@/lib/utils';
import type { ThoughtComment } from '../../../shared/types';

interface MarkdownViewerProps {
  content: string;
  comments: ThoughtComment[];
  highlightedCommentId: string | null;
  onTextSelect?: (startLine: number, endLine: number, selectedText: string) => void;
}

export function MarkdownViewer({
  content,
  comments,
  highlightedCommentId,
  onTextSelect
}: MarkdownViewerProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Process content to inject comment markers
  const processedContent = React.useMemo(() => {
    return injectCommentMarkers(content, comments);
  }, [content, comments]);

  // Handle text selection for new comments
  const handleMouseUp = () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;

    // Calculate line numbers from selection
    const range = selection.getRangeAt(0);
    const startLine = getLineNumber(range.startContainer, containerRef.current);
    const endLine = getLineNumber(range.endContainer, containerRef.current);
    const selectedText = selection.toString();

    if (startLine && endLine && selectedText.trim()) {
      onTextSelect?.(startLine, endLine, selectedText);
    }
  };

  return (
    <div
      ref={containerRef}
      className="h-full overflow-auto px-6 py-4 prose prose-sm dark:prose-invert max-w-none"
      onMouseUp={handleMouseUp}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, rehypeSlug]}
        components={{
          // Custom component to render comment anchors
          'comment-anchor': ({ id }: { id: string }) => (
            <span
              id={`comment-${id}`}
              className={cn(
                'comment-anchor',
                highlightedCommentId === id && 'bg-yellow-200 dark:bg-yellow-800'
              )}
            />
          ),
        }}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
}

// Helper to inject invisible markers at comment positions
function injectCommentMarkers(content: string, comments: ThoughtComment[]): string {
  // Implementation: parse content line by line, inject <comment-anchor id="X" /> tags
  // at comment start positions
  const lines = content.split('\n');
  // ... inject markers
  return lines.join('\n');
}

// Helper to get line number from DOM node
function getLineNumber(node: Node, container: HTMLElement | null): number | null {
  // Implementation: traverse up to find line marker or calculate from position
  return null;
}
```

#### 3. Add Line Number Tracking
**File**: `hive/src/renderer/components/thoughts/MarkdownViewer.tsx`
**Changes**: Add data attributes for line tracking

The markdown renderer needs to track which source lines correspond to which rendered elements. We'll add `data-line` attributes during processing.

#### 4. Highlight Styles
**File**: `hive/src/renderer/index.css`
**Changes**: Add comment highlight styles

```css
/* Comment highlight animation */
.comment-highlight {
  background-color: rgba(250, 204, 21, 0.3);
  transition: background-color 0.3s ease;
}

.comment-highlight-flash {
  animation: comment-flash 1.5s ease-out;
}

@keyframes comment-flash {
  0% { background-color: rgba(250, 204, 21, 0.6); }
  100% { background-color: transparent; }
}
```

### Success Criteria:

#### Automated Verification:
- [x] TypeScript compiles: `pnpm exec tsc --noEmit`
- [x] Dependencies installed correctly

#### Manual Verification:
- [ ] Markdown renders correctly with GFM support (tables, checkboxes, etc.)
- [ ] Code blocks have syntax highlighting
- [ ] Text selection triggers callback with line numbers
- [ ] Comment markers render at correct positions

**Implementation Note**: After completing this phase, pause for manual verification before proceeding.

---

## Phase 3: Comments Sidebar Component

### Overview
Create a Google Docs-style comments sidebar that displays comments aligned with their target text.

### Changes Required:

#### 1. Create CommentsSidebar Component
**File**: `hive/src/renderer/components/thoughts/CommentsSidebar.tsx`
**Changes**: New file

```tsx
import React from 'react';
import { MessageSquare, Send, Check, Clock, MoreHorizontal, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ThoughtComment } from '../../../shared/types';

interface CommentsSidebarProps {
  comments: ThoughtComment[];
  selectedCommentIds: Set<string>;
  highlightedCommentId: string | null;
  onCommentClick: (comment: ThoughtComment) => void;
  onCommentSelect: (commentId: string, selected: boolean) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onSendSelected: () => void;
  onDeleteComment: (commentId: string) => void;
  // Map of comment ID to vertical position (px from top)
  commentPositions: Map<string, number>;
}

export function CommentsSidebar({
  comments,
  selectedCommentIds,
  highlightedCommentId,
  onCommentClick,
  onCommentSelect,
  onSelectAll,
  onDeselectAll,
  onSendSelected,
  onDeleteComment,
  commentPositions,
}: CommentsSidebarProps) {
  const pendingComments = comments.filter(c => c.status === 'pending');
  const sentComments = comments.filter(c => c.status === 'sent');

  return (
    <div className="h-full flex flex-col bg-[var(--background-secondary)] border-l border-[var(--border)]">
      {/* Header with actions */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border)]">
        <span className="text-sm font-medium">
          Comments ({pendingComments.length})
        </span>
        <div className="flex items-center gap-1">
          {selectedCommentIds.size > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onSendSelected}
              className="gap-1 text-xs"
            >
              <Send className="h-3 w-3" />
              Send ({selectedCommentIds.size})
            </Button>
          )}
        </div>
      </div>

      {/* Comments list - positioned to align with document */}
      <div className="flex-1 overflow-auto relative">
        {pendingComments.map((comment) => {
          const position = commentPositions.get(comment.id);
          return (
            <CommentCard
              key={comment.id}
              comment={comment}
              isSelected={selectedCommentIds.has(comment.id)}
              isHighlighted={highlightedCommentId === comment.id}
              onClick={() => onCommentClick(comment)}
              onSelect={(selected) => onCommentSelect(comment.id, selected)}
              onDelete={() => onDeleteComment(comment.id)}
              style={position !== undefined ? {
                position: 'absolute',
                top: position,
                left: 0,
                right: 0,
              } : undefined}
            />
          );
        })}

        {/* Fallback: show comments in list if positioning fails */}
        {commentPositions.size === 0 && pendingComments.map((comment) => (
          <CommentCard
            key={comment.id}
            comment={comment}
            isSelected={selectedCommentIds.has(comment.id)}
            isHighlighted={highlightedCommentId === comment.id}
            onClick={() => onCommentClick(comment)}
            onSelect={(selected) => onCommentSelect(comment.id, selected)}
            onDelete={() => onDeleteComment(comment.id)}
          />
        ))}
      </div>

      {/* Sent comments section (collapsed by default) */}
      {sentComments.length > 0 && (
        <details className="border-t border-[var(--border)]">
          <summary className="px-3 py-2 text-sm text-[var(--foreground-muted)] cursor-pointer">
            Sent ({sentComments.length})
          </summary>
          <div className="max-h-32 overflow-auto">
            {sentComments.map((comment) => (
              <div
                key={comment.id}
                className="px-3 py-2 text-xs text-[var(--foreground-muted)] opacity-60"
              >
                <Check className="h-3 w-3 inline mr-1" />
                {comment.content.slice(0, 50)}...
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

interface CommentCardProps {
  comment: ThoughtComment;
  isSelected: boolean;
  isHighlighted: boolean;
  onClick: () => void;
  onSelect: (selected: boolean) => void;
  onDelete: () => void;
  style?: React.CSSProperties;
}

function CommentCard({
  comment,
  isSelected,
  isHighlighted,
  onClick,
  onSelect,
  onDelete,
  style,
}: CommentCardProps) {
  return (
    <div
      className={cn(
        'px-3 py-2 border-b border-[var(--border)] cursor-pointer transition-colors',
        isHighlighted && 'bg-yellow-100 dark:bg-yellow-900/30',
        isSelected && 'bg-[var(--primary)]/10',
        !isHighlighted && !isSelected && 'hover:bg-[var(--sidebar-accent)]'
      )}
      style={style}
      onClick={onClick}
    >
      <div className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={(e) => {
            e.stopPropagation();
            onSelect(e.target.checked);
          }}
          className="mt-1"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 text-xs text-[var(--foreground-muted)]">
            <Clock className="h-3 w-3" />
            <span>Lines {comment.startLine}-{comment.endLine}</span>
          </div>
          <p className="text-sm mt-1">{comment.content}</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 opacity-0 group-hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}
```

### Success Criteria:

#### Automated Verification:
- [x] TypeScript compiles: `pnpm exec tsc --noEmit`

#### Manual Verification:
- [ ] Comments display in sidebar with checkbox selection
- [ ] Clicking comment triggers callback
- [ ] Selected comments show count in header
- [ ] Sent comments appear in collapsed section

**Implementation Note**: After completing this phase, pause for manual verification before proceeding.

---

## Phase 4: Redesigned ThoughtsEditor with Three Panels

### Overview
Refactor ThoughtsEditor to use three-panel layout: markdown viewer (center) + comments sidebar (right), with toggle for raw editor mode.

### Changes Required:

#### 1. Update ThoughtsEditor
**File**: `hive/src/renderer/components/thoughts/ThoughtsEditor.tsx`
**Changes**: Complete rewrite

```tsx
import React from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import Editor, { type OnMount } from '@monaco-editor/react';
import { Eye, Code, MessageSquare, Plus, Send, List } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MarkdownViewer } from './MarkdownViewer';
import { CommentsSidebar } from './CommentsSidebar';
import { AddCommentDialog } from './AddCommentDialog';
import { AllCommentsPanel } from './AllCommentsPanel';
import { useThemeStore } from '@/lib/store';
import { solarizedLight, solarizedDark } from '@/lib/monaco-themes';
import type { FileContent, ThoughtComment } from '../../../shared/types';

type ViewMode = 'rendered' | 'raw';

interface ThoughtsEditorProps {
  fileContent: FileContent;
  comments: ThoughtComment[];
  projectId: string;
  projectDirectory: string;
  onSave: (content: string) => void;
  onCreateComment: (content: string, startLine: number, endLine: number) => void;
  onDeleteComment: (commentId: string) => void;
  onSendComments: (commentIds: string[]) => void;
}

export function ThoughtsEditor({
  fileContent,
  comments,
  projectId,
  projectDirectory,
  onSave,
  onCreateComment,
  onDeleteComment,
  onSendComments,
}: ThoughtsEditorProps) {
  const [content, setContent] = React.useState(fileContent.content);
  const [isDirty, setIsDirty] = React.useState(false);
  const [viewMode, setViewMode] = React.useState<ViewMode>('rendered');
  const [showAllComments, setShowAllComments] = React.useState(false);

  // Comment interaction state
  const [highlightedCommentId, setHighlightedCommentId] = React.useState<string | null>(null);
  const [selectedCommentIds, setSelectedCommentIds] = React.useState<Set<string>>(new Set());
  const [commentPositions, setCommentPositions] = React.useState<Map<string, number>>(new Map());

  // Add comment dialog
  const [showCommentDialog, setShowCommentDialog] = React.useState(false);
  const [pendingSelection, setPendingSelection] = React.useState<{
    startLine: number;
    endLine: number;
    selectedText: string;
  } | null>(null);

  const { resolvedTheme } = useThemeStore();
  const editorRef = React.useRef<editor.IStandaloneCodeEditor | null>(null);
  const viewerRef = React.useRef<HTMLDivElement>(null);

  // Sync content when file changes
  React.useEffect(() => {
    setContent(fileContent.content);
    setIsDirty(false);
  }, [fileContent.path, fileContent.content]);

  // Handle text selection in markdown viewer
  const handleTextSelect = (startLine: number, endLine: number, selectedText: string) => {
    setPendingSelection({ startLine, endLine, selectedText });
    setShowCommentDialog(true);
  };

  // Handle comment click - highlight and scroll
  const handleCommentClick = (comment: ThoughtComment) => {
    setHighlightedCommentId(comment.id);

    // Scroll to comment in viewer
    const element = document.getElementById(`comment-${comment.id}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // Clear highlight after animation
    setTimeout(() => setHighlightedCommentId(null), 2000);
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

  // Send selected comments to agent
  const handleSendSelected = () => {
    const ids = Array.from(selectedCommentIds);
    if (ids.length > 0) {
      onSendComments(ids);
      setSelectedCommentIds(new Set());
    }
  };

  // Create new comment
  const handleCommentSubmit = (commentContent: string) => {
    if (pendingSelection) {
      onCreateComment(commentContent, pendingSelection.startLine, pendingSelection.endLine);
      setPendingSelection(null);
    }
  };

  // Calculate comment positions for sidebar alignment
  React.useEffect(() => {
    if (viewMode !== 'rendered' || !viewerRef.current) return;

    const positions = new Map<string, number>();
    comments.forEach(comment => {
      const anchor = document.getElementById(`comment-${comment.id}`);
      if (anchor && viewerRef.current) {
        const viewerRect = viewerRef.current.getBoundingClientRect();
        const anchorRect = anchor.getBoundingClientRect();
        positions.set(comment.id, anchorRect.top - viewerRect.top);
      }
    });
    setCommentPositions(positions);
  }, [comments, viewMode, content]);

  const pendingComments = comments.filter(c => c.status === 'pending');

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
              className="rounded-r-none gap-1"
            >
              <Eye className="h-3 w-3" />
              View
            </Button>
            <Button
              variant={viewMode === 'raw' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('raw')}
              className="rounded-l-none gap-1"
            >
              <Code className="h-3 w-3" />
              Edit
            </Button>
          </div>

          {/* All comments toggle */}
          <Button
            variant={showAllComments ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setShowAllComments(!showAllComments)}
            className="gap-1"
          >
            <List className="h-3 w-3" />
            All ({pendingComments.length})
          </Button>

          {/* Add comment (only in rendered mode) */}
          {viewMode === 'rendered' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setPendingSelection({ startLine: 1, endLine: 1, selectedText: '' });
                setShowCommentDialog(true);
              }}
              className="gap-1"
            >
              <Plus className="h-3 w-3" />
              Comment
            </Button>
          )}
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 overflow-hidden">
        {showAllComments ? (
          <AllCommentsPanel
            comments={comments}
            projectDirectory={projectDirectory}
            onCommentClick={handleCommentClick}
            onClose={() => setShowAllComments(false)}
          />
        ) : (
          <PanelGroup direction="horizontal">
            {/* Content panel */}
            <Panel defaultSize={70} minSize={50}>
              <div ref={viewerRef} className="h-full">
                {viewMode === 'rendered' ? (
                  <MarkdownViewer
                    content={content}
                    comments={comments}
                    highlightedCommentId={highlightedCommentId}
                    onTextSelect={handleTextSelect}
                  />
                ) : (
                  <RawEditor
                    content={content}
                    onChange={(value) => {
                      setContent(value);
                      setIsDirty(value !== fileContent.content);
                    }}
                    onSave={() => {
                      onSave(content);
                      setIsDirty(false);
                    }}
                    theme={resolvedTheme}
                  />
                )}
              </div>
            </Panel>

            <PanelResizeHandle className="w-1 bg-[var(--border)] hover:bg-[var(--primary)] transition-colors" />

            {/* Comments sidebar */}
            <Panel defaultSize={30} minSize={20} maxSize={40}>
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
                commentPositions={commentPositions}
              />
            </Panel>
          </PanelGroup>
        )}
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
        line={pendingSelection?.startLine ?? 1}
      />
    </div>
  );
}

// Raw editor component (Monaco)
function RawEditor({ content, onChange, onSave, theme }: {
  content: string;
  onChange: (value: string) => void;
  onSave: () => void;
  theme: 'light' | 'dark';
}) {
  const editorRef = React.useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = React.useRef<typeof import('monaco-editor') | null>(null);

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    monaco.editor.defineTheme('solarized-light', solarizedLight);
    monaco.editor.defineTheme('solarized-dark', solarizedDark);
    monaco.editor.setTheme(theme === 'dark' ? 'solarized-dark' : 'solarized-light');

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, onSave);
  };

  React.useEffect(() => {
    if (monacoRef.current) {
      monacoRef.current.editor.setTheme(theme === 'dark' ? 'solarized-dark' : 'solarized-light');
    }
  }, [theme]);

  return (
    <Editor
      height="100%"
      language="markdown"
      value={content}
      onChange={(value) => value && onChange(value)}
      onMount={handleMount}
      options={{
        fontFamily: 'Hack, "Fira Code", monospace',
        fontSize: 14,
        lineHeight: 1.6,
        minimap: { enabled: false },
        wordWrap: 'on',
        lineNumbers: 'on',
        padding: { top: 8, bottom: 8 },
      }}
    />
  );
}
```

#### 2. Create AllCommentsPanel
**File**: `hive/src/renderer/components/thoughts/AllCommentsPanel.tsx`
**Changes**: New file - shows all comments across all files with navigation

```tsx
import React from 'react';
import { ArrowLeft, FileText, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ThoughtComment } from '../../../shared/types';

interface AllCommentsPanelProps {
  comments: ThoughtComment[];
  projectDirectory: string;
  onCommentClick: (comment: ThoughtComment) => void;
  onClose: () => void;
}

export function AllCommentsPanel({
  comments,
  projectDirectory,
  onCommentClick,
  onClose,
}: AllCommentsPanelProps) {
  // Group comments by file
  const commentsByFile = React.useMemo(() => {
    const grouped = new Map<string, ThoughtComment[]>();
    comments.forEach(comment => {
      const existing = grouped.get(comment.filePath) || [];
      grouped.set(comment.filePath, [...existing, comment]);
    });
    return grouped;
  }, [comments]);

  const pendingCount = comments.filter(c => c.status === 'pending').length;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--border)]">
        <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <span className="font-medium">All Comments ({pendingCount} pending)</span>
      </div>

      {/* Comments grouped by file */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {Array.from(commentsByFile.entries()).map(([filePath, fileComments]) => {
          const relativePath = filePath.replace(projectDirectory + '/thoughts/', '');
          const pendingInFile = fileComments.filter(c => c.status === 'pending');

          if (pendingInFile.length === 0) return null;

          return (
            <div key={filePath} className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-[var(--foreground-muted)]">
                <FileText className="h-4 w-4" />
                <span>{relativePath}</span>
                <span className="text-xs">({pendingInFile.length})</span>
              </div>
              <div className="space-y-1 ml-6">
                {pendingInFile.map(comment => (
                  <button
                    key={comment.id}
                    onClick={() => onCommentClick(comment)}
                    className="w-full text-left p-2 rounded bg-[var(--background-secondary)] hover:bg-[var(--sidebar-accent)] transition-colors"
                  >
                    <div className="text-xs text-[var(--foreground-muted)]">
                      Lines {comment.startLine}-{comment.endLine}
                    </div>
                    <div className="text-sm">{comment.content}</div>
                  </button>
                ))}
              </div>
            </div>
          );
        })}

        {pendingCount === 0 && (
          <div className="text-center text-[var(--foreground-muted)] py-8">
            No pending comments
          </div>
        )}
      </div>
    </div>
  );
}
```

#### 3. Update ThoughtsPane
**File**: `hive/src/renderer/components/thoughts/ThoughtsPane.tsx`
**Changes**: Add comment state management and pass to ThoughtsEditor

```tsx
// Add state for comments from database
const [dbComments, setDbComments] = React.useState<ThoughtComment[]>([]);

// Load comments from database
React.useEffect(() => {
  async function loadComments() {
    if (!selectedPath) return;
    const comments = await window.electronAPI.invoke<ThoughtComment[]>(
      'db:thought-comments:list-by-file',
      { filePath: selectedPath }
    );
    setDbComments(comments);
  }
  loadComments();
}, [selectedPath]);

// Handle comment creation
const handleCreateComment = async (content: string, startLine: number, endLine: number) => {
  if (!selectedPath || !projectId) return;

  const comment = await window.electronAPI.invoke<ThoughtComment>(
    'db:thought-comments:create',
    {
      projectId,
      filePath: selectedPath,
      content,
      startLine,
      endLine,
      projectDirectory,
    }
  );

  setDbComments(prev => [...prev, comment]);
};

// Handle comment deletion
const handleDeleteComment = async (commentId: string) => {
  await window.electronAPI.invoke('db:thought-comments:delete', { id: commentId });
  setDbComments(prev => prev.filter(c => c.id !== commentId));
};

// Handle sending comments to agent
const handleSendComments = async (commentIds: string[]) => {
  // Get the comments to send
  const commentsToSend = dbComments.filter(c => commentIds.includes(c.id));

  // Navigate to agent tab with prefilled message
  // This will be implemented in Phase 5
  onSendToAgent?.(commentsToSend);

  // Update comment status to 'sent'
  for (const id of commentIds) {
    await window.electronAPI.invoke('db:thought-comments:update-status', {
      id,
      status: 'sent',
      sessionId: currentSessionId,
    });
  }

  // Update local state
  setDbComments(prev => prev.map(c =>
    commentIds.includes(c.id) ? { ...c, status: 'sent' as const } : c
  ));
};
```

### Success Criteria:

#### Automated Verification:
- [x] TypeScript compiles: `pnpm exec tsc --noEmit`
- [ ] No console errors on load

#### Manual Verification:
- [ ] Three-panel layout displays correctly
- [ ] Toggle between rendered/raw view works
- [ ] Comments appear in sidebar
- [ ] Clicking comment scrolls to position in document
- [ ] Can select text and add new comment
- [ ] All Comments panel shows grouped comments

**Implementation Note**: After completing this phase, pause for manual verification before proceeding.

---

## Phase 5: Agent Integration

### Overview
Implement the ability to send selected comments directly to the agent session with prefilled input.

### Changes Required:

#### 1. Update Store with Prefill Functionality
**File**: `hive/src/renderer/lib/store.ts`
**Changes**: Add prefill state to drafts store

```typescript
interface DraftsState {
  // ... existing fields
  prefillForSession: (sessionId: string, text: string) => void;
}

// In the store implementation:
prefillForSession: (sessionId, text) => {
  set((state) => {
    const existingIndex = state.drafts.findIndex(d => d.sessionId === sessionId);
    const now = Date.now();

    if (existingIndex >= 0) {
      // Append to existing draft
      const updated = [...state.drafts];
      const existingText = updated[existingIndex].text;
      updated[existingIndex] = {
        ...updated[existingIndex],
        text: existingText ? `${existingText}\n\n${text}` : text,
        updatedAt: now,
      };
      return { drafts: updated };
    } else {
      // Create new draft
      const newDraft: Draft = {
        id: `draft-${now}`,
        projectId: '', // Will be set when accessed
        sessionId,
        text,
        createdAt: now,
        updatedAt: now,
      };
      return { drafts: [...state.drafts, newDraft] };
    }
  });
},
```

#### 2. Update SessionView to Accept Prefilled Comments
**File**: `hive/src/renderer/components/views/SessionView.tsx`
**Changes**: Listen for comment prefill events

```typescript
// Listen for prefill events from Thoughts tab
React.useEffect(() => {
  const handler = (event: CustomEvent<{ comments: ThoughtComment[] }>) => {
    const { comments } = event.detail;
    const text = formatCommentsForAgent(comments);

    // Prefill the message input
    prefillForSession(session.id, text);

    // Switch to agent tab
    setActiveTab('agent');
  };

  window.addEventListener('prefill-comments', handler as EventListener);
  return () => window.removeEventListener('prefill-comments', handler as EventListener);
}, [session.id]);
```

#### 3. Format Comments for Agent
**File**: `hive/src/renderer/lib/comment-utils.ts`
**Changes**: Update formatting function

```typescript
export function formatCommentsForAgent(comments: ThoughtComment[]): string {
  if (comments.length === 0) return '';

  const header = 'Please review and address the following feedback:\n\n';
  const commentsList = comments.map((c, i) => {
    const fileName = c.filePath.split('/').pop();
    return `${i + 1}. **${fileName}** (lines ${c.startLine}-${c.endLine}):\n   ${c.content}`;
  }).join('\n\n');

  return header + commentsList;
}
```

#### 4. Connect ThoughtsPane to Agent Tab
**File**: `hive/src/renderer/components/thoughts/ThoughtsPane.tsx`
**Changes**: Dispatch prefill event when sending comments

```typescript
const handleSendComments = async (commentIds: string[]) => {
  const commentsToSend = dbComments.filter(c => commentIds.includes(c.id));

  // Dispatch event to prefill agent tab
  window.dispatchEvent(new CustomEvent('prefill-comments', {
    detail: { comments: commentsToSend }
  }));

  // Update status in database
  for (const id of commentIds) {
    await window.electronAPI.invoke('db:thought-comments:update-status', {
      id,
      status: 'sent',
      sessionId: currentSessionId,
    });
  }

  // Update local state
  setDbComments(prev => prev.map(c =>
    commentIds.includes(c.id) ? { ...c, status: 'sent' as const } : c
  ));
};
```

#### 5. Update MessageInput to Support Prefill
**File**: `hive/src/renderer/components/session/MessageInput.tsx`
**Changes**: Load prefilled content on mount and after prefill event

The existing draft loading logic should already handle this if we use the drafts store correctly. Just ensure the prefillForSession updates the draft properly.

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compiles: `pnpm exec tsc --noEmit`

#### Manual Verification:
- [ ] Selecting comments and clicking "Send" switches to Agent tab
- [ ] Agent tab input is prefilled with formatted comments
- [ ] Can add additional context to prefilled message
- [ ] Sending the message works correctly
- [ ] Comments are marked as "sent" in sidebar

**Implementation Note**: After completing this phase, pause for manual verification before proceeding.

---

## Phase 6: Git Commit Integration

### Overview
Store the git commit hash when a comment is created, enabling historical context for when the comment was made.

### Changes Required:

#### 1. Git Service Extension
**File**: `hive/src/main/git-service.ts`
**Changes**: Add function to get HEAD commit

```typescript
export async function getHeadCommit(cwd: string): Promise<string | null> {
  try {
    const result = await exec('git rev-parse HEAD', { cwd });
    return result.stdout.trim();
  } catch {
    return null;
  }
}
```

#### 2. Update Comment Creation IPC
**File**: `hive/src/main/ipc-handlers.ts`
**Changes**: Fetch commit when creating comment

```typescript
ipcMain.handle('db:thought-comments:create', async (_, data) => {
  const gitCommit = await getHeadCommit(data.projectDirectory);
  return database.thoughtComments.create({
    projectId: data.projectId,
    filePath: data.filePath,
    content: data.content,
    startLine: data.startLine,
    endLine: data.endLine,
    gitCommit,
  });
});
```

#### 3. Display Commit Info in Comment Card
**File**: `hive/src/renderer/components/thoughts/CommentsSidebar.tsx`
**Changes**: Show commit hash in comment metadata

```tsx
{comment.gitCommit && (
  <span className="text-xs text-[var(--foreground-muted)] font-mono">
    @ {comment.gitCommit.slice(0, 7)}
  </span>
)}
```

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compiles: `pnpm exec tsc --noEmit`

#### Manual Verification:
- [ ] New comments have git commit stored
- [ ] Commit hash displays in comment card
- [ ] Works correctly in non-git directories (null commit)

**Implementation Note**: After completing this phase, pause for manual verification before proceeding.

---

## Phase 7: Polish and Edge Cases

### Overview
Handle edge cases, improve UX, and ensure robust behavior.

### Changes Required:

#### 1. Handle File Changes
- Detect when file content changes externally
- Warn if comments may be outdated (line numbers shifted)
- Option to re-sync comment positions

#### 2. Empty States
- No comments in file
- No thoughts directory
- No pending comments

#### 3. Keyboard Shortcuts
- `Cmd+/` to add comment at selection
- `Cmd+Enter` to send selected comments
- `Escape` to deselect all

#### 4. Loading States
- Show skeleton while loading comments
- Show loading indicator while sending

#### 5. Error Handling
- Handle database errors gracefully
- Show toast notifications for actions

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compiles: `pnpm exec tsc --noEmit`
- [ ] ESLint passes

#### Manual Verification:
- [ ] All empty states display correctly
- [ ] Keyboard shortcuts work
- [ ] Loading states appear appropriately
- [ ] Error messages display for failures

---

## Testing Strategy

### Unit Tests:
- Comment parsing and injection
- formatCommentsForAgent function
- Line number calculation

### Integration Tests:
- Database CRUD operations
- IPC handlers

### Manual Testing Steps:
1. Open a thoughts file with existing comments
2. Verify comments appear in sidebar
3. Click a comment - verify highlight and scroll
4. Select text in rendered view - add new comment
5. Select multiple comments and send to agent
6. Verify agent tab receives prefilled message
7. Verify comment status changes to "sent"
8. Switch to raw view and back
9. Check "All Comments" panel functionality
10. Create comment, verify git commit is stored

## Performance Considerations

- **Comment Position Calculation**: Debounce position recalculation on scroll/resize
- **Large Files**: Virtual scrolling for files with many comments
- **Database Queries**: Index on file_path for fast lookups

## Migration Notes

- Existing inline comments (`<!-- hive-comment -->`) will continue to work
- New comments will be stored in both inline format AND database
- Gradual migration: comments are synced to DB when file is opened
- No breaking changes to existing thoughts files

## References

- Current implementation: `hive/src/renderer/components/thoughts/`
- Database patterns: `hive/src/main/database.ts`
- Session integration: `hive/src/renderer/components/views/SessionView.tsx`
- Similar sidebar pattern: `hive/src/renderer/components/session/MessageList.tsx`
