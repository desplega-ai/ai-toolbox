import { createReadStream } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createInterface } from 'node:readline'
import { config } from '../config'
import type { HistoryEntry } from '../types'

/**
 * Read all history entries
 */
export async function readHistory(): Promise<HistoryEntry[]> {
	const entries: HistoryEntry[] = []

	try {
		const content = await readFile(config.historyFile, 'utf-8')
		const lines = content.split('\n').filter((line) => line.trim())

		for (const line of lines) {
			try {
				const entry = JSON.parse(line) as HistoryEntry
				entries.push(entry)
			} catch {
				// Skip malformed lines
			}
		}
	} catch {
		// History file doesn't exist
	}

	return entries
}

/**
 * Stream history entries for large files
 */
export async function* streamHistory(): AsyncGenerator<HistoryEntry> {
	const fileStream = createReadStream(config.historyFile)
	const rl = createInterface({
		input: fileStream,
		crlfDelay: Number.POSITIVE_INFINITY,
	})

	for await (const line of rl) {
		if (line.trim()) {
			try {
				yield JSON.parse(line) as HistoryEntry
			} catch {
				// Skip malformed lines
			}
		}
	}
}

/**
 * Get recent history entries
 */
export async function getRecentHistory(limit = 50): Promise<HistoryEntry[]> {
	const entries = await readHistory()
	return entries.slice(-limit).reverse()
}

/**
 * Search history by display text
 */
export async function searchHistory(query: string): Promise<HistoryEntry[]> {
	const entries = await readHistory()
	const lower = query.toLowerCase()
	return entries.filter((e) => e.display.toLowerCase().includes(lower))
}

/**
 * Get history for a specific project
 */
export async function getHistoryForProject(
	projectPath: string,
): Promise<HistoryEntry[]> {
	const entries = await readHistory()
	return entries.filter((e) => e.project === projectPath)
}
