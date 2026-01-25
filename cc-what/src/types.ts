// ============================================
// stats-cache.json
// ============================================
export interface StatsCache {
	version: number
	lastComputedDate: string // 'YYYY-MM-DD'
	dailyActivity: DailyActivity[]
	dailyModelTokens: DailyModelTokens[]
	modelUsage: Record<string, ModelUsage>
	totalSessions: number
	totalMessages: number
	longestSession: LongestSession
	firstSessionDate: string // ISO 8601
	hourCounts: Record<string, number> // "0"-"23" -> count
}

export interface DailyActivity {
	date: string
	messageCount: number
	sessionCount: number
	toolCallCount: number
}

export interface DailyModelTokens {
	date: string
	tokensByModel: Record<string, number>
}

export interface ModelUsage {
	inputTokens: number
	outputTokens: number
	cacheReadInputTokens: number
	cacheCreationInputTokens: number
	webSearchRequests: number
	costUSD: number
	contextWindow: number
	maxOutputTokens: number
}

export interface LongestSession {
	sessionId: string
	duration: number
	messageCount: number
	timestamp: string
}

// ============================================
// history.jsonl
// ============================================
export interface HistoryEntry {
	display: string
	pastedContents: Record<string, unknown>
	timestamp: number // Unix ms
	project: string
}

// ============================================
// sessions-index.json
// ============================================
export interface SessionIndex {
	version: number
	entries: SessionEntry[]
}

export interface SessionEntry {
	sessionId: string
	fullPath: string
	fileMtime: number
	firstPrompt: string
	summary: string
	messageCount: number
	created: string // ISO 8601
	modified: string // ISO 8601
	gitBranch: string
	projectPath: string
	isSidechain: boolean
}

// ============================================
// Session JSONL Messages
// ============================================
export interface SessionMessageBase {
	parentUuid: string | null
	isSidechain: boolean
	userType: 'external' | 'internal'
	cwd: string
	sessionId: string
	version: string
	gitBranch: string
	uuid: string
	timestamp: string // ISO 8601
	// Subagent fields (optional)
	agentId?: string // e.g., 'a8ad0b5'
	slug?: string // e.g., 'iterative-sauteeing-pearl'
}

export interface SessionUserMessage extends SessionMessageBase {
	type: 'user'
	message: {
		role: 'user'
		content: string
	}
	isMeta?: boolean
}

export interface SessionAssistantMessage extends SessionMessageBase {
	type: 'assistant'
	requestId?: string
	message: {
		model: string
		id: string
		type: 'message'
		role: 'assistant'
		content: AssistantContent[]
		stop_reason: 'end_turn' | 'tool_use' | 'max_tokens' | null
		stop_sequence: string | null
		usage: TokenUsage
	}
}

export type AssistantContent =
	| { type: 'text'; text: string }
	| {
			type: 'tool_use'
			id: string
			name: string
			input: Record<string, unknown>
	  }

export interface TokenUsage {
	input_tokens: number
	cache_creation_input_tokens: number
	cache_read_input_tokens: number
	output_tokens: number
	service_tier?: string
}

export interface FileHistorySnapshot extends SessionMessageBase {
	type: 'file-history-snapshot'
	messageId: string
	snapshot: {
		messageId: string
		trackedFileBackups: Record<
			string,
			{ hash?: string; size?: number; timestamp?: string }
		>
		timestamp: string
	}
	isSnapshotUpdate: boolean
}

export interface SessionSummaryMessage {
	type: 'summary'
	summary: string
	leafUuid: string
}

export type SessionMessage =
	| SessionUserMessage
	| SessionAssistantMessage
	| FileHistorySnapshot
	| SessionSummaryMessage

// ============================================
// Subagent (same as session but always sidechain)
// ============================================
export interface SubagentMessage extends SessionMessageBase {
	isSidechain: true
	agentId: string
	slug: string
}

// ============================================
// Query Types
// ============================================
export interface SessionWithMessages extends SessionEntry {
	messages(): Promise<SessionMessage[]>
	subagents(): Promise<SubagentSession[]>
}

export interface SubagentSession {
	agentId: string
	slug: string
	sessionId: string
	messages: SessionMessage[]
}

export interface CostBreakdown {
	total: number
	byModel: Record<string, number>
	byDay: Record<string, number>
	byProject: Record<string, number>
}

export interface ProjectStats {
	path: string
	encodedPath: string
	messageCount: number
	sessionCount: number
	lastModified: string
}
