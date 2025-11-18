'use client'
import Editor, { OnMount } from '@monaco-editor/react'
import { useRef, useEffect, useState } from 'react'
import { initVimMode } from 'monaco-vim'
import { parseBlocks, Block } from '@/lib/blocks'

interface MonacoEditorProps {
  value: string
  onChange: (value: string) => void
  onMount?: (editor: any) => void
  onActiveBlockChange?: (blockId: string | null) => void
}

export function MonacoEditor({ value, onChange, onMount, onActiveBlockChange }: MonacoEditorProps) {
  const editorRef = useRef<any>()
  const monacoRef = useRef<any>()
  const vimModeRef = useRef<any>()
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null)
  const [blocks, setBlocks] = useState<Block[]>([])
  const decorationsRef = useRef<string[]>([])

  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor
    monacoRef.current = monaco

    // Initialize vim mode
    const vimStatusBar = document.getElementById('vim-status')
    if (vimStatusBar) {
      vimModeRef.current = initVimMode(editor, vimStatusBar)
    }

    // Track cursor position to determine active block
    editor.onDidChangeCursorPosition((e) => {
      const lineNumber = e.position.lineNumber - 1 // Monaco is 1-indexed
      const block = blocks.find(
        b => lineNumber >= b.startLine && lineNumber <= b.endLine
      )
      const newBlockId = block?.id || null
      if (newBlockId !== activeBlockId) {
        setActiveBlockId(newBlockId)
        onActiveBlockChange?.(newBlockId)
      }
    })

    onMount?.(editor)
  }

  // Parse blocks whenever content changes
  useEffect(() => {
    const newBlocks = parseBlocks(value)
    setBlocks(newBlocks)
  }, [value])

  // Update decorations when active block changes
  useEffect(() => {
    if (!editorRef.current || !monacoRef.current || !activeBlockId) {
      // Clear decorations if no active block
      if (editorRef.current && decorationsRef.current.length > 0) {
        decorationsRef.current = editorRef.current.deltaDecorations(decorationsRef.current, [])
      }
      return
    }

    const activeBlock = blocks.find(b => b.id === activeBlockId)
    if (!activeBlock) return

    // Highlight active block
    const decorations = editorRef.current.deltaDecorations(decorationsRef.current, [
      {
        range: new monacoRef.current.Range(
          activeBlock.startLine + 1,
          1,
          activeBlock.endLine + 1,
          1
        ),
        options: {
          isWholeLine: true,
          className: 'active-block-highlight',
        },
      },
    ])
    decorationsRef.current = decorations
  }, [activeBlockId, blocks])

  return (
    <div className="relative h-full">
      <Editor
        height="100%"
        defaultLanguage="markdown"
        value={value}
        onChange={(val) => onChange(val || '')}
        onMount={handleEditorMount}
        theme="vs-dark"
        options={{
          minimap: { enabled: false },
          lineNumbers: 'off',
          wordWrap: 'on',
          fontSize: 16,
          fontFamily: 'JetBrains Mono, monospace',
          padding: { top: 16, bottom: 16 },
          scrollBeyondLastLine: false,
          renderLineHighlight: 'none',
        }}
      />
      <div id="vim-status" className="absolute bottom-2 left-2 text-xs font-mono opacity-70" />
    </div>
  )
}
