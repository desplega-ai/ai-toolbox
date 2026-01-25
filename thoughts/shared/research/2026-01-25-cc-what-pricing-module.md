---
date: 2026-01-25T12:00:00Z
topic: "cc-what SDK Pricing Module Research"
type: research
project: cc-what
---

# cc-what SDK Pricing Module Research

**Context:** Claude Code sets `costUSD: 0` in stats-cache.json modelUsage, so we need to compute costs from token counts using external pricing data.

---

## 1. LiteLLM Pricing JSON Structure

**Source:** https://raw.githubusercontent.com/BerriAI/litellm/refs/heads/main/model_prices_and_context_window.json

### Top-Level Structure

```typescript
type LiteLLMPricing = Record<string, ModelPricing>
```

The JSON is an object where keys are model identifiers and values are pricing/capability objects.

### ModelPricing Fields

| Field | Type | Description |
|-------|------|-------------|
| `input_cost_per_token` | number | Cost per input token (USD) |
| `output_cost_per_token` | number | Cost per output token (USD) |
| `cache_creation_input_token_cost` | number | Cost to create cached tokens |
| `cache_read_input_token_cost` | number | Cost to read cached tokens |
| `cache_creation_input_token_cost_above_1hr` | number | Cache creation cost after 1hr TTL |
| `input_cost_per_token_above_200k_tokens` | number | Tiered pricing for large contexts |
| `output_cost_per_token_above_200k_tokens` | number | Tiered output pricing |
| `max_input_tokens` | number | Maximum input context |
| `max_output_tokens` | number | Maximum output tokens |
| `litellm_provider` | string | Provider identifier (`anthropic`, `bedrock`, etc.) |
| `deprecation_date` | string | When model will be deprecated |
| `search_context_cost_per_query` | object | Web search pricing tiers |
| `supports_*` | boolean | Various capability flags |

### Key Observations

1. **Provider Prefixes:** LiteLLM uses prefixes for different providers:
   - `claude-*` - Direct Anthropic API
   - `anthropic.claude-*` - AWS Bedrock
   - `azure_ai/claude-*` - Azure AI

2. **Cache Pricing:** Anthropic's prompt caching has specific costs:
   - Cache creation: 1.25x input cost
   - Cache read: 0.1x input cost

3. **Tiered Pricing:** Some models (Claude 4 Sonnet) have higher rates above 200k tokens.

---

## 2. Model Name Analysis

### Models in stats-cache.json

| Claude Code Model | LiteLLM Key | Notes |
|-------------------|-------------|-------|
| `claude-sonnet-4-5-20250929` | `claude-sonnet-4-5-20250929` | Exact match |
| `claude-opus-4-5-20251101` | `claude-opus-4-5-20251101` | Exact match |
| `claude-haiku-4-5-20251001` | `claude-haiku-4-5-20251001` | Exact match |
| `claude-opus-4-1-20250805` | `claude-opus-4-1-20250805` | Exact match |

### Models in __store.db

| SQLite Model | LiteLLM Key | Notes |
|--------------|-------------|-------|
| `claude-3-7-sonnet-20250219` | `claude-3-7-sonnet-20250219` | Exact match |

### Models in Session JSONL

| Session Model | LiteLLM Key | Notes |
|---------------|-------------|-------|
| `claude-haiku-4-5-20251001` | `claude-haiku-4-5-20251001` | Exact match |
| `claude-opus-4-5-20251101` | `claude-opus-4-5-20251101` | Exact match |

### Naming Pattern Analysis

Claude Code uses Anthropic's direct model IDs (no provider prefix). The pattern is:

```
claude-{family}-{version}[-{date}]
```

Examples:
- `claude-sonnet-4-5-20250929` - Sonnet 4.5, released 2025-09-29
- `claude-opus-4-5-20251101` - Opus 4.5, released 2025-11-01
- `claude-haiku-4-5-20251001` - Haiku 4.5, released 2025-10-01
- `claude-3-7-sonnet-20250219` - Claude 3.7 Sonnet, released 2025-02-19

**Key Finding:** Claude Code model names match LiteLLM keys exactly for the `anthropic` provider. No transformation needed.

---

## 3. Pricing Data (Current Models)

### Active Claude Models

| Model | Input/1M | Output/1M | Cache Create/1M | Cache Read/1M |
|-------|----------|-----------|-----------------|---------------|
| claude-opus-4-5-20251101 | $5.00 | $25.00 | $6.25 | $0.50 |
| claude-sonnet-4-5-20250929 | $3.00 | $15.00 | $3.75 | $0.30 |
| claude-haiku-4-5-20251001 | $1.00 | $5.00 | $1.25 | $0.10 |
| claude-opus-4-1-20250805 | $15.00 | $75.00 | $18.75 | $1.50 |
| claude-3-7-sonnet-20250219 | $3.00 | $15.00 | $3.75 | $0.30 |

