'use client'
import { useState, useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'
import type { Document } from '@/lib/storage'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable'
import { useEditorStore } from '@/lib/store'
import { SettingsDialog } from '@/components/settings/SettingsDialog'

// Dynamically import components to avoid SSR
const MonacoEditor = dynamic(() => import('@/components/editor/MonacoEditor').then(mod => ({ default: mod.MonacoEditor })), { ssr: false })
const DocumentList = dynamic(() => import('@/components/documents/DocumentList').then(mod => ({ default: mod.DocumentList })), { ssr: false })
const CommentPane = dynamic(() => import('@/components/comments/CommentPane').then(mod => ({ default: mod.CommentPane })), { ssr: false })

export default function Home() {
  const [currentDoc, setCurrentDoc] = useState<Document | null>(null)
  const [content, setContent] = useState('')
  const [mounted, setMounted] = useState(false)
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout>()
  const { setCurrentDocumentId, setActiveBlockId, loadComments } = useEditorStore()

  useEffect(() => {
    setMounted(true)
  }, [])

  const handleSelectDocument = async (doc: Document) => {
    setCurrentDoc(doc)
    setContent(doc.content)
    setCurrentDocumentId(doc.id)

    // Load comments for the document
    const { loadCommentsForDocument } = await import('@/lib/storage')
    const comments = await loadCommentsForDocument(doc.id)
    loadComments(comments)
  }

  const handleContentChange = async (newContent: string) => {
    setContent(newContent)

    // Trigger auto-save
    if (currentDoc) {
      clearTimeout(autoSaveTimeoutRef.current)
      autoSaveTimeoutRef.current = setTimeout(async () => {
        const { saveDocument } = await import('@/lib/storage')
        saveDocument({ ...currentDoc, content: newContent })
      }, 1000)
    }
  }

  const handleActiveBlockChange = (blockId: string | null) => {
    setActiveBlockId(blockId)
  }

  if (!mounted) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Writing Assistant</h1>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen flex">
      <DocumentList onSelectDocument={handleSelectDocument} />
      <div className="flex-1 flex flex-col">
        <header className="border-b p-2 flex items-center justify-between">
          <span className="text-sm font-medium">
            {currentDoc?.title || 'Select a document'}
          </span>
          <SettingsDialog />
        </header>
        <main className="flex-1">
          {currentDoc ? (
            <ResizablePanelGroup direction="horizontal">
              <ResizablePanel defaultSize={60} minSize={30}>
                <MonacoEditor
                  value={content}
                  onChange={handleContentChange}
                  onActiveBlockChange={handleActiveBlockChange}
                />
              </ResizablePanel>
              <ResizableHandle />
              <ResizablePanel defaultSize={40} minSize={20}>
                <CommentPane content={content} />
              </ResizablePanel>
            </ResizablePanelGroup>
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
