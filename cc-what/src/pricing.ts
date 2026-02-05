import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

const LITELLM_URL =
	'https://raw.githubusercontent.com/BerriAI/litellm/refs/heads/main/model_prices_and_context_window.json'
const CACHE_DIR = join(homedir(), '.claude')
const CACHE_PATH = join(CACHE_DIR, 'cc-what-pricing.json')
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

/**
 * Official Anthropic pricing (as of 2026-02)
 * Source: https://www.anthropic.com/pricing
 *
 * Format: [input $/MTok, output $/MTok, cache_write $/MTok (5min), cache_read $/MTok]
 *
 * Model ID patterns:
 *   claude-opus-4-5-*    → Opus 4.5
 *   claude-opus-4-1-*    → Opus 4.1
 *   claude-opus-4-*      → Opus 4 (not 4.1 or 4.5)
 *   claude-sonnet-4-5-*  → Sonnet 4.5
 *   claude-sonnet-4-*    → Sonnet 4 (not 4.5)
 *   claude-sonnet-3-7-*  → Sonnet 3.7 (deprecated)
 *   claude-haiku-4-5-*   → Haiku 4.5
 *   claude-haiku-3-5-*   → Haiku 3.5
 *   claude-opus-3-*      → Opus 3 (deprecated)
 *   claude-haiku-3-*     → Haiku 3 (not 3.5)
 */
const ANTHROPIC_PRICING: Record<
	string,
	{ input: number; output: number; cacheWrite: number; cacheRead: number }
> = {
	// Opus family
	'opus-4.5': { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 },
	'opus-4.1': { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 },
	'opus-4': { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 },
	'opus-3': { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 },
	// Sonnet family
	'sonnet-4.5': { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 },
	'sonnet-4': { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 },
	'sonnet-3.7': { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 },
	// Haiku family
	'haiku-4.5': { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 },
	'haiku-3.5': { input: 0.8, output: 4, cacheWrite: 1, cacheRead: 0.08 },
	'haiku-3': { input: 0.25, output: 1.25, cacheWrite: 0.3, cacheRead: 0.03 },
}

/**
 * Extract model family and version from full model ID
 * e.g., "claude-opus-4-5-20251101" → "opus-4.5"
 */
function parseModelFamily(modelId: string): string | null {
	// Pattern: claude-{family}-{major}-{minor?}-{date}
	const match = modelId.match(/^claude-(\w+)-(\d+)(?:-(\d+))?-\d+$/)
	if (!match) return null

	const [, family, major, minor] = match
	if (minor) {
		return `${family}-${major}.${minor}`
	}
	return `${family}-${major}`
}

/**
 * Get official Anthropic pricing for a model ID
 * Returns pricing in $/MTok format, or null if unknown
 */
export function getAnthropicPricing(
	modelId: string,
): (typeof ANTHROPIC_PRICING)[string] | null {
	const family = parseModelFamily(modelId)
	if (!family) return null
	return ANTHROPIC_PRICING[family] ?? null
}

/**
 * Pricing data for a single model
 */
export interface ModelPricing {
	input_cost_per_token: number
	output_cost_per_token: number
	cache_creation_input_token_cost?: number
	cache_read_input_token_cost?: number
	max_input_tokens?: number
	max_output_tokens?: number
	litellm_provider?: string
}

/**
 * Claude models pricing database
 */
export type PricingDatabase = Record<string, ModelPricing>

/**
 * Token counts for cost computation
 */
export interface TokenCounts {
	input: number
	output: number
	cacheCreation: number
	cacheRead: number
}

/**
 * Computed cost breakdown
 */
export interface ComputedCost {
	total: number
	input: number
	output: number
	cacheCreation: number
	cacheRead: number
}

interface CachedPricing {
	timestamp: number
	data: PricingDatabase
}

let memoryCache: CachedPricing | null = null

/**
 * Default pricing (Sonnet 4.5) for unknown models
 */
export function getDefaultPricing(): ModelPricing {
	return {
		input_cost_per_token: 0.000003,
		output_cost_per_token: 0.000015,
		cache_creation_input_token_cost: 0.00000375,
		cache_read_input_token_cost: 0.0000003,
	}
}

/**
 * Convert Anthropic pricing ($/MTok) to ModelPricing (per token)
 */
function anthropicToModelPricing(
	pricing: (typeof ANTHROPIC_PRICING)[string],
): ModelPricing {
	return {
		input_cost_per_token: pricing.input / 1_000_000,
		output_cost_per_token: pricing.output / 1_000_000,
		cache_creation_input_token_cost: pricing.cacheWrite / 1_000_000,
		cache_read_input_token_cost: pricing.cacheRead / 1_000_000,
	}
}

