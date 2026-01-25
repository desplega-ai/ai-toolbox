import {
	countSubagents,
	readSessionMessages,
	readSubagentSessions,
} from '../sources/session'
import {
	findSessionEntry,
	getAllSessionEntries,
	getSessionEntriesForProject,
} from '../sources/session-index'
import type {
	SessionAssistantMessage,
	SessionEntry,
	SessionMessage,
	SessionUserMessage,
	SessionWithMessages,
	SubagentSession,
} from '../types'
import { isWithinRange, startOfThisWeek, today } from '../utils/dates'
import { encodePath } from '../utils/paths'

/**
 * Create a SessionWithMessages object from a SessionEntry
 */
function enrichSession(
	entry: SessionEntry,
	encodedPath: string,
): SessionWithMessages {
	return {
		...entry,
		messages: () => readSessionMessages(encodedPath, entry.sessionId),
		subagents: () => readSubagentSessions(encodedPath, entry.sessionId),
	}
}

/**
 * Get a specific session by ID
 */
export async function get(
	sessionId: string,
): Promise<SessionWithMessages | null> {
	const result = await findSessionEntry(sessionId)
	if (!result) return null
	return enrichSession(result.entry, result.encodedPath)
}

/**
 * Get all sessions from today
 */
export async function todaySessions(): Promise<SessionEntry[]> {
	const todayStr = today()
	const entries = await getAllSessionEntries()
	return entries.filter((e) => e.created.startsWith(todayStr))
}

/**
 * Get all sessions from this week
 */
export async function thisWeekSessions(): Promise<SessionEntry[]> {
	const weekStart = startOfThisWeek()
	const entries = await getAllSessionEntries()
	return entries.filter((e) => {
		const dateStr = e.created.split('T')[0]
		return isWithinRange(dateStr, weekStart)
	})
}

/**
 * Get sessions for a specific project path
 */
export async function forProject(projectPath: string): Promise<SessionEntry[]> {
	const encoded = encodePath(projectPath)
	return getSessionEntriesForProject(encoded)
}

/**
 * Get recent sessions sorted by modification time
 */
