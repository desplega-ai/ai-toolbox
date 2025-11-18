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
