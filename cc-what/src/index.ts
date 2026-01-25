// Core config
export { config } from './config'

// Types
export type {
	// Stats
	StatsCache,
	DailyActivity,
	DailyModelTokens,
	ModelUsage,
	LongestSession,
	// History
	HistoryEntry,
	// Sessions
	SessionIndex,
	SessionEntry,
	SessionMessageBase,
	SessionUserMessage,
	SessionAssistantMessage,
	AssistantContent,
	TokenUsage,
	FileHistorySnapshot,
	SessionSummaryMessage,
	SessionMessage,
	SubagentMessage,
	// Query types
	SessionWithMessages,
	SubagentSession,
	CostBreakdown,
	ProjectStats,
} from './types'

// Utils
export { encodePath, decodePath, extractEncodedPath } from './utils/paths'
export {
	today,
	startOfThisWeek,
	endOfThisWeek,
	startOfThisMonth,
	formatDate,
	parseDate,
	isWithinRange,
	lastNDays,
} from './utils/dates'

// Source readers
export {
	readStatsCache,
	clearStatsCache,
	statsCacheExists,
} from './sources/stats-cache'
export {
	readHistory,
	streamHistory,
	getRecentHistory,
	searchHistory,
	getHistoryForProject,
} from './sources/history'
export {
	readSessionMessages,
	streamSessionMessages,
	readSubagentSessions,
	countSubagents,
} from './sources/session'
export {
	readSessionIndex,
	listProjects,
	getAllSessionEntries,
	getSessionEntriesForProject,
	findSessionEntry,
} from './sources/session-index'

// Query APIs
export { stats } from './queries/stats'
export { sessions } from './queries/sessions'
export type {
	MessageRatio,
	ContentBreakdown,
	ContextMetrics,
} from './queries/sessions'
export { messages } from './queries/messages'
export { costs } from './queries/costs'
export { projects } from './queries/projects'
export { tools } from './queries/tools'
export type { ToolUsage, LineChanges, FileChange } from './queries/tools'
export { prompts } from './queries/prompts'
export type { CommandUsage, PromptStats } from './queries/prompts'

// Pricing
export { pricing } from './pricing'
export type {
	ModelPricing,
	PricingDatabase,
	TokenCounts,
	ComputedCost,
} from './pricing'
