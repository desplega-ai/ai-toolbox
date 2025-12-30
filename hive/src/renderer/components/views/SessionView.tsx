import React from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { Loader2, CheckCircle, Archive, Terminal, Copy, Check, ExternalLink, FolderOpen, Shield, ShieldAlert, Edit3, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MessageList, type SubmittedQuestion } from '@/components/session/MessageList';
import { MessageInput } from '@/components/session/MessageInput';
import { FileViewerPane } from '@/components/session/FileViewerPane';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Select } from '@/components/ui/select';
import { useSessionMessagesStore, useFileViewerStore } from '@/lib/store';
import { useTabContext } from '@/components/layout/MainLayout';
import { ThoughtsPane } from '@/components/thoughts/ThoughtsPane';
import { DiffTab, type DiffStats } from '@/components/session/DiffTab';
import { useBuildFileIndex, useLoadCommands, useLoadAgents } from '@/lib/autocomplete-store';
import type { Session, ClaudeModel, PermissionMode, PermissionDuration } from '../../../shared/types';
import { CLAUDE_MODELS, PERMISSION_MODES, DEFAULT_PERMISSION_MODE } from '../../../shared/types';
import type { SDKMessage, PermissionRequest, SDKStreamEvent, SDKResultMessage, AskUserQuestionRequest } from '../../../shared/sdk-types';
import { PermissionModeModal } from './PermissionModeModal';
import { DeleteSessionModal } from './DeleteSessionModal';

// Stable empty array to avoid infinite re-renders
const EMPTY_MESSAGES: SDKMessage[] = [];
const EMPTY_PERMISSIONS: PermissionRequest[] = [];

// Helper to get permission mode icon
function getPermissionIcon(mode: PermissionMode): React.ReactNode {
  switch (mode) {
    case 'bypassPermissions':
      return <ShieldAlert className="h-3.5 w-3.5 text-amber-500" />;
    case 'acceptEdits':
      return <Edit3 className="h-3.5 w-3.5 text-blue-500" />;
    default:
      return <Shield className="h-3.5 w-3.5" />;
  }
}

// Context Usage Computation
const DEFAULT_CONTEXT_WINDOW = 200000; // 200k default
const ESTIMATED_SYSTEM_TOKENS = 21000; // System prompt + tools + MCP overhead

interface ContextUsage {
  current: number;      // Conversation tokens
  system: number;       // Estimated system overhead
  max: number;
}

function computeContextUsage(messages: SDKMessage[]): ContextUsage {
  let current = 0;
  let max = DEFAULT_CONTEXT_WINDOW;

  for (const msg of messages) {
    // Sum all tokens from result messages (includes input, output, cache read/write)
    if (msg.type === 'result') {
      const resultMsg = msg as SDKResultMessage;

      // Add input + output tokens (cache tokens are already included in input_tokens)
      if (resultMsg.usage) {
        current += resultMsg.usage.input_tokens || 0;
        current += resultMsg.usage.output_tokens || 0;
      }

      // Get contextWindow from modelUsage if available
      if (resultMsg.modelUsage) {
        const models = Object.values(resultMsg.modelUsage);
        if (models.length > 0 && models[0].contextWindow > 0) {
          max = models[0].contextWindow;
        }
      }
    }
  }

  return { current, system: ESTIMATED_SYSTEM_TOKENS, max };
}

