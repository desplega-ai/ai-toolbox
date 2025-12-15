import { readDir, readTextFile, watchImmediate, exists } from '@tauri-apps/plugin-fs'
import { join, dirname } from '@tauri-apps/api/path'

export interface ThoughtsFile {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: ThoughtsFile[]
}

// Search upward from projectPath to find thoughts/shared directory
async function findThoughtsPath(projectPath: string): Promise<string | null> {
  let currentPath = projectPath
  const root = '/'

  while (currentPath !== root) {
    const thoughtsPath = await join(currentPath, 'thoughts', 'shared')
    if (await exists(thoughtsPath)) {
      return thoughtsPath
    }
    const parent = await dirname(currentPath)
    if (parent === currentPath) break // reached root
    currentPath = parent
  }

  return null
}

export async function listThoughtsFiles(projectPath: string): Promise<ThoughtsFile[]> {
  const thoughtsPath = await findThoughtsPath(projectPath)

  if (!thoughtsPath) {
    return []
  }

  try {
    return await listDirectory(thoughtsPath)
  } catch {
    // thoughts/shared doesn't exist
    return []
  }
}

async function listDirectory(path: string): Promise<ThoughtsFile[]> {
  const entries = await readDir(path)
  const files: ThoughtsFile[] = []

  for (const entry of entries) {
    if (!entry.name || entry.name.startsWith('.')) continue

    const entryPath = await join(path, entry.name)

    if (entry.isDirectory) {
      const children = await listDirectory(entryPath)
      files.push({
        name: entry.name,
        path: entryPath,
        type: 'directory',
        children
      })
    } else if (entry.name.endsWith('.md')) {
      files.push({
        name: entry.name,
        path: entryPath,
        type: 'file'
      })
    }
  }

  return files.sort((a, b) => {
    // Directories first, then alphabetical
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

export async function readThoughtsFile(path: string): Promise<string> {
  return await readTextFile(path)
}

export async function watchThoughtsDirectory(
  projectPath: string,
  callback: () => void
): Promise<() => void> {
  const thoughtsSharedPath = await findThoughtsPath(projectPath)

  if (!thoughtsSharedPath) {
    return () => {}
  }

  // Watch the parent 'thoughts' directory
  const thoughtsPath = await dirname(thoughtsSharedPath)

  try {
    return await watchImmediate(thoughtsPath, callback, { recursive: true })
  } catch {
    // Directory doesn't exist, return no-op
    return () => {}
  }
}
