import { query, type Query, type PermissionResult, type HookCallback, type HookJSONOutput, type PermissionRequestHookInput } from '@anthropic-ai/claude-agent-sdk';
import { app, BrowserWindow, Notification } from 'electron';
import path from 'path';
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { getAuthEnvironment } from './auth-manager';
import { getPreferences } from './preferences';
import { database, type PendingApproval } from './database';
import { hashToolCall } from '../shared/tool-hash';
import type { Session, ClaudeModel, PermissionMode } from '../shared/types';
import { DEFAULT_MODEL, DEFAULT_PERMISSION_MODE } from '../shared/types';
import type { SDKMessage, SDKResultMessage, PermissionRequest } from '../shared/sdk-types';

// Cache the Claude executable path
let cachedClaudePath: string | null = null;

/**
 * Find the Claude Code CLI executable.
 * Tries: 1) which claude, 2) common install locations
 */
function findClaudeExecutable(): string {
  if (cachedClaudePath) return cachedClaudePath;

  // Try 'which claude' first
  try {
    const result = execSync('which claude', { encoding: 'utf-8', timeout: 5000 }).trim();
    if (result && existsSync(result)) {
      cachedClaudePath = result;
      console.log(`[Session] Found Claude executable via 'which': ${result}`);
      return result;
    }
  } catch {
    // 'which' failed, try common locations
  }

  // Common installation paths
  const commonPaths = [
    '/usr/local/bin/claude',
    '/opt/homebrew/bin/claude',
    `${process.env.HOME}/.local/bin/claude`,
    `${process.env.HOME}/.npm-global/bin/claude`,
  ];

  for (const p of commonPaths) {
    if (existsSync(p)) {
      cachedClaudePath = p;
      console.log(`[Session] Found Claude executable at: ${p}`);
      return p;
    }
  }

  throw new Error(
    'Claude Code CLI not found. Please install it with: npm install -g @anthropic-ai/claude-code'
  );
}

interface ActiveSession {
  query: Query;
  abortController: AbortController;
}

// Resolver function for pending permission requests
type PermissionResolver = (result: PermissionResult) => void;

// Global map to store permission resolvers (keyed by pendingApprovalId)
const pendingResolvers = new Map<string, PermissionResolver>();

/**
 * Resolve a pending permission request (called from IPC handlers).
 */
export function resolvePermission(pendingApprovalId: string, result: PermissionResult): boolean {
  const resolver = pendingResolvers.get(pendingApprovalId);
  if (resolver) {
    resolver(result);
    pendingResolvers.delete(pendingApprovalId);
    return true;
  }
  return false;
}

