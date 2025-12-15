import { ChevronRight, ChevronDown, FileText, Folder, FolderOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FileNode } from '../../../shared/types';

interface FileTreeProps {
  nodes: FileNode[];
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
  expandedDirs: Set<string>;
  onToggleDir: (path: string) => void;
}

export function FileTree({
  nodes,
  selectedPath,
  onSelectFile,
  expandedDirs,
  onToggleDir,
}: FileTreeProps) {
  return (
    <div className="py-1">
      {nodes.map((node) => (
        <FileTreeNode
          key={node.path}
          node={node}
          depth={0}
          selectedPath={selectedPath}
          onSelectFile={onSelectFile}
          expandedDirs={expandedDirs}
          onToggleDir={onToggleDir}
        />
      ))}
    </div>
  );
}

interface FileTreeNodeProps {
  node: FileNode;
  depth: number;
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
  expandedDirs: Set<string>;
  onToggleDir: (path: string) => void;
}

function FileTreeNode({
  node,
  depth,
  selectedPath,
  onSelectFile,
  expandedDirs,
  onToggleDir,
}: FileTreeNodeProps) {
  const isExpanded = expandedDirs.has(node.path);
  const isSelected = selectedPath === node.path;
  const paddingLeft = depth * 12 + 8;

  const handleClick = () => {
    if (node.type === 'directory') {
      onToggleDir(node.path);
    } else {
      onSelectFile(node.path);
    }
  };

  return (
    <div>
      <button
        onClick={handleClick}
        className={cn(
          'w-full flex items-center gap-1 py-1 text-sm text-left',
          'hover:bg-[var(--sidebar-accent)] transition-colors',
          isSelected && 'bg-[var(--sidebar-accent)] text-[var(--primary)]'
        )}
        style={{ paddingLeft }}
      >
        {node.type === 'directory' ? (
          <>
            {isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5 flex-shrink-0" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 flex-shrink-0" />
            )}
            {isExpanded ? (
              <FolderOpen className="h-4 w-4 flex-shrink-0 text-[var(--warning)]" />
            ) : (
              <Folder className="h-4 w-4 flex-shrink-0 text-[var(--warning)]" />
            )}
          </>
        ) : (
          <>
            <span className="w-3.5 flex-shrink-0" />
            <FileText className="h-4 w-4 flex-shrink-0 text-[var(--foreground-muted)]" />
          </>
        )}
        <span className="truncate">{node.name}</span>
      </button>

      {node.type === 'directory' && isExpanded && node.children && (
        <div>
          {node.children.map((child) => (
            <FileTreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              onSelectFile={onSelectFile}
              expandedDirs={expandedDirs}
              onToggleDir={onToggleDir}
            />
          ))}
        </div>
      )}
    </div>
  );
}
