import { Document, Comment } from './types'

// Re-export types for convenience
export type { Document, Comment }

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

  return doc
}

export async function saveDocument(doc: Document): Promise<void> {
  const db = await openDB()
  const tx = db.transaction(DOCUMENTS_STORE, 'readwrite')
  await tx.objectStore(DOCUMENTS_STORE).put({ ...doc, updatedAt: Date.now() })
}

export async function loadDocument(id: string): Promise<Document | null> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const request = db.transaction(DOCUMENTS_STORE).objectStore(DOCUMENTS_STORE).get(id)
    request.onsuccess = () => resolve(request.result || null)
    request.onerror = () => reject(request.error)
  })
}

export async function listDocuments(): Promise<Document[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const request = db.transaction(DOCUMENTS_STORE).objectStore(DOCUMENTS_STORE).getAll()
    request.onsuccess = () => {
      const docs = request.result as Document[]
      resolve(docs.sort((a, b) => b.updatedAt - a.updatedAt))
    }
    request.onerror = () => reject(request.error)
  })
}

export async function deleteDocument(id: string): Promise<void> {
  const db = await openDB()

  // Delete document
  await new Promise<void>((resolve, reject) => {
    const request = db.transaction(DOCUMENTS_STORE, 'readwrite').objectStore(DOCUMENTS_STORE).delete(id)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })

  // Delete associated comments
  const comments = await new Promise<Comment[]>((resolve, reject) => {
    const index = db.transaction(COMMENTS_STORE).objectStore(COMMENTS_STORE).index('documentId')
    const request = index.getAll(id)
    request.onsuccess = () => resolve(request.result as Comment[])
    request.onerror = () => reject(request.error)
  })

  for (const comment of comments) {
    await new Promise<void>((resolve, reject) => {
      const request = db.transaction(COMMENTS_STORE, 'readwrite').objectStore(COMMENTS_STORE).delete(comment.id)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }
}

export async function saveComment(comment: Comment): Promise<void> {
  const db = await openDB()
  const tx = db.transaction(COMMENTS_STORE, 'readwrite')
  await tx.objectStore(COMMENTS_STORE).put(comment)
}

export async function deleteComment(id: string): Promise<void> {
  const db = await openDB()
  const tx = db.transaction(COMMENTS_STORE, 'readwrite')
  await tx.objectStore(COMMENTS_STORE).delete(id)
}

export async function loadCommentsForDocument(documentId: string): Promise<Comment[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const index = db.transaction(COMMENTS_STORE).objectStore(COMMENTS_STORE).index('documentId')
    const request = index.getAll(documentId)
    request.onsuccess = () => resolve(request.result as Comment[])
    request.onerror = () => reject(request.error)
  })
}
