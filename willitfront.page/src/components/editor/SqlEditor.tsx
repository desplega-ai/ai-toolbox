import { useRef, useEffect, useState } from 'react';
import Editor, { type Monaco, type OnMount } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { useSchema } from '@/hooks/useSchema';
import { configureMonaco } from '@/lib/monaco-config';

interface SqlEditorProps {
  value: string;
  onChange: (value: string) => void;
  onExecute: () => void;
  autoHeight?: boolean;
  minHeight?: number;
  maxHeight?: number;
}

const LINE_HEIGHT = 19; // Monaco default line height at 14px font
const PADDING = 10; // Top + bottom padding

export function SqlEditor({
  value,
  onChange,
  onExecute,
  autoHeight = false,
  minHeight = 80,
  maxHeight = 600,
}: SqlEditorProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const onExecuteRef = useRef(onExecute);
  const { schema } = useSchema();
  const monacoConfigured = useRef(false);
  const [editorHeight, setEditorHeight] = useState(minHeight);

  // Keep the ref updated with the latest callback
  useEffect(() => {
    onExecuteRef.current = onExecute;
  }, [onExecute]);

  // Calculate height based on content
  useEffect(() => {
    if (autoHeight && editorRef.current) {
      const lineCount = editorRef.current.getModel()?.getLineCount() || 1;
      const contentHeight = lineCount * LINE_HEIGHT + PADDING;
      const newHeight = Math.min(Math.max(contentHeight, minHeight), maxHeight);
      setEditorHeight(newHeight);
    }
  }, [value, autoHeight, minHeight, maxHeight]);

  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;

    // Add Cmd/Ctrl+Enter to execute
    editor.addAction({
      id: 'execute-query',
      label: 'Execute Query',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
      run: () => {
        onExecuteRef.current();
      },
    });

    // Configure autocomplete if schema is ready
    if (schema && !monacoConfigured.current) {
      configureMonaco(monaco, schema);
      monacoConfigured.current = true;
    }

    // Initial height calculation
    if (autoHeight) {
      const lineCount = editor.getModel()?.getLineCount() || 1;
      const contentHeight = lineCount * LINE_HEIGHT + PADDING;
      setEditorHeight(Math.min(Math.max(contentHeight, minHeight), maxHeight));
    }
  };

  // Configure autocomplete when schema loads after editor mount
  useEffect(() => {
    if (schema && editorRef.current && !monacoConfigured.current) {
      const monaco = (window as unknown as { monaco: Monaco }).monaco;
      if (monaco) {
        configureMonaco(monaco, schema);
        monacoConfigured.current = true;
      }
    }
  }, [schema]);

  const height = autoHeight ? `${editorHeight}px` : '200px';

  return (
    <div className="border rounded overflow-hidden">
      <Editor
        height={height}
        defaultLanguage="sql"
        value={value}
        onChange={(v) => onChange(v || '')}
        onMount={handleEditorMount}
        options={{
          minimap: { enabled: false },
          fontSize: 14,
          lineNumbers: 'on',
          scrollBeyondLastLine: false,
          wordWrap: 'on',
          automaticLayout: true,
          tabSize: 2,
          suggestOnTriggerCharacters: true,
          scrollbar: {
            vertical: autoHeight ? 'hidden' : 'auto',
            horizontal: 'auto',
            alwaysConsumeMouseWheel: false,
          },
        }}
        theme="vs"
      />
    </div>
  );
}