/**
 * Read cached pricing from disk
 */
async function readCache(): Promise<CachedPricing | null> {
	try {
		const content = await readFile(CACHE_PATH, 'utf-8')
		return JSON.parse(content) as CachedPricing
	} catch {
		return null
	}
}

/**
 * Write pricing to disk cache
 */
async function writeCache(data: PricingDatabase): Promise<void> {
	const cached: CachedPricing = {
		timestamp: Date.now(),
		data,
	}
	try {
		await mkdir(CACHE_DIR, { recursive: true })
		await writeFile(CACHE_PATH, JSON.stringify(cached, null, 2))
	} catch {
		// Ignore write errors
	}
}

/**
 * Filter LiteLLM pricing to Claude models only
 */
function filterClaudeModels(
	allPricing: Record<string, ModelPricing>,
): PricingDatabase {
	const result: PricingDatabase = {}
	for (const [key, value] of Object.entries(allPricing)) {
		// Only direct Anthropic API models (no bedrock/azure prefixes)
		if (key.startsWith('claude-') && !key.includes('/')) {
			result[key] = value
		}
	}
	return result
}

/**
 * Fetch pricing from LiteLLM
 */
async function fetchFromLiteLLM(): Promise<PricingDatabase> {
	const response = await fetch(LITELLM_URL)
	if (!response.ok) {
		throw new Error(`Failed to fetch pricing: ${response.status}`)
	}
	const allPricing = (await response.json()) as Record<string, ModelPricing>
	return filterClaudeModels(allPricing)
}

/**
 * Fetch and cache LiteLLM pricing
 */
export async function fetchPricing(
	forceRefresh = false,
): Promise<PricingDatabase> {
	const now = Date.now()

	// Check memory cache first
	if (
		!forceRefresh &&
		memoryCache &&
		now - memoryCache.timestamp < CACHE_TTL_MS
	) {
		return memoryCache.data
	}

	// Check disk cache
	if (!forceRefresh) {
		const diskCache = await readCache()
		if (diskCache && now - diskCache.timestamp < CACHE_TTL_MS) {
			memoryCache = diskCache
			return diskCache.data
		}
	}

	// Fetch fresh data
	const data = await fetchFromLiteLLM()
	memoryCache = { timestamp: now, data }
	await writeCache(data)
	return data
}

/**
 * Get pricing for a specific model
 * Prefers official Anthropic pricing, falls back to LiteLLM
 */
export async function getPricing(model: string): Promise<ModelPricing | null> {
	// First try official Anthropic pricing (most reliable)
	const anthropic = getAnthropicPricing(model)
	if (anthropic) {
		return anthropicToModelPricing(anthropic)
	}

	// Fall back to LiteLLM for other models
	const db = await fetchPricing()
	return db[model] ?? null
}

/**
 * Compute cost from token counts
 */
export async function computeCost(
	model: string,
	tokens: TokenCounts,
): Promise<ComputedCost> {
	const pricing = (await getPricing(model)) ?? getDefaultPricing()

	const cacheCreationRate =
		pricing.cache_creation_input_token_cost ??
		pricing.input_cost_per_token * 1.25
	const cacheReadRate =
		pricing.cache_read_input_token_cost ?? pricing.input_cost_per_token * 0.1

	const input = tokens.input * pricing.input_cost_per_token
	const output = tokens.output * pricing.output_cost_per_token
	const cacheCreation = tokens.cacheCreation * cacheCreationRate
	const cacheRead = tokens.cacheRead * cacheReadRate

	return {
		input,
		output,
		cacheCreation,
		cacheRead,
		total: input + output + cacheCreation + cacheRead,
	}
}

/**
 * Compute cost for all models from stats-cache tokensByModel
 */
export async function computeAllCosts(
	tokensByModel: Record<string, TokenCounts>,
): Promise<{
	byModel: Record<string, ComputedCost>
	total: number
}> {
	const byModel: Record<string, ComputedCost> = {}
	let total = 0

	for (const [model, tokens] of Object.entries(tokensByModel)) {
		const cost = await computeCost(model, tokens)
		byModel[model] = cost
		total += cost.total
	}

	return { byModel, total }
}

/**
 * List all available Claude models in pricing database
 */
export async function listModels(): Promise<string[]> {
	const db = await fetchPricing()
	return Object.keys(db).sort()
}

/**
 * Clear pricing cache
 */
export function clearCache(): void {
	memoryCache = null
}

export const pricing = {
	fetch: fetchPricing,
	get: getPricing,
	compute: computeCost,
	computeAll: computeAllCosts,
	listModels,
	getDefault: getDefaultPricing,
	getAnthropic: getAnthropicPricing,
	clearCache,
}
