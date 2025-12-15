import React from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import Fuse from 'fuse.js';
import { FileTree } from './FileTree';
import { ThoughtsEditor } from './ThoughtsEditor';
import { RefreshCw, ExternalLink, Search, X, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatCommentsForAgent } from '@/lib/comment-utils';
import type { FileNode, FileContent, ThoughtComment } from '../../../shared/types';

// Flatten file tree to get all files for searching
function flattenFiles(nodes: FileNode[]): { path: string; name: string }[] {
  const files: { path: string; name: string }[] = [];
  for (const node of nodes) {
    if (node.type === 'file') {
      files.push({ path: node.path, name: node.name });
    } else if (node.children) {
      files.push(...flattenFiles(node.children));
    }
  }
  return files;
}

interface ThoughtsPaneProps {
  projectId: string;
  projectDirectory: string;
  currentSessionId?: string | null;
  onSendToAgent?: (text: string) => void;
}

export function ThoughtsPane({ projectId, projectDirectory, currentSessionId, onSendToAgent }: ThoughtsPaneProps) {
  const [nodes, setNodes] = React.useState<FileNode[]>([]);
  const [selectedPath, setSelectedPath] = React.useState<string | null>(null);
  const [fileContent, setFileContent] = React.useState<FileContent | null>(null);
  const [expandedDirs, setExpandedDirs] = React.useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = React.useState(true);
  const [hasThoughtsDir, setHasThoughtsDir] = React.useState(true);
  const [searchQuery, setSearchQuery] = React.useState('');
  const searchInputRef = React.useRef<HTMLInputElement>(null);

  // Database-backed comments
  const [fileComments, setFileComments] = React.useState<ThoughtComment[]>([]);
  const [allProjectComments, setAllProjectComments] = React.useState<ThoughtComment[]>([]);

  const thoughtsPath = `${projectDirectory}/thoughts`;

  // Flatten files for searching
  const allFiles = React.useMemo(() => flattenFiles(nodes), [nodes]);

  // Fuse.js instance for fuzzy search
  const fuse = React.useMemo(() => {
    return new Fuse(allFiles, {
      keys: ['path', 'name'],
      threshold: 0.4,
      ignoreLocation: true,
    });
  }, [allFiles]);

  // Filtered files based on search
  const searchResults = React.useMemo(() => {
    if (!searchQuery.trim()) return null;
    return fuse.search(searchQuery).map(result => result.item);
  }, [searchQuery, fuse]);

  // Helper to collect all directory paths for expansion
  const collectDirectoryPaths = (nodes: FileNode[]): string[] => {
    const paths: string[] = [];
    for (const node of nodes) {
      if (node.type === 'directory') {
        paths.push(node.path);
        if (node.children) {
          paths.push(...collectDirectoryPaths(node.children));
        }
      }
    }
    return paths;
  };

  // Load directory structure
  const loadDirectory = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await window.electronAPI.invoke<FileNode[]>('fs:read-directory', {
        path: thoughtsPath,
      });
      setNodes(result);
      setHasThoughtsDir(true);

      // Expand all directories by default on initial load
      setExpandedDirs(prev => {
        if (prev.size === 0) {
          return new Set(collectDirectoryPaths(result));
        }
        return prev;
      });
    } catch (error) {
      console.error('Failed to load thoughts directory:', error);
      setHasThoughtsDir(false);
    } finally {
      setIsLoading(false);
    }
  }, [thoughtsPath]);

  // Load all project comments
  const loadAllComments = React.useCallback(async () => {
    try {
      const comments = await window.electronAPI.invoke<ThoughtComment[]>(
        'db:thought-comments:list-by-project',
        { projectId }
      );
      setAllProjectComments(comments);
    } catch (error) {
      console.error('Failed to load project comments:', error);
    }
  }, [projectId]);

  // Load comments for the selected file
  const loadFileComments = React.useCallback(async (filePath: string) => {
    try {
      const comments = await window.electronAPI.invoke<ThoughtComment[]>(
        'db:thought-comments:list-by-file',
        { filePath }
      );
      setFileComments(comments);
    } catch (error) {
      console.error('Failed to load file comments:', error);
    }
  }, []);

  // Initial load
  React.useEffect(() => {
    loadDirectory();
    loadAllComments();
  }, [loadDirectory, loadAllComments]);

  // Start file watcher
  React.useEffect(() => {
    window.electronAPI.invoke('fs:watch-start', { path: thoughtsPath });

    const unsubscribe = window.electronAPI.on('fs:file-changed', (data: unknown) => {
      const { path, event } = data as { path: string; event: string };

      // Refresh directory on any change
      loadDirectory();

      // If the currently open file changed, reload it
      if (selectedPath === path && event === 'change') {
        loadFile(path);
      }
    });

    return () => {
      unsubscribe();
      window.electronAPI.invoke('fs:watch-stop');
    };
  }, [thoughtsPath, selectedPath, loadDirectory]);

  // Load file content
  const loadFile = async (path: string) => {
    try {
      const content = await window.electronAPI.invoke<FileContent>('fs:read-file', { path });
      setFileContent(content);
      loadFileComments(path);
    } catch (error) {
      console.error('Failed to load file:', error);
    }
  };

  const handleSelectFile = (path: string) => {
    setSelectedPath(path);
    loadFile(path);
  };

  const handleToggleDir = (path: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const handleSaveFile = async (content: string) => {
    if (!selectedPath) return;

    try {
      await window.electronAPI.invoke('fs:write-file', {
        path: selectedPath,
        content,
      });
      // Reload to get updated content
      loadFile(selectedPath);
    } catch (error) {
      console.error('Failed to save file:', error);
    }
  };

  const handleOpenInEditor = () => {
    // Open thoughts directory in external editor
    window.electronAPI.invoke('shell:open-in-editor', { path: thoughtsPath });
  };

  // Create a new comment
  const handleCreateComment = async (
    content: string,
    selectedText: string,
    contextBefore: string,
    contextAfter: string
  ): Promise<ThoughtComment | null> => {
    if (!selectedPath) return null;

    try {
      const comment = await window.electronAPI.invoke<ThoughtComment>(
        'db:thought-comments:create',
        {
          projectId,
          filePath: selectedPath,
          content,
          selectedText,
          contextBefore,
          contextAfter,
          projectDirectory,
        }
      );

      // Update local state
      setFileComments(prev => [...prev, comment]);
      setAllProjectComments(prev => [...prev, comment]);

      return comment;
    } catch (error) {
      console.error('Failed to create comment:', error);
      return null;
    }
  };

  // Delete a comment
  const handleDeleteComment = async (commentId: string) => {
    try {
      await window.electronAPI.invoke('db:thought-comments:delete', { id: commentId });

      // Update local state
      setFileComments(prev => prev.filter(c => c.id !== commentId));
      setAllProjectComments(prev => prev.filter(c => c.id !== commentId));
    } catch (error) {
      console.error('Failed to delete comment:', error);
    }
  };

  // Send comments to agent
  const handleSendComments = async (commentIds: string[]) => {
    const commentsToSend = fileComments.filter(c => commentIds.includes(c.id));
    const text = formatCommentsForAgent(commentsToSend);

    if (onSendToAgent) {
      // Send directly to agent tab
      onSendToAgent(text);
    } else {
      // Fallback: copy to clipboard
      navigator.clipboard.writeText(text);
      alert('Comments copied to clipboard! You can paste them into the Agent tab.');
    }

    // Update comment status to 'sent' in database
    for (const id of commentIds) {
      try {
        await window.electronAPI.invoke('db:thought-comments:update-status', {
          id,
          status: 'sent',
          sessionId: currentSessionId,
        });
      } catch (error) {
        console.error('Failed to update comment status:', error);
      }
    }

    // Update local state
    setFileComments(prev => prev.map(c =>
      commentIds.includes(c.id) ? { ...c, status: 'sent' as const } : c
    ));
    setAllProjectComments(prev => prev.map(c =>
      commentIds.includes(c.id) ? { ...c, status: 'sent' as const } : c
    ));
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-[var(--foreground-muted)]">Loading thoughts...</p>
      </div>
    );
  }

  if (!hasThoughtsDir) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4">
        <p className="text-[var(--foreground-muted)]">
          No thoughts/ directory found in this project.
        </p>
        <p className="text-sm text-[var(--foreground-muted)]">
          Create a thoughts/ directory to start organizing your research and plans.
        </p>
      </div>
    );
  }

  return (
    <PanelGroup direction="horizontal" autoSaveId="hive-thoughts-layout">
      {/* File Tree Panel */}
      <Panel id="thoughts-tree" defaultSize={25} minSize={15} maxSize={40}>
        <div className="h-full flex flex-col bg-[var(--sidebar)]">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border)]">
            <span className="text-sm font-medium">thoughts/</span>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={loadDirectory}
                title="Refresh"
              >
                <RefreshCw className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={handleOpenInEditor}
                title="Open in external editor"
              >
                <ExternalLink className="h-3 w-3" />
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
                className="w-full pl-7 pr-7 py-1 text-sm bg-[var(--background)] border border-[var(--border)] rounded focus:outline-none focus:border-[var(--primary)]"
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

          {/* Tree or Search Results */}
          <div className="flex-1 overflow-auto">
            {nodes.length === 0 ? (
              <p className="text-sm text-[var(--foreground-muted)] p-3">
                No markdown files found
              </p>
            ) : searchResults ? (
              // Show flat search results
              <div>
                {searchResults.length === 0 ? (
                  <div className="px-3 py-4 text-sm text-[var(--foreground-muted)] text-center">
                    No files match "{searchQuery}"
                  </div>
                ) : (
                  searchResults.map((file) => {
                    const relativePath = file.path.replace(thoughtsPath + '/', '');
                    return (
                      <button
                        key={file.path}
                        onClick={() => handleSelectFile(file.path)}
                        className={cn(
                          'w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors',
                          'hover:bg-[var(--sidebar-accent)]',
                          selectedPath === file.path && 'bg-[var(--sidebar-accent)]'
                        )}
                      >
                        <FileText className="h-4 w-4 flex-shrink-0 text-[var(--foreground-muted)]" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm truncate">{file.name}</div>
                          <div className="text-xs text-[var(--foreground-muted)] truncate">
                            {relativePath}
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            ) : (
              // Show tree view
              <FileTree
                nodes={nodes}
                selectedPath={selectedPath}
                onSelectFile={handleSelectFile}
                expandedDirs={expandedDirs}
                onToggleDir={handleToggleDir}
              />
            )}
          </div>
        </div>
      </Panel>

      <PanelResizeHandle className="w-1 bg-[var(--border)] hover:bg-[var(--primary)] transition-colors" />

      {/* Editor Panel */}
      <Panel id="thoughts-editor" minSize={50}>
        {fileContent ? (
          <ThoughtsEditor
            fileContent={fileContent}
            comments={fileComments}
            allProjectComments={allProjectComments}
            projectDirectory={projectDirectory}
            onSave={handleSaveFile}
            onCreateComment={handleCreateComment}
            onDeleteComment={handleDeleteComment}
            onSendComments={handleSendComments}
            onFileSelect={handleSelectFile}
          />
        ) : (
          <div className="h-full flex items-center justify-center">
            <p className="text-[var(--foreground-muted)]">
              Select a file to view
            </p>
          </div>
        )}
      </Panel>
    </PanelGroup>
  );
}
