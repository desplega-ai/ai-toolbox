import { readHistory } from '../sources/history'
import type { HistoryEntry } from '../types'
import { isWithinRange } from '../utils/dates'

export interface CommandUsage {
	command: string
	count: number
}

export interface PromptStats {
	total: number
	byMonth: Record<string, number>
	byProject: Record<string, number>
	avgLength: number
}

/**
 * Extract slash commands from a prompt
 * Matches patterns like /research, /commit, /desplega:research, etc.
 * Must be at start of text or after whitespace, not part of a path
 */
function extractCommands(text: string): string[] {
	// Match commands at start or after whitespace, with optional namespace:command format
	// Exclude path-like patterns (multiple slashes, common path segments)
	const pattern = /(?:^|\s)(\/[\w-]+(?::[\w-]+)*)/g
	const matches: string[] = []
	let match: RegExpExecArray | null

	while ((match = pattern.exec(text)) !== null) {
		const cmd = match[1]
		// Filter out path-like patterns
		if (isLikelyCommand(cmd)) {
			matches.push(cmd)
		}
	}

	return matches
}

/**
 * Check if a slash-prefixed string looks like a command vs a path
 */
function isLikelyCommand(text: string): boolean {
	// Common path segments to exclude
	const pathSegments = [
		'/users',
		'/lib',
		'/bin',
		'/var',
		'/tmp',
		'/etc',
		'/opt',
		'/home',
		'/root',
		'/usr',
		'/dev',
		'/proc',
		'/sys',
		'/documents',
		'/desktop',
		'/downloads',
		'/applications',
		'/library',
		'/volumes',
		'/private',
		'/cores',
		'/node_modules',
		'/dist',
		'/build',
		'/src',
		'/test',
		'/tests',
		'/venv',
		'/env',
		'/python',
		'/python3',
		'/site-packages',
		'/starlette',
		'/middleware',
		'/api',
		'/app',
		'/pkg',
		'/taras',
		'/code',
		'/shared',
		'/cope',
		'/be',
		'/fe',
		'/.',
		'/package',
		'/index',
		'/main',
		'/config',
	]

	const lower = text.toLowerCase()

	// Exclude if matches common path segment
	if (pathSegments.some((p) => lower === p || lower.startsWith(p + '/'))) {
		return false
	}

	// Likely a command if it has namespace:name format
	if (text.includes(':')) {
		return true
	}

	// Known commands without namespace
	const knownCommands = [
		'/research',
		'/plan',
		'/commit',
		'/clear',
		'/help',
		'/init',
		'/config',
		'/status',
		'/review',
		'/test',
		'/build',
		'/deploy',
		'/run',
		'/start',
		'/stop',
		'/add',
		'/remove',
		'/update',
		'/delete',
		'/create',
		'/memory',
		'/forget',
		'/remember',
		'/note',
		'/todo',
	]

	return knownCommands.some((c) => lower === c || lower.startsWith(c + ' '))
}

/**
 * Get all slash command usage
 */
export async function commands(
	after?: string,
	before?: string,
): Promise<CommandUsage[]> {
	const history = await readHistory()
	const counts: Record<string, number> = {}

	for (const entry of history) {
		const date = new Date(entry.timestamp).toISOString().slice(0, 10)
		if (!isWithinRange(date, after, before)) continue

		const cmds = extractCommands(entry.display)
		for (const cmd of cmds) {
			const normalized = cmd.toLowerCase()
			counts[normalized] = (counts[normalized] || 0) + 1
		}
	}

	return Object.entries(counts)
		.map(([command, count]) => ({ command, count }))
		.sort((a, b) => b.count - a.count)
}

/**
 * Get usage for commands matching a pattern
 */
export async function commandsMatching(
	pattern: RegExp,
	after?: string,
	before?: string,
): Promise<{
	total: number
	byVariant: CommandUsage[]
	byMonth: Record<string, number>
}> {
	const history = await readHistory()
	const byVariant: Record<string, number> = {}
	const byMonth: Record<string, number> = {}
	let total = 0

	for (const entry of history) {
		const date = new Date(entry.timestamp).toISOString().slice(0, 10)
		if (!isWithinRange(date, after, before)) continue

		if (pattern.test(entry.display)) {
			total++
			const month = date.slice(0, 7)
			byMonth[month] = (byMonth[month] || 0) + 1

			// Extract the specific command variant
			const match = entry.display.match(pattern)
			if (match) {
				const variant = match[0].toLowerCase()
				byVariant[variant] = (byVariant[variant] || 0) + 1
			}
		}
	}

	return {
		total,
		byVariant: Object.entries(byVariant)
			.map(([command, count]) => ({ command, count }))
			.sort((a, b) => b.count - a.count),
		byMonth,
	}
}