export async function recent(limit = 10): Promise<SessionEntry[]> {
	const entries = await getAllSessionEntries()
	return entries
		.sort(
			(a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime(),
		)
		.slice(0, limit)
}

/**
 * Session query builder
 */
export function query(): SessionQueryBuilder {
	return new SessionQueryBuilder()
}

class SessionQueryBuilder {
	private filters: Array<(entry: SessionEntry) => boolean> = []
	private _limit?: number
	private _includeSubagents = false
	private _projectPath?: string

	after(date: string): this {
		this.filters.push((e) => {
			const entryDate = e.created.split('T')[0]
			return entryDate >= date
		})
		return this
	}

	before(date: string): this {
		this.filters.push((e) => {
			const entryDate = e.created.split('T')[0]
			return entryDate <= date
		})
		return this
	}

	inProject(path: string): this {
		this._projectPath = path
		this.filters.push((e) => e.projectPath === path)
		return this
	}

	withBranch(branch: string): this {
		this.filters.push((e) => e.gitBranch === branch)
		return this
	}

	withSubagents(): this {
		this._includeSubagents = true
		return this
	}

	mainOnly(): this {
		this.filters.push((e) => !e.isSidechain)
		return this
	}

	sidechainOnly(): this {
		this.filters.push((e) => e.isSidechain)
		return this
	}

	limit(n: number): this {
		this._limit = n
		return this
	}

	minMessages(n: number): this {
		this.filters.push((e) => e.messageCount >= n)
		return this
	}

	searchPrompt(text: string): this {
		const lower = text.toLowerCase()
		this.filters.push(
			(e) =>
				e.firstPrompt.toLowerCase().includes(lower) ||
				e.summary.toLowerCase().includes(lower),
		)
		return this
	}

	async get(): Promise<SessionEntry[]> {
		let entries: SessionEntry[]

		if (this._projectPath) {
			const encoded = encodePath(this._projectPath)
			entries = await getSessionEntriesForProject(encoded)
		} else {
			entries = await getAllSessionEntries()
		}

		// Apply filters
		for (const filter of this.filters) {
			entries = entries.filter(filter)
		}

		// Sort by created date descending
		entries.sort(
			(a, b) => new Date(b.created).getTime() - new Date(a.created).getTime(),
		)

		// Apply limit
		if (this._limit) {
			entries = entries.slice(0, this._limit)
		}

		// Filter by subagent presence if requested
		if (this._includeSubagents) {
			const withSubagents: SessionEntry[] = []
			for (const entry of entries) {
				const result = await findSessionEntry(entry.sessionId)
				if (result) {
					const count = await countSubagents(
						result.encodedPath,
						entry.sessionId,
					)
					if (count > 0) {
						withSubagents.push(entry)
					}
				}
			}
			return withSubagents
		}

		return entries
	}

	async getWithMessages(): Promise<SessionWithMessages[]> {
		const entries = await this.get()
		const result: SessionWithMessages[] = []

		for (const entry of entries) {
			const found = await findSessionEntry(entry.sessionId)
			if (found) {
				result.push(enrichSession(entry, found.encodedPath))
			}
		}

		return result
	}
}

// ============================================
// Analytics Types
// ============================================

export interface MessageRatio {
	sessionsAnalyzed: number
	user: { total: number; avgPerSession: number }
	assistant: { total: number; avgPerSession: number }
	ratio: number // assistant messages per user message
}

export interface ContentBreakdown {
	sessionsAnalyzed: number
	userPrompts: { count: number; chars: number; avgChars: number }
	toolResults: { count: number; chars: number; avgChars: number }
	assistantText: { count: number; chars: number; avgChars: number }
	assistantToolCalls: { count: number; chars: number; avgChars: number }
	totalChars: number
}

export interface ContextMetrics {
	sessionsAnalyzed: number
	avgInputTokens: number
	avgOutputTokens: number
	avgTotalTokens: number
	maxInputTokens: number
	maxOutputTokens: number
	maxTotalTokens: number
	contextLimit: number
	avgUtilization: number // percentage of context limit used
	sessionsNearLimit: number // sessions that hit >90% of limit
}

// ============================================
// Analytics Functions
// ============================================

/**
 * Calculate message ratio between user and assistant
 */
/**
 * Get message breakdown for a specific date (YYYY-MM-DD)
 */
export async function messageBreakdownForDate(
	date: string,
): Promise<MessageRatio> {
	// Get sessions created on this specific date by filtering manually
	const entries = await getAllSessionEntries()
	const targetSessions = entries.filter((e) => e.created.startsWith(date))

	let totalUser = 0
	let totalAssistant = 0
	let sessionCount = 0

	for (const entry of targetSessions) {
		const result = await findSessionEntry(entry.sessionId)
		if (result) {
			const msgs = await readSessionMessages(
				result.encodedPath,
				entry.sessionId,
			)
			const user = msgs.filter((m) => m.type === 'user').length
			const assistant = msgs.filter((m) => m.type === 'assistant').length

			if (user > 0 || assistant > 0) {
				totalUser += user
				totalAssistant += assistant
				sessionCount++
			}
		}
	}

	return {
		sessionsAnalyzed: sessionCount,
		user: {
			total: totalUser,
			avgPerSession: sessionCount > 0 ? totalUser / sessionCount : 0,
		},
		assistant: {
			total: totalAssistant,
			avgPerSession: sessionCount > 0 ? totalAssistant / sessionCount : 0,
		},
		ratio: totalUser > 0 ? totalAssistant / totalUser : 0,
	}
}

/**
 * Get message breakdown for yesterday
 */
export async function yesterdayMessageBreakdown(): Promise<MessageRatio> {
	const yesterday = new Date()
	yesterday.setDate(yesterday.getDate() - 1)
	const yesterdayStr = yesterday.toISOString().split('T')[0]
	return messageBreakdownForDate(yesterdayStr)
}

/**
 * Calculate message ratio between user and assistant
 */
export async function messageRatio(
	limit = 500,
	after?: string,
	before?: string,
): Promise<MessageRatio> {
	let builder = query()
	if (after) builder = builder.after(after)
	if (before) builder = builder.before(before)
	const sessionsWithMsgs = await builder.limit(limit).getWithMessages()

	let totalUser = 0
	let totalAssistant = 0
	let sessionCount = 0

	for (const session of sessionsWithMsgs) {
		const msgs = await session.messages()
		const user = msgs.filter((m) => m.type === 'user').length
		const assistant = msgs.filter((m) => m.type === 'assistant').length

		if (user > 0 || assistant > 0) {
			totalUser += user
			totalAssistant += assistant
			sessionCount++
		}
	}

	return {
		sessionsAnalyzed: sessionCount,
		user: {
			total: totalUser,
			avgPerSession: sessionCount > 0 ? totalUser / sessionCount : 0,
		},
		assistant: {
			total: totalAssistant,
			avgPerSession: sessionCount > 0 ? totalAssistant / sessionCount : 0,
		},
		ratio: totalUser > 0 ? totalAssistant / totalUser : 0,
	}
}

/**
 * Get detailed content breakdown by type
 */
export async function contentBreakdown(
	limit = 500,
	after?: string,
	before?: string,
): Promise<ContentBreakdown> {
	let builder = query()
	if (after) builder = builder.after(after)
	if (before) builder = builder.before(before)
	const sessionsWithMsgs = await builder.limit(limit).getWithMessages()

	let userPromptsCount = 0
	let userPromptsChars = 0
	let toolResultsCount = 0
	let toolResultsChars = 0
	let assistantTextCount = 0
	let assistantTextChars = 0
	let assistantToolCount = 0
	let assistantToolChars = 0

	for (const session of sessionsWithMsgs) {
		const msgs = await session.messages()

		for (const m of msgs) {
			if (m.type === 'user') {
				const userMsg = m as SessionUserMessage
				const content = userMsg.message?.content as unknown
				if (typeof content === 'string') {
					userPromptsChars += content.length
					userPromptsCount++
				} else if (Array.isArray(content)) {
					for (const c of content as Array<{
						type: string
						text?: string
						content?: unknown
					}>) {
						if (c.type === 'text') {
							userPromptsChars += c.text?.length || 0
							userPromptsCount++
						}
						if (c.type === 'tool_result') {
							const cont = c.content
							const len =
								typeof cont === 'string'
									? cont.length
									: JSON.stringify(cont || '').length
							toolResultsChars += len
							toolResultsCount++
						}
					}
				}
			} else if (m.type === 'assistant') {
				const assistantMsg = m as SessionAssistantMessage
				const content = assistantMsg.message?.content
				if (Array.isArray(content)) {
					for (const c of content) {
						if (c.type === 'text') {
							assistantTextChars += c.text?.length || 0
							assistantTextCount++
						}
						if (c.type === 'tool_use') {
							assistantToolChars += JSON.stringify(
								(c as { input?: unknown }).input || {},
							).length
							assistantToolCount++
						}
					}
				}
			}
		}
	}

	const totalChars =
		userPromptsChars +
		toolResultsChars +
		assistantTextChars +
		assistantToolChars

	return {
		sessionsAnalyzed: sessionsWithMsgs.length,
		userPrompts: {
			count: userPromptsCount,
			chars: userPromptsChars,
			avgChars:
				userPromptsCount > 0
					? Math.round(userPromptsChars / userPromptsCount)
					: 0,
		},
		toolResults: {
			count: toolResultsCount,
			chars: toolResultsChars,
			avgChars:
				toolResultsCount > 0
					? Math.round(toolResultsChars / toolResultsCount)
					: 0,
		},
		assistantText: {
			count: assistantTextCount,
			chars: assistantTextChars,
			avgChars:
				assistantTextCount > 0
					? Math.round(assistantTextChars / assistantTextCount)
					: 0,
		},
		assistantToolCalls: {
			count: assistantToolCount,
			chars: assistantToolChars,
			avgChars:
				assistantToolCount > 0
					? Math.round(assistantToolChars / assistantToolCount)
					: 0,
		},
		totalChars,
	}
}

/**
 * Get context/token usage metrics per session
 */
export async function contextMetrics(
	limit = 500,
	contextLimit = 200000,
	after?: string,
	before?: string,
): Promise<ContextMetrics> {
	let builder = query()
	if (after) builder = builder.after(after)
	if (before) builder = builder.before(before)
	const sessionsWithMsgs = await builder.limit(limit).getWithMessages()

	const sessionTokens: Array<{ input: number; output: number }> = []

	for (const session of sessionsWithMsgs) {
		const msgs = await session.messages()
		let sessionInput = 0
		let sessionOutput = 0

		for (const m of msgs) {
			if (m.type === 'assistant') {
				const assistantMsg = m as SessionAssistantMessage
				const usage = assistantMsg.message?.usage
				if (usage) {
					// Input includes cache tokens
					sessionInput = Math.max(
						sessionInput,
						(usage.input_tokens || 0) +
							(usage.cache_read_input_tokens || 0) +
							(usage.cache_creation_input_tokens || 0),
					)
					sessionOutput += usage.output_tokens || 0
				}
			}
		}

		if (sessionInput > 0 || sessionOutput > 0) {
			sessionTokens.push({ input: sessionInput, output: sessionOutput })
		}
	}

	if (sessionTokens.length === 0) {
		return {
			sessionsAnalyzed: 0,
			avgInputTokens: 0,
			avgOutputTokens: 0,
			avgTotalTokens: 0,
			maxInputTokens: 0,
			maxOutputTokens: 0,
			maxTotalTokens: 0,
			contextLimit,
			avgUtilization: 0,
			sessionsNearLimit: 0,
		}
	}

	const totalInputs = sessionTokens.reduce((sum, s) => sum + s.input, 0)
	const totalOutputs = sessionTokens.reduce((sum, s) => sum + s.output, 0)
	const maxInput = Math.max(...sessionTokens.map((s) => s.input))
	const maxOutput = Math.max(...sessionTokens.map((s) => s.output))
	const maxTotal = Math.max(...sessionTokens.map((s) => s.input + s.output))
	const avgTotal = (totalInputs + totalOutputs) / sessionTokens.length
	const nearLimit = sessionTokens.filter(
		(s) => s.input >= contextLimit * 0.9,
	).length

	return {
		sessionsAnalyzed: sessionTokens.length,
		avgInputTokens: Math.round(totalInputs / sessionTokens.length),
		avgOutputTokens: Math.round(totalOutputs / sessionTokens.length),
		avgTotalTokens: Math.round(avgTotal),
		maxInputTokens: maxInput,
		maxOutputTokens: maxOutput,
		maxTotalTokens: maxTotal,
		contextLimit,
		avgUtilization: (avgTotal / contextLimit) * 100,
		sessionsNearLimit: nearLimit,
	}
}

export const sessions = {
	get,
	today: todaySessions,
	thisWeek: thisWeekSessions,
	forProject,
	recent,
	query,
	messageRatio,
	messageBreakdownForDate,
	yesterdayMessageBreakdown,
	contentBreakdown,
	contextMetrics,
}