// Context Usage Bar Component
function ContextUsageBar({ current, system, max }: ContextUsage) {
  // Don't show if no usage yet
  if (current === 0) return null;

  const total = current + system;
  const systemPercent = (system / max) * 100;
  const conversationPercent = (current / max) * 100;
  const totalPercent = (total / max) * 100;

  const formatNum = (n: number): string => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(0)}k`;
    return String(n);
  };

  return (
    <div className="px-4 pb-2 flex items-center gap-2 text-xs text-[var(--foreground-muted)]">
      <span>Context:</span>
      <div className="flex-1 h-1.5 bg-[var(--border)] overflow-hidden max-w-48 flex">
        {/* System tokens segment (muted) */}
        <div
          className="h-full bg-[var(--foreground-muted)]/30 transition-all duration-300"
          style={{ width: `${Math.min(systemPercent, 100)}%` }}
        />
        {/* Conversation tokens segment */}
        <div
          className={cn(
            "h-full transition-all duration-300",
            totalPercent >= 90 ? "bg-red-500" : totalPercent >= 70 ? "bg-amber-500" : "bg-[var(--primary)]"
          )}
          style={{ width: `${Math.min(conversationPercent, 100 - systemPercent)}%` }}
        />
      </div>
      <span className="font-mono">
        <span className="opacity-60">{formatNum(system)}</span> + {formatNum(current)} / {formatNum(max)} ({totalPercent.toFixed(1)}%)
      </span>
    </div>
  );
}

interface SessionViewProps {
  session: Session;
  projectId: string;
  projectDirectory: string;
}

type TabId = 'agent' | 'todos' | 'diff' | 'analytics' | 'thoughts' | 'meta';
type Activity = 'idle' | 'connecting' | 'thinking' | 'streaming' | 'tool_use';

export function SessionView({ session, projectId, projectDirectory }: SessionViewProps) {
  // Get activeTab from context (persisted across refreshes)
  const { activeSessionTab, setActiveSessionTab } = useTabContext();
  const activeTab = activeSessionTab as TabId;
  const setActiveTab = setActiveSessionTab;
  const [pendingApprovals, setPendingApprovals] = React.useState<PermissionRequest[]>(EMPTY_PERMISSIONS);
  // Track staged decisions (approve/deny) before submitting all at once
  const [stagedDecisions, setStagedDecisions] = React.useState<Map<string, 'approved' | 'denied'>>(new Map());
  // Track resolved decisions (persists after submission to show outcome)
  const [resolvedDecisions, setResolvedDecisions] = React.useState<Map<string, 'approved' | 'denied'>>(new Map());
  const [isLoadingHistory, setIsLoadingHistory] = React.useState(false);
  // Local status tracking - stays in sync with backend via IPC
  const [localStatus, setLocalStatus] = React.useState<Session['status']>(session.status);
  // Activity state for showing what Claude is currently doing
  const [activity, setActivity] = React.useState<Activity>('idle');
  // Editable session name
  const [isEditingName, setIsEditingName] = React.useState(false);
  const [editedName, setEditedName] = React.useState(session.name);
  // Permission mode modal
  const [showPermissionModal, setShowPermissionModal] = React.useState(false);
  // Delete session modal
  const [showDeleteModal, setShowDeleteModal] = React.useState(false);
  // Current question request from AskUserQuestion tool
  const [currentQuestion, setCurrentQuestion] = React.useState<AskUserQuestionRequest | null>(null);
  // Submitted questions (for showing answered questions collapsed)
  const [submittedQuestions, setSubmittedQuestions] = React.useState<SubmittedQuestion[]>([]);
  // Timer for timed permission modes
  const [timeRemaining, setTimeRemaining] = React.useState<string | null>(null);
  // Diff stats for tab label
  const [diffStats, setDiffStats] = React.useState<DiffStats | null>(null);

  // File viewer store
  const openFile = useFileViewerStore((state) => state.openFile);
  const closeFile = useFileViewerStore((state) => state.closeFile);

  // Load diff stats eagerly on session open
  React.useEffect(() => {
    async function loadDiffStats() {
      try {
        const gitStatus = await window.electronAPI.invoke<{ isRepo: boolean }>('git:get-status', {
          cwd: projectDirectory,
        });
        if (!gitStatus.isRepo) return;

        const changes = await window.electronAPI.invoke<Array<{ additions: number; deletions: number }>>('git:get-changes-since', {
          cwd: projectDirectory,
          timestamp: session.createdAt,
        });

        if (changes.length > 0) {
          setDiffStats({
            additions: changes.reduce((sum, f) => sum + f.additions, 0),
            deletions: changes.reduce((sum, f) => sum + f.deletions, 0),
            fileCount: changes.length,
          });
        }
      } catch (error) {
        console.error('Failed to load diff stats:', error);
      }
    }

    loadDiffStats();
  }, [projectDirectory, session.createdAt]);

  // Sync local status when session prop changes
  React.useEffect(() => {
    setLocalStatus(session.status);
  }, [session.status]);

  // Sync name when session prop changes
  React.useEffect(() => {
    setEditedName(session.name);
  }, [session.name]);

  // Reset activity and load submitted questions when session changes
  React.useEffect(() => {
    setActivity('idle');
    setPendingApprovals(EMPTY_PERMISSIONS);
    setCurrentQuestion(null);

    // Load submitted questions from database
    window.electronAPI.invoke<Array<{
      request: AskUserQuestionRequest;
      answers: Record<string, string | string[]>;
    }>>('session:get-submitted-questions', { sessionId: session.id })
      .then((records) => {
        setSubmittedQuestions(records.map(r => ({
          request: r.request as AskUserQuestionRequest,
          answers: r.answers,
        })));
      })
      .catch((err) => {
        console.error('Failed to load submitted questions:', err);
        setSubmittedQuestions([]);
      });
  }, [session.id]);

  // Load autocomplete data when session opens
  const buildFileIndex = useBuildFileIndex();
  const loadCommands = useLoadCommands();
  const loadAgents = useLoadAgents();

  React.useEffect(() => {
    if (projectDirectory) {
      // Build file index
      buildFileIndex(projectDirectory).then((files) => {
        console.log(`[Autocomplete] Built file index with ${files.length} files`);
      });

      // Load commands from ~/.claude and project
      loadCommands(projectDirectory).then((commands) => {
        console.log(`[Autocomplete] Loaded ${commands.length} commands`);
      });

      // Load agents from ~/.claude and project
      loadAgents(projectDirectory).then((agents) => {
        console.log(`[Autocomplete] Loaded ${agents.length} agents`);
      });
    }
  }, [projectDirectory, buildFileIndex, loadCommands, loadAgents]);

  // Timer countdown for timed permission modes
  const { updateSessionPermissionMode } = useTabContext();
  React.useEffect(() => {
    if (!session.permissionExpiresAt) {
      setTimeRemaining(null);
      return;
    }

    const updateTimer = () => {
      const now = Date.now();
      const remaining = session.permissionExpiresAt! - now;

      if (remaining <= 0) {
        // Timer expired - revert to default
        setTimeRemaining(null);
        handlePermissionModeChange(DEFAULT_PERMISSION_MODE);
        return;
      }

      const minutes = Math.floor(remaining / 60000);
      const seconds = Math.floor((remaining % 60000) / 1000);
      setTimeRemaining(`${minutes}:${seconds.toString().padStart(2, '0')}`);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [session.permissionExpiresAt]);

  const messagesFromStore = useSessionMessagesStore((state) => state.messagesBySession[session.id]);
  const streamingTextFromStore = useSessionMessagesStore((state) => state.streamingTextBySession[session.id]);
  const addMessage = useSessionMessagesStore((state) => state.addMessage);
  const setMessages = useSessionMessagesStore((state) => state.setMessages);
  const appendStreamingText = useSessionMessagesStore((state) => state.appendStreamingText);
  const clearStreamingText = useSessionMessagesStore((state) => state.clearStreamingText);
  const isLoaded = useSessionMessagesStore((state) => state.isLoaded);
  const markLoaded = useSessionMessagesStore((state) => state.markLoaded);

  // Use stable defaults
  const messages = messagesFromStore ?? EMPTY_MESSAGES;
  const streamingText = streamingTextFromStore ?? '';

  // Compute context usage from messages
  const contextUsage = React.useMemo(() => computeContextUsage(messages), [messages]);

  // Load pending approvals from database on mount
  React.useEffect(() => {
    async function loadPendingApprovals() {
      try {
        const approvals = await window.electronAPI.invoke<PermissionRequest[]>('session:get-pending-approvals', {
          sessionId: session.id,
        });
        if (approvals.length > 0) {
          setPendingApprovals(approvals);
        }
      } catch (error) {
        console.error('Failed to load pending approvals:', error);
      }
    }

    loadPendingApprovals();
  }, [session.id]);

  // Load session history from ~/.claude JSONL files on mount
  // Use a ref to check messages without triggering re-runs
  const messagesRef = React.useRef(messages);
  messagesRef.current = messages;

  React.useEffect(() => {
    async function loadHistory() {
      // Skip if already loaded or no claude session ID
      if (isLoaded(session.id) || !session.claudeSessionId) {
        return;
      }

      // Skip if we already have messages in memory (from live session)
      // This prevents overwriting live messages when claudeSessionId gets set
      if (messagesRef.current.length > 0) {
        markLoaded(session.id);
        return;
      }

      setIsLoadingHistory(true);
      try {
        const history = await window.electronAPI.invoke<SDKMessage[]>('session:load-history', {
          directory: projectDirectory,
          claudeSessionId: session.claudeSessionId,
        });

        if (history.length > 0) {
          setMessages(session.id, history);
        }
        markLoaded(session.id);
      } catch (error) {
        console.error('Failed to load session history:', error);
      } finally {
        setIsLoadingHistory(false);
      }
    }

    loadHistory();
  }, [session.id, session.claudeSessionId, projectDirectory, isLoaded, markLoaded, setMessages]);

  const tabs: { id: TabId; label: string; badge?: React.ReactNode }[] = [
    { id: 'agent', label: 'Agent' },
    { id: 'todos', label: 'Todos' },
    {
      id: 'diff', label: 'Diff', badge: diffStats ? (
        <span className="ml-1.5 text-xs">
          <span className="text-[var(--success)]">+{diffStats.additions}</span>
          {' '}
          <span className="text-[var(--destructive)]">-{diffStats.deletions}</span>
        </span>
      ) : null
    },
    { id: 'analytics', label: 'Analytics' },
    { id: 'thoughts', label: 'Thoughts' },
    { id: 'meta', label: 'Meta' },
  ];

  // Subscribe to session events for local UI state (activity indicator, pending approvals)
  // Note: Messages are handled globally in App.tsx to persist across tab switches
  React.useEffect(() => {
    // Track activity state based on message types
    const unsubMessage = window.electronAPI.on('session:message', (data: unknown) => {
      const { sessionId, message } = data as { sessionId: string; message: SDKMessage };
      if (sessionId !== session.id) return;

      // Handle streaming events for activity indicator
      if (message.type === 'stream_event') {
        const streamEvent = message as SDKStreamEvent;
        if (streamEvent.event.type === 'content_block_start') {
          const blockType = streamEvent.event.content_block?.type;
          setActivity(blockType === 'tool_use' ? 'tool_use' : 'thinking');
        } else if (streamEvent.event.type === 'content_block_delta' && streamEvent.event.delta?.text) {
          setActivity('streaming');
        }
        return;
      }

      // System init - Claude is now thinking
      if (message.type === 'system' && (message as { subtype?: string }).subtype === 'init') {
        setActivity('thinking');
      }

      // Check if assistant message has tool uses
      if (message.type === 'assistant') {
        const assistantMsg = message as { message?: { content?: Array<{ type: string }> } };
        const hasToolUse = assistantMsg.message?.content?.some(b => b.type === 'tool_use');
        setActivity(hasToolUse ? 'tool_use' : 'thinking');
      }

      // Result means we're done
      if (message.type === 'result') {
        setActivity('idle');
      }
    });

    // Track status changes for local UI
    const unsubStatus = window.electronAPI.on('session:status', (data: unknown) => {
      const { sessionId, status: newStatus } = data as { sessionId: string; status: Session['status'] };
      if (sessionId === session.id) {
        setLocalStatus(newStatus);
        // Clear pending approvals only when session is truly done, NOT when 'waiting' for approval
        if (newStatus === 'idle' || newStatus === 'error' || newStatus === 'finished') {
          setPendingApprovals([]);
          setActivity('idle');
        } else if (newStatus === 'waiting') {
          // When waiting for approval, just set activity to idle but keep pending approvals
          setActivity('idle');
        }
      }
    });

    // Listen for new permission requests
    const unsubPermission = window.electronAPI.on('session:permission-request', (request: unknown) => {
      const req = request as PermissionRequest;
      console.log(`[SessionView] permission-request received:`, {
        reqSessionId: req.sessionId,
        currentSessionId: session.id,
        matches: req.sessionId === session.id,
        toolUseId: req.toolUseId,
        toolName: req.toolName
      });
      if (req.sessionId === session.id) {
        console.log(`[SessionView] Adding to pendingApprovals`);
        setPendingApprovals(prev => {
          const exists = prev.some(p => p.id === req.id);
          if (exists) {
            console.log(`[SessionView] Already exists in pendingApprovals`);
            return prev;
          }
          console.log(`[SessionView] pendingApprovals updated, new count:`, prev.length + 1);
          return [...prev, req];
        });
      } else {
        console.log(`[SessionView] Session ID mismatch, ignoring`);
      }
    });

    // Listen for streaming text from ACP
    const unsubStream = window.electronAPI.on('session:stream', (data: unknown) => {
      const { sessionId, text } = data as { sessionId: string; text: string };
      if (sessionId === session.id) {
        appendStreamingText(sessionId, text);
        setActivity('streaming');
      }
    });

    // Listen for clear streaming text event (when prompt completes)
    const unsubClearStream = window.electronAPI.on('session:clear-stream', (data: unknown) => {
      const { sessionId } = data as { sessionId: string };
      if (sessionId === session.id) {
        clearStreamingText(sessionId);
      }
    });

    // Listen for question requests from AskUserQuestion tool
    const unsubQuestion = window.electronAPI.on('session:question-request', (data: unknown) => {
      const request = data as AskUserQuestionRequest;
      console.log(`[SessionView] question-request received:`, {
        reqSessionId: request.sessionId,
        currentSessionId: session.id,
        matches: request.sessionId === session.id,
        toolCallId: request.toolCallId,
        questionCount: request.questions.length
      });
      if (request.sessionId === session.id) {
        setCurrentQuestion(request);
      }
    });

    return () => {
      unsubMessage();
      unsubStatus();
      unsubPermission();
      unsubStream();
      unsubClearStream();
      unsubQuestion();
    };
  }, [session.id, appendStreamingText, clearStreamingText]);

  const handleSendMessage = async (prompt: string) => {
    // Update status and activity immediately for responsive UI
    setLocalStatus('running');
    setActivity('connecting');

    // Add user message to UI
    const userMessage: SDKMessage = {
      type: 'user',
      session_id: session.claudeSessionId || '',
      message: { role: 'user', content: [{ type: 'text', text: prompt }] }
    } as SDKMessage;
    addMessage(session.id, userMessage);

    // Start session via IPC
    await window.electronAPI.invoke('session:start', {
      hiveSessionId: session.id,
      prompt,
      cwd: projectDirectory,
      claudeSessionId: session.claudeSessionId,
      model: session.model,
      permissionMode: session.permissionMode
    });
  };

  const handleInterrupt = async () => {
    await window.electronAPI.invoke('session:interrupt', {
      hiveSessionId: session.id
    });
  };

  // Stage a single pending tool call as approved (don't send to backend yet)
  const handleApprove = (request: PermissionRequest) => {
    setStagedDecisions(prev => {
      const next = new Map(prev);
      next.set(request.id, 'approved');
      return next;
    });
  };

  // Stage all pending tool calls as approved
  const handleApproveAll = () => {
    setStagedDecisions(prev => {
      const next = new Map(prev);
      for (const approval of pendingApprovals) {
        next.set(approval.id, 'approved');
      }
      return next;
    });
  };

  // Stage a pending tool call as denied
  const handleDeny = (request: PermissionRequest, _reason?: string) => {
    setStagedDecisions(prev => {
      const next = new Map(prev);
      next.set(request.id, 'denied');
      return next;
    });
  };

  // Handle question dialog submit
  const handleQuestionSubmit = async (answers: Record<string, string | string[]>) => {
    if (!currentQuestion) return;
    console.log(`[SessionView] Submitting answers for question:`, {
      toolCallId: currentQuestion.toolCallId,
      answers
    });

    // Save to local state for display
    setSubmittedQuestions(prev => [...prev, { request: currentQuestion, answers }]);

    // Save to database for persistence
    try {
      await window.electronAPI.invoke('session:save-submitted-question', {
        sessionId: session.id,
        toolCallId: currentQuestion.toolCallId,
        request: currentQuestion,
        answers,
      });
    } catch (error) {
      console.error('Failed to save submitted question:', error);
    }

    // Send answer to ACP
    try {
      await window.electronAPI.invoke('session:answer-question', {
        toolCallId: currentQuestion.toolCallId,
        answers
      });
    } catch (error) {
      console.error('Failed to submit question answers:', error);
    }

    setCurrentQuestion(null);
  };

  // Handle question dialog cancel (skip)
  const handleQuestionCancel = async () => {
    if (!currentQuestion) return;
    console.log(`[SessionView] Skipping question:`, currentQuestion.toolCallId);

    // Save as skipped (empty answers) to local state
    setSubmittedQuestions(prev => [...prev, { request: currentQuestion, answers: {} }]);

    // Save to database for persistence
    try {
      await window.electronAPI.invoke('session:save-submitted-question', {
        sessionId: session.id,
        toolCallId: currentQuestion.toolCallId,
        request: currentQuestion,
        answers: {},
      });
    } catch (error) {
      console.error('Failed to save skipped question:', error);
    }

    // Submit empty answers to indicate skip
    try {
      await window.electronAPI.invoke('session:answer-question', {
        toolCallId: currentQuestion.toolCallId,
        answers: {}
      });
    } catch (error) {
      console.error('Failed to skip question:', error);
    }

    setCurrentQuestion(null);
  };

  // Check if all pending approvals have been staged
  const allDecisionsStaged = pendingApprovals.length > 0 &&
    pendingApprovals.every(p => stagedDecisions.has(p.id));

  // Submit all staged decisions to backend
  const handleSubmitDecisions = async () => {
    // Separate approved and denied
    const approved: PermissionRequest[] = [];
    const denied: PermissionRequest[] = [];

    for (const approval of pendingApprovals) {
      const decision = stagedDecisions.get(approval.id);
      if (decision === 'approved') {
        approved.push(approval);
      } else if (decision === 'denied') {
        denied.push(approval);
      }
    }

    // Clear local state
    setPendingApprovals([]);
    setStagedDecisions(new Map());

    // If any denied, deny ALL (backend denies all when one is denied)
    if (denied.length > 0) {
      // Mark ALL as denied since backend denies all
      setResolvedDecisions(prev => {
        const next = new Map(prev);
        for (const approval of pendingApprovals) {
          next.set(approval.toolUseId, 'denied');
        }
        return next;
      });

      await window.electronAPI.invoke('session:deny', {
        sessionId: session.id,
        pendingApprovalId: denied[0].id,
        reason: 'User denied permission',
      });
      return;
    }

    // All approved - save decisions to resolved
    setResolvedDecisions(prev => {
      const next = new Map(prev);
      for (const approval of approved) {
        next.set(approval.toolUseId, 'approved');
      }
      return next;
    });

    // If all approved, approve all at once
    if (approved.length > 0) {
      await window.electronAPI.invoke('session:approve-all', {
        sessionId: session.id,
      });
    }
  };

  // Save session name
  const { setSessions, sessions, setCurrentSession, currentSession } = useTabContext();
  const handleSaveName = async () => {
    const trimmedName = editedName.trim();
    if (trimmedName && trimmedName !== session.name) {
      await window.electronAPI.invoke('db:sessions:update-name', {
        id: session.id,
        name: trimmedName,
      });
      // Update local sessions list
      setSessions(sessions.map(s =>
        s.id === session.id ? { ...s, name: trimmedName } : s
      ));
      // Update current session so the detail view updates
      if (currentSession?.id === session.id) {
        setCurrentSession({ ...currentSession, name: trimmedName });
      }
    } else {
      setEditedName(session.name);
    }
    setIsEditingName(false);
  };

  // Mark session as finished
  const handleMarkFinished = async () => {
    setLocalStatus('finished');
    await window.electronAPI.invoke('db:sessions:update-status', {
      id: session.id,
      status: 'finished',
    });
    setSessions(sessions.map(s =>
      s.id === session.id ? { ...s, status: 'finished', updatedAt: Date.now() } : s
    ));
  };

  // Archive session
  const handleArchive = async () => {
    setLocalStatus('archived');
    await window.electronAPI.invoke('db:sessions:update-status', {
      id: session.id,
      status: 'archived',
    });
    setSessions(sessions.map(s =>
      s.id === session.id ? { ...s, status: 'archived', updatedAt: Date.now() } : s
    ));
  };

  // Delete session (force delete with confirmation)
  const handleDeleteSession = async () => {
    await window.electronAPI.invoke('db:sessions:delete', {
      id: session.id,
    });
    // Remove from sessions list
    setSessions(sessions.filter(s => s.id !== session.id));
    // Clear current session
    setCurrentSession(null);
  };

  // Continue in terminal
  const handleContinueInTerminal = async () => {
    if (!session.claudeSessionId) return;
    try {
      await window.electronAPI.invoke('shell:open-in-terminal', {
        path: projectDirectory,
        command: `claude --resume ${session.claudeSessionId}`,
      });
    } catch (err) {
      console.error('[SessionView] IPC error:', err);
    }
  };

  // Copy resume command
  const [copied, setCopied] = React.useState(false);
  const handleCopyCommand = async () => {
    if (!session.claudeSessionId) return;
    const command = `claude --resume ${session.claudeSessionId}`;
    await navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Update session model
  const { updateSessionModel } = useTabContext();
  const handleModelChange = async (newModel: ClaudeModel) => {
    await window.electronAPI.invoke('db:sessions:update-model', {
      id: session.id,
      model: newModel,
    });
    updateSessionModel(session.id, newModel);
  };

  // Update session permission mode
  const handlePermissionModeChange = async (newMode: PermissionMode, duration?: PermissionDuration) => {
    // Calculate expiration time if duration is provided
    const expiresAt = duration ? Date.now() + duration * 60 * 1000 : null;

    // Save to database
    await window.electronAPI.invoke('db:sessions:update-permission-mode', {
      id: session.id,
      mode: newMode,
      expiresAt,
    });

    // Update local state
    updateSessionPermissionMode(session.id, newMode, expiresAt);

    // If session is running, also update the SDK dynamically
    if (localStatus === 'running') {
      await window.electronAPI.invoke('session:set-permission-mode', {
        hiveSessionId: session.id,
        mode: newMode,
      });
    }
  };

  // Handle permission selector change
  const handlePermissionSelectorChange = (newMode: PermissionMode) => {
    const modeConfig = PERMISSION_MODES.find(m => m.value === newMode);
    if (modeConfig?.requiresConfirmation) {
      // Show modal for dangerous modes
      setShowPermissionModal(true);
    } else {
      // Apply immediately without duration
      handlePermissionModeChange(newMode);
    }
  };

  // Handle "Auto-accept edits" quick action - changes mode and approves all
  const handleAutoAcceptEdits = async () => {
    // Change permission mode first
    await handlePermissionModeChange('acceptEdits');

    // Then approve all and continue
    if (pendingApprovals.length > 0) {
      // Save all as approved to resolved decisions
      setResolvedDecisions(prev => {
        const next = new Map(prev);
        for (const approval of pendingApprovals) {
          next.set(approval.toolUseId, 'approved');
        }
        return next;
      });

      // Clear local state
      setPendingApprovals([]);
      setStagedDecisions(new Map());

      // Approve all and resume
      await window.electronAPI.invoke('session:approve-all', {
        sessionId: session.id,
      });
    }
  };

  // Handle modal confirmation
  const handlePermissionModalConfirm = (duration: PermissionDuration) => {
    handlePermissionModeChange('bypassPermissions', duration);
  };

  // Show action buttons only when session is not actively running
  const canShowActions = ['idle', 'pending', 'error', 'finished'].includes(localStatus);

  return (
    <div className="h-full flex flex-col">
      {/* Tab Bar */}
      <div className="relative flex items-end gap-1 pt-2 bg-[var(--background-secondary)] border-b border-[var(--border)]">
        {tabs.map((tab, ix) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'px-4 py-1.5 text-sm font-medium transition-all relative cursor-pointer',
              ix === 0 ? 'ml-2' : '',
              activeTab === tab.id
                ? 'bg-[var(--background)] text-[var(--foreground)] -mb-px z-10'
                : 'text-[var(--foreground-muted)] hover:text-[var(--foreground)] hover:bg-[var(--background)]/50 mb-0'
            )}
          >
            {tab.label}
            {tab.badge}
            {/* Bottom cover to hide border line under active tab */}
            {activeTab === tab.id && (
              <span className="absolute bottom-0 left-0 right-0 h-px bg-[var(--background)]" />
            )}
          </button>
        ))}
      </div>

      {/* Divider */}
      <div className="h-px bg-[var(--border)]" />

      {/* Session Header */}
      <div className="px-4 py-2 border-b border-[var(--border)]">
        <div className="flex items-center gap-2">
          {/* Spinner when running */}
          {localStatus === 'running' && (
            <Loader2 className="h-4 w-4 animate-spin text-[var(--success)]" />
          )}
          {/* Editable session name */}
          {isEditingName ? (
            <input
              type="text"
              value={editedName}
              onChange={(e) => setEditedName(e.target.value)}
              onBlur={handleSaveName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveName();
                if (e.key === 'Escape') {
                  setEditedName(session.name);
                  setIsEditingName(false);
                }
              }}
              autoFocus
              className="font-medium bg-transparent border-b border-[var(--primary)] outline-none px-0"
            />
          ) : (
            <span
              className="font-medium cursor-pointer hover:text-[var(--primary)]"
              onClick={() => setIsEditingName(true)}
              title="Click to edit session name"
            >
              {session.name}
            </span>
          )}
          <span className="text-xs px-2 py-0.5 bg-[var(--secondary)] text-[var(--secondary-foreground)]">
            {session.actionType}
          </span>
          {/* Model selector */}
          <Select
            value={session.model}
            onChange={handleModelChange}
            options={CLAUDE_MODELS}
            disabled={localStatus === 'running'}
            variant="compact"
          />
          {/* Permission mode selector */}
          <div className="flex items-center gap-1">
            <Select
              value={session.permissionMode}
              onChange={handlePermissionSelectorChange}
              options={PERMISSION_MODES.map((m) => ({
                value: m.value,
                label: m.label,
                description: m.description,
                icon: getPermissionIcon(m.value),
              }))}
              variant="compact"
              showDescriptions
              triggerClassName={cn(
                session.permissionMode === 'bypassPermissions'
                  ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400 hover:bg-amber-500/30'
                  : session.permissionMode === 'acceptEdits'
                    ? 'bg-blue-500/20 text-blue-600 dark:text-blue-400 hover:bg-blue-500/30'
                    : ''
              )}
            />
            {timeRemaining && (
              <span className="text-xs text-amber-600 dark:text-amber-400 font-mono">
                {timeRemaining}
              </span>
            )}
          </div>
          <span className={cn(
            'text-xs px-2 py-0.5',
            localStatus === 'pending' && 'bg-[var(--secondary)] text-[var(--secondary-foreground)]',
            localStatus === 'running' && 'bg-[var(--success)]/20 text-[var(--success)]',
            localStatus === 'waiting' && 'bg-[var(--warning)]/20 text-[var(--warning)]',
            localStatus === 'idle' && 'bg-[var(--primary)]/20 text-[var(--primary)]',
            localStatus === 'error' && 'bg-[var(--destructive)]/20 text-[var(--destructive)]',
            localStatus === 'finished' && 'bg-[var(--success)]/20 text-[var(--success)]',
            localStatus === 'archived' && 'bg-[var(--secondary)] text-[var(--foreground-muted)]'
          )}>
            {localStatus}
          </span>
          {pendingApprovals.length > 0 && (
            <span className="text-xs px-2 py-0.5 bg-[var(--warning)]/20 text-[var(--warning)]">
              {pendingApprovals.length} pending approval{pendingApprovals.length > 1 ? 's' : ''}
            </span>
          )}

          {/* Session actions */}
          <div className="flex-1" />
          <div className="flex items-center gap-1">
            {/* Actions for non-running/non-archived sessions */}
            {canShowActions && localStatus !== 'archived' && (
              <>
                {session.claudeSessionId && (
                  <>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={handleCopyCommand}
                          className="h-7 w-7"
                        >
                          {copied ? <Check className="h-3.5 w-3.5 text-[var(--success)]" /> : <Copy className="h-3.5 w-3.5" />}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Copy resume command</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={handleContinueInTerminal}
                          className="h-7 w-7"
                        >
                          <Terminal className="h-3.5 w-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Continue in terminal</TooltipContent>
                    </Tooltip>
                  </>
                )}
                {localStatus !== 'finished' && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleMarkFinished}
                        className="h-7 w-7"
                      >
                        <CheckCircle className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Mark complete</TooltipContent>
                  </Tooltip>
                )}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleArchive}
                      className="h-7 w-7 text-[var(--foreground-muted)]"
                    >
                      <Archive className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Archive session</TooltipContent>
                </Tooltip>
              </>
            )}

            {/* Delete button - always visible for any session state */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowDeleteModal(true)}
                  className="h-7 w-7 text-[var(--destructive)] hover:text-[var(--destructive)] hover:bg-[var(--destructive)]/10"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Force delete session</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {activeTab === 'agent' && (
          openFile ? (
            <PanelGroup direction="horizontal" autoSaveId="hive-session-file-viewer">
              <Panel id="messages" defaultSize={60} minSize={40}>
                <div className="h-full flex flex-col">
                  <MessageList
                    messages={messages}
                    streamingText={streamingText}
                    pendingApprovals={pendingApprovals}
                    stagedDecisions={stagedDecisions}
                    resolvedDecisions={resolvedDecisions}
                    allDecisionsStaged={allDecisionsStaged}
                    onApprove={handleApprove}
                    onApproveAll={handleApproveAll}
                    onDeny={handleDeny}
                    onSubmitDecisions={handleSubmitDecisions}
                    permissionMode={session.permissionMode}
                    onAutoAcceptEdits={handleAutoAcceptEdits}
                    onBypassAll={() => setShowPermissionModal(true)}
                    isLoadingHistory={isLoadingHistory}
                    activity={activity}
                    onFocusInput={() => window.dispatchEvent(new Event('focus-message-input'))}
                    currentQuestion={currentQuestion}
                    submittedQuestions={submittedQuestions}
                    onQuestionSubmit={handleQuestionSubmit}
                    onQuestionCancel={handleQuestionCancel}
                  />
                  <MessageInput
                    onSend={handleSendMessage}
                    onInterrupt={handleInterrupt}
                    isRunning={localStatus === 'running'}
                    disabled={pendingApprovals.length > 0}
                    sessionId={session.id}
                    projectId={projectId}
                  />
                  <ContextUsageBar current={contextUsage.current} system={contextUsage.system} max={contextUsage.max} />
                </div>
              </Panel>
              <PanelResizeHandle className="w-1 bg-[var(--border)] hover:bg-[var(--primary)] transition-colors" />
              <Panel id="file-viewer" defaultSize={40} minSize={20}>
                <FileViewerPane
                  projectDirectory={projectDirectory}
                  onOpenThoughtsTab={() => {
                    setActiveTab('thoughts');
                    closeFile();
                  }}
                  onOpenDiffTab={() => {
                    setActiveTab('diff');
                    closeFile();
                  }}
                />
              </Panel>
            </PanelGroup>
          ) : (
            <>
              <MessageList
                messages={messages}
                streamingText={streamingText}
                pendingApprovals={pendingApprovals}
                stagedDecisions={stagedDecisions}
                resolvedDecisions={resolvedDecisions}
                allDecisionsStaged={allDecisionsStaged}
                onApprove={handleApprove}
                onApproveAll={handleApproveAll}
                onDeny={handleDeny}
                onSubmitDecisions={handleSubmitDecisions}
                permissionMode={session.permissionMode}
                onAutoAcceptEdits={handleAutoAcceptEdits}
                onBypassAll={() => setShowPermissionModal(true)}
                isLoadingHistory={isLoadingHistory}
                activity={activity}
                onFocusInput={() => window.dispatchEvent(new Event('focus-message-input'))}
                currentQuestion={currentQuestion}
                submittedQuestions={submittedQuestions}
                onQuestionSubmit={handleQuestionSubmit}
                onQuestionCancel={handleQuestionCancel}
              />
              <MessageInput
                onSend={handleSendMessage}
                onInterrupt={handleInterrupt}
                isRunning={localStatus === 'running'}
                disabled={pendingApprovals.length > 0}
                sessionId={session.id}
                projectId={projectId}
              />
              <ContextUsageBar current={contextUsage.current} system={contextUsage.system} max={contextUsage.max} />
            </>
          )
        )}
        {activeTab === 'todos' && <TodosTab messages={messages} />}
        {activeTab === 'diff' && (
          <DiffTab
            projectDirectory={projectDirectory}
            claudeSessionId={session.claudeSessionId}
            onStatsChange={setDiffStats}
          />
        )}
        {activeTab === 'analytics' && <AnalyticsTab messages={messages} />}
        {activeTab === 'thoughts' && (
          <ThoughtsPane
            projectId={projectId}
            projectDirectory={projectDirectory}
            currentSessionId={session.id}
          />
        )}
        {activeTab === 'meta' && <MetaTab session={session} projectDirectory={projectDirectory} />}
      </div>

      {/* Permission Mode Modal */}
      <PermissionModeModal
        isOpen={showPermissionModal}
        onClose={() => setShowPermissionModal(false)}
        onConfirm={handlePermissionModalConfirm}
      />

      {/* Delete Session Modal */}
      <DeleteSessionModal
        isOpen={showDeleteModal}
        session={session}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleDeleteSession}
      />
    </div>
  );
}

interface Todo {
  content: string;
  activeForm: string;
  status: 'pending' | 'in_progress' | 'completed';
}

function TodosTab({ messages }: { messages: SDKMessage[] }) {
  // Extract latest todos from messages by finding the most recent TodoWrite tool_use
  const todos = React.useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.type === 'assistant') {
        const assistantMsg = msg as { message?: { content?: Array<{ type: string; name?: string; input?: { todos?: Todo[] } }> } };
        const todoBlock = assistantMsg.message?.content?.find(
          block => block.type === 'tool_use' && block.name === 'TodoWrite'
        );
        if (todoBlock?.input?.todos) {
          return todoBlock.input.todos;
        }
      }
    }
    return [];
  }, [messages]);

  const completed = todos.filter(t => t.status === 'completed').length;
  const inProgress = todos.filter(t => t.status === 'in_progress').length;
  const pending = todos.filter(t => t.status === 'pending').length;
  const total = todos.length;
  const progressPercent = total > 0 ? Math.round((completed / total) * 100) : 0;

  if (total === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-[var(--foreground-muted)]">
          No todos in this session
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-4">
      <div className="max-w-2xl space-y-4">
        {/* Progress Summary */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-[var(--foreground-muted)]">
              Progress: {completed}/{total} completed
              {inProgress > 0 && `, ${inProgress} in progress`}
              {pending > 0 && `, ${pending} pending`}
            </span>
            <span className="font-medium">{progressPercent}%</span>
          </div>
          {/* Progress Bar */}
          <div className="h-2 bg-[var(--secondary)] overflow-hidden">
            <div
              className="h-full bg-[var(--success)] transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Todo List */}
        <div className="bg-[var(--background-secondary)] border border-[var(--border)] divide-y divide-[var(--border)]">
          {todos.map((todo, index) => (
            <div
              key={index}
              className={cn(
                'flex items-start gap-3 px-4 py-3',
                todo.status === 'completed' && 'opacity-60'
              )}
            >
              {/* Status Icon */}
              <span className="text-base mt-0.5">
                {todo.status === 'completed' && <CheckCircle className="h-5 w-5 text-[var(--success)]" />}
                {todo.status === 'in_progress' && <Loader2 className="h-5 w-5 text-[var(--primary)] animate-spin" />}
                {todo.status === 'pending' && (
                  <span className="inline-block h-5 w-5 border-2 border-[var(--border)]" />
                )}
              </span>
              {/* Task Text */}
              <span
                className={cn(
                  'text-sm flex-1',
                  todo.status === 'completed' && 'line-through text-[var(--foreground-muted)]',
                  todo.status === 'in_progress' && 'text-[var(--primary)] font-medium'
                )}
              >
                {todo.status === 'in_progress' ? todo.activeForm : todo.content}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MetaTab({ session, projectDirectory }: { session: Session; projectDirectory: string }) {
  const [copied, setCopied] = React.useState<string | null>(null);
  const [sessionFilePath, setSessionFilePath] = React.useState<string | null>(null);

  // Fetch the actual session file path from main process
  React.useEffect(() => {
    if (!session.claudeSessionId) {
      setSessionFilePath(null);
      return;
    }
    window.electronAPI.invoke<string | null>('session:get-file-path', {
      directory: projectDirectory,
      claudeSessionId: session.claudeSessionId,
    }).then(setSessionFilePath);
  }, [session.claudeSessionId, projectDirectory]);

  const resumeCommand = session.claudeSessionId
    ? `claude --resume ${session.claudeSessionId}`
    : null;

  const handleCopy = async (text: string, key: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleOpenInEditor = async () => {
    if (!sessionFilePath) return;
    try {
      await window.electronAPI.invoke('shell:open-in-editor', {
        path: sessionFilePath,
      });
    } catch (err) {
      console.error('[MetaTab] Failed to open in editor:', err);
    }
  };

  const handleRevealInFinder = async () => {
    if (!sessionFilePath) return;
    try {
      await window.electronAPI.invoke('shell:reveal-in-finder', {
        path: sessionFilePath,
      });
    } catch (err) {
      console.error('[MetaTab] Failed to reveal in finder:', err);
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  const rows: { label: string; value: string | null; copyable?: boolean; key: string }[] = [
    { label: 'Hive Session ID', value: session.id, copyable: true, key: 'hiveId' },
    { label: 'Claude Session ID', value: session.claudeSessionId, copyable: true, key: 'claudeId' },
    { label: 'Status', value: session.status, key: 'status' },
    { label: 'Action Type', value: session.actionType, key: 'actionType' },
    { label: 'Model', value: session.model, key: 'model' },
    { label: 'Created', value: formatDate(session.createdAt), key: 'created' },
    { label: 'Updated', value: formatDate(session.updatedAt), key: 'updated' },
    { label: 'Project ID', value: session.projectId, copyable: true, key: 'projectId' },
  ];

  return (
    <div className="h-full overflow-auto p-4">
      <div className="max-w-2xl space-y-6">
        {/* Session Info */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-[var(--foreground-muted)] uppercase tracking-wider">
            Session Info
          </h3>
          <div className="bg-[var(--background-secondary)] border border-[var(--border)] divide-y divide-[var(--border)]">
            {rows.map(({ label, value, copyable, key }) => (
              <div key={key} className="flex items-center justify-between px-4 py-2.5">
                <span className="text-sm text-[var(--foreground-muted)]">{label}</span>
                <div className="flex items-center gap-2">
                  <code className="text-sm font-mono text-[var(--foreground)]">
                    {value || '—'}
                  </code>
                  {copyable && value && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => handleCopy(value, key)}
                    >
                      {copied === key ? (
                        <Check className="h-3 w-3 text-[var(--success)]" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Resume Command */}
        {resumeCommand && (
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-[var(--foreground-muted)] uppercase tracking-wider">
              Resume Command
            </h3>
            <div className="bg-[var(--background-secondary)] border border-[var(--border)] p-3 flex items-center justify-between">
              <code className="text-sm font-mono text-[var(--foreground)]">
                {resumeCommand}
              </code>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => handleCopy(resumeCommand, 'resume')}
              >
                {copied === 'resume' ? (
                  <Check className="h-3.5 w-3.5 text-[var(--success)]" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Session File */}
        {sessionFilePath && (
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-[var(--foreground-muted)] uppercase tracking-wider">
              Session File
            </h3>
            <div className="bg-[var(--background-secondary)] border border-[var(--border)] p-3">
              <div className="flex items-center justify-between">
                <code className="text-sm font-mono text-[var(--foreground)] break-all">
                  {sessionFilePath}
                </code>
                <div className="flex items-center gap-1 ml-2 shrink-0">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleCopy(sessionFilePath, 'path')}
                      >
                        {copied === 'path' ? (
                          <Check className="h-3.5 w-3.5 text-[var(--success)]" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Copy path</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={handleOpenInEditor}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Open in editor</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={handleRevealInFinder}
                      >
                        <FolderOpen className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Reveal in Finder</TooltipContent>
                  </Tooltip>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Metadata */}
        {Object.keys(session.metadata).length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-[var(--foreground-muted)] uppercase tracking-wider">
              Metadata
            </h3>
            <div className="bg-[var(--background-secondary)] border border-[var(--border)] p-3">
              <pre className="text-sm font-mono text-[var(--foreground)] whitespace-pre-wrap overflow-auto">
                {JSON.stringify(session.metadata, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Analytics Tab
interface SessionAnalytics {
  totalCost: number;
  totalDuration: number;
  totalApiDuration: number;
  totalTurns: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  resultCount: number;
}

function computeSessionAnalytics(messages: SDKMessage[]): SessionAnalytics {
  const stats: SessionAnalytics = {
    totalCost: 0,
    totalDuration: 0,
    totalApiDuration: 0,
    totalTurns: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    resultCount: 0,
  };

  for (const msg of messages) {
    if (msg.type !== 'result') continue;
    const result = msg as SDKResultMessage;

    // Skip interrupted results (they don't have stats)
    if (result.subtype === 'interrupted') continue;

    stats.resultCount++;
    stats.totalCost += result.total_cost_usd || 0;
    stats.totalDuration += result.duration_ms || 0;
    stats.totalApiDuration += result.duration_api_ms || 0;
    stats.totalTurns += result.num_turns || 1;

    if (result.usage) {
      stats.inputTokens += result.usage.input_tokens || 0;
      stats.outputTokens += result.usage.output_tokens || 0;
      stats.cacheReadTokens += result.usage.cache_read_input_tokens || 0;
      stats.cacheWriteTokens += result.usage.cache_creation_input_tokens || 0;
    }
  }

  return stats;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = ((ms % 60000) / 1000).toFixed(0);
  return `${mins}m ${secs}s`;
}

function formatTokens(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(2)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function AnalyticsTab({ messages }: { messages: SDKMessage[] }) {
  const stats = React.useMemo(() => computeSessionAnalytics(messages), [messages]);

  const totalTokens = stats.inputTokens + stats.outputTokens + stats.cacheReadTokens + stats.cacheWriteTokens;

  if (stats.resultCount === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-[var(--foreground-muted)]">
          No analytics data yet - send a message to start
        </p>
      </div>
    );
  }

  const statCards: Array<{
    label: string;
    value: string;
    subtext?: string;
    tooltip?: string[];
  }> = [
      {
        label: 'Total Cost',
        value: `$${stats.totalCost.toFixed(4)}`,
        subtext: stats.resultCount > 1 ? `across ${stats.resultCount} turns` : undefined,
      },
      {
        label: 'Total Tokens',
        value: formatTokens(totalTokens),
        tooltip: [
          `Input: ${formatTokens(stats.inputTokens)}`,
          `Output: ${formatTokens(stats.outputTokens)}`,
          stats.cacheReadTokens > 0 ? `Cache read: ${formatTokens(stats.cacheReadTokens)}` : null,
          stats.cacheWriteTokens > 0 ? `Cache write: ${formatTokens(stats.cacheWriteTokens)}` : null,
        ].filter(Boolean) as string[],
      },
      {
        label: 'Total Duration',
        value: formatDuration(stats.totalDuration),
        tooltip: [
          `Total: ${formatDuration(stats.totalDuration)}`,
          `API time: ${formatDuration(stats.totalApiDuration)}`,
          `Overhead: ${formatDuration(stats.totalDuration - stats.totalApiDuration)}`,
        ],
      },
      {
        label: 'Turns',
        value: String(stats.totalTurns),
        subtext: stats.resultCount !== stats.totalTurns
          ? `(${stats.resultCount} result${stats.resultCount > 1 ? 's' : ''})`
          : undefined,
      },
    ];

  return (
    <div className="h-full overflow-auto p-4">
      <div className="max-w-2xl space-y-6">
        {/* Summary Header */}
        <div>
          <h3 className="text-sm font-medium text-[var(--foreground-muted)] uppercase tracking-wider mb-4">
            Session Analytics
          </h3>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {statCards.map((card) => (
              <div
                key={card.label}
                className="bg-[var(--background-secondary)] border border-[var(--border)] p-4"
              >
                <div className="text-xs text-[var(--foreground-muted)] mb-1">
                  {card.label}
                </div>
                {card.tooltip ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="text-2xl font-semibold cursor-help">
                        {card.value}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <div className="space-y-0.5">
                        {card.tooltip.map((line, i) => (
                          <div key={i}>{line}</div>
                        ))}
                      </div>
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <div className="text-2xl font-semibold">{card.value}</div>
                )}
                {card.subtext && (
                  <div className="text-xs text-[var(--foreground-muted)] mt-1">
                    {card.subtext}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Token Breakdown */}
        <div>
          <h3 className="text-sm font-medium text-[var(--foreground-muted)] uppercase tracking-wider mb-3">
            Token Breakdown
          </h3>
          <div className="bg-[var(--background-secondary)] border border-[var(--border)] divide-y divide-[var(--border)]">
            <TokenRow label="Input tokens" value={stats.inputTokens} total={totalTokens} />
            <TokenRow label="Output tokens" value={stats.outputTokens} total={totalTokens} />
            {stats.cacheReadTokens > 0 && (
              <TokenRow label="Cache read" value={stats.cacheReadTokens} total={totalTokens} />
            )}
            {stats.cacheWriteTokens > 0 && (
              <TokenRow label="Cache write" value={stats.cacheWriteTokens} total={totalTokens} />
            )}
          </div>
        </div>

        {/* Duration Breakdown */}
        <div>
          <h3 className="text-sm font-medium text-[var(--foreground-muted)] uppercase tracking-wider mb-3">
            Duration Breakdown
          </h3>
          <div className="bg-[var(--background-secondary)] border border-[var(--border)] divide-y divide-[var(--border)]">
            <DurationRow
              label="API time"
              value={stats.totalApiDuration}
              total={stats.totalDuration}
            />
            <DurationRow
              label="Overhead"
              value={stats.totalDuration - stats.totalApiDuration}
              total={stats.totalDuration}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function TokenRow({ label, value, total }: { label: string; value: number; total: number }) {
  const percent = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <span className="text-sm text-[var(--foreground-muted)]">{label}</span>
      <div className="flex items-center gap-3">
        <div className="w-24 h-2 bg-[var(--border)] overflow-hidden">
          <div
            className="h-full bg-[var(--primary)] transition-all duration-300"
            style={{ width: `${percent}%` }}
          />
        </div>
        <span className="text-sm font-mono w-16 text-right">{formatTokens(value)}</span>
        <span className="text-xs text-[var(--foreground-muted)] w-12 text-right">
          {percent.toFixed(1)}%
        </span>
      </div>
    </div>
  );
}

function DurationRow({ label, value, total }: { label: string; value: number; total: number }) {
  const percent = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <span className="text-sm text-[var(--foreground-muted)]">{label}</span>
      <div className="flex items-center gap-3">
        <div className="w-24 h-2 bg-[var(--border)] overflow-hidden">
          <div
            className="h-full bg-[var(--success)] transition-all duration-300"
            style={{ width: `${percent}%` }}
          />
        </div>
        <span className="text-sm font-mono w-16 text-right">{formatDuration(value)}</span>
        <span className="text-xs text-[var(--foreground-muted)] w-12 text-right">
          {percent.toFixed(1)}%
        </span>
      </div>
    </div>
  );
}
