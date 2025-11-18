export interface Document {
  id: string
  title: string
  content: string
  createdAt: number
  updatedAt: number
}

export interface Comment {
  id: string
  documentId: string
  blockId: string
  type: 'manual' | 'ai'
  content: string
  timestamp: number
  resolved: boolean
}
