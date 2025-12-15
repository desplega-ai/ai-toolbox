import { ipcMain, dialog, BrowserWindow, shell } from 'electron';
import { spawn, exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { database } from './database';
import { DEFAULT_MODEL, DEFAULT_PERMISSION_MODE } from '../shared/types';
import { getPreferences, setPreferences, addRecentDirectory, getTabsState, setTabsState } from './preferences';
import { SessionManager } from './session-manager';
import { getAuthConfig, setAuthConfig } from './auth-manager';
import { loadSessionHistory, discoverProjectSessions, getSessionFilePath, getSessionWrittenFiles } from './session-history';
import { readDirectory, readFile, writeFile, directoryExists } from './file-system';
import { startWatching, stopWatching } from './file-watcher';
import { buildFileIndex, getFileIndex, clearFileIndex } from './file-indexer';
import { loadCommands, loadAgents } from './claude-config';
import { GitService, getHeadCommit, type GitStatus, type DiffContent, type FileDiff } from './git-service';

let sessionManager: SessionManager | null = null;

// Track open prompt files and their watchers
const promptFilePaths = new Map<string, string>();
// Track files being updated from input to avoid feedback loops
const updatingFiles = new Set<string>();
// Track last known content to detect actual changes
const promptFileContents = new Map<string, string>();

export function registerIpcHandlers(mainWindow: BrowserWindow): void {
  // Initialize session manager
  sessionManager = new SessionManager(mainWindow);

  // Projects
  ipcMain.handle('db:projects:list', () => {
    return database.projects.list();
  });

  ipcMain.handle('db:projects:create', (_, data) => {
    const project = database.projects.create(data);
    addRecentDirectory(data.directory);
    return project;
  });

  ipcMain.handle('db:projects:delete', (_, { id }) => {
    database.projects.delete(id);
  });

  // Sessions
  ipcMain.handle('db:sessions:list', (_, { projectId }) => {
    return database.sessions.listByProject(projectId);
  });

  ipcMain.handle('db:sessions:create', (_, data) => {
    return database.sessions.create(data);
  });

  ipcMain.handle('db:sessions:get', (_, { id }) => {
    return database.sessions.getById(id);
  });

  ipcMain.handle('db:sessions:update-name', (_, { id, name }) => {
    database.sessions.updateName(id, name);
  });

  ipcMain.handle('db:sessions:update-status', (_, { id, status }) => {
    database.sessions.updateStatus(id, status);
    // Also broadcast status change
    mainWindow.webContents.send('session:status', { sessionId: id, status });
  });

  // Load session history from ~/.claude JSONL files
  ipcMain.handle('session:load-history', async (_, { directory, claudeSessionId }) => {
    if (!claudeSessionId) return [];
    // Get persisted result messages from database
    const persistedResults = database.sessionResults.getByClaudeSessionId(claudeSessionId);
    // Load history with persisted results
    return loadSessionHistory(directory, claudeSessionId, persistedResults);
  });

  // Get session file path
  ipcMain.handle('session:get-file-path', (_, { directory, claudeSessionId }) => {
    if (!claudeSessionId) return null;
    return getSessionFilePath(directory, claudeSessionId);
  });

  // Get files written/edited during a session (for diff filtering)
  ipcMain.handle('session:get-written-files', async (_, { directory, claudeSessionId }) => {
    if (!claudeSessionId) return [];
    return getSessionWrittenFiles(directory, claudeSessionId);
  });

  // Discover sessions from ~/.claude/projects/ and sync to database
  ipcMain.handle('session:discover-and-sync', async (_, { projectId, directory }) => {
    // Get existing sessions for this project
    const existingSessions = database.sessions.listByProject(projectId);
    const existingClaudeIds = new Set(
      existingSessions
        .filter(s => s.claudeSessionId)
        .map(s => s.claudeSessionId)
    );

    // Discover sessions from SDK storage
    const discovered = discoverProjectSessions(directory);

    // Create new sessions for any we don't have
    const newSessions = [];
    for (const disc of discovered) {
      if (!existingClaudeIds.has(disc.claudeSessionId)) {
        // Create session name from first prompt
        const name = disc.firstPrompt
          ? disc.firstPrompt.slice(0, 50) + (disc.firstPrompt.length > 50 ? '...' : '')
          : `Session ${disc.claudeSessionId.slice(0, 8)}`;

        const session = database.sessions.create({
          projectId,
          claudeSessionId: disc.claudeSessionId,
          name,
          model: DEFAULT_MODEL,
          permissionMode: DEFAULT_PERMISSION_MODE,
          permissionExpiresAt: null,
          actionType: 'freeform',
          status: 'idle',
          metadata: {
            importedFrom: 'claude-sdk',
            originalTimestamp: disc.timestamp,
          },
        });
        newSessions.push(session);
      }
    }

    return {
      discovered: discovered.length,
      imported: newSessions.length,
      sessions: newSessions,
    };
  });

  // Session operations (Claude SDK)
  ipcMain.handle('session:start', async (_, { hiveSessionId, prompt, cwd, claudeSessionId, model, permissionMode }) => {
    if (!sessionManager) throw new Error('SessionManager not initialized');
    await sessionManager.startSession(hiveSessionId, prompt, cwd, claudeSessionId, model, permissionMode);
  });

  // Update session model
  ipcMain.handle('db:sessions:update-model', (_, { id, model }) => {
    database.sessions.updateModel(id, model);
  });

  // Update session permission mode
  ipcMain.handle('db:sessions:update-permission-mode', (_, { id, mode, expiresAt }) => {
    database.sessions.updatePermissionMode(id, mode, expiresAt ?? null);
  });

  // Set permission mode on an active session (calls SDK's setPermissionMode)
  ipcMain.handle('session:set-permission-mode', async (_, { hiveSessionId, mode }) => {
    if (!sessionManager) throw new Error('SessionManager not initialized');
    await sessionManager.setPermissionMode(hiveSessionId, mode);
  });

  ipcMain.handle('session:interrupt', async (_, { hiveSessionId }) => {
    if (!sessionManager) throw new Error('SessionManager not initialized');
    await sessionManager.interruptSession(hiveSessionId);
  });

  // Approve a pending tool call and resume session
  ipcMain.handle('session:approve', async (_, { sessionId, pendingApprovalId }) => {
    if (!sessionManager) throw new Error('SessionManager not initialized');
    await sessionManager.approveAndResume(sessionId, pendingApprovalId);
    // Notify renderer that an approval was resolved
    mainWindow.webContents.send('session:approval-resolved', { sessionId, count: 1 });
  });

  // Approve all pending tool calls and resume session
  ipcMain.handle('session:approve-all', async (_, { sessionId }) => {
    if (!sessionManager) throw new Error('SessionManager not initialized');
    const count = sessionManager.getPendingApprovals(sessionId).length;
    await sessionManager.approveAllAndResume(sessionId);
    // Notify renderer that all approvals were resolved
    mainWindow.webContents.send('session:approval-resolved', { sessionId, count, all: true });
  });

  // Deny a pending tool call and resume session with denial message
  ipcMain.handle('session:deny', async (_, { sessionId, pendingApprovalId, reason }) => {
    if (!sessionManager) throw new Error('SessionManager not initialized');
    await sessionManager.denyAndResume(sessionId, pendingApprovalId, reason);
    // Notify renderer - deny clears all pending
    mainWindow.webContents.send('session:approval-resolved', { sessionId, all: true });
  });

  // Get pending approvals for a session
  ipcMain.handle('session:get-pending-approvals', (_, { sessionId }) => {
    if (!sessionManager) return [];
    // Map database fields to PermissionRequest fields
    const dbApprovals = sessionManager.getPendingApprovals(sessionId);
    return dbApprovals.map(p => ({
      id: p.id,
      sessionId: p.sessionId,
      toolUseId: p.toolUseId,
      toolName: p.toolName,
      input: p.toolInput,
      timestamp: p.createdAt,
      hash: p.hash,
    }));
  });

  // Clear all pending approvals for a session
  ipcMain.handle('session:clear-pending-approvals', (_, { sessionId }) => {
    if (!sessionManager) return;
    sessionManager.clearPendingApprovals(sessionId);
  });

  // Preferences
  ipcMain.handle('preferences:get', () => {
    return getPreferences();
  });

  ipcMain.handle('preferences:set', (_, updates) => {
    setPreferences(updates);
    // Notify renderer of preference changes
    mainWindow.webContents.send('preferences:changed', getPreferences());
  });

  // Auth
  ipcMain.handle('auth:get', () => {
    return getAuthConfig();
  });

  ipcMain.handle('auth:set', (_, config) => {
    setAuthConfig(config);
  });

  // Dialogs
  ipcMain.handle('dialog:open-directory', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'createDirectory'],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  // Shell operations
  ipcMain.handle('shell:open-in-editor', async (_, { path: targetPath }) => {
    // Get editor from preferences
    const prefs = getPreferences();
    const editor = prefs.editorCommand || 'code';
    // Expand ~ to home directory if present
    const expandedPath = targetPath.replace(/^~/, os.homedir());

    try {
      // Spawn editor directly with the path
      const child = spawn(editor, [expandedPath], {
        detached: true,
        stdio: 'ignore',
        env: { ...process.env },
      });
      child.unref();
    } catch (error) {
      console.error('Failed to open editor:', error);
      // Fallback to opening in system file manager
      await shell.openPath(expandedPath);
    }
  });

  // Reveal file in Finder/Explorer
  ipcMain.handle('shell:reveal-in-finder', async (_, { path: targetPath }) => {
    // Expand ~ to home directory if present
    const expandedPath = targetPath.replace(/^~/, os.homedir());
    shell.showItemInFolder(expandedPath);
  });

  // Open terminal with optional command
  ipcMain.handle('shell:open-in-terminal', async (_, { path: targetPath, command }) => {
    const prefs = getPreferences();
    const terminal = prefs.terminalCommand || (process.platform === 'darwin' ? 'Terminal' : 'gnome-terminal');
    const fullCommand = command ? `cd '${targetPath.replace(/'/g, "'\\''")}' && ${command}` : `cd '${targetPath.replace(/'/g, "'\\''")}'`;

    console.log('[shell:open-in-terminal] terminal:', terminal);
    console.log('[shell:open-in-terminal] fullCommand:', fullCommand);

    try {
      if (process.platform === 'darwin') {
        if (terminal === 'Terminal') {
          const script = `
            tell application "Terminal"
              activate
              do script "${fullCommand.replace(/"/g, '\\"')}"
            end tell
          `;
          console.log('[shell:open-in-terminal] AppleScript:', script);
          const child = spawn('osascript', ['-e', script], { detached: true, stdio: 'pipe' });
          child.stderr?.on('data', (data) => console.error('[osascript stderr]', data.toString()));
          child.on('error', (err) => console.error('[osascript error]', err));
          child.unref();
        } else if (terminal === 'iTerm') {
          const script = `
            tell application "iTerm"
              activate
              create window with default profile command "${fullCommand.replace(/"/g, '\\"')}"
            end tell
          `;
          console.log('[shell:open-in-terminal] iTerm AppleScript:', script);
          const child = spawn('osascript', ['-e', script], { detached: true, stdio: 'pipe' });
          child.stderr?.on('data', (data) => console.error('[osascript stderr]', data.toString()));
          child.on('error', (err) => console.error('[osascript error]', err));
          child.unref();
        } else if (terminal === 'Warp') {
          // Warp doesn't support AppleScript do script - copy command to clipboard and open Warp
          const escapedCommand = fullCommand.replace(/'/g, "'\\''");
          exec(`echo '${escapedCommand}' | pbcopy && open -a Warp "${targetPath}"`, (err) => {
            if (err) console.error('[Warp open error]', err);
          });
          console.log('[shell:open-in-terminal] Warp: command copied to clipboard, paste with Cmd+V');
        } else if (terminal === 'Alacritty') {
          spawn('alacritty', ['-e', 'sh', '-c', fullCommand], { detached: true, stdio: 'ignore' }).unref();
        } else if (terminal === 'kitty') {
          spawn('kitty', ['sh', '-c', fullCommand], { detached: true, stdio: 'ignore' }).unref();
        } else {
          // Custom terminal
          spawn(terminal, ['-e', 'sh', '-c', fullCommand], { detached: true, stdio: 'ignore' }).unref();
        }
      } else if (process.platform === 'linux') {
        if (terminal === 'gnome-terminal') {
          spawn(terminal, ['--', 'sh', '-c', fullCommand], { detached: true, stdio: 'ignore' }).unref();
        } else if (terminal === 'konsole') {
          spawn(terminal, ['-e', 'sh', '-c', fullCommand], { detached: true, stdio: 'ignore' }).unref();
        } else {
          spawn(terminal, ['-e', 'sh', '-c', fullCommand], { detached: true, stdio: 'ignore' }).unref();
        }
      }
    } catch (error) {
      console.error('Failed to open terminal:', error);
    }
  });

  // Tabs state
  ipcMain.handle('tabs:get', () => {
    return getTabsState();
  });

  ipcMain.handle('tabs:set', (_, state) => {
    setTabsState(state);
  });

  // Prompt file editing - open content in external editor with auto-sync
  ipcMain.handle('prompt-file:open', async (_, { content, sessionId }) => {
    const fileId = `hive-prompt-${sessionId}-${Date.now()}`;
    const filePath = path.join(os.tmpdir(), `${fileId}.md`);

    // Write initial content
    fs.writeFileSync(filePath, content, 'utf-8');

    // Open in editor
    const prefs = getPreferences();
    const editor = prefs.editorCommand || 'code';

    try {
      const child = spawn(editor, [filePath], {
        detached: true,
        stdio: 'ignore',
        env: { ...process.env },
      });
      child.unref();
    } catch (error) {
      console.error('Failed to open editor for prompt file:', error);
      // Fallback to system default
      await shell.openPath(filePath);
    }

    // Track initial content
    promptFileContents.set(fileId, content);
    promptFilePaths.set(fileId, filePath);

    // Watch for changes using fs.watchFile (more reliable than fs.watch on macOS)
    fs.watchFile(filePath, { interval: 300 }, () => {
      // Skip if we're the ones updating the file
      if (updatingFiles.has(fileId)) return;

      try {
        const newContent = fs.readFileSync(filePath, 'utf-8');
        const lastContent = promptFileContents.get(fileId);

        // Only send if content actually changed
        if (newContent !== lastContent) {
          promptFileContents.set(fileId, newContent);
          mainWindow.webContents.send('prompt-file:changed', { fileId, content: newContent });
        }
      } catch (err) {
        // File might be deleted
        console.error('Failed to read prompt file:', err);
      }
    });

    return { fileId, filePath };
  });

  // Focus an existing prompt file in editor
  ipcMain.handle('prompt-file:focus', async (_, { fileId }) => {
    const filePath = promptFilePaths.get(fileId);
    if (!filePath) return;

    const prefs = getPreferences();
    const editor = prefs.editorCommand || 'code';

    try {
      const child = spawn(editor, [filePath], {
        detached: true,
        stdio: 'ignore',
        env: { ...process.env },
      });
      child.unref();
    } catch (error) {
      console.error('Failed to focus editor for prompt file:', error);
    }
  });

  // Update prompt file content (from input to editor)
  ipcMain.handle('prompt-file:update', (_, { fileId, content }) => {
    const filePath = promptFilePaths.get(fileId);
    if (!filePath) return;

    // Skip if content hasn't changed
    if (promptFileContents.get(fileId) === content) return;

    // Mark as updating to ignore the watcher event
    updatingFiles.add(fileId);
    promptFileContents.set(fileId, content);

    try {
      fs.writeFileSync(filePath, content, 'utf-8');
    } catch (err) {
      console.error('Failed to update prompt file:', err);
    }

    // Clear the flag after a short delay
    setTimeout(() => updatingFiles.delete(fileId), 500);
  });

  // Close and cleanup prompt file
  ipcMain.handle('prompt-file:close', (_, { fileId }) => {
    const filePath = promptFilePaths.get(fileId);
    if (filePath) {
      // Stop watching
      fs.unwatchFile(filePath);

      // Delete the temp file
      try {
        fs.unlinkSync(filePath);
      } catch (err) {
        // File might already be deleted
      }
      promptFilePaths.delete(fileId);
    }

    promptFileContents.delete(fileId);
    updatingFiles.delete(fileId);
  });

  // File system handlers for Thoughts pane
  ipcMain.handle('fs:read-directory', async (_, { path: dirPath }) => {
    return readDirectory(dirPath);
  });

  ipcMain.handle('fs:read-file', async (_, { path: filePath }) => {
    return readFile(filePath);
  });

  ipcMain.handle('fs:write-file', async (_, { path: filePath, content }) => {
    return writeFile(filePath, content);
  });

  ipcMain.handle('fs:watch-start', async (_, { path: dirPath }) => {
    const exists = await directoryExists(dirPath);
    if (exists) {
      startWatching(dirPath, mainWindow);
    }
  });

  ipcMain.handle('fs:watch-stop', () => {
    stopWatching();
  });

  // File index for autocomplete
  ipcMain.handle('fs:build-file-index', async (_, { projectPath }) => {
    return buildFileIndex(projectPath);
  });

  ipcMain.handle('fs:get-file-index', (_, { projectPath }) => {
    return getFileIndex(projectPath);
  });

  ipcMain.handle('fs:clear-file-index', (_, { projectPath }) => {
    clearFileIndex(projectPath);
  });

  // Claude config - load commands and agents from ~/.claude and project
  ipcMain.handle('claude:load-commands', async (_, { projectPath }) => {
    return loadCommands(projectPath);
  });

  ipcMain.handle('claude:load-agents', async (_, { projectPath }) => {
    return loadAgents(projectPath);
  });

  // Git operations
  ipcMain.handle('git:get-status', async (_, { cwd }: { cwd: string }): Promise<GitStatus> => {
    const git = new GitService(cwd);
    return git.getStatus();
  });

  ipcMain.handle('git:get-file-diff', async (_, { cwd, filePath }: { cwd: string; filePath: string }): Promise<DiffContent | null> => {
    const git = new GitService(cwd);
    return git.getFileDiff(filePath);
  });

  ipcMain.handle('git:get-changes-since', async (_, { cwd }: { cwd: string }): Promise<FileDiff[]> => {
    const git = new GitService(cwd);
    const status = await git.getStatus();
    return status.changedFiles;
  });

  // Thought Comments
  ipcMain.handle('db:thought-comments:list-by-project', async (_, { projectId }: { projectId: string }) => {
    return database.thoughtComments.listByProject(projectId);
  });

  ipcMain.handle('db:thought-comments:list-by-file', async (_, { filePath }: { filePath: string }) => {
    return database.thoughtComments.listByFile(filePath);
  });

  ipcMain.handle('db:thought-comments:list-pending', async (_, { projectId }: { projectId: string }) => {
    return database.thoughtComments.listPendingByProject(projectId);
  });

  ipcMain.handle('db:thought-comments:create', async (_, data: {
    projectId: string;
    filePath: string;
    content: string;
    selectedText: string;
    contextBefore: string;
    contextAfter: string;
    projectDirectory: string;
  }) => {
    // Get current git commit from the project directory
    const gitCommit = await getHeadCommit(data.projectDirectory);
    return database.thoughtComments.create({
      projectId: data.projectId,
      filePath: data.filePath,
      content: data.content,
      selectedText: data.selectedText,
      contextBefore: data.contextBefore,
      contextAfter: data.contextAfter,
      gitCommit,
    });
  });

  ipcMain.handle('db:thought-comments:update-status', async (_, { id, status, sessionId }: {
    id: string;
    status: 'pending' | 'sent' | 'archived';
    sessionId?: string;
  }) => {
    return database.thoughtComments.updateStatus(id, status, sessionId);
  });

  ipcMain.handle('db:thought-comments:delete', async (_, { id }: { id: string }) => {
    return database.thoughtComments.delete(id);
  });
}
