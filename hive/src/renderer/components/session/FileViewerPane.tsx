import React from 'react';
import Editor from '@monaco-editor/react';
import { X, ExternalLink, GitBranch, FileText, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useFileViewerStore, useThemeStore } from '@/lib/store';
import { solarizedLight, solarizedDark } from '@/lib/monaco-themes';

interface FileViewerPaneProps {
  projectDirectory: string;
  onOpenThoughtsTab?: (path: string) => void;
  onOpenDiffTab?: (path: string) => void;
}

// Map file extension to Monaco language
function getLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const langMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    json: 'json',
    md: 'markdown',
    py: 'python',
    rs: 'rust',
    go: 'go',
    html: 'html',
    css: 'css',
    scss: 'scss',
    sass: 'scss',
    yaml: 'yaml',
    yml: 'yaml',
    toml: 'ini',
    sh: 'shell',
    bash: 'shell',
    zsh: 'shell',
    sql: 'sql',
    xml: 'xml',
    vue: 'html',
    svelte: 'html',
    swift: 'swift',
    kt: 'kotlin',
    java: 'java',
    rb: 'ruby',
    php: 'php',
    c: 'c',
    cpp: 'cpp',
    h: 'c',
    hpp: 'cpp',
  };
  return langMap[ext] || 'plaintext';
}

export function FileViewerPane({ projectDirectory, onOpenThoughtsTab, onOpenDiffTab }: FileViewerPaneProps) {
  const { openFile, closeFile } = useFileViewerStore();
  const { resolvedTheme } = useThemeStore();
  const [content, setContent] = React.useState<string>('');
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Derive file info
  const fileName = openFile?.path.split('/').pop() || '';
  const isThoughtFile = openFile?.path.includes('/thoughts/');
  const language = React.useMemo(() => getLanguage(fileName), [fileName]);

  // Close on Escape key
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && openFile) {
        closeFile();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [openFile, closeFile]);

  // Load file content
  React.useEffect(() => {
    if (!openFile) return;

    setIsLoading(true);
    setError(null);

    window.electronAPI.invoke<{ content: string }>('fs:read-file', { path: openFile.path })
      .then(result => {
        setContent(result.content);
      })
      .catch(err => {
        setError(`Failed to load file: ${err.message || err}`);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [openFile?.path]);

  const handleOpenInEditor = () => {
    if (openFile) {
      window.electronAPI.invoke('shell:open-in-editor', { path: openFile.path });
    }
  };

  const handleShowDiff = () => {
    if (openFile && onOpenDiffTab) {
      onOpenDiffTab(openFile.path);
    }
  };

  const handleOpenInThoughts = () => {
    if (openFile && onOpenThoughtsTab) {
      onOpenThoughtsTab(openFile.path);
    }
  };

  if (!openFile) return null;

  return (
    <div className="h-full flex flex-col border-l border-[var(--border)]">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border)] bg-[var(--secondary)]">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <FileText className="h-4 w-4 flex-shrink-0 text-[var(--foreground-muted)]" />
          <button
            onClick={handleOpenInEditor}
            className="text-sm font-medium truncate text-[var(--primary)] hover:underline"
            title={`Open ${openFile.path} in editor`}
          >
            {fileName}
          </button>
        </div>
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleOpenInEditor}>
                <ExternalLink className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Open in editor</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleShowDiff}>
                <GitBranch className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Show git diff</TooltipContent>
          </Tooltip>
          {isThoughtFile && onOpenThoughtsTab && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleOpenInThoughts}>
                  <BookOpen className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>View in Thoughts</TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={closeFile}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Close (Esc)</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Full path display */}
      <div className="px-3 py-1 text-xs text-[var(--foreground-muted)] bg-[var(--background)] border-b border-[var(--border)] truncate font-mono">
        {openFile.path}
        {openFile.line && <span className="text-[var(--primary)]">:{openFile.line}</span>}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {isLoading ? (
          <div className="h-full flex items-center justify-center">
            <p className="text-[var(--foreground-muted)]">Loading...</p>
          </div>
        ) : error ? (
          <div className="h-full flex items-center justify-center p-4">
            <p className="text-[var(--destructive)] text-sm text-center">{error}</p>
          </div>
        ) : (
          <Editor
            height="100%"
            language={language}
            value={content}
            theme={resolvedTheme === 'dark' ? 'solarized-dark' : 'solarized-light'}
            options={{
              readOnly: true,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              fontFamily: 'Hack, "Fira Code", monospace',
              fontSize: 13,
              lineHeight: 1.5,
              lineNumbers: 'on',
              renderLineHighlight: 'line',
              wordWrap: 'on',
              automaticLayout: true,
            }}
            onMount={(editor, monaco) => {
              // Register themes
              monaco.editor.defineTheme('solarized-light', solarizedLight);
              monaco.editor.defineTheme('solarized-dark', solarizedDark);

              // Scroll to line if specified
              if (openFile?.line) {
                editor.revealLineInCenter(openFile.line);
                editor.setPosition({ lineNumber: openFile.line, column: 1 });
              }
            }}
          />
        )}
      </div>
    </div>
  );
}
