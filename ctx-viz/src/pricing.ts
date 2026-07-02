// Model pricing table + cost estimation.
// Prices are USD per MTok. Matched on substring of `message.model`,
// first match wins, in table order (per SPEC.md).

export interface Usage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_creation?: {
    ephemeral_5m_input_tokens?: number;
    ephemeral_1h_input_tokens?: number;
  } | null;
}

interface Price {
  input: number;
  output: number;
}

const DEFAULT_PRICE: Price = { input: 3, output: 15 };

// Order matters: first substring match wins.
const PRICING: Array<[string, Price]> = [
  ["fable-5", { input: 10, output: 50 }],
  ["mythos-5", { input: 10, output: 50 }],
  ["opus-4-5", { input: 5, output: 25 }],
  ["opus-4-6", { input: 5, output: 25 }],
  ["opus-4-7", { input: 5, output: 25 }],
  ["opus-4-8", { input: 5, output: 25 }],
  ["opus", { input: 15, output: 75 }],
  ["sonnet", { input: 3, output: 15 }],
  ["haiku-4", { input: 1, output: 5 }],
  ["haiku-3-5", { input: 0.8, output: 4 }],
  ["haiku", { input: 0.25, output: 1.25 }],
];

export function priceFor(model: string | undefined | null): Price {
  if (typeof model !== "string" || model.length === 0) return DEFAULT_PRICE;
  for (const [substr, price] of PRICING) {
    if (model.includes(substr)) return price;
  }
  return DEFAULT_PRICE;
}

/**
 * Estimated cost in USD for a single (deduped) assistant message.
 * Cache read = 0.1 × input price. Cache write: when `usage.cache_creation`
 * exists, e5m × 1.25 × in + e1h × 2 × in; else cache_creation_input_tokens × 1.25 × in.
 */
export function estimateCostUSD(model: string | undefined | null, usage: Usage | undefined | null): number {
  if (!usage || typeof usage !== "object") return 0;
  const p = priceFor(model);
  const input = num(usage.input_tokens);
  const output = num(usage.output_tokens);
  const cacheRead = num(usage.cache_read_input_tokens);

  let cacheWrite = 0;
  const cc = usage.cache_creation;
  if (cc && typeof cc === "object") {
    cacheWrite =
      num(cc.ephemeral_5m_input_tokens) * 1.25 * p.input +
      num(cc.ephemeral_1h_input_tokens) * 2 * p.input;
  } else {
    cacheWrite = num(usage.cache_creation_input_tokens) * 1.25 * p.input;
  }

  return (input * p.input + output * p.output + cacheRead * 0.1 * p.input + cacheWrite) / 1e6;
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}