### Cost per Token (for computation)

| Model | input_cost_per_token | output_cost_per_token | cache_creation | cache_read |
|-------|---------------------|----------------------|----------------|------------|
| claude-opus-4-5-20251101 | 0.000005 | 0.000025 | 0.00000625 | 0.0000005 |
| claude-sonnet-4-5-20250929 | 0.000003 | 0.000015 | 0.00000375 | 0.0000003 |
| claude-haiku-4-5-20251001 | 0.000001 | 0.000005 | 0.00000125 | 0.0000001 |
| claude-opus-4-1-20250805 | 0.000015 | 0.000075 | 0.00001875 | 0.0000015 |
| claude-3-7-sonnet-20250219 | 0.000003 | 0.000015 | 0.00000375 | 0.0000003 |

---

## 4. Proposed TypeScript Interfaces

### src/pricing.ts Types

```typescript
/**
 * Pricing data for a single model from LiteLLM
 */
export interface ModelPricing {
  input_cost_per_token: number
  output_cost_per_token: number
  cache_creation_input_token_cost?: number
  cache_read_input_token_cost?: number
  max_input_tokens?: number
  max_output_tokens?: number
  litellm_provider?: string
  deprecation_date?: string
  // Tiered pricing (for 1M token contexts)
  input_cost_per_token_above_200k_tokens?: number
  output_cost_per_token_above_200k_tokens?: number
  cache_creation_input_token_cost_above_200k_tokens?: number
  cache_read_input_token_cost_above_200k_tokens?: number
}

/**
 * Pricing database (Claude models only)
 */
export type PricingDatabase = Record<string, ModelPricing>

/**
 * Token usage from Claude Code (matches TokenUsage in types.ts)
 */
export interface TokenCounts {
  input_tokens: number
  output_tokens: number
  cache_creation_input_tokens: number
  cache_read_input_tokens: number
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
```

### Function Signatures

```typescript
/**
 * Fetch and cache LiteLLM pricing JSON
 * @param forceRefresh - Bypass cache and fetch fresh data
 * @returns Claude-only pricing database
 */
export async function fetchPricing(forceRefresh?: boolean): Promise<PricingDatabase>

/**
 * Get pricing for a specific model
 * @param model - Model identifier (e.g., "claude-sonnet-4-5-20250929")
 * @returns Model pricing or null if not found
 */
export async function getPricing(model: string): Promise<ModelPricing | null>

/**
 * Compute cost from token counts
 * @param model - Model identifier
 * @param tokens - Token usage counts
 * @returns Computed cost breakdown
 */
export async function computeCost(
  model: string,
  tokens: TokenCounts
): Promise<ComputedCost>

/**
 * Compute total cost for ModelUsage from stats-cache.json
 * @param model - Model identifier
 * @param usage - ModelUsage object from stats-cache
 * @returns Total cost in USD
 */
export async function computeModelUsageCost(
  model: string,
  usage: ModelUsage
): Promise<number>

/**
 * Fallback pricing for unknown models (uses Sonnet pricing)
 */
export function getDefaultPricing(): ModelPricing
```

---

## 5. Implementation Plan

### Phase 1: Core Module (`src/pricing.ts`)

1. **Pricing Cache File**
   - Store at `~/.claude/cc-what-pricing.json`
   - Cache TTL: 24 hours
   - Include fetch timestamp

2. **Fetch Logic**
   ```typescript
   const LITELLM_URL = 'https://raw.githubusercontent.com/BerriAI/litellm/refs/heads/main/model_prices_and_context_window.json'
   const CACHE_PATH = join(homedir(), '.claude', 'cc-what-pricing.json')
   const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours
   ```

3. **Filter Claude Models**
   - Keep only keys starting with `claude-` (direct Anthropic API)
   - Ignore Bedrock (`anthropic.`) and Azure (`azure_ai/`) prefixes

4. **Cost Computation**
   ```typescript
   function computeCost(model: string, tokens: TokenCounts): ComputedCost {
     const pricing = await getPricing(model)
     if (!pricing) {
       pricing = getDefaultPricing() // Fallback to Sonnet pricing
     }

     return {
       input: tokens.input_tokens * pricing.input_cost_per_token,
       output: tokens.output_tokens * pricing.output_cost_per_token,
       cacheCreation: tokens.cache_creation_input_tokens *
         (pricing.cache_creation_input_token_cost ?? pricing.input_cost_per_token * 1.25),
       cacheRead: tokens.cache_read_input_tokens *
         (pricing.cache_read_input_token_cost ?? pricing.input_cost_per_token * 0.1),
       total: // sum of above
     }
   }
   ```

