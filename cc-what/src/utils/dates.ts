/**
 * Get today's date as YYYY-MM-DD string
 */
export function today(): string {
	return formatDate(new Date())
}

/**
 * Get the start of the current week (Monday) as YYYY-MM-DD
 */
export function startOfThisWeek(): string {
	const now = new Date()
	const day = now.getDay()
	const diff = now.getDate() - day + (day === 0 ? -6 : 1) // Adjust for Sunday
	const monday = new Date(now.setDate(diff))
	return formatDate(monday)
}

/**
 * Get the end of the current week (Sunday) as YYYY-MM-DD
 */
export function endOfThisWeek(): string {
	const monday = new Date(startOfThisWeek())
	const sunday = new Date(monday)
	sunday.setDate(monday.getDate() + 6)
	return formatDate(sunday)
}

/**
 * Get the start of the current month as YYYY-MM-DD
 */
export function startOfThisMonth(): string {
	const now = new Date()
	return formatDate(new Date(now.getFullYear(), now.getMonth(), 1))
}

/**
 * Format a Date object as YYYY-MM-DD
 */
export function formatDate(date: Date): string {
	return date.toISOString().split('T')[0]
}

/**
 * Parse a YYYY-MM-DD string to a Date object
 */
export function parseDate(dateStr: string): Date {
	return new Date(`${dateStr}T00:00:00`)
}

/**
 * Check if a date string is within a range
 */
export function isWithinRange(
	dateStr: string,
	after?: string,
	before?: string,
): boolean {
	const date = parseDate(dateStr)

	if (after && date < parseDate(after)) {
		return false
	}

	if (before && date > parseDate(before)) {
		return false
	}

	return true
}

/**
 * Get dates for the last N days
 */
export function lastNDays(n: number): { start: string; end: string } {
	const end = new Date()
	const start = new Date()
	start.setDate(end.getDate() - n + 1)
	return {
		start: formatDate(start),
		end: formatDate(end),
	}
}