/**
 * Get research command usage (/research, /base:research, /desplega:research, etc.)
 */
export async function researches(
	after?: string,
	before?: string,
): Promise<{
	total: number
	byVariant: CommandUsage[]
	byMonth: Record<string, number>
}> {
	return commandsMatching(/\/(\w+:)?research/i, after, before)
}

/**
 * Get plan command usage (/plan, /create-plan, /desplega:create-plan, etc.)
 */
export async function plans(
	after?: string,
	before?: string,
): Promise<{
	total: number
	byVariant: CommandUsage[]
	byMonth: Record<string, number>
}> {
	return commandsMatching(/\/(\w+:)?(create-)?plan/i, after, before)
}

/**
 * Get commit command usage
 */
export async function commits(
	after?: string,
	before?: string,
): Promise<{
	total: number
	byVariant: CommandUsage[]
	byMonth: Record<string, number>
}> {
	return commandsMatching(/\/(\w+:)?commit/i, after, before)
}

/**
 * Get top N most used commands
 */
export async function topCommands(
	n = 10,
	after?: string,
	before?: string,
): Promise<CommandUsage[]> {
	const all = await commands(after, before)
	return all.slice(0, n)
}

/**
 * Get general prompt statistics
 */
export async function stats(
	after?: string,
	before?: string,
): Promise<PromptStats> {
	const history = await readHistory()
	const byMonth: Record<string, number> = {}
	const byProject: Record<string, number> = {}
	let totalLength = 0
	let count = 0

	for (const entry of history) {
		const date = new Date(entry.timestamp).toISOString().slice(0, 10)
		if (!isWithinRange(date, after, before)) continue

		count++
		totalLength += entry.display.length

		const month = date.slice(0, 7)
		byMonth[month] = (byMonth[month] || 0) + 1

		const project = entry.project || 'unknown'
		byProject[project] = (byProject[project] || 0) + 1
	}

	return {
		total: count,
		byMonth,
		byProject,
		avgLength: count > 0 ? Math.round(totalLength / count) : 0,
	}
}

/**
 * Get prompts by project
 */
export async function byProject(
	after?: string,
	before?: string,
): Promise<Array<{ project: string; count: number }>> {
	const s = await stats(after, before)
	return Object.entries(s.byProject)
		.map(([project, count]) => ({ project, count }))
		.sort((a, b) => b.count - a.count)
}

/**
 * Get prompts by month
 */
export async function byMonth(
	after?: string,
	before?: string,
): Promise<Array<{ month: string; count: number }>> {
	const s = await stats(after, before)
	return Object.entries(s.byMonth)
		.map(([month, count]) => ({ month, count }))
		.sort((a, b) => a.month.localeCompare(b.month))
}

/**
 * Search prompts containing text
 */
export async function search(
	text: string,
	after?: string,
	before?: string,
): Promise<HistoryEntry[]> {
	const history = await readHistory()
	const lower = text.toLowerCase()

	return history.filter((entry) => {
		const date = new Date(entry.timestamp).toISOString().slice(0, 10)
		if (!isWithinRange(date, after, before)) return false
		return entry.display.toLowerCase().includes(lower)
	})
}

/**
 * Get date range of history
 */
export async function dateRange(): Promise<{
	from: string
	to: string
	days: number
}> {
	const history = await readHistory()
	if (history.length === 0) {
		return { from: '', to: '', days: 0 }
	}

	const timestamps = history.map((h) => h.timestamp)
	const min = Math.min(...timestamps)
	const max = Math.max(...timestamps)
	const from = new Date(min).toISOString().slice(0, 10)
	const to = new Date(max).toISOString().slice(0, 10)
	const days = Math.ceil((max - min) / (1000 * 60 * 60 * 24)) + 1

	return { from, to, days }
}

export const prompts = {
	commands,
	commandsMatching,
	topCommands,
	researches,
	plans,
	commits,
	stats,
	byProject,
	byMonth,
	search,
	dateRange,
}