### Phase 2: Integration with Existing Code

1. **Update `queries/costs.ts`**
   - Add `computedTotal()` that uses pricing module
   - Add `computedByModel()` for per-model computed costs
   - Keep existing DB-based functions for comparison

2. **Update `types.ts`**
   - Add `ComputedCost` interface
   - Export pricing types

3. **Update `index.ts`**
   - Export pricing functions
   - Export new computed cost functions

### Phase 3: Stats Cache Enhancement

1. **Add computed costs to stats reader**
   ```typescript
   export async function getModelUsageWithCosts(): Promise<Record<string, {
     usage: ModelUsage
     computedCost: number
   }>>
   ```

2. **Aggregate functions**
   ```typescript
   export async function getTotalComputedCost(): Promise<number>
   export async function getCostBreakdownComputed(): Promise<CostBreakdown>
   ```

---

## 6. Sample Computation

Using current stats-cache.json data:

### claude-opus-4-5-20251101

| Metric | Tokens | Rate | Cost |
|--------|--------|------|------|
| Input | 9,296,921 | $5/1M | $46.48 |
| Output | 13,309,370 | $25/1M | $332.73 |
| Cache Create | 492,294,197 | $6.25/1M | $3,076.84 |
| Cache Read | 6,672,054,998 | $0.50/1M | $3,336.03 |
| **Total** | | | **$6,792.08** |

### claude-sonnet-4-5-20250929

| Metric | Tokens | Rate | Cost |
|--------|--------|------|------|
| Input | 638,326 | $3/1M | $1.91 |
| Output | 2,816,833 | $15/1M | $42.25 |
| Cache Create | 57,469,219 | $3.75/1M | $215.51 |
| Cache Read | 746,095,988 | $0.30/1M | $223.83 |
| **Total** | | | **$483.50** |

### claude-haiku-4-5-20251001

| Metric | Tokens | Rate | Cost |
|--------|--------|------|------|
| Input | 79,913 | $1/1M | $0.08 |
| Output | 1,487,198 | $5/1M | $7.44 |
| Cache Create | 10,345,189 | $1.25/1M | $12.93 |
| Cache Read | 276,139,839 | $0.10/1M | $27.61 |
| **Total** | | | **$48.06** |

### claude-opus-4-1-20250805

| Metric | Tokens | Rate | Cost |
|--------|--------|------|------|
| Input | 2,946 | $15/1M | $0.04 |
| Output | 110,049 | $75/1M | $8.25 |
| Cache Create | 1,059,356 | $18.75/1M | $19.86 |
| Cache Read | 17,493,844 | $1.50/1M | $26.24 |
| **Total** | | | **$54.40** |

### All Models Grand Total: ~$7,378.04

---

## 7. Edge Cases and Considerations

### Unknown Models

If a model is not in the pricing database:
1. Log a warning
2. Use Sonnet 4.5 pricing as fallback (middle-tier)
3. Mark the cost as "estimated" in output

### Tiered Pricing

Claude 4 Sonnet has higher rates above 200k tokens. For simplicity:
- V1: Use base rates (most sessions are under 200k)
- V2: Track cumulative context size per session for accurate tiered pricing

### Web Search Costs

LiteLLM includes `search_context_cost_per_query` but Claude Code tracks `webSearchRequests` count, not query size. For now:
- Use `search_context_size_low` rate ($0.01/query) as approximation

### Cache TTL Pricing

Some models have `cache_creation_input_token_cost_above_1hr` for longer-lived caches. Claude Code doesn't expose cache age, so:
- Use base cache creation rate
- Document this limitation

---

## 8. File Structure

### Option A: Single Module (Recommended for V1)

```
src/
  pricing.ts          # All pricing logic in one file
  queries/costs.ts    # Update with computed cost variants
```

### Option B: Expanded Structure (For future)

```
src/
  pricing.ts          # Main module (re-exports)
  pricing/
    types.ts          # Pricing-specific types
    fetch.ts          # LiteLLM fetch/cache logic
    compute.ts        # Cost computation functions
  queries/
    costs.ts          # Update with computed costs
  types.ts            # Add ComputedCost export
  index.ts            # Add pricing exports
```

---

## 9. Dependencies

No new dependencies required:
- Use `fetch` (native in Bun)
- Use `fs/promises` for caching
- Use existing config patterns from `config.ts`

---

## 10. Next Steps

1. [ ] Create `src/pricing.ts` with fetch and cache logic
2. [ ] Add cost computation functions
3. [ ] Update `queries/costs.ts` with `computed*` variants
4. [ ] Add unit tests for cost computation
5. [ ] Update CLI to show computed costs alongside DB costs
6. [ ] Document the pricing module in README