export class SessionManager {
  private activeSessions = new Map<string, ActiveSession>();
  private mainWindow: BrowserWindow;

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow;
  }

  async startSession(
    hiveSessionId: string,
    prompt: string,
    cwd: string,
    existingClaudeSessionId?: string,
    model?: ClaudeModel,
    permissionMode?: PermissionMode
  ): Promise<void> {
    // Update status to running
    database.sessions.updateStatus(hiveSessionId, 'running');
    this.sendStatusUpdate(hiveSessionId, 'running');

    // Auto-update session name from first prompt (if using default name)
    if (!existingClaudeSessionId) {
      const session = database.sessions.getById(hiveSessionId);
      if (session && /^Session \d+$/.test(session.name)) {
        const trimmed = prompt.trim();
        if (trimmed.length > 0) {
          const newName = trimmed.length <= 50 ? trimmed : trimmed.slice(0, 50) + '...';
          database.sessions.updateName(hiveSessionId, newName);
          this.sendNameUpdate(hiveSessionId, newName);
        }
      }

      // Auto-detect actionType from first message commands or permission mode
      const commandRegex = /\/[\w:-]+/g;
      const commands = prompt.match(commandRegex) || [];
      let detectedActionType: Session['actionType'] | null = null;

      // Check if any command contains "research"
      if (commands.some(cmd => cmd.toLowerCase().includes('research'))) {
        detectedActionType = 'research';
      }
      // Check if any command contains "create-plan" OR permission mode is 'plan'
      else if (commands.some(cmd => cmd.toLowerCase().includes('create-plan')) || permissionMode === 'plan') {
        detectedActionType = 'plan';
      }

      if (detectedActionType) {
        database.sessions.updateActionType(hiveSessionId, detectedActionType);
        this.sendActionTypeUpdate(hiveSessionId, detectedActionType);
      }
    }

    const abortController = new AbortController();

    // Get the user's permission mode (we bypass SDK's internal system and implement it ourselves)
    const effectivePermissionMode = permissionMode || DEFAULT_PERMISSION_MODE;

    // Define which tools are safe/auto-approved based on permission mode
    const readOnlyTools = ['Read', 'Glob', 'Grep', 'WebSearch', 'WebFetch', 'TodoWrite', 'Task', 'TaskOutput'];
    const editTools = ['Edit', 'Write', 'NotebookEdit'];

    console.log(`[Session] Creating query with PermissionRequest hook`);

    // Find the Claude Code CLI executable
    const claudeExecutable = findClaudeExecutable();
    console.log(`[Session] Using Claude executable: ${claudeExecutable}`);

    // Create PermissionRequest hook that handles permissions via our UI
    const permissionRequestHook: HookCallback = async (
      input,
      toolUseID,
      options
    ): Promise<HookJSONOutput> => {
      const hookInput = input as PermissionRequestHookInput;
      const toolName = hookInput.tool_name;
      const toolInput = hookInput.tool_input as Record<string, unknown>;

      const hash = hashToolCall(toolName, toolInput);
      console.log(`[PermissionHook] Tool: ${toolName}, Hash: ${hash}, PermissionMode: ${effectivePermissionMode}`);
      console.log(`[PermissionHook] ToolUseID: ${toolUseID}`);
      console.log(`[PermissionHook] Input:`, JSON.stringify(toolInput).slice(0, 200));

      // Apply permission mode logic
      if (effectivePermissionMode === 'bypassPermissions') {
        console.log(`[PermissionHook] Bypass mode - auto-allowing ${toolName}`);
        return {
          hookSpecificOutput: {
            hookEventName: 'PermissionRequest',
            decision: { behavior: 'allow', updatedInput: toolInput }
          }
        };
      }

      if (effectivePermissionMode === 'acceptEdits') {
        if (readOnlyTools.includes(toolName) || editTools.includes(toolName)) {
          console.log(`[PermissionHook] AcceptEdits mode - auto-allowing ${toolName}`);
          return {
            hookSpecificOutput: {
              hookEventName: 'PermissionRequest',
              decision: { behavior: 'allow', updatedInput: toolInput }
            }
          };
        }
      }

      if (effectivePermissionMode === 'plan') {
        if (readOnlyTools.includes(toolName)) {
          console.log(`[PermissionHook] Plan mode - auto-allowing read-only tool ${toolName}`);
          return {
            hookSpecificOutput: {
              hookEventName: 'PermissionRequest',
              decision: { behavior: 'allow', updatedInput: toolInput }
            }
          };
        }
        console.log(`[PermissionHook] Plan mode - denying write operation ${toolName}`);
        return {
          hookSpecificOutput: {
            hookEventName: 'PermissionRequest',
            decision: { behavior: 'deny', message: 'Write operations are not allowed in plan mode' }
          }
        };
      }

      // Default mode - check pre-approvals or wait for user
      const approved = database.approvedToolCalls.findByHash(hiveSessionId, hash);
      if (approved) {
        console.log(`[PermissionHook] Pre-approved hash found, allowing tool`);
        database.approvedToolCalls.delete(approved.id);
        return {
          hookSpecificOutput: {
            hookEventName: 'PermissionRequest',
            decision: { behavior: 'allow', updatedInput: toolInput }
          }
        };
      }

      // Not pre-approved - wait for user approval via Promise
      console.log(`[PermissionHook] No pre-approval, waiting for user decision`);

      // Store pending approval in database
      const pending = database.pendingApprovals.create({
        sessionId: hiveSessionId,
        toolUseId: toolUseID || 'unknown',
        toolName,
        toolInput,
        hash,
      });

      // Update status to waiting
      database.sessions.updateStatus(hiveSessionId, 'waiting');
      this.sendStatusUpdate(hiveSessionId, 'waiting');

      // Send notification if window not focused
      this.sendInputRequiredNotification(hiveSessionId, toolName, toolInput);

      // Send permission request to renderer
      const request: PermissionRequest = {
        id: pending.id,
        sessionId: hiveSessionId,
        toolUseId: toolUseID || 'unknown',
        toolName,
        input: toolInput,
        timestamp: pending.createdAt,
        hash,
        permissionSuggestions: hookInput.permission_suggestions as unknown[],
      };
      console.log(`[PermissionHook] Sending permission-request IPC:`, JSON.stringify({ id: request.id, sessionId: request.sessionId, toolUseId: request.toolUseId, toolName: request.toolName }));
      if (!this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('session:permission-request', request);
        console.log(`[PermissionHook] IPC sent, waiting for user response...`);
      } else {
        console.error(`[PermissionHook] ERROR: mainWindow is destroyed, cannot send IPC`);
        return {
          hookSpecificOutput: {
            hookEventName: 'PermissionRequest',
            decision: { behavior: 'deny', message: 'UI not available' }
          }
        };
      }

      // Return a Promise that will be resolved when user approves/denies
      return new Promise<HookJSONOutput>((resolve) => {
        // Store the resolver so it can be called from IPC handlers
        // We need to adapt between PermissionResult and HookJSONOutput
        const hookResolver = (result: PermissionResult) => {
          if (result.behavior === 'allow') {
            resolve({
              hookSpecificOutput: {
                hookEventName: 'PermissionRequest',
                decision: { behavior: 'allow', updatedInput: result.updatedInput }
              }
            });
          } else {
            resolve({
              hookSpecificOutput: {
                hookEventName: 'PermissionRequest',
                decision: { behavior: 'deny', message: result.message }
              }
            });
          }
        };
        pendingResolvers.set(pending.id, hookResolver);

        // Handle abort signal
        options.signal.addEventListener('abort', () => {
          console.log(`[PermissionHook] Abort signal received for ${pending.id}`);
          pendingResolvers.delete(pending.id);
          resolve({
            hookSpecificOutput: {
              hookEventName: 'PermissionRequest',
              decision: { behavior: 'deny', message: 'Session interrupted' }
            }
          });
        }, { once: true });
      });
    };

    const response = query({
      prompt,
      options: {
        cwd,
        model: model || DEFAULT_MODEL,
        resume: existingClaudeSessionId,
        env: getAuthEnvironment(),
        abortController,
        includePartialMessages: true,
        systemPrompt: { type: 'preset', preset: 'claude_code' },
        tools: { type: 'preset', preset: 'claude_code' },
        // Use default permission mode - the PermissionRequest hook will handle all permission decisions
        permissionMode: effectivePermissionMode,
        // Use both global (~/.claude/settings.json) and project (.claude/settings.json) settings
        settingSources: ['user', 'project'],
        // Use PermissionRequest hook instead of canUseTool
        hooks: {
          PermissionRequest: [{
            hooks: [permissionRequestHook]
          }]
        },
        // Path to Claude Code CLI (required for packaged apps)
        pathToClaudeCodeExecutable: claudeExecutable,
      },
    });

    console.log(`[Session] Query created`);

    const activeSession: ActiveSession = {
      query: response,
      abortController,
    };

    this.activeSessions.set(hiveSessionId, activeSession);

    try {
      console.log(`[Session] Starting message loop for ${hiveSessionId}`);
      for await (const message of response) {
        const subtype = 'subtype' in message ? message.subtype : undefined;
        console.log(`[Session] Received message type: ${message.type}${subtype ? `, subtype: ${subtype}` : ''}`);

        // Log full message for debugging (except stream events which are noisy)
        if (message.type !== 'stream_event') {
          console.log(`[Session] Message content:`, JSON.stringify(message, null, 2).slice(0, 1000));
        }

        // Update claude_session_id on init
        if (message.type === 'system' && message.subtype === 'init') {
          database.sessions.updateClaudeSessionId(hiveSessionId, message.session_id);
        }

        // Forward message to renderer
        this.sendMessage(hiveSessionId, message as SDKMessage);

        // Handle result
        if (message.type === 'result') {
          console.log(`[Session] Result received: ${message.subtype}`);

          // Persist result message with analytics data
          const session = database.sessions.getById(hiveSessionId);
          if (session?.claudeSessionId) {
            const resultMsg = message as SDKResultMessage;
            database.sessionResults.insert({
              sessionId: hiveSessionId,
              claudeSessionId: session.claudeSessionId,
              subtype: resultMsg.subtype,
              timestamp: resultMsg.timestamp,
              result: resultMsg.result,
              totalCostUsd: resultMsg.total_cost_usd,
              durationMs: resultMsg.duration_ms,
              durationApiMs: resultMsg.duration_api_ms,
              numTurns: resultMsg.num_turns,
              usage: resultMsg.usage,
            });
          }

          // Check if we have pending approvals - if so, stay in 'waiting' status
          const pendingApprovals = database.pendingApprovals.listBySession(hiveSessionId);
          if (pendingApprovals.length > 0) {
            console.log(`[Session] ${pendingApprovals.length} pending approval(s), staying in waiting status`);
            database.sessions.updateStatus(hiveSessionId, 'waiting');
            this.sendStatusUpdate(hiveSessionId, 'waiting');
          } else {
            const isSuccess = message.subtype === 'success';
            const resultMsg = message as SDKResultMessage;
            database.sessions.updateStatus(hiveSessionId, 'idle');
            this.sendStatusUpdate(hiveSessionId, 'idle');
            this.sendCompletionNotification(
              hiveSessionId,
              isSuccess,
              !isSuccess ? resultMsg.result : undefined
            );
          }
        }
      }
      console.log(`[Session] Message loop ended for ${hiveSessionId}`);
    } catch (error) {
      // Check if this was a user-initiated interrupt (status already set to 'idle')
      const session = database.sessions.getById(hiveSessionId);
      if (session?.status === 'idle') {
        console.log('[Session] Session was interrupted by user');
      } else {
        console.error('[Session] Error in message loop:', error);
        database.sessions.updateStatus(hiveSessionId, 'error');
        this.sendStatusUpdate(hiveSessionId, 'error');
      }
    } finally {
      console.log(`[Session] Cleaning up session ${hiveSessionId}`);
      this.activeSessions.delete(hiveSessionId);
    }
  }

  async interruptSession(hiveSessionId: string): Promise<void> {
    const active = this.activeSessions.get(hiveSessionId);
    if (active) {
      // Send interrupted message to UI
      const session = database.sessions.getById(hiveSessionId);
      this.sendMessage(hiveSessionId, {
        type: 'result',
        subtype: 'interrupted',
        session_id: session?.claudeSessionId || '',
        result: 'Session interrupted by user',
      } as SDKMessage);

      // Persist interrupted result to database
      if (session?.claudeSessionId) {
        database.sessionResults.insert({
          sessionId: hiveSessionId,
          claudeSessionId: session.claudeSessionId,
          subtype: 'interrupted',
          timestamp: new Date().toISOString(),
          result: 'Session interrupted by user',
        });
      }

      // Update status immediately so user sees feedback
      database.sessions.updateStatus(hiveSessionId, 'idle');
      this.sendStatusUpdate(hiveSessionId, 'idle');

      // Use abort to stop the session - interrupt() can cause unwanted restarts
      active.abortController.abort();
    }
  }

  /**
   * Dynamically change the permission mode for an active session.
   * Uses the SDK's setPermissionMode API.
   */
  async setPermissionMode(hiveSessionId: string, mode: PermissionMode): Promise<void> {
    const active = this.activeSessions.get(hiveSessionId);
    if (active) {
      try {
        await active.query.setPermissionMode(mode);
        console.log(`[Session] Permission mode set to ${mode} for session ${hiveSessionId}`);
      } catch (error) {
        console.error(`[Session] Failed to set permission mode:`, error);
      }
    }
  }

  /**
   * Approve a pending tool call.
   * Resolves the waiting Promise so the tool executes immediately.
   * Falls back to session restart if no active session (e.g., after app restart).
   */
  async approveAndResume(hiveSessionId: string, pendingApprovalId: string): Promise<void> {
    const pendingApprovals = database.pendingApprovals.listBySession(hiveSessionId);
    const pending = pendingApprovals.find(p => p.id === pendingApprovalId);

    if (!pending) {
      console.log(`[Approval] Pending approval ${pendingApprovalId} not found`);
      return;
    }

    console.log(`[Approval] Approving ${pending.toolName} (hash: ${pending.hash})`);

    // Store the approved hash and tool name for sub-agent auto-approval
    database.approvedToolCalls.create({
      sessionId: hiveSessionId,
      hash: pending.hash,
      toolName: pending.toolName,
    });

    // Remove from pending
    database.pendingApprovals.delete(pendingApprovalId);

    // Try to resolve the waiting Promise
    const resolved = resolvePermission(pendingApprovalId, {
      behavior: 'allow',
      updatedInput: pending.toolInput as Record<string, unknown>,
    });

    if (resolved) {
      console.log(`[Approval] Permission resolved, tool will execute`);
      // Update status if no more pending approvals
      const remainingPending = database.pendingApprovals.listBySession(hiveSessionId);
      if (remainingPending.length === 0) {
        database.sessions.updateStatus(hiveSessionId, 'running');
        this.sendStatusUpdate(hiveSessionId, 'running');
      }
    } else {
      // No active session - fall back to restart (e.g., after app restart)
      console.log(`[Approval] No active session, checking if restart needed`);
      const remainingPending = database.pendingApprovals.listBySession(hiveSessionId);
      if (remainingPending.length === 0) {
        await this.restartSessionWithApproval(hiveSessionId, pending.toolName);
      }
    }
  }

  /**
   * Helper to restart a session after approval (fallback when no active Promise).
   */
  private async restartSessionWithApproval(hiveSessionId: string, toolName: string): Promise<void> {
    const session = database.sessions.getById(hiveSessionId);
    if (!session) return;

    const project = database.projects.list().find(p => {
      const sessions = database.sessions.listByProject(p.id);
      return sessions.some(s => s.id === hiveSessionId);
    });
    if (!project) return;

    console.log(`[Approval] Restarting session ${hiveSessionId}`);
    const resumeMessage = `The ${toolName} tool has been approved. Please retry the exact same ${toolName} call that was previously denied - it will now succeed.`;
    await this.startSession(
      hiveSessionId,
      resumeMessage,
      project.directory,
      session.claudeSessionId || undefined,
      session.model,
      session.permissionMode
    );
  }

  /**
   * Approve all pending tool calls for a session.
   * Resolves all waiting Promises so tools execute immediately.
   * Falls back to session restart if no active session (e.g., after app restart).
   */
  async approveAllAndResume(hiveSessionId: string): Promise<void> {
    const pendingApprovals = database.pendingApprovals.listBySession(hiveSessionId);

    if (pendingApprovals.length === 0) {
      console.log(`[Approval] No pending approvals for session ${hiveSessionId}`);
      return;
    }

    console.log(`[Approval] Approving all ${pendingApprovals.length} pending tool calls`);

    // Collect tool names for potential restart message
    const toolNames = [...new Set(pendingApprovals.map(p => p.toolName))];
    let anyResolved = false;

    // Store all approved hashes and tool names, then resolve each Promise
    for (const pending of pendingApprovals) {
      // Store for sub-agent auto-approval
      database.approvedToolCalls.create({
        sessionId: hiveSessionId,
        hash: pending.hash,
        toolName: pending.toolName,
      });

      // Try to resolve the waiting Promise
      const resolved = resolvePermission(pending.id, {
        behavior: 'allow',
        updatedInput: pending.toolInput as Record<string, unknown>,
      });
      if (resolved) anyResolved = true;
    }

    // Clear all pending from database
    database.pendingApprovals.deleteBySession(hiveSessionId);

    if (anyResolved) {
      // Active session - update status
      database.sessions.updateStatus(hiveSessionId, 'running');
      this.sendStatusUpdate(hiveSessionId, 'running');
    } else {
      // No active session - fall back to restart
      console.log(`[Approval] No active session, restarting with approval`);
      await this.restartSessionWithApproval(hiveSessionId, toolNames.join(', '));
    }
  }

  /**
   * Deny a pending tool call.
   * Resolves the waiting Promise with deny so Claude gets the denial message.
   * Falls back to session restart if no active session (e.g., after app restart).
   */
  async denyAndResume(hiveSessionId: string, pendingApprovalId: string, reason?: string): Promise<void> {
    const pendingApprovals = database.pendingApprovals.listBySession(hiveSessionId);
    const pending = pendingApprovals.find(p => p.id === pendingApprovalId);

    if (!pending) {
      console.log(`[Denial] Pending approval ${pendingApprovalId} not found`);
      return;
    }

    console.log(`[Denial] Denying ${pending.toolName} (hash: ${pending.hash})`);

    const denialMessage = reason
      ? `User denied the ${pending.toolName} tool. Reason: ${reason}. Please try a different approach or ask for clarification.`
      : `User denied the ${pending.toolName} tool. Please try a different approach or ask for clarification.`;

    // Try to resolve with deny - Claude will see the denial message
    const resolved = resolvePermission(pendingApprovalId, {
      behavior: 'deny',
      message: denialMessage,
    });

    // Remove the denied approval from database
    database.pendingApprovals.delete(pendingApprovalId);

    // Also deny any other pending approvals (deny cancels all)
    const remainingPending = database.pendingApprovals.listBySession(hiveSessionId);
    for (const other of remainingPending) {
      resolvePermission(other.id, {
        behavior: 'deny',
        message: 'Another tool was denied, cancelling this request.',
      });
    }
    database.pendingApprovals.deleteBySession(hiveSessionId);

    if (resolved) {
      // Active session - update status
      database.sessions.updateStatus(hiveSessionId, 'running');
      this.sendStatusUpdate(hiveSessionId, 'running');
    } else {
      // No active session - fall back to restart with denial message
      console.log(`[Denial] No active session, restarting with denial`);
      await this.restartSessionWithDenial(hiveSessionId, denialMessage);
    }
  }

  /**
   * Helper to restart a session after denial (fallback when no active Promise).
   */
  private async restartSessionWithDenial(hiveSessionId: string, denialMessage: string): Promise<void> {
    const session = database.sessions.getById(hiveSessionId);
    if (!session) return;

    const project = database.projects.list().find(p => {
      const sessions = database.sessions.listByProject(p.id);
      return sessions.some(s => s.id === hiveSessionId);
    });
    if (!project) return;

    console.log(`[Denial] Restarting session ${hiveSessionId} with denial`);
    await this.startSession(
      hiveSessionId,
      denialMessage,
      project.directory,
      session.claudeSessionId || undefined,
      session.model,
      session.permissionMode
    );
  }

  /**
   * Get pending approvals for a session.
   */
  getPendingApprovals(hiveSessionId: string): PendingApproval[] {
    return database.pendingApprovals.listBySession(hiveSessionId);
  }

  /**
   * Clear all pending approvals for a session.
   */
  clearPendingApprovals(hiveSessionId: string): void {
    database.pendingApprovals.deleteBySession(hiveSessionId);
    database.approvedToolCalls.deleteBySession(hiveSessionId);
  }

  private sendMessage(sessionId: string, message: SDKMessage): void {
    if (!this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('session:message', { sessionId, message });
    }
  }

  private sendStatusUpdate(sessionId: string, status: Session['status']): void {
    if (!this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('session:status', { sessionId, status });
    }
  }

  private sendNameUpdate(sessionId: string, name: string): void {
    if (!this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('session:name', { sessionId, name });
    }
  }

  private sendActionTypeUpdate(sessionId: string, actionType: Session['actionType']): void {
    if (!this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('session:actionType', { sessionId, actionType });
    }
  }

  /**
   * Get session and project context for notifications.
   */
  private getSessionContext(sessionId: string): { sessionName: string; projectName: string } | null {
    const session = database.sessions.getById(sessionId);
    if (!session) return null;
    const project = database.projects.list().find(p => p.id === session.projectId);
    return {
      sessionName: session.name,
      projectName: project?.name || 'Unknown Project'
    };
  }

  /**
   * Get notification icon path (works in dev and production).
   */
  private getNotificationIcon(): string {
    const isDev = !app.isPackaged;
    if (isDev) {
      return path.join(process.cwd(), 'resources', 'icon.png');
    }
    return path.join(process.resourcesPath, 'icon.png');
  }

  /**
   * Extract the most relevant detail from tool input for notification display.
   */
  private extractToolDetail(toolName: string, toolInput: Record<string, unknown>): string | null {
    switch (toolName) {
      case 'Edit':
      case 'Read':
      case 'Write':
        return (toolInput.file_path as string) || null;
      case 'Bash': {
        const cmd = toolInput.command as string;
        return cmd ? (cmd.length > 50 ? cmd.slice(0, 47) + '...' : cmd) : null;
      }
      case 'Glob':
      case 'Grep':
        return (toolInput.pattern as string) || null;
      default:
        return null;
    }
  }

  private sendInputRequiredNotification(
    sessionId: string,
    toolName: string,
    toolInput: Record<string, unknown>
  ): void {
    // Check preference
    const prefs = getPreferences();
    if (!prefs.notifications.inputRequired) return;

    if (this.mainWindow.isFocused()) return;

    const context = this.getSessionContext(sessionId);
    const detail = this.extractToolDetail(toolName, toolInput);

    const notification = new Notification({
      title: context?.sessionName || 'Permission Required',
      body: detail ? `${toolName}: ${detail}` : `Wants to use: ${toolName}`,
      icon: this.getNotificationIcon(),
      timeoutType: 'never'
    });

    notification.on('click', () => {
      this.mainWindow.show();
      this.mainWindow.focus();
      this.mainWindow.webContents.send('session:focus', sessionId);
    });

    notification.show();
  }

  private sendCompletionNotification(
    sessionId: string,
    success: boolean,
    resultText?: string
  ): void {
    // Check preference
    const prefs = getPreferences();
    if (!prefs.notifications.sessionComplete) return;

    if (this.mainWindow.isFocused()) return;

    const context = this.getSessionContext(sessionId);

    const notification = new Notification({
      title: context?.sessionName || (success ? 'Task Complete' : 'Task Error'),
      body: success ? 'Finished successfully' : (resultText || 'Ended with an error'),
      icon: this.getNotificationIcon(),
    });

    notification.on('click', () => {
      this.mainWindow.show();
      this.mainWindow.focus();
      this.mainWindow.webContents.send('session:focus', sessionId);
    });

    notification.show();
  }
}
