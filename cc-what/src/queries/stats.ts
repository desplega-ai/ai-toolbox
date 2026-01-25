import { readStatsCache } from '../sources/stats-cache'
import type {
	DailyActivity,
	DailyModelTokens,
	LongestSession,
	ModelUsage,
} from '../types'
import { isWithinRange, startOfThisWeek, today } from '../utils/dates'

/**
 * Get daily activity stats
 */
export async function daily(
	after?: string,
	before?: string,
): Promise<DailyActivity[]> {
	const stats = await readStatsCache()

	if (!after && !before) {
		return stats.dailyActivity
	}

	return stats.dailyActivity.filter((d) => isWithinRange(d.date, after, before))
}

/**
 * Get today's activity
 */
export async function todayActivity(): Promise<DailyActivity | undefined> {
	const stats = await readStatsCache()
	const todayStr = today()
	return stats.dailyActivity.find((d) => d.date === todayStr)
}

/**
 * Get this week's activity
 */
export async function thisWeekActivity(): Promise<DailyActivity[]> {
	const weekStart = startOfThisWeek()
	return daily(weekStart)
}

/**
 * Get model usage stats
 */
export async function models(): Promise<Record<string, ModelUsage>> {
	const stats = await readStatsCache()
	return stats.modelUsage
}

/**
 * Get usage for a specific model
 */
export async function model(
	modelName: string,
): Promise<ModelUsage | undefined> {
	const usage = await models()
	return usage[modelName]
}

/**
 * Get daily token counts by model
 */
export async function dailyTokens(
	after?: string,
	before?: string,
): Promise<DailyModelTokens[]> {
	const stats = await readStatsCache()

	if (!after && !before) {
		return stats.dailyModelTokens
	}

	return stats.dailyModelTokens.filter((d) =>
		isWithinRange(d.date, after, before),
	)
}

/**
 * Get message counts by hour of day
 */
export async function byHour(): Promise<Record<string, number>> {
	const stats = await readStatsCache()
	return stats.hourCounts
}

/**
 * Get peak activity hour
 */
export async function peakHour(): Promise<{
	hour: number
	count: number
} | null> {
	const counts = await byHour()
	const entries = Object.entries(counts)

	if (entries.length === 0) {
		return null
	}

	const [hour, count] = entries.reduce((max, current) =>
		current[1] > max[1] ? current : max,
	)

	return { hour: Number.parseInt(hour, 10), count }
}

/**
 * Get total sessions and messages
 */
export async function totals(): Promise<{
	sessions: number
	messages: number
}> {
	const stats = await readStatsCache()
	return {
		sessions: stats.totalSessions,
		messages: stats.totalMessages,
	}
}

/**
 * Get the longest session info
 */
export async function longestSession(): Promise<LongestSession> {
	const stats = await readStatsCache()
	return stats.longestSession
}

/**
 * Get the first session date
 */
export async function firstSessionDate(): Promise<string> {
	const stats = await readStatsCache()
	return stats.firstSessionDate
}

/**
 * Get last computed date
 */
export async function lastUpdated(): Promise<string> {
	const stats = await readStatsCache()
	return stats.lastComputedDate
}

/**
 * Get total cost across all models
 */
export async function totalCost(): Promise<number> {
	const usage = await models()
	return Object.values(usage).reduce((sum, m) => sum + m.costUSD, 0)
}

/**
 * Get total tokens across all models
 */
export async function totalTokens(): Promise<{
	input: number
	output: number
	cacheRead: number
	cacheCreation: number
}> {
	const usage = await models()
	const totals = {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheCreation: 0,
	}

	for (const m of Object.values(usage)) {
		totals.input += m.inputTokens
		totals.output += m.outputTokens
		totals.cacheRead += m.cacheReadInputTokens
		totals.cacheCreation += m.cacheCreationInputTokens
	}

	return totals
}

export const stats = {
	daily,
	todayActivity,
	thisWeekActivity,
	models,
	model,
	dailyTokens,
	byHour,
	peakHour,
	totals,
	longestSession,
	firstSessionDate,
	lastUpdated,
	totalCost,
	totalTokens,
}
