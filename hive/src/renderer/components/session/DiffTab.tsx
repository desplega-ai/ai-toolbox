import React from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { DiffEditor } from '@monaco-editor/react';
import type { Monaco } from '@monaco-editor/react';
import Fuse from 'fuse.js';
import { RefreshCw, GitBranch, FileText, FilePlus, FileMinus, FileEdit, AlertCircle, Columns2, AlignJustify, ExternalLink, Maximize2, Minimize2, Search, X, Filter } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { solarizedLight, solarizedDark } from '@/lib/monaco-themes';
import { useThemeStore } from '@/lib/store';
import type { FileDiff, DiffContent, GitStatus } from '../../../shared/types';

export interface DiffStats {
  additions: number;
  deletions: number;
  fileCount: number;
}

interface DiffTabProps {
  projectDirectory: string;
  claudeSessionId: string | null;
  onStatsChange?: (stats: DiffStats | null) => void;
}

export function DiffTab({ projectDirectory, claudeSessionId, onStatsChange }: DiffTabProps) {
  const [status, setStatus] = React.useState<GitStatus | null>(null);
  const [changedFiles, setChangedFiles] = React.useState<FileDiff[]>([]);
  const [selectedFile, setSelectedFile] = React.useState<string | null>(null);
  const [diffContent, setDiffContent] = React.useState<DiffContent | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isLoadingDiff, setIsLoadingDiff] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const fileListRef = React.useRef<HTMLDivElement>(null);

  // Session filter state
  const [sessionFilesOnly, setSessionFilesOnly] = React.useState(false);
  const [sessionFiles, setSessionFiles] = React.useState<string[] | null>(null);
  const [isLoadingSessionFiles, setIsLoadingSessionFiles] = React.useState(false);

  // Filtered files based on search and session filter
  const filteredFiles = React.useMemo(() => {
    let files = changedFiles;

    // Apply session filter if enabled
    if (sessionFilesOnly && sessionFiles) {
      const sessionFileSet = new Set(sessionFiles);
      files = files.filter(f => sessionFileSet.has(f.path));
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const searchFuse = new Fuse(files, {
        keys: ['path'],
        threshold: 0.4,
        ignoreLocation: true,
      });
      return searchFuse.search(searchQuery).map(result => result.item);
    }

    return files;
  }, [changedFiles, searchQuery, sessionFilesOnly, sessionFiles]);

  // Load git status and changes
  const loadChanges = React.useCallback(async () => {
    setIsLoading(true);
    try {
      // Get git status first
      const gitStatus = await window.electronAPI.invoke<GitStatus>('git:get-status', {
        cwd: projectDirectory,
      });
      setStatus(gitStatus);

      if (gitStatus.isRepo) {
        // Get all uncommitted changes
        const changes = await window.electronAPI.invoke<FileDiff[]>('git:get-changes-since', {
          cwd: projectDirectory,
        });
        setChangedFiles(changes);

        // Select first file if none selected
        if (changes.length > 0) {
          setSelectedFile(prev => prev || changes[0].path);
        }
      }
    } catch (error) {
      console.error('Failed to load git status:', error);
    } finally {
      setIsLoading(false);
    }
  }, [projectDirectory]);

  // Initial load
  React.useEffect(() => {
    loadChanges();
  }, [loadChanges]);

  // Load session files when filter is enabled
  const loadSessionFiles = React.useCallback(async () => {
    if (!claudeSessionId) return;
    setIsLoadingSessionFiles(true);
    try {
      const files = await window.electronAPI.invoke<string[]>('session:get-written-files', {
        directory: projectDirectory,
        claudeSessionId,
      });
      setSessionFiles(files);
    } catch (error) {
      console.error('Failed to load session files:', error);
      setSessionFiles([]);
    } finally {
      setIsLoadingSessionFiles(false);
    }
  }, [projectDirectory, claudeSessionId]);

  // Load session files when filter is toggled on
  React.useEffect(() => {
    if (sessionFilesOnly && sessionFiles === null && !isLoadingSessionFiles) {
      loadSessionFiles();
    }
  }, [sessionFilesOnly, sessionFiles, isLoadingSessionFiles, loadSessionFiles]);

  // Toggle session filter
  const toggleSessionFilter = React.useCallback(() => {
    setSessionFilesOnly(prev => !prev);
  }, []);

  // Notify parent of stats changes
  React.useEffect(() => {
    if (onStatsChange) {
      if (changedFiles.length === 0) {
        onStatsChange(null);
      } else {
        onStatsChange({
          additions: changedFiles.reduce((sum, f) => sum + f.additions, 0),
          deletions: changedFiles.reduce((sum, f) => sum + f.deletions, 0),
          fileCount: changedFiles.length,
        });
      }
    }
  }, [changedFiles, onStatsChange]);

  // Load diff content when file is selected
  React.useEffect(() => {
    if (!selectedFile) {
      setDiffContent(null);
      return;
    }

    async function loadDiff() {
      setIsLoadingDiff(true);
      try {
        const content = await window.electronAPI.invoke<DiffContent | null>('git:get-file-diff', {
          cwd: projectDirectory,
          filePath: selectedFile,
        });
        setDiffContent(content);
      } catch (error) {
        console.error('Failed to load diff:', error);
        setDiffContent(null);
      } finally {
        setIsLoadingDiff(false);
      }
    }

    loadDiff();
  }, [selectedFile, projectDirectory]);

  // Keyboard navigation
  const handleKeyDown = React.useCallback((e: KeyboardEvent) => {
    // Cmd/Ctrl+F to focus search
    if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
      e.preventDefault();
      searchInputRef.current?.focus();
      return;
    }

    // Escape to clear search
    if (e.key === 'Escape' && searchQuery) {
      e.preventDefault();
      setSearchQuery('');
      searchInputRef.current?.blur();
      return;
    }

    if (filteredFiles.length === 0) return;

    const currentIndex = selectedFile
      ? filteredFiles.findIndex(f => f.path === selectedFile)
      : -1;

    if (e.key === 'ArrowDown' || e.key === 'j') {
      e.preventDefault();
      const nextIndex = Math.min(currentIndex + 1, filteredFiles.length - 1);
      setSelectedFile(filteredFiles[nextIndex].path);
    } else if (e.key === 'ArrowUp' || e.key === 'k') {
      e.preventDefault();
      const prevIndex = Math.max(currentIndex - 1, 0);
      setSelectedFile(filteredFiles[prevIndex].path);
    }
  }, [filteredFiles, selectedFile, searchQuery]);

  React.useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Not a git repo
  if (status && !status.isRepo) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4">
        <AlertCircle className="h-12 w-12 text-[var(--foreground-muted)]" />
        <p className="text-[var(--foreground-muted)]">
          This project is not a git repository.
        </p>
        <p className="text-sm text-[var(--foreground-muted)]">
          Initialize git to track file changes.
        </p>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-[var(--foreground-muted)]">Loading git status...</p>
      </div>
    );
  }

  // No changes
  if (changedFiles.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4">
        <FileText className="h-12 w-12 text-[var(--foreground-muted)]" />
        <p className="text-[var(--foreground-muted)]">
          No uncommitted changes detected.
        </p>
        <Button variant="outline" size="sm" onClick={loadChanges}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>
    );
  }

  return (
    <PanelGroup direction="horizontal" autoSaveId="hive-diff-layout">
      {/* File List Panel */}
      <Panel id="diff-files" defaultSize={25} minSize={15} maxSize={40}>
        <div className="h-full flex flex-col bg-[var(--sidebar)]">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border)]">
            <div className="flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-[var(--foreground-muted)]" />
              <span className="text-sm font-medium">{status?.branch || 'unknown'}</span>
            </div>
            <div className="flex items-center gap-1">
              {claudeSessionId && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={sessionFilesOnly ? 'secondary' : 'ghost'}
                      size="icon"
                      className="h-6 w-6"
                      onClick={toggleSessionFilter}
                      disabled={isLoadingSessionFiles}
                    >
                      <Filter className={cn('h-3 w-3', sessionFilesOnly && 'text-[var(--primary)]')} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {sessionFilesOnly ? 'Show all changes' : 'Show only files written by this session'}
                  </TooltipContent>
                </Tooltip>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={loadChanges}
                title="Refresh"
              >
                <RefreshCw className="h-3 w-3" />
              </Button>
            </div>
          </div>

          {/* Search Input */}
          <div className="px-2 py-2 border-b border-[var(--border)]">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--foreground-muted)]" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search files..."
                className="w-full pl-7 pr-7 py-1 text-sm bg-[var(--background)] border border-[var(--border)] focus:outline-none focus:border-[var(--primary)]"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Summary Stats */}
          <div className="px-3 py-2 text-xs border-b border-[var(--border)]">
            <div className="flex items-center justify-between">
              <span className="text-[var(--foreground-muted)]">
                {(searchQuery || sessionFilesOnly) ? `${filteredFiles.length} of ${changedFiles.length}` : changedFiles.length} file{((searchQuery || sessionFilesOnly) ? filteredFiles.length : changedFiles.length) !== 1 ? 's' : ''}
                {sessionFilesOnly && <span className="ml-1 text-[var(--primary)]">(session)</span>}
              </span>
              <span>
                <span className="text-[var(--success)]">
                  +{filteredFiles.reduce((sum, f) => sum + f.additions, 0)}
                </span>
                {' '}
                <span className="text-[var(--destructive)]">
                  -{filteredFiles.reduce((sum, f) => sum + f.deletions, 0)}
                </span>
              </span>
            </div>
          </div>

          {/* File List */}
          <div ref={fileListRef} className="flex-1 overflow-auto">
            {filteredFiles.map((file) => (
              <FileListItem
                key={file.path}
                file={file}
                isSelected={selectedFile === file.path}
                onClick={() => setSelectedFile(file.path)}
              />
            ))}
            {filteredFiles.length === 0 && (searchQuery || sessionFilesOnly) && (
              <div className="px-3 py-4 text-sm text-[var(--foreground-muted)] text-center">
                {searchQuery
                  ? `No files match "${searchQuery}"`
                  : sessionFilesOnly
                    ? 'No files were written by this session'
                    : 'No files to show'}
              </div>
            )}
          </div>
        </div>
      </Panel>

      <PanelResizeHandle className="w-1 bg-[var(--border)] hover:bg-[var(--primary)] transition-colors" />

      {/* Diff Viewer Panel */}
      <Panel id="diff-viewer" minSize={50}>
        {selectedFile && diffContent ? (
          <DiffViewer content={diffContent} isLoading={isLoadingDiff} projectDirectory={projectDirectory} />
        ) : (
          <div className="h-full flex items-center justify-center">
            <p className="text-[var(--foreground-muted)]">
              {isLoadingDiff ? 'Loading diff...' : 'Select a file to view diff'}
            </p>
          </div>
        )}
      </Panel>
    </PanelGroup>
  );
}

