import { Store } from '@tauri-apps/plugin-store'
import type { WorkingDirectory } from './types'

const STORE_KEY = 'recentDirectories'
const MAX_RECENT = 10

let store: Store | null = null

async function getStore(): Promise<Store> {
  if (!store) {
    store = await Store.load('hive-state.json')
  }
  return store
}

export async function getRecentDirectories(): Promise<WorkingDirectory[]> {
  const s = await getStore()
  const recent = await s.get<WorkingDirectory[]>(STORE_KEY)
  return recent || []
}

export async function addRecentDirectory(dir: WorkingDirectory): Promise<void> {
  const s = await getStore()
  const recent = await getRecentDirectories()

  // Remove if already exists (to move to top)
  const filtered = recent.filter(d => d.path !== dir.path)

  // Add to beginning and limit size
  const updated = [dir, ...filtered].slice(0, MAX_RECENT)

  await s.set(STORE_KEY, updated)
}

export async function removeRecentDirectory(path: string): Promise<void> {
  const s = await getStore()
  const recent = await getRecentDirectories()
  const updated = recent.filter(d => d.path !== path)
  await s.set(STORE_KEY, updated)
}
