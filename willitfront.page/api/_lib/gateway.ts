import { createGateway } from 'ai';
import {
  DEFAULT_MODEL,
  MAX_INPUT_PRICE_PER_TOKEN,
  MAX_OUTPUT_PRICE_PER_TOKEN,
  BLOCKED_MODEL_PATTERNS,
} from './constants';

const AI_GATEWAY_API_KEY = process.env.AI_GATEWAY_API_KEY;

export const gateway = AI_GATEWAY_API_KEY
  ? createGateway({ apiKey: AI_GATEWAY_API_KEY })
  : null;

interface ModelPricing {
  input: string;
  output: string;
}

export interface GatewayModel {
  id: string;
  name: string;
  description?: string | null;
  pricing?: ModelPricing | null;
  modelType?: 'image' | 'language' | 'embedding' | null;
}

export function isModelAllowed(model: GatewayModel): boolean {
  if (model.modelType !== 'language') return false;
  if (BLOCKED_MODEL_PATTERNS.some(pattern => pattern.test(model.id))) return false;
  if (!model.pricing) return false;
  const inputPrice = parseFloat(model.pricing.input) || 0;
  const outputPrice = parseFloat(model.pricing.output) || 0;
  return inputPrice <= MAX_INPUT_PRICE_PER_TOKEN && outputPrice <= MAX_OUTPUT_PRICE_PER_TOKEN;
}

// Cache for allowed model IDs
let allowedModelIds: Set<string> | null = null;

export async function getAllowedModelIds(): Promise<Set<string>> {
  if (allowedModelIds) return allowedModelIds;

  if (!gateway) {
    allowedModelIds = new Set([DEFAULT_MODEL]);
    return allowedModelIds;
  }

  try {
    const result = await gateway.getAvailableModels();
    allowedModelIds = new Set(
      result.models
        .filter((m: GatewayModel) => isModelAllowed(m))
        .map((m: GatewayModel) => m.id)
    );
  } catch {
    allowedModelIds = new Set([DEFAULT_MODEL]);
  }

  return allowedModelIds;
}
