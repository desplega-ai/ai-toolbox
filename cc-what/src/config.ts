import { homedir } from 'node:os'
import { join } from 'node:path'

const CLAUDE_DIR = join(homedir(), '.claude')

export const config = {
	claudeDir: CLAUDE_DIR,
	statsCache: join(CLAUDE_DIR, 'stats-cache.json'),
	storeDb: join(CLAUDE_DIR, '__store.db'),
	historyFile: join(CLAUDE_DIR, 'history.jsonl'),
	projectsDir: join(CLAUDE_DIR, 'projects'),
} as const

export function getProjectDir(encodedPath: string): string {
	return join(config.projectsDir, encodedPath)
}

export function getSessionsIndexPath(encodedPath: string): string {
	return join(getProjectDir(encodedPath), 'sessions-index.json')
}

export function getSessionPath(encodedPath: string, sessionId: string): string {
	return join(getProjectDir(encodedPath), `${sessionId}.jsonl`)
}

export function getSubagentsDir(
	encodedPath: string,
	sessionId: string,
): string {
	return join(getProjectDir(encodedPath), sessionId, 'subagents')
}
