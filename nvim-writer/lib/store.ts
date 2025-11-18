import { create } from 'zustand'
import { Comment } from './types'
import { saveComment as saveCommentToDB, deleteComment as deleteCommentFromDB } from './storage'
import { streamCompletion } from './ai/openrouter'
import { FEEDBACK_PROMPTS } from './ai/prompts'

interface EditorStore {
  currentDocumentId: string | null
  comments: Comment[]
  activeBlockId: string | null
  apiKey: string
  aiModel: string
  setCurrentDocumentId: (id: string | null) => void
  setActiveBlockId: (id: string | null) => void
  addComment: (blockId: string, content: string) => void
  updateComment: (id: string, content: string) => void
  deleteComment: (id: string) => void
  toggleResolved: (id: string) => void
  loadComments: (comments: Comment[]) => void
  getBlockComments: (blockId: string) => Comment[]
  setApiKey: (key: string) => void
  setAIModel: (model: string) => void
  requestAIFeedback: (blockId: string, blockContent: string, feedbackType?: 'general' | 'grammar' | 'clarity' | 'structure') => Promise<void>
}

export const useEditorStore = create<EditorStore>((set, get) => ({
  currentDocumentId: null,
  comments: [],
  activeBlockId: null,
  apiKey: typeof window !== 'undefined' ? localStorage.getItem('openrouter-key') || '' : '',
  aiModel: 'anthropic/claude-3.5-sonnet',

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

    // Save to IndexedDB
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

    // Delete from IndexedDB
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

  setApiKey: (key) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('openrouter-key', key)
    }
    set({ apiKey: key })
  },

  setAIModel: (model) => set({ aiModel: model }),

  requestAIFeedback: async (blockId: string, blockContent: string, feedbackType: 'general' | 'grammar' | 'clarity' | 'structure' = 'general') => {
    const { apiKey, aiModel, currentDocumentId } = get()

    if (!apiKey) {
      alert('Please set your OpenRouter API key in Settings')
      return
    }

    if (!currentDocumentId) return

    // Create placeholder comment
    const commentId = `comment-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const placeholderComment: Comment = {
      id: commentId,
      documentId: currentDocumentId,
      blockId,
      type: 'ai',
      content: 'AI is thinking...',
      timestamp: Date.now(),
      resolved: false,
    }

    set((state) => ({
      comments: [...state.comments, placeholderComment],
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

      // Save final comment to IndexedDB
      const finalComment = get().comments.find(c => c.id === commentId)
      if (finalComment) {
        saveCommentToDB(finalComment)
      }
    } catch (error: any) {
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
}))
