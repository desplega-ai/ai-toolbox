import { query, type Query, type PermissionResult, type PermissionUpdate, type CanUseTool } from '@anthropic-ai/claude-agent-sdk';
import { BrowserWindow, Notification } from 'electron';
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { getAuthEnvironment } from './auth-manager';
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

    const abortController = new AbortController();

    // Create the canUseTool callback that uses hash-based pre-approval
    const canUseTool: CanUseTool = async (
      toolName: string,
      toolInput: Record<string, unknown>,
      options: {
        signal: AbortSignal;
        suggestions?: PermissionUpdate[];
        blockedPath?: string;
        decisionReason?: string;
        toolUseID: string;
        agentID?: string;
      }
    ): Promise<PermissionResult> => {
      const hash = hashToolCall(toolName, toolInput);
      console.log(`[canUseTool] Tool: ${toolName}, Hash: ${hash}`);
      console.log(`[canUseTool] Input:`, JSON.stringify(toolInput).slice(0, 200));

      // Check if this tool call was pre-approved (from previous interrupt/resume)
      const approved = database.approvedToolCalls.findByHash(hiveSessionId, hash);
      if (approved) {
        console.log(`[canUseTool] Pre-approved hash found, allowing tool`);
        // Remove the one-time approval
        database.approvedToolCalls.delete(approved.id);
        return { behavior: 'allow', updatedInput: toolInput };
      }

      // Not pre-approved - store as pending and deny (user will approve via UI)
      console.log(`[canUseTool] No pre-approval, storing pending and denying`);

      // Store pending approval in database (persists across restarts)
      const pending = database.pendingApprovals.create({
        sessionId: hiveSessionId,
        toolUseId: options.toolUseID,
        toolName,
        toolInput,
        hash,
      });

      // Update status to waiting
      database.sessions.updateStatus(hiveSessionId, 'waiting');
      this.sendStatusUpdate(hiveSessionId, 'waiting');

      // Send notification if window not focused
      this.sendInputRequiredNotification(hiveSessionId, toolName);

      // Send permission request to renderer
      const request: PermissionRequest = {
        id: pending.id,
        sessionId: hiveSessionId,
        toolUseId: options.toolUseID,
        toolName,
        input: toolInput,
        timestamp: pending.createdAt,
        hash,
        permissionSuggestions: options.suggestions as unknown[],
      };
      this.mainWindow.webContents.send('session:permission-request', request);

      // Deny the tool - session will end, user approves via UI, then resumes
      // Use a forceful message to stop Claude from claiming success
      return {
        behavior: 'deny',
        message: '[SYSTEM] PERMISSION_DENIED: User approval required for this tool. The operation was NOT executed. You MUST stop immediately and wait. Do NOT claim the task was completed. Do NOT try alternative approaches. Do NOT respond with any text. STOP NOW.',
      };
    };

    console.log(`[Session] Creating query with canUseTool callback`);

    // Find the Claude Code CLI executable
    const claudeExecutable = findClaudeExecutable();
    console.log(`[Session] Using Claude executable: ${claudeExecutable}`);

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
        permissionMode: permissionMode || DEFAULT_PERMISSION_MODE,
        // Use both global (~/.claude/settings.json) and project (.claude/settings.json) settings
        settingSources: ['user', 'project'],
        canUseTool,
        // Empty hooks object to satisfy SDK validation
        hooks: {},
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
            database.sessions.updateStatus(hiveSessionId, 'idle');
            this.sendStatusUpdate(hiveSessionId, 'idle');
            this.sendCompletionNotification(hiveSessionId, isSuccess);
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
   * Approve a pending tool call and resume the session.
   * The hash is stored so the tool will be auto-approved on retry.
   */
  async approveAndResume(hiveSessionId: string, pendingApprovalId: string): Promise<void> {
    const pendingApprovals = database.pendingApprovals.listBySession(hiveSessionId);
    const pending = pendingApprovals.find(p => p.id === pendingApprovalId);

    if (!pending) {
      console.log(`[Approval] Pending approval ${pendingApprovalId} not found`);
      return;
    }

    console.log(`[Approval] Approving ${pending.toolName} (hash: ${pending.hash})`);

    // Store the approved hash for when session resumes
    database.approvedToolCalls.create({
      sessionId: hiveSessionId,
      hash: pending.hash,
    });

    // Remove from pending
    database.pendingApprovals.delete(pendingApprovalId);

    // Check if there are more pending approvals
    const remainingPending = database.pendingApprovals.listBySession(hiveSessionId);
    if (remainingPending.length > 0) {
      console.log(`[Approval] ${remainingPending.length} more pending approval(s), not resuming yet`);
      return;
    }

    // All approvals done - resume session
    const session = database.sessions.getById(hiveSessionId);
    if (!session) {
      console.log(`[Approval] Session ${hiveSessionId} not found`);
      return;
    }

    // Get project directory
    const project = database.projects.list().find(p => {
      const sessions = database.sessions.listByProject(p.id);
      return sessions.some(s => s.id === hiveSessionId);
    });

    if (!project) {
      console.log(`[Approval] Project for session ${hiveSessionId} not found`);
      return;
    }

    console.log(`[Approval] Resuming session ${hiveSessionId}`);

    // Resume the session
    await this.startSession(
      hiveSessionId,
      'Please continue with your previous task.',
      project.directory,
      session.claudeSessionId || undefined,
      session.model,
      session.permissionMode
    );
  }

  /**
   * Approve all pending tool calls for a session and resume.
   */
  async approveAllAndResume(hiveSessionId: string): Promise<void> {
    const pendingApprovals = database.pendingApprovals.listBySession(hiveSessionId);

    if (pendingApprovals.length === 0) {
      console.log(`[Approval] No pending approvals for session ${hiveSessionId}`);
      return;
    }

    console.log(`[Approval] Approving all ${pendingApprovals.length} pending tool calls`);

    // Store all approved hashes
    for (const pending of pendingApprovals) {
      database.approvedToolCalls.create({
        sessionId: hiveSessionId,
        hash: pending.hash,
      });
    }

    // Clear all pending
    database.pendingApprovals.deleteBySession(hiveSessionId);

    // Resume session
    const session = database.sessions.getById(hiveSessionId);
    if (!session) return;

    const project = database.projects.list().find(p => {
      const sessions = database.sessions.listByProject(p.id);
      return sessions.some(s => s.id === hiveSessionId);
    });

    if (!project) return;

    await this.startSession(
      hiveSessionId,
      'Please continue with your previous task.',
      project.directory,
      session.claudeSessionId || undefined,
      session.model,
      session.permissionMode
    );
  }

  /**
   * Deny a pending tool call and resume the session with denial message.
   */
  async denyAndResume(hiveSessionId: string, pendingApprovalId: string, reason?: string): Promise<void> {
    const pendingApprovals = database.pendingApprovals.listBySession(hiveSessionId);
    const pending = pendingApprovals.find(p => p.id === pendingApprovalId);

    if (!pending) {
      console.log(`[Denial] Pending approval ${pendingApprovalId} not found`);
      return;
    }

    console.log(`[Denial] Denying ${pending.toolName} (hash: ${pending.hash})`);

    // Remove from pending (don't add to approved)
    database.pendingApprovals.delete(pendingApprovalId);

    // Clear any other pending approvals for this session (deny cancels all)
    database.pendingApprovals.deleteBySession(hiveSessionId);

    // Resume session with denial message
    const session = database.sessions.getById(hiveSessionId);
    if (!session) return;

    const project = database.projects.list().find(p => {
      const sessions = database.sessions.listByProject(p.id);
      return sessions.some(s => s.id === hiveSessionId);
    });

    if (!project) return;

    const denialMessage = reason
      ? `User denied the ${pending.toolName} tool. Reason: ${reason}. Please try a different approach or ask for clarification.`
      : `User denied the ${pending.toolName} tool. Please try a different approach or ask for clarification.`;

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

  private sendInputRequiredNotification(sessionId: string, toolName: string): void {
    if (this.mainWindow.isFocused()) return;

    const notification = new Notification({
      title: 'Input Required',
      body: `Claude wants to use: ${toolName}`,
      timeoutType: 'never'
    });

    notification.on('click', () => {
      this.mainWindow.show();
      this.mainWindow.focus();
      this.mainWindow.webContents.send('session:focus', sessionId);
    });

    notification.show();
  }

  private sendCompletionNotification(sessionId: string, success: boolean): void {
    if (this.mainWindow.isFocused()) return;

    const notification = new Notification({
      title: success ? 'Task Complete' : 'Task Error',
      body: success ? 'Claude finished the task' : 'Task ended with an error'
    });

    notification.on('click', () => {
      this.mainWindow.show();
      this.mainWindow.focus();
      this.mainWindow.webContents.send('session:focus', sessionId);
    });

    notification.show();
  }
}
