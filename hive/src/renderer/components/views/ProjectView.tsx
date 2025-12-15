import React from 'react';
import { ArrowLeft, Plus, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useTabContext } from '@/components/layout/MainLayout';
import { SessionView } from './SessionView';
import type { Session, Preferences } from '../../../shared/types';
import { DEFAULT_MODEL, DEFAULT_PERMISSION_MODE } from '../../../shared/types';

// Map editor commands to display names
const EDITOR_NAMES: Record<string, string> = {
  code: 'VS Code',
  cursor: 'Cursor',
  subl: 'Sublime Text',
  vim: 'Vim',
  nvim: 'Neovim',
  emacs: 'Emacs',
};

function getEditorDisplayName(command: string): string {
  // Check exact match
  if (EDITOR_NAMES[command]) return EDITOR_NAMES[command];
  // Check if command contains a known editor
  const basename = command.split('/').pop() || command;
  if (EDITOR_NAMES[basename]) return EDITOR_NAMES[basename];
  // Return the command itself if unknown
  return basename || 'Editor';
}

export function ProjectView() {
  const {
    currentProject,
    currentSession,
    sessions,
    setCurrentProject,
    setCurrentSession,
    setSessions,
  } = useTabContext();

  const [editorCommand, setEditorCommand] = React.useState<string>('code');

  // Load editor preference
  React.useEffect(() => {
    async function loadPreferences() {
      const prefs = await window.electronAPI.invoke<Preferences>('preferences:get');
      setEditorCommand(prefs.editorCommand || 'code');
    }
    loadPreferences();
  }, []);

  React.useEffect(() => {
    if (currentProject) {
      loadSessions();
    }
  }, [currentProject?.id]);

  // Listen for Cmd+N to create new session
  React.useEffect(() => {
    const handler = () => {
      if (currentProject) {
        handleNewSession();
      }
    };
    window.addEventListener('create-new-session', handler);
    return () => window.removeEventListener('create-new-session', handler);
  }, [currentProject, sessions.length]);

  const loadSessions = async () => {
    if (!currentProject) return;
    try {
      // First, discover and import any sessions from ~/.claude/projects/
      await window.electronAPI.invoke('session:discover-and-sync', {
        projectId: currentProject.id,
        directory: currentProject.directory,
      });

      // Then load all sessions (including newly imported ones)
      const result = await window.electronAPI.invoke<Session[]>('db:sessions:list', {
        projectId: currentProject.id,
      });
      setSessions(result);
    } catch (error) {
      console.error('Failed to load sessions:', error);
    }
  };

  const handleBack = () => {
    setCurrentProject(null);
    setCurrentSession(null);
    setSessions([]);
  };

  const handleNewSession = async () => {
    if (!currentProject) return;

    // Create a placeholder session
    try {
      const session = await window.electronAPI.invoke<Session>('db:sessions:create', {
        projectId: currentProject.id,
        claudeSessionId: null,
        name: `Session ${sessions.length + 1}`,
        model: DEFAULT_MODEL,
        permissionMode: DEFAULT_PERMISSION_MODE,
        permissionExpiresAt: null,
        actionType: 'freeform',
        status: 'pending',
        metadata: {},
      });
      setSessions([session, ...sessions]);
      setCurrentSession(session);
      // Focus the message input after a short delay to ensure the session view is mounted
      setTimeout(() => {
        window.dispatchEvent(new Event('focus-message-input'));
      }, 100);
    } catch (error) {
      console.error('Failed to create session:', error);
    }
  };

  if (!currentProject) {
    return null;
  }

  const handleOpenInEditor = async () => {
    if (!currentProject) return;
    try {
      await window.electronAPI.invoke('shell:open-in-editor', {
        path: currentProject.directory,
      });
    } catch (error) {
      console.error('Failed to open in editor:', error);
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="h-12 flex items-center gap-3 px-4 border-b border-[var(--border)] bg-[var(--background-secondary)]">
        <Button
          variant="outline"
          size="sm"
          onClick={handleBack}
          className="border-[var(--border)] hover:bg-[var(--background)] hover:border-[var(--foreground-muted)]"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <div className="h-4 w-px bg-[var(--border)]" />
        <span className="font-medium">{currentProject.name}</span>
        <span className="text-xs text-[var(--foreground-muted)] font-mono truncate max-w-[200px]">
          {currentProject.directory}
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              onClick={handleOpenInEditor}
              className="h-7 text-xs border-[var(--border)] hover:bg-[var(--background)] hover:border-[var(--foreground-muted)]"
            >
              <ExternalLink className="h-3 w-3 mr-1.5" />
              Open in {getEditorDisplayName(editorCommand)}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <div className="text-xs">
              <div>Open project in {getEditorDisplayName(editorCommand)}</div>
              <div className="text-[var(--foreground-muted)] font-mono">{currentProject.directory}</div>
            </div>
          </TooltipContent>
        </Tooltip>
        <div className="flex-1" />
        <Button size="sm" onClick={handleNewSession}>
          <Plus className="h-4 w-4 mr-1" />
          New Session
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {currentSession ? (
          <SessionView session={currentSession} projectId={currentProject.id} projectDirectory={currentProject.directory} />
        ) : (
          <div className="h-full flex flex-col items-center justify-center">
            <p className="text-[var(--foreground-muted)] mb-4">
              Select a session or create a new one
            </p>
            <Button onClick={handleNewSession}>
              <Plus className="h-4 w-4 mr-2" />
              New Session
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
