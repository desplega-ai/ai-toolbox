import {
	getSessionEntriesForProject,
	listProjects as listProjectDirs,
} from '../sources/session-index'
import type { ProjectStats, SessionEntry } from '../types'
import { decodePath } from '../utils/paths'

/**
 * Get all projects with stats
 */
export async function all(): Promise<ProjectStats[]> {
	const projects = await listProjectDirs()
	const result: ProjectStats[] = []

	for (const encodedPath of projects) {
		const entries = await getSessionEntriesForProject(encodedPath)
		const messageCount = entries.reduce((sum, e) => sum + e.messageCount, 0)

		let lastModified = ''
		if (entries.length > 0) {
			lastModified = entries.reduce(
				(latest, e) => (e.modified > latest ? e.modified : latest),
				entries[0].modified,
			)
		}

		result.push({
			path: decodePath(encodedPath),
			encodedPath,
			messageCount,
			sessionCount: entries.length,
			lastModified,
		})
	}

	return result
}

/**
 * Get top projects by message count
 */
export async function byMessageCount(limit = 10): Promise<ProjectStats[]> {
	const projects = await all()
	return projects
		.sort((a, b) => b.messageCount - a.messageCount)
		.slice(0, limit)
}

/**
 * Get top projects by session count
 */
export async function bySessionCount(limit = 10): Promise<ProjectStats[]> {
	const projects = await all()
	return projects
		.sort((a, b) => b.sessionCount - a.sessionCount)
		.slice(0, limit)
}

/**
 * Get recently active projects
 */
export async function recent(limit = 10): Promise<ProjectStats[]> {
	const projects = await all()
	return projects
		.filter((p) => p.lastModified)
		.sort((a, b) => b.lastModified.localeCompare(a.lastModified))
		.slice(0, limit)
}

/**
 * Get project by path
 */
export async function byPath(
	projectPath: string,
): Promise<ProjectStats | null> {
	const projects = await all()
	return projects.find((p) => p.path === projectPath) || null
}

/**
 * Search projects by path
 */
export async function search(query: string): Promise<ProjectStats[]> {
	const projects = await all()
	const lower = query.toLowerCase()
	return projects.filter((p) => p.path.toLowerCase().includes(lower))
}

/**
 * Get sessions for a project
 */
export async function sessions(encodedPath: string): Promise<SessionEntry[]> {
	return getSessionEntriesForProject(encodedPath)
}

export const projects = {
	all,
	byMessageCount,
	bySessionCount,
	recent,
	byPath,
	search,
	sessions,
}
