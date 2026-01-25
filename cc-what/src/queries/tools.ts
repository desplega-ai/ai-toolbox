import { readSessionMessages } from '../sources/session'
import {
	findSessionEntry,
	getAllSessionEntries,
} from '../sources/session-index'
import type { SessionAssistantMessage, SessionMessage } from '../types'
import { isWithinRange, today } from '../utils/dates'

export interface ToolUsage {
	name: string
	count: number
}

export interface LineChanges {
	added: number
	removed: number
	modified: number // files with both adds and removes
	filesChanged: number
}

export interface FileChange {
	filePath: string
	linesAdded: number
	linesRemoved: number
	toolName: 'Write' | 'Edit'
}

/**
 * Extract tool calls from a session message
 */
function extractToolCalls(
	message: SessionMessage,
): Array<{ name: string; input: Record<string, unknown> }> {
	if (message.type !== 'assistant') return []
	const assistantMsg = message as SessionAssistantMessage
	const content = assistantMsg.message?.content
	if (!Array.isArray(content)) return []

	return content
		.filter((c) => c.type === 'tool_use')
		.map((c) => ({
			name: (c as { name: string }).name,
			input: (c as { input: Record<string, unknown> }).input,
		}))
}

/**
 * Count lines in a string
 */
function countLines(text: string | undefined): number {
	if (!text) return 0
	return text.split('\n').length
}

/**
 * Calculate line changes from Write tool call
 * Write replaces entire file, so we need to track old vs new
 * For now, we count all lines as "added" since we don't have the old content
 */
function analyzeWriteCall(input: Record<string, unknown>): FileChange | null {
	const filePath = input.file_path as string | undefined
	const content = input.content as string | undefined

	if (!filePath) return null

	return {
		filePath,
		linesAdded: countLines(content),
		linesRemoved: 0, // Can't know without reading old file
		toolName: 'Write',
	}
}

/**
 * Calculate line changes from Edit tool call
 */
function analyzeEditCall(input: Record<string, unknown>): FileChange | null {
	const filePath = input.file_path as string | undefined
	const oldString = input.old_string as string | undefined
	const newString = input.new_string as string | undefined

	if (!filePath) return null

	const oldLines = countLines(oldString)
	const newLines = countLines(newString)

	return {
		filePath,
		linesAdded: Math.max(0, newLines - oldLines),
		linesRemoved: Math.max(0, oldLines - newLines),
		toolName: 'Edit',
	}
}

/**
 * Get tool usage counts across all sessions
 */
export async function usage(
	after?: string,
	before?: string,
): Promise<ToolUsage[]> {
	const counts: Record<string, number> = {}
	const entries = await getAllSessionEntries()

	for (const entry of entries) {
		const entryDate = entry.created.split('T')[0]
		if (!isWithinRange(entryDate, after, before)) continue

		const result = await findSessionEntry(entry.sessionId)
		if (!result) continue

		const messages = await readSessionMessages(
			result.encodedPath,
			entry.sessionId,
		)

		for (const msg of messages) {
			const toolCalls = extractToolCalls(msg)
			for (const call of toolCalls) {
				counts[call.name] = (counts[call.name] || 0) + 1
			}
		}
	}

	return Object.entries(counts)
		.map(([name, count]) => ({ name, count }))
		.sort((a, b) => b.count - a.count)
}

/**
 * Get top N most used tools
 */
export async function topTools(
	n = 10,
	after?: string,
	before?: string,
): Promise<ToolUsage[]> {
	const all = await usage(after, before)
	return all.slice(0, n)
}

/**
 * Get today's tool usage
 */
export async function todayUsage(): Promise<ToolUsage[]> {
	const todayStr = today()
	return usage(todayStr, todayStr)
}

/**
 * Get line changes across all sessions
 */
