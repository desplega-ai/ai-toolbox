import { useEffect, useState, useCallback } from 'react'
import { listThoughtsFiles, readThoughtsFile, watchThoughtsDirectory, type ThoughtsFile } from '../../lib/thoughts-files'
import { FileTree } from './FileTree'
import { MarkdownViewer } from './MarkdownViewer'
import type { WorkingDirectory } from '../../lib/types'

interface Props {
  workingDir: WorkingDirectory | null
}

export function ThoughtsPane({ workingDir }: Props) {
  const [files, setFiles] = useState<ThoughtsFile[]>([])
  const [selectedFile, setSelectedFile] = useState<ThoughtsFile | null>(null)
  const [content, setContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Load file tree
  const loadFiles = useCallback(async () => {
    if (!workingDir) {
      setFiles([])
      return
    }

    try {
      const thoughtsFiles = await listThoughtsFiles(workingDir.path)
      setFiles(thoughtsFiles)
    } catch (err) {
      console.error('Failed to load thoughts files:', err)
      setFiles([])
    }
  }, [workingDir])

  // Load files on project change
  useEffect(() => {
    setSelectedFile(null)
    setContent(null)
    loadFiles()
  }, [workingDir, loadFiles])

  // Watch for file changes
  useEffect(() => {
    if (!workingDir) return

    let cleanup: (() => void) | undefined

    watchThoughtsDirectory(workingDir.path, loadFiles)
      .then(unwatch => { cleanup = unwatch })

    return () => cleanup?.()
  }, [workingDir, loadFiles])

  // Load selected file content
  useEffect(() => {
    if (!selectedFile || selectedFile.type !== 'file') {
      setContent(null)
      return
    }

    setLoading(true)
    readThoughtsFile(selectedFile.path)
      .then(setContent)
      .catch(err => {
        console.error('Failed to read file:', err)
        setContent(null)
      })
      .finally(() => setLoading(false))
  }, [selectedFile])

  if (!workingDir) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-850 text-gray-500 text-sm">
        Select a project to view thoughts
      </div>
    )
  }

  if (files.length === 0) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-850 text-gray-500 text-sm">
        No thoughts/ directory found
      </div>
    )
  }

  return (
    <div className="h-full flex bg-gray-850">
      <div className="w-48 border-r border-gray-700 overflow-y-auto">
        <div className="px-3 py-2 border-b border-gray-700 text-sm font-medium text-gray-400">
          Thoughts
        </div>
        <FileTree
          files={files}
          selectedPath={selectedFile?.path || null}
          onSelect={setSelectedFile}
        />
      </div>

      <div className="flex-1">
        {loading ? (
          <div className="h-full flex items-center justify-center text-gray-500">
            Loading...
          </div>
        ) : content ? (
          <MarkdownViewer
            content={content}
            fileName={selectedFile?.name || ''}
          />
        ) : (
          <div className="h-full flex items-center justify-center text-gray-500 text-sm">
            Select a file to view
          </div>
        )}
      </div>
    </div>
  )
}
