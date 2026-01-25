/**
 * Encode a file path for use as a directory name.
 * Claude Code uses a specific encoding: all `/` become `-`
 * e.g., /Users/taras/code -> -Users-taras-code
 */
export function encodePath(path: string): string {
	return path.replace(/\//g, '-')
}

/**
 * Decode a directory name back to a file path.
 * e.g., -Users-taras-code -> /Users/taras/code
 */
export function decodePath(encoded: string): string {
	return encoded.replace(/-/g, '/')
}

/**
 * Extract project path from a sessions-index.json path.
 */
export function extractEncodedPath(sessionsIndexPath: string): string {
	const parts = sessionsIndexPath.split('/')
	// Path format: ~/.claude/projects/{encodedPath}/sessions-index.json
	const projectsIndex = parts.indexOf('projects')
	if (projectsIndex === -1) {
		throw new Error('Invalid sessions-index.json path')
	}
	return parts[projectsIndex + 1]
}
