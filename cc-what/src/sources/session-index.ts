import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { config, getSessionsIndexPath } from '../config'
import type { SessionEntry, SessionIndex } from '../types'

/**
 * Read sessions-index.json for a specific project
 */
export async function readSessionIndex(
	encodedPath: string,
): Promise<SessionIndex> {
	const indexPath = getSessionsIndexPath(encodedPath)
	const content = await readFile(indexPath, 'utf-8')
	return JSON.parse(content) as SessionIndex
}

/**
 * Get all project directories (encoded paths)
 */
export async function listProjects(): Promise<string[]> {
	try {
		const entries = await readdir(config.projectsDir, { withFileTypes: true })
		return entries
			.filter((e) => e.isDirectory())
			.map((e) => e.name)
			.filter((name) => !name.startsWith('.'))
	} catch {
		return []
	}
}

/**
 * Get all session entries across all projects
 */
export async function getAllSessionEntries(): Promise<SessionEntry[]> {
	const projects = await listProjects()
	const allEntries: SessionEntry[] = []

	for (const project of projects) {
		try {
			const index = await readSessionIndex(project)
			allEntries.push(...index.entries)
		} catch {
			// Skip projects without valid index
		}
	}

	return allEntries
}

/**
 * Get session entries for a specific project
 */
export async function getSessionEntriesForProject(
	encodedPath: string,
): Promise<SessionEntry[]> {
	try {
		const index = await readSessionIndex(encodedPath)
		return index.entries
	} catch {
		return []
	}
}

/**
 * Find a session entry by ID across all projects
 */
export async function findSessionEntry(
	sessionId: string,
): Promise<{ entry: SessionEntry; encodedPath: string } | null> {
	const projects = await listProjects()

	for (const project of projects) {
		try {
			const index = await readSessionIndex(project)
			const entry = index.entries.find((e) => e.sessionId === sessionId)
			if (entry) {
				return { entry, encodedPath: project }
			}
		} catch {
			// Skip projects without valid index
		}
	}

	return null
}
