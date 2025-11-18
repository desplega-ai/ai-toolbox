'use client'
import { useEditorStore } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useState } from 'react'
import { Comment } from '@/lib/types'
import { parseBlocks } from '@/lib/blocks'

interface CommentPaneProps {
  content?: string
}

export function CommentPane({ content = '' }: CommentPaneProps) {
  const { comments, activeBlockId, addComment, deleteComment, toggleResolved, requestAIFeedback } = useEditorStore()
  const [newComment, setNewComment] = useState('')

  const activeBlockComments = comments.filter(c => c.blockId === activeBlockId)
  const allComments = comments.filter(c => !c.resolved)

  // Get active block content
  const blocks = parseBlocks(content)
  const activeBlock = blocks.find(b => b.id === activeBlockId)

  const handleAddComment = () => {
    if (newComment.trim() && activeBlockId) {
      addComment(activeBlockId, newComment.trim())
      setNewComment('')
    }
  }

  const handleAIFeedback = () => {
    if (activeBlockId && activeBlock) {
      requestAIFeedback(activeBlockId, activeBlock.content)
    }
  }

  return (
    <div className="h-full flex flex-col p-4 border-l">
      <h3 className="font-semibold mb-4">Comments</h3>

      {activeBlockId && activeBlock && (
        <Button
          onClick={handleAIFeedback}
          variant="secondary"
          size="sm"
          className="mb-4"
        >
          ✨ Request AI Feedback
        </Button>
      )}

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
    <div className={`mb-3 p-3 border rounded-lg ${comment.type === 'ai' ? 'bg-secondary/50' : ''}`}>
      <div className="flex justify-between items-start mb-2">
        <div className="flex items-center gap-2">
          {comment.type === 'ai' && <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded">AI</span>}
          <span className="text-xs text-muted-foreground">
            {new Date(comment.timestamp).toLocaleString()}
          </span>
        </div>
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
      <p className="text-sm whitespace-pre-wrap">{comment.content}</p>
    </div>
  )
}