export async function lineChanges(
	after?: string,
	before?: string,
): Promise<LineChanges> {
	const result: LineChanges = {
		added: 0,
		removed: 0,
		modified: 0,
		filesChanged: 0,
	}
	const filesWithChanges = new Set<string>()
	const filesWithBothAddRemove = new Set<string>()

	const entries = await getAllSessionEntries()

	for (const entry of entries) {
		const entryDate = entry.created.split('T')[0]
		if (!isWithinRange(entryDate, after, before)) continue

		const found = await findSessionEntry(entry.sessionId)
		if (!found) continue

		const messages = await readSessionMessages(
			found.encodedPath,
			entry.sessionId,
		)

		for (const msg of messages) {
			const toolCalls = extractToolCalls(msg)
			for (const call of toolCalls) {
				let change: FileChange | null = null

				if (call.name === 'Write') {
					change = analyzeWriteCall(call.input)
				} else if (call.name === 'Edit') {
					change = analyzeEditCall(call.input)
				}

				if (change) {
					filesWithChanges.add(change.filePath)
					result.added += change.linesAdded
					result.removed += change.linesRemoved

					if (change.linesAdded > 0 && change.linesRemoved > 0) {
						filesWithBothAddRemove.add(change.filePath)
					}
				}
			}
		}
	}

	result.filesChanged = filesWithChanges.size
	result.modified = filesWithBothAddRemove.size

	return result
}

/**
 * Get today's line changes
 */
export async function todayLineChanges(): Promise<LineChanges> {
	const todayStr = today()
	return lineChanges(todayStr, todayStr)
}

/**
 * Get detailed file changes
 */
export async function fileChanges(
	after?: string,
	before?: string,
): Promise<FileChange[]> {
	const changes: FileChange[] = []
	const entries = await getAllSessionEntries()

	for (const entry of entries) {
		const entryDate = entry.created.split('T')[0]
		if (!isWithinRange(entryDate, after, before)) continue

		const found = await findSessionEntry(entry.sessionId)
		if (!found) continue

		const messages = await readSessionMessages(
			found.encodedPath,
			entry.sessionId,
		)

		for (const msg of messages) {
			const toolCalls = extractToolCalls(msg)
			for (const call of toolCalls) {
				let change: FileChange | null = null

				if (call.name === 'Write') {
					change = analyzeWriteCall(call.input)
				} else if (call.name === 'Edit') {
					change = analyzeEditCall(call.input)
				}

				if (change) {
					changes.push(change)
				}
			}
		}
	}

	return changes
}

/**
 * Get skill/Task agent usage
 */
export async function skillUsage(
	after?: string,
	before?: string,
): Promise<ToolUsage[]> {
	const counts: Record<string, number> = {}
	const entries = await getAllSessionEntries()

	for (const entry of entries) {
		const entryDate = entry.created.split('T')[0]
		if (!isWithinRange(entryDate, after, before)) continue

		const found = await findSessionEntry(entry.sessionId)
		if (!found) continue

		const messages = await readSessionMessages(
			found.encodedPath,
			entry.sessionId,
		)

		for (const msg of messages) {
			const toolCalls = extractToolCalls(msg)
			for (const call of toolCalls) {
				// Skill tool calls
				if (call.name === 'Skill') {
					const skill = call.input.skill as string | undefined
					if (skill) {
						counts[`/${skill}`] = (counts[`/${skill}`] || 0) + 1
					}
				}
				// Task tool calls (sub-agents)
				if (call.name === 'Task') {
					const subagentType = call.input.subagent_type as string | undefined
					if (subagentType) {
						counts[`Task:${subagentType}`] =
							(counts[`Task:${subagentType}`] || 0) + 1
					}
				}
			}
		}
	}

	return Object.entries(counts)
		.map(([name, count]) => ({ name, count }))
		.sort((a, b) => b.count - a.count)
}

export const tools = {
	usage,
	topTools,
	todayUsage,
	lineChanges,
	todayLineChanges,
	fileChanges,
	skillUsage,
}
