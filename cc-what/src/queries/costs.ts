import { computeAllCosts, computeCost } from '../pricing'
import type { ComputedCost, TokenCounts } from '../pricing'
import { readStatsCache } from '../sources/stats-cache'
import type { CostBreakdown } from '../types'

/**
 * Get token usage by model (from stats-cache)
 */
export async function tokensByModel(): Promise<Record<string, TokenCounts>> {
	const stats = await readStatsCache()
	const result: Record<string, TokenCounts> = {}
	for (const [model, usage] of Object.entries(stats.modelUsage)) {
		result[model] = {
			input: usage.inputTokens,
			output: usage.outputTokens,
			cacheRead: usage.cacheReadInputTokens,
			cacheCreation: usage.cacheCreationInputTokens,
		}
	}
	return result
}

/**
 * Get computed costs by model using LiteLLM pricing
 */
export async function computedByModel(): Promise<Record<string, ComputedCost>> {
	const tokens = await tokensByModel()
	const { byModel } = await computeAllCosts(tokens)
	return byModel
}

/**
 * Get total computed cost using LiteLLM pricing
 */
export async function computedTotal(): Promise<number> {
	const tokens = await tokensByModel()
	const { total } = await computeAllCosts(tokens)
	return total
}

/**
 * Get computed cost for a specific model
 */
export async function computedForModel(model: string): Promise<ComputedCost> {
	const tokens = await tokensByModel()
	const modelTokens = tokens[model]
	if (!modelTokens) {
		return { total: 0, input: 0, output: 0, cacheCreation: 0, cacheRead: 0 }
	}
	return computeCost(model, modelTokens)
}

/**
 * Get full cost breakdown with computed costs
 */
export async function breakdown(): Promise<CostBreakdown> {
	const byModel = await computedByModel()
	const modelCosts: Record<string, number> = {}
	let total = 0

	for (const [model, cost] of Object.entries(byModel)) {
		modelCosts[model] = cost.total
		total += cost.total
	}

	return {
		total,
		byModel: modelCosts,
		byDay: {},
		byProject: {},
	}
}

/**
 * Get summary with totals
 */
export async function summary(): Promise<{
	total: number
	byModel: Array<{ model: string; cost: ComputedCost }>
}> {
	const byModel = await computedByModel()
	const models = Object.entries(byModel)
		.map(([model, cost]) => ({ model, cost }))
		.sort((a, b) => b.cost.total - a.cost.total)

	return {
		total: models.reduce((sum, m) => sum + m.cost.total, 0),
		byModel: models,
	}
}

export const costs = {
	tokensByModel,
	computedByModel,
	computedTotal,
	computedForModel,
	breakdown,
	summary,
}
