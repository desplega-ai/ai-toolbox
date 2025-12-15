import { useState } from 'react'
import type { ThoughtsFile } from '../../lib/thoughts-files'

interface Props {
  files: ThoughtsFile[]
  selectedPath: string | null
  onSelect: (file: ThoughtsFile) => void
}

export function FileTree({ files, selectedPath, onSelect }: Props) {
  return (
    <div className="text-sm">
      {files.map(file => (
        <FileTreeItem
          key={file.path}
          file={file}
          selectedPath={selectedPath}
          onSelect={onSelect}
          depth={0}
        />
      ))}
    </div>
  )
}

interface ItemProps {
  file: ThoughtsFile
  selectedPath: string | null
  onSelect: (file: ThoughtsFile) => void
  depth: number
}

function FileTreeItem({ file, selectedPath, onSelect, depth }: ItemProps) {
  const [expanded, setExpanded] = useState(true)

  if (file.type === 'directory') {
    return (
      <div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full text-left px-2 py-1 hover:bg-gray-700 flex items-center gap-1"
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          <span className="text-gray-500">{expanded ? '▼' : '▶'}</span>
          <span className="text-gray-300">{file.name}</span>
        </button>
        {expanded && file.children && (
          <div>
            {file.children.map(child => (
              <FileTreeItem
                key={child.path}
                file={child}
                selectedPath={selectedPath}
                onSelect={onSelect}
                depth={depth + 1}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <button
      onClick={() => onSelect(file)}
      className={`
        w-full text-left px-2 py-1 hover:bg-gray-700
        ${selectedPath === file.path ? 'bg-gray-700 text-blue-400' : 'text-gray-300'}
      `}
      style={{ paddingLeft: `${depth * 12 + 20}px` }}
    >
      {file.name}
    </button>
  )
}
