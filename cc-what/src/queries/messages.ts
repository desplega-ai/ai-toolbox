import { readSessionMessages } from '../sources/session'
import {
	findSessionEntry,
	getAllSessionEntries,
} from '../sources/session-index'
import type { SessionMessage } from '../types'

/**
 * Get recent messages across all sessions
 */
export async function recent(limit = 50): Promise<SessionMessage[]> {
	const entries = await getAllSessionEntries()
	const sorted = entries.sort(
		(a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime(),
	)

	const messages: SessionMessage[] = []
	for (const entry of sorted) {
		if (messages.length >= limit) break

		const found = await findSessionEntry(entry.sessionId)
		if (found) {
			const sessionMsgs = await readSessionMessages(
				found.encodedPath,
				entry.sessionId,
			)
			messages.push(...sessionMsgs)
		}
	}

	return messages.slice(0, limit)
}

/**
 * Get messages for a specific session
 */
export async function forSession(sessionId: string): Promise<SessionMessage[]> {
	const found = await findSessionEntry(sessionId)
	if (!found) return []
	return readSessionMessages(found.encodedPath, sessionId)
}

export const messages = {
	recent,
	forSession,
}
