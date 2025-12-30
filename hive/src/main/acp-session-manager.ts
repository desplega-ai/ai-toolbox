import * as acp from '@agentclientprotocol/sdk';
import { spawn, type ChildProcess } from 'child_process';
import { Readable, Writable } from 'stream';
import { BrowserWindow, Notification, app } from 'electron';
import path from 'path';
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { getAuthEnvironment } from './auth-manager';
import { getPreferences } from './preferences';
import { database } from './database';
import type { Session, PermissionMode } from '../shared/types';
import { DEFAULT_PERMISSION_MODE } from '../shared/types';
import type { SDKMessage, SDKAssistantMessage, SDKUserMessage, SDKResultMessage, SDKInitMessage, PermissionRequest } from '../shared/sdk-types';
import { extractSessionUsage } from './session-history';

// Cache the claude-code-acp executable path
let cachedAcpPath: string | null = null;

function findClaudeAcpExecutable(): string {
  if (cachedAcpPath) return cachedAcpPath;

  // First, try the local node_modules/.bin (from this package's dependencies)
  const localBinPath = path.join(__dirname, '..', '..', 'node_modules', '.bin', 'claude-code-acp');
  if (existsSync(localBinPath)) {
    cachedAcpPath = localBinPath;
    return localBinPath;
  }

  // In development, try the workspace root
  const devBinPath = path.join(process.cwd(), 'node_modules', '.bin', 'claude-code-acp');
  if (existsSync(devBinPath)) {
    cachedAcpPath = devBinPath;
    return devBinPath;
  }

  // Try global installation via which
  try {
    const result = execSync('which claude-code-acp', { encoding: 'utf-8', timeout: 5000 }).trim();
    if (result && existsSync(result)) {
      cachedAcpPath = result;
      return result;
    }
  } catch {
    // Not found globally
  }

  throw new Error('claude-code-acp not found. Please ensure @zed-industries/claude-code-acp is installed.');
}

interface ActiveSession {
  process: ChildProcess;
  connection: acp.ClientSideConnection;
  sessionId: string; // ACP session ID
  hiveSessionId: string;
  permissionMode: PermissionMode;
  turnCount: number; // Track turns per session for stats
}

// Resolver for pending permission requests
type PermissionResolver = (outcome: acp.RequestPermissionResponse) => void;
const pendingResolvers = new Map<string, PermissionResolver>();

// Store options for each permission request to find the right optionId
const pendingOptions = new Map<string, acp.PermissionOption[]>();

export function resolvePermission(toolCallId: string, outcome: 'allow' | 'deny'): boolean {
  const resolver = pendingResolvers.get(toolCallId);
  const options = pendingOptions.get(toolCallId);

  if (resolver && options) {
    // Find the appropriate optionId based on the outcome
    const optionKind = outcome === 'allow' ? 'allow_once' : 'reject_once';
    const option = options.find(o => o.kind === optionKind) || options[0];

    if (outcome === 'allow') {
      resolver({
        outcome: {
          outcome: 'selected',
          optionId: option?.optionId || 'allow',
        },
      });
    } else {
      // For deny, use reject_once option or return cancelled
      const rejectOption = options.find(o => o.kind === 'reject_once' || o.kind === 'reject_always');
      if (rejectOption) {
        resolver({
          outcome: {
            outcome: 'selected',
            optionId: rejectOption.optionId,
          },
        });
      } else {
        resolver({
          outcome: { outcome: 'cancelled' },
        });
      }
    }

    pendingResolvers.delete(toolCallId);
    pendingOptions.delete(toolCallId);
    return true;
  }
  return false;
}

// AskUserQuestion types and resolvers
export interface AskUserQuestionOption {
  label: string;
  description?: string;
}

export interface AskUserQuestion {
  question: string;
  header?: string;
  options: AskUserQuestionOption[];
  multiSelect?: boolean;
}

export interface AskUserQuestionRequest {
  id: string;
  sessionId: string;
  toolCallId: string;
  questions: AskUserQuestion[];
}

type QuestionResolver = (answers: Record<string, string | string[]>) => void;
const pendingQuestionResolvers = new Map<string, QuestionResolver>();

