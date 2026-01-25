import { createReadStream } from 'node:fs'
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { getSessionPath, getSubagentsDir } from '../config'
import type { SessionMessage, SubagentSession } from '../types'

/**
 * Read all messages from a session JSONL file
 */
export async function readSessionMessages(
	encodedPath: string,
	sessionId: string,
): Promise<SessionMessage[]> {
	const sessionPath = getSessionPath(encodedPath, sessionId)
	const messages: SessionMessage[] = []

	try {
		const content = await readFile(sessionPath, 'utf-8')
		const lines = content.split('\n').filter((line) => line.trim())

		for (const line of lines) {
			try {
				const msg = JSON.parse(line) as SessionMessage
				messages.push(msg)
			} catch {
				// Skip malformed lines
			}
		}
	} catch {
		// Session file doesn't exist
	}

	return messages
}

/**
 * Stream session messages using AsyncGenerator for large files
 */
export async function* streamSessionMessages(
	encodedPath: string,
	sessionId: string,
): AsyncGenerator<SessionMessage> {
	const sessionPath = getSessionPath(encodedPath, sessionId)

	const fileStream = createReadStream(sessionPath)
	const rl = createInterface({
		input: fileStream,
		crlfDelay: Number.POSITIVE_INFINITY,
	})

	for await (const line of rl) {
		if (line.trim()) {
			try {
				yield JSON.parse(line) as SessionMessage
			} catch {
				// Skip malformed lines
			}
		}
	}
}

/**
 * Get all subagent sessions for a parent session
 */
export async function readSubagentSessions(
	encodedPath: string,
	sessionId: string,
): Promise<SubagentSession[]> {
	const subagentsDir = getSubagentsDir(encodedPath, sessionId)
	const sessions: SubagentSession[] = []

	try {
		const files = await readdir(subagentsDir)
		const jsonlFiles = files.filter((f) => f.endsWith('.jsonl'))

		for (const file of jsonlFiles) {
			const agentId = file.replace('.jsonl', '')
			const filePath = join(subagentsDir, file)

			try {
				const content = await readFile(filePath, 'utf-8')
				const lines = content.split('\n').filter((line) => line.trim())
				const messages: SessionMessage[] = []
				let slug = ''

				for (const line of lines) {
					try {
						const msg = JSON.parse(line) as SessionMessage
						messages.push(msg)
						// Extract slug from first message that has it
						if (!slug && 'slug' in msg && msg.slug) {
							slug = msg.slug as string
						}
					} catch {
						// Skip malformed lines
					}
				}

				sessions.push({
					agentId,
					slug,
					sessionId,
					messages,
				})
			} catch {
				// Skip unreadable files
			}
		}
	} catch {
		// No subagents directory
	}

	return sessions
}

/**
 * Count subagents for a session without loading all messages
 */
export async function countSubagents(
	encodedPath: string,
	sessionId: string,
): Promise<number> {
	const subagentsDir = getSubagentsDir(encodedPath, sessionId)

	try {
		const files = await readdir(subagentsDir)
		return files.filter((f) => f.endsWith('.jsonl')).length
	} catch {
		return 0
	}
}
