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
	SessionEntry,
	SessionMessage,
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

export const sessions = {
	get,
	today: todaySessions,
	thisWeek: thisWeekSessions,
	forProject,
	recent,
	query,
}