export function resolveQuestion(toolCallId: string, answers: Record<string, string | string[]>): boolean {
  const resolver = pendingQuestionResolvers.get(toolCallId);
  if (resolver) {
    resolver(answers);
    pendingQuestionResolvers.delete(toolCallId);
    return true;
  }
  return false;
}

export class ACPSessionManager {
  private activeSessions = new Map<string, ActiveSession>();
  private mainWindow: BrowserWindow;
  // Track accumulated streaming text per session for finalization
  private streamingTextBySession = new Map<string, string>();

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow;
  }

  private spawnClaudeProcess(cwd: string): ChildProcess {
    const acpPath = findClaudeAcpExecutable();
    const env = getAuthEnvironment();

    return spawn(acpPath, [], {
      cwd,
      stdio: ['pipe', 'pipe', 'inherit'],
      env: { ...process.env, ...env },
    });
  }

  private createClient(hiveSessionId: string, permissionMode: PermissionMode): acp.Client {
    return {
      requestPermission: async (params: acp.RequestPermissionRequest): Promise<acp.RequestPermissionResponse> => {
        const toolCall = params.toolCall;
        const toolName = toolCall.title || 'Unknown Tool';
        const toolInput = toolCall.rawInput as Record<string, unknown> || {};
        const toolCallId = toolCall.toolCallId;

        // Check permission mode
        if (permissionMode === 'bypassPermissions') {
          // Find allow_once option
          const allowOption = params.options.find(o => o.kind === 'allow_once');
          return {
            outcome: {
              outcome: 'selected',
              optionId: allowOption?.optionId || params.options[0]?.optionId || 'allow'
            }
          };
        }

        // Accept edits mode: auto-approve Write, Edit, NotebookEdit
        if (permissionMode === 'acceptEdits') {
          const editTools = ['Write', 'Edit', 'NotebookEdit'];
          if (editTools.includes(toolName)) {
            const allowOption = params.options.find(o => o.kind === 'allow_once');
            return {
              outcome: {
                outcome: 'selected',
                optionId: allowOption?.optionId || params.options[0]?.optionId || 'allow'
              }
            };
          }
        }

        // Handle AskUserQuestion tool - show question UI instead of tool approval
        const askUserQuestion = (params._meta as { askUserQuestion?: { questions: AskUserQuestion[] } } | undefined)?.askUserQuestion;
        if (askUserQuestion && askUserQuestion.questions) {
          database.sessions.updateStatus(hiveSessionId, 'waiting');
          this.sendStatusUpdate(hiveSessionId, 'waiting');

          // Send question request to renderer
          const questionRequest: AskUserQuestionRequest = {
            id: `question_${toolCallId}`,
            sessionId: hiveSessionId,
            toolCallId,
            questions: askUserQuestion.questions,
          };

          if (!this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send('session:question-request', questionRequest);
          }

          this.sendQuestionNotification(hiveSessionId, askUserQuestion.questions);

          // Wait for user answers
          return new Promise((resolve) => {
            pendingQuestionResolvers.set(toolCallId, (answers) => {
              // Return with answers in _meta
              const allowOption = params.options.find(o => o.kind === 'allow_once');
              resolve({
                outcome: {
                  outcome: 'selected',
                  optionId: allowOption?.optionId || params.options[0]?.optionId || 'allow',
                },
                _meta: { answers },
              } as acp.RequestPermissionResponse);

              // Update status back to running
              database.sessions.updateStatus(hiveSessionId, 'running');
              this.sendStatusUpdate(hiveSessionId, 'running');
            });
          });
        }

        // Default mode: require approval
        // Store pending and notify renderer
        const pending = database.pendingApprovals.create({
          sessionId: hiveSessionId,
          toolUseId: toolCallId,
          toolName,
          toolInput,
          hash: `${toolName}:${toolCallId}`,
        });

        database.sessions.updateStatus(hiveSessionId, 'waiting');
        this.sendStatusUpdate(hiveSessionId, 'waiting');

        // Send permission request to renderer
        const request: PermissionRequest = {
          id: pending.id,
          sessionId: hiveSessionId,
          toolUseId: toolCallId,
          toolName,
          input: toolInput,
          timestamp: pending.createdAt,
          hash: pending.hash,
        };

        if (!this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.send('session:permission-request', request);
        }

        this.sendInputRequiredNotification(hiveSessionId, toolName, toolInput);

        // Store options for when user responds
        pendingOptions.set(toolCallId, params.options);

        // Wait for user decision
        return new Promise((resolve) => {
          pendingResolvers.set(toolCallId, resolve);
        });
      },

      sessionUpdate: async (notification: acp.SessionNotification): Promise<void> => {
        // Convert ACP updates to SDK message format and forward to renderer
        this.handleSessionUpdate(hiveSessionId, notification);
      },
    };
  }

  private handleSessionUpdate(hiveSessionId: string, notification: acp.SessionNotification): void {
    const update = notification.update;
    const sessionUpdateType = (update as { sessionUpdate: string }).sessionUpdate;

    // Convert ACP update types to SDK message format
    switch (sessionUpdateType) {
      case 'agent_message_chunk': {
        // Streaming text - send as stream event and accumulate for finalization
        const chunk = update as acp.ContentChunk & { sessionUpdate: string };
        if (chunk.content && chunk.content.type === 'text') {
          const text = (chunk.content as { text: string }).text;
          this.sendStreamEvent(hiveSessionId, text);
          // Accumulate for final message
          const current = this.streamingTextBySession.get(hiveSessionId) || '';
          this.streamingTextBySession.set(hiveSessionId, current + text);
        }
        break;
      }

      case 'tool_call': {
        // Tool use started - create assistant message with tool_use
        const toolUpdate = update as acp.ToolCall & { sessionUpdate: string };
        const message: SDKAssistantMessage = {
          type: 'assistant',
          uuid: toolUpdate.toolCallId,
          session_id: notification.sessionId,
          message: {
            role: 'assistant',
            content: [{
              type: 'tool_use',
              id: toolUpdate.toolCallId,
              name: toolUpdate.title || 'unknown',
              input: toolUpdate.rawInput,
            }],
          },
        };
        this.sendMessage(hiveSessionId, message);
        break;
      }

      case 'tool_call_update': {
        // Tool result - create user message with tool_result if completed
        const toolUpdate = update as acp.ToolCallUpdate & { sessionUpdate: string };
        if (toolUpdate.status === 'completed' && toolUpdate.content) {
          // Convert content array to string
          const contentStr = toolUpdate.content.map(c => {
            if (c.type === 'content' && 'content' in c) {
              const innerContent = (c as { content?: { type: string; text?: string } }).content;
              if (innerContent?.type === 'text') {
                return innerContent.text || '';
              }
            }
            return '';
          }).join('\n');

          const message: SDKUserMessage = {
            type: 'user',
            session_id: notification.sessionId,
            message: {
              role: 'user',
              content: [{
                type: 'tool_result',
                tool_use_id: toolUpdate.toolCallId,
                content: contentStr || toolUpdate.rawOutput,
                is_error: false,
              }],
            },
          };
          this.sendMessage(hiveSessionId, message);
        }
        break;
      }

      case 'current_mode_update': {
        // Mode change (e.g., plan mode) - we can log it
        const modeUpdate = update as { mode?: string; sessionUpdate: string };
        console.log(`[ACP] Mode update: ${modeUpdate.mode}`);
        break;
      }

      case 'available_commands_update': {
        // Available commands changed - we don't need to do anything with this
        break;
      }

      default: {
        // Log unknown update types for debugging
        console.log(`[ACP] Unknown session update type: ${sessionUpdateType}`, update);
      }
    }
  }

  async startSession(
    hiveSessionId: string,
    prompt: string,
    cwd: string,
    existingClaudeSessionId?: string,
    model?: string,
    permissionMode?: PermissionMode
  ): Promise<void> {
    database.sessions.updateStatus(hiveSessionId, 'running');
    this.sendStatusUpdate(hiveSessionId, 'running');

    const effectivePermissionMode = permissionMode || DEFAULT_PERMISSION_MODE;

    // Auto-update session name from first prompt (only for brand new sessions)
    const session = database.sessions.getById(hiveSessionId);
    if (session && /^Session \d+$/.test(session.name) && !existingClaudeSessionId) {
      const trimmed = prompt.trim();
      if (trimmed.length > 0) {
        const newName = trimmed.length <= 50 ? trimmed : trimmed.slice(0, 50) + '...';
        database.sessions.updateName(hiveSessionId, newName);
        this.sendNameUpdate(hiveSessionId, newName);
      }
    }

    // Check if we have an active session we can reuse (for follow-ups)
    const existingActive = this.activeSessions.get(hiveSessionId);
    if (existingActive) {
      console.log('[ACP] Reusing existing connection for follow-up');
      // Clear any accumulated streaming text from previous turn
      this.streamingTextBySession.delete(hiveSessionId);

      // Track timing and increment turn count
      const promptStartTime = Date.now();
      existingActive.turnCount++;

      try {
        const response = await existingActive.connection.prompt({
          sessionId: existingActive.sessionId,
          prompt: [{ type: 'text', text: prompt }],
        });

        // Finalize streaming text into a proper message
        this.finalizeStreamingText(hiveSessionId, existingActive.sessionId);

        // Extract usage from JSONL transcript
        const usageData = await extractSessionUsage(cwd, existingActive.sessionId);

        const resultMessage: SDKResultMessage = {
          type: 'result',
          subtype: response.stopReason === 'end_turn' ? 'success' : 'error_during_execution',
          session_id: existingActive.sessionId,
          result: response.stopReason === 'end_turn' ? 'Completed' : `Stopped: ${response.stopReason}`,
          timestamp: new Date().toISOString(),
          duration_ms: Date.now() - promptStartTime,
          num_turns: existingActive.turnCount,
          usage: usageData?.usage,
          modelUsage: usageData?.modelUsage,
        };
        this.sendMessage(hiveSessionId, resultMessage);

        // Persist result to database for analytics and history
        database.sessionResults.insert({
          sessionId: hiveSessionId,
          claudeSessionId: existingActive.sessionId,
          subtype: resultMessage.subtype,
          timestamp: resultMessage.timestamp,
          result: resultMessage.result,
          durationMs: resultMessage.duration_ms,
          numTurns: resultMessage.num_turns,
          usage: resultMessage.usage,
        });

        const pendingApprovals = database.pendingApprovals.listBySession(hiveSessionId);
        if (pendingApprovals.length > 0) {
          database.sessions.updateStatus(hiveSessionId, 'waiting');
          this.sendStatusUpdate(hiveSessionId, 'waiting');
        } else {
          database.sessions.updateStatus(hiveSessionId, 'idle');
          this.sendStatusUpdate(hiveSessionId, 'idle');
          this.sendCompletionNotification(hiveSessionId, response.stopReason === 'end_turn');
        }
      } catch (error) {
        console.error('[ACP] Follow-up prompt error:', error);
        // Clear the dead session so next attempt creates fresh connection
        this.activeSessions.delete(hiveSessionId);
        this.streamingTextBySession.delete(hiveSessionId);
        database.sessions.updateStatus(hiveSessionId, 'error');
        this.sendStatusUpdate(hiveSessionId, 'error');
      }
      return;
    }

    // Clear any stale streaming text
    this.streamingTextBySession.delete(hiveSessionId);

    // Spawn claude --acp subprocess
    const claudeProcess = this.spawnClaudeProcess(cwd);

    claudeProcess.on('error', (err) => {
      console.error('[ACP] Process error:', err);
      database.sessions.updateStatus(hiveSessionId, 'error');
      this.sendStatusUpdate(hiveSessionId, 'error');
    });

    claudeProcess.on('exit', (code) => {
      console.log(`[ACP] Process exited with code ${code}`);
      this.activeSessions.delete(hiveSessionId);
      this.streamingTextBySession.delete(hiveSessionId);
    });

    // Create ACP connection
    const stdin = claudeProcess.stdin;
    const stdout = claudeProcess.stdout;

    if (!stdin || !stdout) {
      throw new Error('Failed to create stdio streams for claude process');
    }

    const input = Writable.toWeb(stdin) as WritableStream<Uint8Array>;
    const output = Readable.toWeb(stdout) as ReadableStream<Uint8Array>;
    const stream = acp.ndJsonStream(input, output);

    const client = this.createClient(hiveSessionId, effectivePermissionMode);
    const connection = new acp.ClientSideConnection((_agent) => client, stream);

    // Initialize connection
    await connection.initialize({
      protocolVersion: acp.PROTOCOL_VERSION,
      clientInfo: {
        name: 'Hive',
        version: app.getVersion(),
      },
      clientCapabilities: {
        // Let claude handle file ops directly
        _meta: {
          askUserQuestion: true, // Enable AskUserQuestion tool support
        },
      },
    });

    // Create or resume session
    let acpSessionId: string;

    if (existingClaudeSessionId) {
      // Try to resume existing session, fall back to new if not supported
      try {
        await connection.loadSession({
          sessionId: existingClaudeSessionId,
          cwd,
          mcpServers: [],
        });
        // If loadSession succeeds, use the session ID we passed in
        acpSessionId = existingClaudeSessionId;
        console.log(`[ACP] Resumed session: ${acpSessionId}`);
      } catch (loadError) {
        // session/load not supported - create new session instead
        console.log('[ACP] Session resume not supported, creating new session');
        const newSessionResponse = await connection.newSession({
          cwd,
          mcpServers: [],
        });
        acpSessionId = newSessionResponse.sessionId;
        database.sessions.updateClaudeSessionId(hiveSessionId, acpSessionId);
      }
    } else {
      // Create new session
      const newSessionResponse = await connection.newSession({
        cwd,
        mcpServers: [],
      });
      acpSessionId = newSessionResponse.sessionId;

      // Store the ACP session ID
      database.sessions.updateClaudeSessionId(hiveSessionId, acpSessionId);

      // Send init message to renderer
      const initMessage: SDKInitMessage = {
        type: 'system',
        subtype: 'init',
        session_id: acpSessionId,
        model: model || 'claude-sonnet-4-20250514',
        tools: [],
        apiKeySource: 'user',
      };
      this.sendMessage(hiveSessionId, initMessage);
    }

    const activeSession: ActiveSession = {
      process: claudeProcess,
      connection,
      sessionId: acpSessionId,
      hiveSessionId,
      permissionMode: effectivePermissionMode,
      turnCount: 1,
    };
    this.activeSessions.set(hiveSessionId, activeSession);

    // Track timing for stats
    const promptStartTime = Date.now();

    try {
      // Send the prompt
      const response = await connection.prompt({
        sessionId: acpSessionId,
        prompt: [{ type: 'text', text: prompt }],
      });

      // Finalize streaming text into a proper assistant message
      this.finalizeStreamingText(hiveSessionId, acpSessionId);

      // Extract usage from JSONL transcript
      const usageData = await extractSessionUsage(cwd, acpSessionId);

      // Session completed
      const resultMessage: SDKResultMessage = {
        type: 'result',
        subtype: response.stopReason === 'end_turn' ? 'success' : 'error_during_execution',
        session_id: acpSessionId,
        result: response.stopReason === 'end_turn' ? 'Completed' : `Stopped: ${response.stopReason}`,
        timestamp: new Date().toISOString(),
        duration_ms: Date.now() - promptStartTime,
        num_turns: 1,
        usage: usageData?.usage,
        modelUsage: usageData?.modelUsage,
      };
      this.sendMessage(hiveSessionId, resultMessage);

      // Persist result to database for analytics and history
      database.sessionResults.insert({
        sessionId: hiveSessionId,
        claudeSessionId: acpSessionId,
        subtype: resultMessage.subtype,
        timestamp: resultMessage.timestamp,
        result: resultMessage.result,
        durationMs: resultMessage.duration_ms,
        numTurns: resultMessage.num_turns,
        usage: resultMessage.usage,
      });

      // Update status
      const pendingApprovals = database.pendingApprovals.listBySession(hiveSessionId);
      if (pendingApprovals.length > 0) {
        database.sessions.updateStatus(hiveSessionId, 'waiting');
        this.sendStatusUpdate(hiveSessionId, 'waiting');
      } else {
        database.sessions.updateStatus(hiveSessionId, 'idle');
        this.sendStatusUpdate(hiveSessionId, 'idle');
        this.sendCompletionNotification(hiveSessionId, response.stopReason === 'end_turn');
      }
    } catch (error) {
      console.error('[ACP] Prompt error:', error);
      database.sessions.updateStatus(hiveSessionId, 'error');
      this.sendStatusUpdate(hiveSessionId, 'error');
    }
  }

  // Finalize accumulated streaming text into a proper assistant message
  private finalizeStreamingText(hiveSessionId: string, acpSessionId: string): void {
    const accumulatedText = this.streamingTextBySession.get(hiveSessionId);
    if (accumulatedText && accumulatedText.trim()) {
      // Send final assistant message with the accumulated text
      const assistantMessage: SDKAssistantMessage = {
        type: 'assistant',
        uuid: `final-${Date.now()}`,
        session_id: acpSessionId,
        message: {
          role: 'assistant',
          content: [{
            type: 'text',
            text: accumulatedText,
          }],
        },
      };
      this.sendMessage(hiveSessionId, assistantMessage);
    }
    // Clear the accumulated text
    this.streamingTextBySession.delete(hiveSessionId);
    // Tell renderer to clear streaming text display
    this.sendClearStreamingText(hiveSessionId);
  }

  async interruptSession(hiveSessionId: string): Promise<void> {
    const active = this.activeSessions.get(hiveSessionId);
    if (active) {
      // Send cancel notification
      await active.connection.cancel({ sessionId: active.sessionId });

      // Send interrupted result
      this.sendMessage(hiveSessionId, {
        type: 'result',
        subtype: 'interrupted',
        session_id: active.sessionId,
        result: 'Session interrupted by user',
      } as SDKMessage);

      database.sessions.updateStatus(hiveSessionId, 'idle');
      this.sendStatusUpdate(hiveSessionId, 'idle');
    }
  }

  async approveAndResume(hiveSessionId: string, pendingApprovalId: string): Promise<void> {
    const pending = database.pendingApprovals.listBySession(hiveSessionId)
      .find(p => p.id === pendingApprovalId);

    if (!pending) return;

    // Store approval for potential sub-agent reuse
    database.approvedToolCalls.create({
      sessionId: hiveSessionId,
      hash: pending.hash,
      toolName: pending.toolName,
    });

    database.pendingApprovals.delete(pendingApprovalId);

    // Resolve the permission promise
    const resolved = resolvePermission(pending.toolUseId, 'allow');

    if (resolved) {
      const remaining = database.pendingApprovals.listBySession(hiveSessionId);
      if (remaining.length === 0) {
        database.sessions.updateStatus(hiveSessionId, 'running');
        this.sendStatusUpdate(hiveSessionId, 'running');
      }
    }
  }

  async approveAllAndResume(hiveSessionId: string): Promise<void> {
    const pendingApprovals = database.pendingApprovals.listBySession(hiveSessionId);

    for (const pending of pendingApprovals) {
      database.approvedToolCalls.create({
        sessionId: hiveSessionId,
        hash: pending.hash,
        toolName: pending.toolName,
      });
      resolvePermission(pending.toolUseId, 'allow');
    }

    database.pendingApprovals.deleteBySession(hiveSessionId);
    database.sessions.updateStatus(hiveSessionId, 'running');
    this.sendStatusUpdate(hiveSessionId, 'running');
  }

  async denyAndResume(hiveSessionId: string, pendingApprovalId: string, _reason?: string): Promise<void> {
    const pending = database.pendingApprovals.listBySession(hiveSessionId)
      .find(p => p.id === pendingApprovalId);

    if (!pending) return;

    // Resolve with deny
    resolvePermission(pending.toolUseId, 'deny');

    // Also deny all other pending
    const remaining = database.pendingApprovals.listBySession(hiveSessionId);
    for (const other of remaining) {
      resolvePermission(other.toolUseId, 'deny');
    }

    database.pendingApprovals.deleteBySession(hiveSessionId);
    database.sessions.updateStatus(hiveSessionId, 'running');
    this.sendStatusUpdate(hiveSessionId, 'running');
  }

  getPendingApprovals(hiveSessionId: string) {
    return database.pendingApprovals.listBySession(hiveSessionId);
  }

  clearPendingApprovals(hiveSessionId: string): void {
    database.pendingApprovals.deleteBySession(hiveSessionId);
    database.approvedToolCalls.deleteBySession(hiveSessionId);
  }

  // IPC message helpers
  private sendMessage(sessionId: string, message: SDKMessage): void {
    if (!this.mainWindow.isDestroyed()) {
      // Ensure message has a timestamp for proper ordering
      const messageWithTimestamp = (message as { timestamp?: string }).timestamp
        ? message
        : { ...message, timestamp: new Date().toISOString() };
      this.mainWindow.webContents.send('session:message', { sessionId, message: messageWithTimestamp });
    }
  }

  private sendStreamEvent(sessionId: string, text: string): void {
    if (!this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('session:stream', { sessionId, text });
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

  private sendClearStreamingText(sessionId: string): void {
    if (!this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('session:clear-stream', { sessionId });
    }
  }

  // Notification helpers (same as current implementation)
  private getSessionContext(sessionId: string): { sessionName: string; projectName: string } | null {
    const session = database.sessions.getById(sessionId);
    if (!session) return null;
    const project = database.projects.list().find(p => p.id === session.projectId);
    return {
      sessionName: session.name,
      projectName: project?.name || 'Unknown Project'
    };
  }

  private getNotificationIcon(): string {
    const isDev = !app.isPackaged;
    if (isDev) {
      return path.join(process.cwd(), 'resources', 'icon.png');
    }
    return path.join(process.resourcesPath, 'icon.png');
  }

  private formatNotificationTitle(context: { sessionName: string; projectName: string } | null, fallback: string): string {
    if (!context) return fallback;
    const sessionTrimmed = context.sessionName.length > 20
      ? context.sessionName.slice(0, 20) + '...'
      : context.sessionName;
    const projectTrimmed = context.projectName.length > 15
      ? context.projectName.slice(0, 15) + '...'
      : context.projectName;
    return `${sessionTrimmed} (${projectTrimmed})`;
  }

  private sendInputRequiredNotification(sessionId: string, toolName: string, _toolInput: Record<string, unknown>): void {
    const prefs = getPreferences();
    if (!prefs.notifications.inputRequired) return;

    const context = this.getSessionContext(sessionId);
    const title = this.formatNotificationTitle(context, 'Permission Required');
    const body = `Wants to use: ${toolName}`;

    if (this.mainWindow.isFocused()) {
      if (!this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('notification:show', {
          type: 'permission',
          sessionId,
          sessionName: context?.sessionName || 'Unknown Session',
          title,
          body,
        });
      }
    } else {
      const notification = new Notification({
        title,
        body,
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
  }

  private sendQuestionNotification(sessionId: string, questions: AskUserQuestion[]): void {
    const prefs = getPreferences();
    if (!prefs.notifications.inputRequired) return;

    const context = this.getSessionContext(sessionId);
    const title = this.formatNotificationTitle(context, 'Question');
    const firstQuestion = questions[0];
    const body = firstQuestion?.header || firstQuestion?.question || 'Claude has a question';

    if (this.mainWindow.isFocused()) {
      if (!this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('notification:show', {
          type: 'question',
          sessionId,
          sessionName: context?.sessionName || 'Unknown Session',
          title,
          body,
        });
      }
    } else {
      const notification = new Notification({
        title,
        body,
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
  }

  private sendCompletionNotification(sessionId: string, success: boolean, resultText?: string): void {
    const prefs = getPreferences();
    if (!prefs.notifications.sessionComplete) return;

    const context = this.getSessionContext(sessionId);
    const title = this.formatNotificationTitle(context, success ? 'Task Complete' : 'Task Error');
    const body = success ? 'Finished successfully' : (resultText || 'Ended with an error');

    if (this.mainWindow.isFocused()) {
      if (!this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('notification:show', {
          type: success ? 'success' : 'error',
          sessionId,
          sessionName: context?.sessionName || 'Unknown Session',
          title,
          body,
        });
      }
    } else {
      const notification = new Notification({
        title,
        body,
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
}