// File list item component
interface FileListItemProps {
  file: FileDiff;
  isSelected: boolean;
  onClick: () => void;
}

function FileListItem({ file, isSelected, onClick }: FileListItemProps) {
  const StatusIcon = {
    added: FilePlus,
    modified: FileEdit,
    deleted: FileMinus,
    renamed: FileEdit,
  }[file.status];

  const statusColor = {
    added: 'text-[var(--success)]',
    modified: 'text-[var(--warning)]',
    deleted: 'text-[var(--destructive)]',
    renamed: 'text-[var(--primary)]',
  }[file.status];

  // Get filename and directory
  const parts = file.path.split('/');
  const filename = parts.pop() || file.path;
  const directory = parts.length > 0 ? parts.join('/') + '/' : '';

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors',
        'hover:bg-[var(--sidebar-accent)]',
        isSelected && 'bg-[var(--sidebar-accent)]'
      )}
    >
      <StatusIcon className={cn('h-4 w-4 flex-shrink-0', statusColor)} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <span className="text-sm truncate">{filename}</span>
          {(file.additions > 0 || file.deletions > 0) && (
            <span className="text-xs text-[var(--foreground-muted)] flex-shrink-0">
              <span className="text-[var(--success)]">+{file.additions}</span>
              {' '}
              <span className="text-[var(--destructive)]">-{file.deletions}</span>
            </span>
          )}
        </div>
        {directory && (
          <div className="text-xs text-[var(--foreground-muted)] truncate">
            {directory}
          </div>
        )}
      </div>
    </button>
  );
}

