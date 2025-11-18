# Writing Assistant Web App - Implementation Plan

## Overview

Building a web-based writing assistant for iterative content creation (blog posts, feature specs, planning docs) with AI-powered feedback and manual annotations. The tool uses a split-view interface: markdown editor on the left (with vim keybindings), comments/feedback on the right, all stored in IndexedDB with export/import for backups and git-friendliness.

## Current State Analysis

**Repository**: `/Users/taras/Documents/code/ai-toolbox/nvim-writer/`
- **Status**: Empty directory (no files, completely greenfield)
- **Parent repo**: Contains other projects (`monitors/` Python CLI, `cc-hooks/` notification scripts)
- **Git**: Initialized, on `main` branch, clean working tree

**Key Constraints**:
- Must store documents in IndexedDB (works in all browsers)
- Must support export/import for local backups
- Must support vim keybindings (monaco-vim)
- Must integrate with OpenRouter API (user-provided keys)
- Should be lightweight (no WYSIWYG bloat)
- Future-proof for Neon sync (design data layer accordingly)

## Desired End State

A Next.js web application where users can:
1. Create and manage documents (stored in IndexedDB)
2. Write content in Monaco editor with vim keybindings
3. Parse content into logical blocks (paragraphs, sections)
4. Request AI feedback on specific blocks (via OpenRouter)
5. Add manual comments/annotations to blocks
6. See all comments in a sidebar, linked to specific blocks
7. Export documents as markdown (clean or with comments) or JSON backup
8. Import documents from backup files
9. Deploy to Vercel for sharing

### Verification:
- User can create a document, edit with vim mode, request AI feedback, and it auto-saves to IndexedDB
- AI suggestions appear in comment pane and can be accepted/rejected
- All documents and comments persist in IndexedDB across sessions
- Can export a document and import it back successfully
- Deployed URL works and is shareable

## What We're NOT Doing

- ❌ Real-time collaboration (no Yjs/CRDT/websockets)
- ❌ Server-side AI proxy (user brings own API key, client-side calls)
- ❌ Database storage (no Postgres/Neon in Phase 1)
- ❌ User authentication/accounts
- ❌ Tauri desktop app (web-only for now)
- ❌ Advanced exports (PDF, styled HTML)
- ❌ Mobile app
- ❌ WYSIWYG or rich text editing
- ❌ Image/media uploads
- ❌ Git integration (beyond being git-friendly)

## Implementation Approach

**Technology Choices**:
- **Framework**: Next.js 14 (App Router) + Bun for speed
- **Editor**: Monaco Editor (`@monaco-editor/react`) - easier React integration, better decoration API
- **UI Components**: shadcn/ui - ResizablePanels for split view, Dialog/Popover for comments
- **Styling**: Tailwind CSS
- **Storage**: IndexedDB (primary storage for documents and comments)
- **AI**: OpenRouter API (OpenAI-compatible) with streaming
- **State**: Zustand for global state (current document, comments, blocks, settings)
- **Deploy**: Vercel

**Architecture**:
```
User writes → Monaco editor → Parse into blocks → AI analyzes block →
Stream response → Display in comment pane → User accepts/rejects →
Update editor content → Auto-save to IndexedDB
```

---

## Phase 1: Project Setup & Basic Editor

### Overview
Initialize Next.js project with Bun, setup Monaco editor with vim mode, implement IndexedDB document storage with create/load/save functionality.

### Changes Required:

#### 1. Project Initialization
**Commands**:
```bash
cd /Users/taras/Documents/code/ai-toolbox/nvim-writer
bun create next-app@latest . --typescript --tailwind --app --no-src
bun add @monaco-editor/react monaco-vim
bun add zustand
```

#### 2. Monaco Editor Component
**File**: `components/editor/MonacoEditor.tsx`
**Changes**: Create Monaco wrapper with vim mode integration

```typescript
'use client'
import Editor, { OnMount } from '@monaco-editor/react'
import { useRef, useEffect } from 'react'
import { initVimMode } from 'monaco-vim'

interface MonacoEditorProps {
  value: string
  onChange: (value: string) => void
  onMount?: (editor: any) => void
}

export function MonacoEditor({ value, onChange, onMount }: MonacoEditorProps) {
  const editorRef = useRef<any>()
  const vimModeRef = useRef<any>()

  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor

    // Initialize vim mode
    const vimStatusBar = document.getElementById('vim-status')
    if (vimStatusBar) {
      vimModeRef.current = initVimMode(editor, vimStatusBar)
    }

    onMount?.(editor)
  }

  return (
    <div className="relative h-full">
      <Editor
        height="100%"
        defaultLanguage="markdown"
        value={value}
        onChange={(val) => onChange(val || '')}
        onMount={handleEditorMount}
        theme="vs-dark"
        options={{
          minimap: { enabled: false },
          lineNumbers: 'off',
          wordWrap: 'on',
          fontSize: 16,
          fontFamily: 'JetBrains Mono, monospace',
          padding: { top: 16, bottom: 16 },
          scrollBeyondLastLine: false,
          renderLineHighlight: 'none',
        }}
      />
      <div id="vim-status" className="absolute bottom-2 left-2 text-xs font-mono opacity-70" />
    </div>
  )
}
```

#### 3. Document Storage (IndexedDB)
**File**: `lib/storage.ts`
**Changes**: Implement IndexedDB document storage

