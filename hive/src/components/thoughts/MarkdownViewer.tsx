interface Props {
  content: string
  fileName: string
}

export function MarkdownViewer({ content, fileName }: Props) {
  // Simple markdown rendering - can enhance with a library later
  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-2 border-b border-gray-700 text-sm font-medium text-gray-300">
        {fileName}
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        <pre className="text-sm text-gray-300 whitespace-pre-wrap font-mono">
          {content}
        </pre>
      </div>
    </div>
  )
}
