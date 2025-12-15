import { useEffect, useState } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import { getRecentDirectories, addRecentDirectory } from '../../lib/recent-directories'
import type { WorkingDirectory } from '../../lib/types'

interface Props {
  selectedDir: WorkingDirectory | null
  onSelectDir: (dir: WorkingDirectory) => void
}

export function Sidebar({ selectedDir, onSelectDir }: Props) {
  const [recentDirs, setRecentDirs] = useState<WorkingDirectory[]>([])

  useEffect(() => {
    getRecentDirectories().then(setRecentDirs)
  }, [])

  const handleOpenFolder = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: 'Select Project Folder'
    })

    if (selected && typeof selected === 'string') {
      const name = selected.split('/').pop() || selected
      const dir: WorkingDirectory = { path: selected, name }

      await addRecentDirectory(dir)
      setRecentDirs(await getRecentDirectories())
      onSelectDir(dir)
    }
  }

  return (
    <div className="h-full flex flex-col bg-gray-800">
      <div className="p-4 border-b border-gray-700">
        <h1 className="text-lg font-semibold">Hive</h1>
      </div>

      <div className="p-3">
        <button
          onClick={handleOpenFolder}
          className="w-full px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors"
        >
          Open Folder...
        </button>
      </div>

      {recentDirs.length > 0 && (
        <div className="flex-1 overflow-y-auto">
          <div className="px-3 py-2 text-xs text-gray-500 uppercase tracking-wide">
            Recent
          </div>
          {recentDirs.map(dir => (
            <button
              key={dir.path}
              onClick={() => onSelectDir(dir)}
              className={`
                w-full text-left px-3 py-2 border-b border-gray-700
                hover:bg-gray-700 transition-colors
                ${selectedDir?.path === dir.path ? 'bg-gray-700' : ''}
              `}
            >
              <div className="font-medium truncate text-sm">{dir.name}</div>
              <div className="text-xs text-gray-500 truncate">{dir.path}</div>
            </button>
          ))}
        </div>
      )}

      {recentDirs.length === 0 && (
        <div className="flex-1 flex items-center justify-center p-4 text-gray-500 text-sm text-center">
          Open a folder to start a Claude session
        </div>
      )}
    </div>
  )
}
