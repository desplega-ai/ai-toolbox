import { Store } from '@tauri-apps/plugin-store'

let store: Store | null = null

async function getStore(): Promise<Store> {
  if (!store) {
    store = await Store.load('hive-state.json')
  }
  return store
}

export async function saveLastProject(path: string | null): Promise<void> {
  const s = await getStore()
  await s.set('lastProjectPath', path)
  await s.save()
}

export async function loadLastProject(): Promise<string | null> {
  const s = await getStore()
  return await s.get<string>('lastProjectPath') || null
}
