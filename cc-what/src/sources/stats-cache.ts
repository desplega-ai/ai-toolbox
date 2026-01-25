import { readFile } from 'node:fs/promises'
import { config } from '../config'
import type { StatsCache } from '../types'

let cachedStats: StatsCache | null = null
let cacheTimestamp = 0
const CACHE_TTL_MS = 60_000 // 1 minute

/**
 * Read and parse stats-cache.json with in-memory caching
 */
export async function readStatsCache(): Promise<StatsCache> {
	const now = Date.now()

	if (cachedStats && now - cacheTimestamp < CACHE_TTL_MS) {
		return cachedStats
	}

	const content = await readFile(config.statsCache, 'utf-8')
	cachedStats = JSON.parse(content) as StatsCache
	cacheTimestamp = now

	return cachedStats
}

/**
 * Clear the in-memory cache
 */
export function clearStatsCache(): void {
	cachedStats = null
	cacheTimestamp = 0
}

/**
 * Check if stats cache file exists
 */
export async function statsCacheExists(): Promise<boolean> {
	try {
		await readFile(config.statsCache)
		return true
	} catch {
		return false
	}
}