// Monaco DiffEditor viewer
interface DiffViewerProps {
  content: DiffContent;
  isLoading: boolean;
  projectDirectory: string;
}

function DiffViewer({ content, isLoading, projectDirectory }: DiffViewerProps) {
  const { resolvedTheme } = useThemeStore();
  const [sideBySide, setSideBySide] = React.useState(true);
  const [hideUnchanged, setHideUnchanged] = React.useState(true);
  const monacoRef = React.useRef<typeof import('monaco-editor') | null>(null);

  const handleEditorMount = (_editor: unknown, monaco: Monaco) => {
    monacoRef.current = monaco;

    // Register Solarized themes if not already registered
    monaco.editor.defineTheme('solarized-light', solarizedLight);
    monaco.editor.defineTheme('solarized-dark', solarizedDark);
    monaco.editor.setTheme(resolvedTheme === 'dark' ? 'solarized-dark' : 'solarized-light');
  };

  // Update theme when app theme changes
  React.useEffect(() => {
    if (monacoRef.current) {
      monacoRef.current.editor.setTheme(resolvedTheme === 'dark' ? 'solarized-dark' : 'solarized-light');
    }
  }, [resolvedTheme]);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-[var(--foreground-muted)]">Loading diff...</p>
      </div>
    );
  }

  // Handle added files (no original content)
  const isNewFile = content.original === '' && content.modified !== '';
  // Handle deleted files (no modified content)
  const isDeletedFile = content.original !== '' && content.modified === '';

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border)] bg-[var(--background-secondary)]">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{content.path}</span>
          {isNewFile && (
            <span className="text-xs px-1.5 py-0.5 bg-[var(--success)]/20 text-[var(--success)]">
              new file
            </span>
          )}
          {isDeletedFile && (
            <span className="text-xs px-1.5 py-0.5 bg-[var(--destructive)]/20 text-[var(--destructive)]">
              deleted
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => window.electronAPI.invoke('shell:open-in-editor', {
              path: `${projectDirectory}/${content.path}`
            })}
            title="Open in editor"
          >
            <ExternalLink className="h-4 w-4" />
          </Button>
          <Button
            variant={hideUnchanged ? 'secondary' : 'ghost'}
            size="icon"
            className="h-7 w-7"
            onClick={() => setHideUnchanged(!hideUnchanged)}
            title={hideUnchanged ? 'Show all lines' : 'Hide unchanged lines'}
          >
            {hideUnchanged ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
          <Button
            variant={sideBySide ? 'secondary' : 'ghost'}
            size="icon"
            className="h-7 w-7"
            onClick={() => setSideBySide(true)}
            title="Side by side"
          >
            <Columns2 className="h-4 w-4" />
          </Button>
          <Button
            variant={!sideBySide ? 'secondary' : 'ghost'}
            size="icon"
            className="h-7 w-7"
            onClick={() => setSideBySide(false)}
            title="Unified"
          >
            <AlignJustify className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Monaco DiffEditor */}
      <div className="flex-1">
        <DiffEditor
          height="100%"
          language={content.language}
          original={content.original}
          modified={content.modified}
          theme={resolvedTheme === 'dark' ? 'solarized-dark' : 'solarized-light'}
          onMount={handleEditorMount}
          options={{
            readOnly: true,
            renderSideBySide: sideBySide,
            fontFamily: 'Hack, "Fira Code", monospace',
            fontSize: 13,
            lineHeight: 1.5,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            renderLineHighlight: 'none',
            scrollbar: {
              verticalScrollbarSize: 8,
              horizontalScrollbarSize: 8,
            },
            padding: { top: 8, bottom: 8 },
            // Diff-specific options
            renderOverviewRuler: false,
            ignoreTrimWhitespace: false,
            renderIndicators: true,
            originalEditable: false,
            // Hide unchanged regions when collapsed
            hideUnchangedRegions: {
              enabled: hideUnchanged,
              revealLineCount: 2,
              minimumLineCount: 3,
              contextLineCount: 3,
            },
          }}
        />
      </div>
    </div>
  );
}