```typescript
export interface Document {
  id: string
  title: string
  content: string
  createdAt: number
  updatedAt: number
}

const DB_NAME = 'writing-assistant'
const DOCUMENTS_STORE = 'documents'
const COMMENTS_STORE = 'comments'

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)

    request.onupgradeneeded = () => {
      const db = request.result

      // Create documents store
      if (!db.objectStoreNames.contains(DOCUMENTS_STORE)) {
        db.createObjectStore(DOCUMENTS_STORE, { keyPath: 'id' })
      }

      // Create comments store
      if (!db.objectStoreNames.contains(COMMENTS_STORE)) {
        const commentsStore = db.createObjectStore(COMMENTS_STORE, { keyPath: 'id' })
        commentsStore.createIndex('documentId', 'documentId', { unique: false })
      }
    }
  })
}

export async function createDocument(title: string): Promise<Document> {
  const doc: Document = {
    id: `doc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    title,
    content: '',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }

  const db = await openDB()
  const tx = db.transaction(DOCUMENTS_STORE, 'readwrite')
  await tx.objectStore(DOCUMENTS_STORE).add(doc)
  await tx.done

  return doc
}

export async function saveDocument(doc: Document): Promise<void> {
  const db = await openDB()
  const tx = db.transaction(DOCUMENTS_STORE, 'readwrite')
  await tx.objectStore(DOCUMENTS_STORE).put({ ...doc, updatedAt: Date.now() })
  await tx.done
}

export async function loadDocument(id: string): Promise<Document | null> {
  const db = await openDB()
  const doc = await db.transaction(DOCUMENTS_STORE).objectStore(DOCUMENTS_STORE).get(id)
  return doc || null
}

export async function listDocuments(): Promise<Document[]> {
  const db = await openDB()
  const docs = await db.transaction(DOCUMENTS_STORE).objectStore(DOCUMENTS_STORE).getAll()
  return docs.sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function deleteDocument(id: string): Promise<void> {
  const db = await openDB()

  // Delete document
  const docTx = db.transaction(DOCUMENTS_STORE, 'readwrite')
  await docTx.objectStore(DOCUMENTS_STORE).delete(id)
  await docTx.done

  // Delete associated comments
  const commentsTx = db.transaction(COMMENTS_STORE, 'readwrite')
  const index = commentsTx.objectStore(COMMENTS_STORE).index('documentId')
  const comments = await index.getAll(id)
  for (const comment of comments) {
    await commentsTx.objectStore(COMMENTS_STORE).delete(comment.id)
  }
  await commentsTx.done
}
```

#### 4. Document List Component
**File**: `components/documents/DocumentList.tsx`
**Changes**: List and manage documents

```typescript
'use client'
import { useEffect, useState } from 'react'
import { listDocuments, createDocument, deleteDocument, Document } from '@/lib/storage'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'

interface DocumentListProps {
  onSelectDocument: (doc: Document) => void
}

export function DocumentList({ onSelectDocument }: DocumentListProps) {
  const [documents, setDocuments] = useState<Document[]>([])
  const [newTitle, setNewTitle] = useState('')

  useEffect(() => {
    loadDocuments()
  }, [])

  const loadDocuments = async () => {
    const docs = await listDocuments()
    setDocuments(docs)
  }

  const handleCreate = async () => {
    if (newTitle.trim()) {
      const doc = await createDocument(newTitle.trim())
      setNewTitle('')
      await loadDocuments()
      onSelectDocument(doc)
    }
  }

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (confirm('Delete this document?')) {
      await deleteDocument(id)
      await loadDocuments()
    }
  }

  return (
    <div className="w-64 border-r p-4 flex flex-col">
      <h2 className="font-semibold mb-4">Documents</h2>

      <div className="mb-4">
        <Input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="New document title..."
          className="mb-2"
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
        />
        <Button onClick={handleCreate} size="sm" className="w-full">
          Create
        </Button>
      </div>

      <ScrollArea className="flex-1">
        {documents.map((doc) => (
          <div
            key={doc.id}
            className="p-2 mb-2 border rounded cursor-pointer hover:bg-accent"
            onClick={() => onSelectDocument(doc)}
          >
            <div className="font-medium truncate">{doc.title}</div>
            <div className="text-xs text-muted-foreground">
              {new Date(doc.updatedAt).toLocaleDateString()}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="mt-1"
              onClick={(e) => handleDelete(doc.id, e)}
            >
              Delete
            </Button>
          </div>
        ))}
      </ScrollArea>
    </div>
  )
}
```

#### 5. Main Page Layout
**File**: `app/page.tsx`
**Changes**: Editor with document list and auto-save

```typescript
'use client'
import { useState, useEffect, useRef } from 'react'
import { MonacoEditor } from '@/components/editor/MonacoEditor'
import { DocumentList } from '@/components/documents/DocumentList'
import { saveDocument, Document } from '@/lib/storage'

export default function Home() {
  const [currentDoc, setCurrentDoc] = useState<Document | null>(null)
  const [content, setContent] = useState('')
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout>()

  const handleSelectDocument = (doc: Document) => {
    setCurrentDoc(doc)
    setContent(doc.content)
  }

  const handleContentChange = (newContent: string) => {
    setContent(newContent)

    // Trigger auto-save
    if (currentDoc) {
      clearTimeout(autoSaveTimeoutRef.current)
      autoSaveTimeoutRef.current = setTimeout(() => {
        saveDocument({ ...currentDoc, content: newContent })
      }, 1000)
    }
  }

  return (
    <div className="h-screen flex">
      <DocumentList onSelectDocument={handleSelectDocument} />
      <div className="flex-1 flex flex-col">
        <header className="border-b p-2">
          <span className="text-sm font-medium">
            {currentDoc?.title || 'Select a document'}
          </span>
        </header>
        <main className="flex-1">
          {currentDoc ? (
            <MonacoEditor value={content} onChange={handleContentChange} />
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              Select or create a document to start writing
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
```

#### 6. shadcn/ui Setup
**Commands**:
```bash
bunx shadcn@latest init -d
bunx shadcn@latest add button
bunx shadcn@latest add input
bunx shadcn@latest add scroll-area
bunx shadcn@latest add resizable
```

### Success Criteria:

#### Automated Verification:
- [ ] Project builds successfully: `bun run build`
- [ ] TypeScript compilation passes: `bun run typecheck` (add script to package.json)
- [ ] No console errors when running: `bun run dev`
- [ ] Monaco editor loads (check Network tab for monaco assets)
- [ ] IndexedDB database is created (check Application tab in DevTools)

#### Manual Verification:
- [ ] Can create a new document with a title
- [ ] Document appears in the document list
- [ ] Can select a document and see it in the editor
- [ ] Content appears in Monaco editor
- [ ] Vim mode works (try `:w`, `i`, `ESC`, `dd`, etc.)
- [ ] Vim status bar shows mode (NORMAL, INSERT, VISUAL)
- [ ] Can edit content and it auto-saves after 1 second
- [ ] Changes persist after page refresh (IndexedDB)
- [ ] Can delete a document and it disappears from the list
- [ ] Editor is responsive and performs well with ~1000 lines

---

## Phase 2: Split View & Block Parsing

### Overview
Implement ResizablePanels for split view (editor left, comments right), parse markdown into logical blocks, highlight active block.

### Changes Required:

#### 1. Block Parser
**File**: `lib/blocks.ts`
**Changes**: Parse markdown into blocks based on paragraphs and headers

```typescript
export interface Block {
  id: string
  startLine: number
  endLine: number
  content: string
  type: 'heading' | 'paragraph' | 'code' | 'list'
}

export function parseBlocks(markdown: string): Block[] {
  const lines = markdown.split('\n')
  const blocks: Block[] = []
  let currentBlock: string[] = []
  let startLine = 0

  lines.forEach((line, idx) => {
    const isBlankLine = line.trim() === ''
    const isHeading = line.startsWith('#')

    if (isBlankLine && currentBlock.length > 0) {
      // End of block
      blocks.push({
        id: `block-${blocks.length}`,
        startLine,
        endLine: idx - 1,
        content: currentBlock.join('\n'),
        type: currentBlock[0].startsWith('#') ? 'heading' : 'paragraph',
      })
      currentBlock = []
    } else if (!isBlankLine) {
      if (currentBlock.length === 0) startLine = idx
      currentBlock.push(line)
    }
  })

  // Handle last block
  if (currentBlock.length > 0) {
    blocks.push({
      id: `block-${blocks.length}`,
      startLine,
      endLine: lines.length - 1,
      content: currentBlock.join('\n'),
      type: currentBlock[0].startsWith('#') ? 'heading' : 'paragraph',
    })
  }

  return blocks
}
```

#### 2. Split View Layout
**File**: `app/page.tsx`
**Changes**: Replace single editor with ResizablePanels

```typescript
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable'

// In component:
<main className="flex-1">
  <ResizablePanelGroup direction="horizontal">
    <ResizablePanel defaultSize={60} minSize={30}>
      <MonacoEditor value={content} onChange={setContent} />
    </ResizablePanel>
    <ResizableHandle />
    <ResizablePanel defaultSize={40} minSize={20}>
      <div className="h-full p-4 border-l">
        <h3 className="font-semibold mb-2">Comments</h3>
        <p className="text-sm text-muted-foreground">No comments yet</p>
      </div>
    </ResizablePanel>
  </ResizablePanelGroup>
</main>
```

#### 3. Block Highlighting
**File**: `components/editor/MonacoEditor.tsx`
**Changes**: Add decorations for highlighting active block

```typescript
// Add to MonacoEditor component:
const [activeBlockId, setActiveBlockId] = useState<string | null>(null)
const [blocks, setBlocks] = useState<Block[]>([])
const decorationsRef = useRef<string[]>([])

useEffect(() => {
  if (!editorRef.current) return

  // Parse blocks whenever content changes
  const newBlocks = parseBlocks(value)
  setBlocks(newBlocks)
}, [value])

useEffect(() => {
  if (!editorRef.current || !activeBlockId) return

  const activeBlock = blocks.find(b => b.id === activeBlockId)
  if (!activeBlock) return

  // Highlight active block
  const decorations = editorRef.current.deltaDecorations(decorationsRef.current, [
    {
      range: new monaco.Range(
        activeBlock.startLine + 1,
        1,
        activeBlock.endLine + 1,
        1
      ),
      options: {
        isWholeLine: true,
        className: 'active-block-highlight',
      },
    },
  ])
  decorationsRef.current = decorations
}, [activeBlockId, blocks])

// Track cursor position to determine active block
useEffect(() => {
  if (!editorRef.current) return

  const disposable = editorRef.current.onDidChangeCursorPosition((e) => {
    const lineNumber = e.position.lineNumber - 1 // Monaco is 1-indexed
    const block = blocks.find(
      b => lineNumber >= b.startLine && lineNumber <= b.endLine
    )
    setActiveBlockId(block?.id || null)
  })

  return () => disposable.dispose()
}, [blocks])
```

#### 4. Global Styles for Block Highlighting
**File**: `app/globals.css`
**Changes**: Add CSS for block decorations

```css
.active-block-highlight {
  background-color: rgba(100, 100, 100, 0.1);
  border-left: 3px solid #3b82f6;
}
```

### Success Criteria:

#### Automated Verification:
- [ ] Build passes: `bun run build`
- [ ] No TypeScript errors: `bun run typecheck`
- [ ] Block parser correctly handles edge cases (test with unit tests)

#### Manual Verification:
- [ ] Split view appears with draggable divider
- [ ] Can resize panels smoothly
- [ ] Active block highlights as cursor moves
- [ ] Block highlight follows cursor through paragraphs
- [ ] Highlight disappears when cursor is on blank lines
- [ ] Empty lines correctly separate blocks
- [ ] Headers are detected as separate blocks

---

## Phase 3: Comment System (Manual)

### Overview
Implement data structures and UI for manual comments linked to specific blocks. Users can add, edit, delete comments.

### Changes Required:

#### 1. Comment Data Model
**File**: `lib/types.ts`
**Changes**: Define comment types

```typescript
export interface Comment {
  id: string
  documentId: string
  blockId: string
  type: 'manual' | 'ai'
  content: string
  timestamp: number
  resolved: boolean
}
```

#### 2. Zustand Store
**File**: `lib/store.ts`
**Changes**: Global state for comments and current document

```typescript
import { create } from 'zustand'
import { Comment } from './types'

interface EditorStore {
  currentDocumentId: string | null
  comments: Comment[]
  activeBlockId: string | null
  setCurrentDocumentId: (id: string | null) => void
  setActiveBlockId: (id: string | null) => void
  addComment: (blockId: string, content: string) => void
  updateComment: (id: string, content: string) => void
  deleteComment: (id: string) => void
  toggleResolved: (id: string) => void
  loadComments: (comments: Comment[]) => void
  getBlockComments: (blockId: string) => Comment[]
}

export const useEditorStore = create<EditorStore>((set, get) => ({
  currentDocumentId: null,
  comments: [],
  activeBlockId: null,

  setCurrentDocumentId: (id) => set({ currentDocumentId: id }),

  setActiveBlockId: (id) => set({ activeBlockId: id }),

  addComment: (blockId, content) => {
    const { currentDocumentId } = get()
    if (!currentDocumentId) return

    const comment: Comment = {
      id: `comment-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      documentId: currentDocumentId,
      blockId,
      type: 'manual',
      content,
      timestamp: Date.now(),
      resolved: false,
    }

    set((state) => ({ comments: [...state.comments, comment] }))

    // Save to IndexedDB (implementation in next section)
    saveCommentToDB(comment)
  },

  updateComment: (id, content) => {
    set((state) => ({
      comments: state.comments.map(c =>
        c.id === id ? { ...c, content, timestamp: Date.now() } : c
      ),
    }))

    // Update in IndexedDB
    const comment = get().comments.find(c => c.id === id)
    if (comment) saveCommentToDB(comment)
  },

  deleteComment: (id) => {
    set((state) => ({
      comments: state.comments.filter(c => c.id !== id),
    }))

    // Delete from IndexedDB (implementation in next section)
    deleteCommentFromDB(id)
  },

  toggleResolved: (id) => {
    set((state) => ({
      comments: state.comments.map(c =>
        c.id === id ? { ...c, resolved: !c.resolved } : c
      ),
    }))

    const comment = get().comments.find(c => c.id === id)
    if (comment) saveCommentToDB(comment)
  },

  loadComments: (comments) => set({ comments }),

  getBlockComments: (blockId) => get().comments.filter(c => c.blockId === blockId),
}))

// Helper functions (to be implemented in lib/storage.ts)
async function saveCommentToDB(comment: Comment) {
  // Implementation in next section
}

async function deleteCommentFromDB(id: string) {
  // Implementation in next section
}
```

#### 3. Comment Pane UI
**File**: `components/comments/CommentPane.tsx`
**Changes**: Display and manage comments

```typescript
'use client'
import { useEditorStore } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useState } from 'react'

export function CommentPane() {
  const { comments, activeBlockId, addComment, deleteComment, toggleResolved } = useEditorStore()
  const [newComment, setNewComment] = useState('')

  const activeBlockComments = comments.filter(c => c.blockId === activeBlockId)
  const allComments = comments.filter(c => !c.resolved)

  const handleAddComment = () => {
    if (newComment.trim() && activeBlockId) {
      addComment(activeBlockId, newComment.trim())
      setNewComment('')
    }
  }

  return (
    <div className="h-full flex flex-col p-4 border-l">
      <h3 className="font-semibold mb-4">Comments</h3>

      {activeBlockId && (
        <div className="mb-4 p-3 border rounded-lg">
          <label className="text-sm font-medium mb-2 block">Add Comment</label>
          <Textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Add a note or reminder..."
            className="mb-2"
          />
          <Button onClick={handleAddComment} size="sm">Add</Button>
        </div>
      )}

      <ScrollArea className="flex-1">
        {activeBlockComments.length > 0 && (
          <div className="mb-4">
            <h4 className="text-sm font-medium mb-2">Active Block</h4>
            {activeBlockComments.map(comment => (
              <CommentCard key={comment.id} comment={comment} />
            ))}
          </div>
        )}

        <h4 className="text-sm font-medium mb-2">All Comments</h4>
        {allComments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No comments yet</p>
        ) : (
          allComments.map(comment => (
            <CommentCard key={comment.id} comment={comment} />
          ))
        )}
      </ScrollArea>
    </div>
  )
}

function CommentCard({ comment }: { comment: Comment }) {
  const { deleteComment, toggleResolved } = useEditorStore()

  return (
    <div className="mb-3 p-3 border rounded-lg">
      <div className="flex justify-between items-start mb-2">
        <span className="text-xs text-muted-foreground">
          {new Date(comment.timestamp).toLocaleString()}
        </span>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => toggleResolved(comment.id)}
          >
            {comment.resolved ? 'Unresolve' : 'Resolve'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => deleteComment(comment.id)}
          >
            Delete
          </Button>
        </div>
      </div>
      <p className="text-sm">{comment.content}</p>
    </div>
  )
}
```

#### 4. shadcn Components
**Commands**:
```bash
bunx shadcn@latest add textarea
bunx shadcn@latest add scroll-area
```

#### 5. Comment Storage Functions
**File**: `lib/storage.ts` (add to existing file)
**Changes**: Add comment storage functions to existing storage file

```typescript
// Add to existing lib/storage.ts file:

export async function saveComment(comment: Comment): Promise<void> {
  const db = await openDB()
  const tx = db.transaction(COMMENTS_STORE, 'readwrite')
  await tx.objectStore(COMMENTS_STORE).put(comment)
  await tx.done
}

export async function deleteComment(id: string): Promise<void> {
  const db = await openDB()
  const tx = db.transaction(COMMENTS_STORE, 'readwrite')
  await tx.objectStore(COMMENTS_STORE).delete(id)
  await tx.done
}

export async function loadCommentsForDocument(documentId: string): Promise<Comment[]> {
  const db = await openDB()
  const tx = db.transaction(COMMENTS_STORE)
  const index = tx.objectStore(COMMENTS_STORE).index('documentId')
  const comments = await index.getAll(documentId)
  return comments
}
```

**File**: `lib/store.ts` (update helper functions)
**Changes**: Import and use the storage functions

```typescript
// Update the imports at the top of lib/store.ts:
import { saveComment as saveCommentToDB, deleteComment as deleteCommentFromDB } from './storage'

// The helper functions at the bottom are no longer needed, remove them
```

### Success Criteria:

#### Automated Verification:
- [ ] Build succeeds: `bun run build`
- [ ] TypeScript check passes: `bun run typecheck`
- [ ] Zustand store correctly updates (test with React DevTools)

#### Manual Verification:
- [ ] Can add a comment to active block via UI
- [ ] Comment appears in "Active Block" section
- [ ] Comment appears in "All Comments" section
- [ ] Can resolve/unresolve comments
- [ ] Resolved comments disappear from view
- [ ] Can delete comments
- [ ] Comments persist after page refresh (IndexedDB)
- [ ] Multiple comments can exist on same block
- [ ] Empty comment cannot be submitted

---

## Phase 4: AI Integration (OpenRouter)

### Overview
Integrate OpenRouter API to request AI feedback on blocks, stream responses into comments, allow accepting/rejecting suggestions.

### Changes Required:

#### 1. OpenRouter Client
**File**: `lib/ai/openrouter.ts`
**Changes**: Streaming API client

```typescript
export interface AIMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export async function* streamCompletion(
  messages: AIMessage[],
  apiKey: string,
  model: string = 'anthropic/claude-3.5-sonnet'
) {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': window.location.origin,
    },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
    }),
  })

  if (!response.ok) {
    throw new Error(`OpenRouter API error: ${response.statusText}`)
  }

  const reader = response.body?.getReader()
  const decoder = new TextDecoder()

  while (reader) {
    const { done, value } = await reader.read()
    if (done) break

    const chunk = decoder.decode(value)
    const lines = chunk.split('\n').filter(line => line.trim().startsWith('data:'))

    for (const line of lines) {
      const data = line.replace('data: ', '')
      if (data === '[DONE]') return

      try {
        const parsed = JSON.parse(data)
        const content = parsed.choices?.[0]?.delta?.content
        if (content) yield content
      } catch (e) {
        // Skip malformed chunks
      }
    }
  }
}
```

#### 2. Prompt Templates
**File**: `lib/ai/prompts.ts`
**Changes**: Define prompt templates for different feedback types

```typescript
export const FEEDBACK_PROMPTS = {
  general: (text: string) => `Provide concise feedback on this text to improve clarity, grammar, and style:\n\n"${text}"\n\nFormat your response as a bulleted list of 2-4 specific, actionable suggestions.`,

  grammar: (text: string) => `Check this text for grammar, spelling, and punctuation errors:\n\n"${text}"\n\nList only the errors you find with corrections.`,

  clarity: (text: string) => `Analyze this text for clarity and readability:\n\n"${text}"\n\nSuggest 2-3 ways to make it clearer and more concise.`,

  structure: (text: string) => `Evaluate the structure and flow of this text:\n\n"${text}"\n\nSuggest improvements to organization and logical flow.`,
}
```

#### 3. Settings Store & UI
**File**: `lib/store.ts`
**Changes**: Add settings to Zustand store

```typescript
// Add to EditorStore interface:
interface EditorStore {
  // ... existing fields
  apiKey: string
  aiModel: string
  setApiKey: (key: string) => void
  setAIModel: (model: string) => void
}

// Add to store implementation:
apiKey: typeof window !== 'undefined' ? localStorage.getItem('openrouter-key') || '' : '',
aiModel: 'anthropic/claude-3.5-sonnet',

setApiKey: (key) => {
  localStorage.setItem('openrouter-key', key)
  set({ apiKey: key })
},

setAIModel: (model) => set({ aiModel: model }),
```

**File**: `components/settings/SettingsDialog.tsx`
**Changes**: Settings UI for API key

```typescript
'use client'
import { useEditorStore } from '@/lib/store'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

export function SettingsDialog() {
  const { apiKey, aiModel, setApiKey, setAIModel } = useEditorStore()

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">Settings</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="api-key">OpenRouter API Key</Label>
            <Input
              id="api-key"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-or-v1-..."
            />
            <p className="text-xs text-muted-foreground mt-1">
              Get your key at <a href="https://openrouter.ai/keys" target="_blank" className="underline">openrouter.ai/keys</a>
            </p>
          </div>
          <div>
            <Label htmlFor="model">AI Model</Label>
            <select
              id="model"
              value={aiModel}
              onChange={(e) => setAIModel(e.target.value)}
              className="w-full p-2 border rounded"
            >
              <option value="anthropic/claude-3.5-sonnet">Claude 3.5 Sonnet</option>
              <option value="openai/gpt-4">GPT-4</option>
              <option value="meta-llama/llama-3.1-70b-instruct">Llama 3.1 70B</option>
            </select>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

#### 4. AI Feedback Action
**File**: `lib/store.ts`
**Changes**: Add requestAIFeedback action

```typescript
import { streamCompletion } from './ai/openrouter'
import { FEEDBACK_PROMPTS } from './ai/prompts'

// Add to EditorStore:
requestAIFeedback: async (blockId: string, blockContent: string, feedbackType: 'general' | 'grammar' | 'clarity' | 'structure' = 'general') => {
  const { apiKey, aiModel, addComment } = get()

  if (!apiKey) {
    alert('Please set your OpenRouter API key in Settings')
    return
  }

  // Create placeholder comment
  const commentId = `comment-${Date.now()}`
  set((state) => ({
    comments: [
      ...state.comments,
      {
        id: commentId,
        blockId,
        type: 'ai',
        content: 'AI is thinking...',
        timestamp: Date.now(),
        resolved: false,
      },
    ],
  }))

  try {
    const prompt = FEEDBACK_PROMPTS[feedbackType](blockContent)
    const messages = [{ role: 'user' as const, content: prompt }]

    let fullResponse = ''
    for await (const chunk of streamCompletion(messages, apiKey, aiModel)) {
      fullResponse += chunk

      // Update comment with streaming content
      set((state) => ({
        comments: state.comments.map(c =>
          c.id === commentId
            ? { ...c, content: fullResponse }
            : c
        ),
      }))
    }
  } catch (error) {
    // Update with error message
    set((state) => ({
      comments: state.comments.map(c =>
        c.id === commentId
          ? { ...c, content: `Error: ${error.message}` }
          : c
      ),
    }))
  }
},
```

#### 5. AI Feedback UI
**File**: `components/comments/CommentPane.tsx`
**Changes**: Add "Request AI Feedback" button

```typescript
// Add to CommentPane:
const { requestAIFeedback } = useEditorStore()
const [blocks, setBlocks] = useState<Block[]>([])

// Get active block content
const activeBlock = blocks.find(b => b.id === activeBlockId)

// In the UI, add button:
{activeBlockId && activeBlock && (
  <Button
    onClick={() => requestAIFeedback(activeBlockId, activeBlock.content)}
    variant="secondary"
    size="sm"
    className="mb-2"
  >
    ✨ Request AI Feedback
  </Button>
)}
```

#### 6. Additional shadcn Components
**Commands**:
```bash
bunx shadcn@latest add dialog
bunx shadcn@latest add input
bunx shadcn@latest add label
bunx shadcn@latest add select
```

### Success Criteria:

#### Automated Verification:
- [ ] Build succeeds: `bun run build`
- [ ] TypeScript passes: `bun run typecheck`
- [ ] No runtime errors when streaming (check browser console)

#### Manual Verification:
- [ ] Can open Settings dialog and enter API key
- [ ] API key persists after page refresh (localStorage)
- [ ] "Request AI Feedback" button appears when block is selected
- [ ] Clicking button shows "AI is thinking..." placeholder
- [ ] AI response streams in real-time (updates as it types)
- [ ] Final AI response appears as a comment
- [ ] Can request feedback on multiple blocks
- [ ] Error handling works (try with invalid API key)
- [ ] Different feedback types work (if implemented in UI)
- [ ] AI comments are marked with type='ai' and styled differently

---

## Phase 5: Export, Polish & Deployment

### Overview
Add export functionality, keyboard shortcuts, auto-save, and deploy to Vercel.

### Changes Required:

#### 1. Export & Import Functionality
**File**: `lib/export.ts`
**Changes**: Export clean markdown, with comments, and full backups; import backups

```typescript
import { Comment, Document } from './types'
import { listDocuments, loadCommentsForDocument } from './storage'

// Export single document as clean markdown
export function exportCleanMarkdown(content: string): string {
  return content
}

// Export single document with comments embedded
export function exportWithComments(content: string, comments: Comment[]): string {
  // Embed comments as HTML comments in markdown
  const lines = content.split('\n')
  const commentsGrouped = groupCommentsByLine(comments)

  let output = ''
  lines.forEach((line, idx) => {
    if (commentsGrouped[idx]) {
      output += `<!-- COMMENTS:\n${commentsGrouped[idx].map(c => `- ${c.content}`).join('\n')}\n-->\n`
    }
    output += line + '\n'
  })

  return output
}

// Export single document for AI ingestion
export function exportForAI(content: string, comments: Comment[]): string {
  return JSON.stringify({
    content,
    comments: comments.map(c => ({
      blockId: c.blockId,
      type: c.type,
      content: c.content,
      timestamp: c.timestamp,
    })),
    exportedAt: Date.now(),
  }, null, 2)
}

// Export entire database as backup
export async function exportFullBackup(): Promise<string> {
  const documents = await listDocuments()

  const backup = {
    version: 1,
    exportedAt: Date.now(),
    documents: await Promise.all(
      documents.map(async (doc) => ({
        ...doc,
        comments: await loadCommentsForDocument(doc.id),
      }))
    ),
  }

  return JSON.stringify(backup, null, 2)
}

// Import backup and restore to IndexedDB
export async function importBackup(backupJson: string): Promise<{
  documentsImported: number;
  commentsImported: number
}> {
  const backup = JSON.parse(backupJson)

  if (backup.version !== 1) {
    throw new Error('Unsupported backup version')
  }

  let documentsImported = 0
  let commentsImported = 0

  for (const docData of backup.documents) {
    const { comments, ...doc } = docData

    // Import document
    await saveDocument(doc)
    documentsImported++

    // Import comments
    for (const comment of comments) {
      await saveComment(comment)
      commentsImported++
    }
  }

  return { documentsImported, commentsImported }
}

function groupCommentsByLine(comments: Comment[]): Record<number, Comment[]> {
  // TODO: Implement proper block-to-line mapping
  // For now, return empty object
  return {}
}
```

#### 2. Auto-Save
**File**: `app/page.tsx`
**Changes**: Debounced auto-save (already implemented in Phase 1)

Note: Auto-save is already implemented in Phase 1's main page layout. This is just a reminder that the auto-save logic saves the document to IndexedDB automatically after 1 second of inactivity.

#### 3. Keyboard Shortcuts
**File**: `components/editor/MonacoEditor.tsx`
**Changes**: Add custom keybindings for AI feedback

```typescript
// In handleEditorMount:
editor.addCommand(
  monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK,
  () => {
    // Trigger AI feedback on current block
    const blockId = useEditorStore.getState().activeBlockId
    if (blockId) {
      const block = blocks.find(b => b.id === blockId)
      if (block) {
        useEditorStore.getState().requestAIFeedback(blockId, block.content)
      }
    }
  }
)

// Add more shortcuts as needed:
// Cmd+Shift+C: Add manual comment
// Cmd+N: Next block with comments
// Cmd+P: Previous block with comments
```

#### 4. Export & Import UI
**File**: `app/page.tsx`
**Changes**: Add export/import buttons to toolbar

```typescript
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { exportCleanMarkdown, exportWithComments, exportForAI, exportFullBackup, importBackup } from '@/lib/export'

// In toolbar:
<header className="border-b p-2 flex gap-2">
  <span className="text-sm font-medium flex-1">
    {currentDoc?.title || 'Select a document'}
  </span>

  {/* Export dropdown */}
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="outline" size="sm">Export</Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent>
      <DropdownMenuItem onClick={async () => {
        if (!currentDoc) return
        const blob = new Blob([exportCleanMarkdown(content)], { type: 'text/markdown' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${currentDoc.title}.md`
        a.click()
      }}>
        Current Doc (Clean Markdown)
      </DropdownMenuItem>
      <DropdownMenuItem onClick={async () => {
        if (!currentDoc) return
        const comments = useEditorStore.getState().comments
        const blob = new Blob([exportWithComments(content, comments)], { type: 'text/markdown' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${currentDoc.title}-with-comments.md`
        a.click()
      }}>
        Current Doc (With Comments)
      </DropdownMenuItem>
      <DropdownMenuItem onClick={async () => {
        if (!currentDoc) return
        const comments = useEditorStore.getState().comments
        const blob = new Blob([exportForAI(content, comments)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${currentDoc.title}-ai.json`
        a.click()
      }}>
        Current Doc (AI Format)
      </DropdownMenuItem>
      <DropdownMenuItem onClick={async () => {
        const backupJson = await exportFullBackup()
        const blob = new Blob([backupJson], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `writing-assistant-backup-${new Date().toISOString().split('T')[0]}.json`
        a.click()
      }}>
        Full Backup (All Documents)
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>

  {/* Import button */}
  <Button
    variant="outline"
    size="sm"
    onClick={() => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = 'application/json'
      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0]
        if (file) {
          const text = await file.text()
          try {
            const result = await importBackup(text)
            alert(`Imported ${result.documentsImported} documents and ${result.commentsImported} comments`)
            // Reload document list
            window.location.reload()
          } catch (err) {
            alert(`Import failed: ${err.message}`)
          }
        }
      }
      input.click()
    }}
  >
    Import Backup
  </Button>
</header>
```

#### 5. Deployment Configuration
**File**: `vercel.json` (create new)
**Changes**: Vercel configuration

```json
{
  "buildCommand": "bun run build",
  "outputDirectory": ".next",
  "framework": "nextjs"
}
```

**File**: `package.json`
**Changes**: Add scripts

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "typecheck": "tsc --noEmit",
    "lint": "next lint"
  }
}
```

#### 6. README Documentation
**File**: `README.md`
**Changes**: Usage instructions

```markdown
# Writing Assistant

AI-powered writing tool with vim keybindings, real-time feedback, and IndexedDB storage.

## Features

- ✍️ Monaco editor with full vim mode
- 🤖 AI-powered feedback via OpenRouter
- 💬 Manual comments and annotations
- 💾 IndexedDB storage (works in all browsers)
- 📤 Export/Import backups
- ⌨️ Keyboard shortcuts
- 🎨 Split view (editor + comments)
- 🔄 Auto-save

## Setup

1. Install dependencies: `bun install`
2. Run dev server: `bun run dev`
3. Open http://localhost:3000
4. Create a new document or import a backup
5. Click Settings → Add your OpenRouter API key
6. Start writing!

## Keyboard Shortcuts

- `Cmd+K`: Request AI feedback on current block
- Vim mode: `i`, `ESC`, `:w`, `dd`, etc.

## Export Options

- **Clean Markdown**: Export current document without comments
- **Markdown with Comments**: Export with embedded HTML comments
- **AI Format**: Export current document as JSON for AI ingestion
- **Full Backup**: Export all documents and comments as JSON

## Tech Stack

- Next.js 14 + Bun
- Monaco Editor + monaco-vim
- shadcn/ui + Tailwind
- IndexedDB (storage)
- OpenRouter API
- Zustand (state management)
```

#### 7. Deploy to Vercel
**Commands**:
```bash
# Install Vercel CLI
bun add -g vercel

# Deploy
vercel --prod
```

### Success Criteria:

#### Automated Verification:
- [ ] Production build succeeds: `bun run build`
- [ ] Build output is optimized (check bundle size)
- [ ] TypeScript check passes: `bun run typecheck`
- [ ] Lint passes: `bun run lint`
- [ ] Vercel deployment succeeds (check deployment logs)

#### Manual Verification:
- [ ] Auto-save works (edit document, wait 1 second, refresh page)
- [ ] Keyboard shortcuts work (Cmd+K triggers AI feedback)
- [ ] Can export current document as clean markdown
- [ ] Can export current document with comments (HTML comments embedded)
- [ ] Can export current document in AI format (valid JSON)
- [ ] Can export full backup (all documents + comments as JSON)
- [ ] Can import backup file successfully
- [ ] Imported documents and comments appear correctly after import
- [ ] Deployed app works on Vercel (test public URL)
- [ ] Vim mode works on deployed version
- [ ] Settings persist on deployed version (localStorage)
- [ ] IndexedDB works on deployed version (all browsers)
- [ ] App is responsive on tablet/mobile (even if not fully functional)

---

## Testing Strategy

### Unit Tests:
- `lib/blocks.ts`: Block parsing edge cases (empty lines, headers, code blocks)
- `lib/export.ts`: Export formats produce correct output
- `lib/ai/prompts.ts`: Prompt templates are well-formed

### Integration Tests:
- Full workflow: Create document → Edit → Request AI feedback → Auto-save → Export
- Comment persistence: Add comments → Refresh → Comments still there
- Auto-save: Edit → Wait → Refresh → Changes persist
- Backup/Restore: Export full backup → Delete all → Import backup → Verify all restored

### Manual Testing Steps:
1. Create a document with 500+ lines (performance test)
2. Add 20+ comments across multiple blocks
3. Request AI feedback on 5 different blocks
4. Export all formats and verify correctness
5. Test full backup export/import cycle
6. Test vim mode thoroughly (macros, visual mode, etc.)
7. Test with no API key (error handling)
8. Test with invalid API key (error handling)
9. Test in multiple browsers (Chrome, Firefox, Safari)
10. Test IndexedDB persistence across page refreshes

## Performance Considerations

- **Monaco bundle size**: ~3MB - use lazy loading if needed
- **Auto-save debouncing**: 1 second to avoid excessive IndexedDB writes
- **Streaming AI responses**: Use async generators to avoid blocking UI
- **Block parsing**: Optimize for large files (>1000 lines)
- **IndexedDB**: Documents and comments stored in separate stores for efficient queries
- **Import/Export**: Large backups may take time - consider showing progress indicator

## Migration Notes

Not applicable (greenfield project)

Future considerations for Neon sync:
- IndexedDB schema is designed to be easily migrated to Postgres
- Document and Comment tables map directly to IndexedDB stores
- Use unique IDs for documents and comments (conflict-free replication)
- Export/Import functionality provides migration path

## References

- Monaco Editor React: https://github.com/suren-atoyan/monaco-react
- monaco-vim: https://github.com/brijeshb42/monaco-vim
- OpenRouter API: https://openrouter.ai/docs
- IndexedDB API: https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API
- shadcn/ui: https://ui.shadcn.com
- Next.js 14: https://nextjs.org/docs
