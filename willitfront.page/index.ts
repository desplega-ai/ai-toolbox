import index from './index.html';
import { streamText, createGateway, stepCountIs, convertToModelMessages } from 'ai';
import { createQuerySqlTool } from './src/server/tools/querySql';
import { buildSystemPrompt, type SqlBlockInfo } from './src/server/buildSystemPrompt';
import {
  DEFAULT_MODEL,
  MAX_INPUT_PRICE_PER_TOKEN,
  MAX_OUTPUT_PRICE_PER_TOKEN,
  BLOCKED_MODEL_PATTERNS,
} from './src/lib/constants';

const HN_SQL_API = process.env.HN_SQL_API_URL || 'http://localhost:3123';
const AI_GATEWAY_API_KEY = process.env.AI_GATEWAY_API_KEY;

const gateway = AI_GATEWAY_API_KEY
  ? createGateway({ apiKey: AI_GATEWAY_API_KEY })
  : null;

interface ModelPricing {
  input: string;
  output: string;
}

interface GatewayModel {
  id: string;
  name: string;
  description?: string | null;
  pricing?: ModelPricing | null;
  modelType?: 'image' | 'language' | 'embedding' | null;
}

// Check if model is allowed based on pricing and type
function isModelAllowed(model: GatewayModel): boolean {
  // Only allow language models (no embeddings, images, vision, etc.)
  if (model.modelType !== 'language') {
    return false;
  }

  // Block by pattern (image models, vision models, embedding models, etc.)
  if (BLOCKED_MODEL_PATTERNS.some(pattern => pattern.test(model.id))) {
    return false;
  }

  // Must have pricing info
  if (!model.pricing) {
    return false;
  }

  // Check price thresholds separately for input and output
  const inputPrice = parseFloat(model.pricing.input) || 0;
  const outputPrice = parseFloat(model.pricing.output) || 0;

  return inputPrice <= MAX_INPUT_PRICE_PER_TOKEN && outputPrice <= MAX_OUTPUT_PRICE_PER_TOKEN;
}

// Cache for allowed model IDs (populated on first /api/models call)
let allowedModelIds: Set<string> | null = null;

Bun.serve({
  port: process.env.PORT ? parseInt(process.env.PORT) : 5193,
  routes: {
    '/': index,

    '/api/chat': {
      POST: async (req) => {
        if (!gateway) {
          return Response.json(
            { error: 'AI Gateway not configured. Set AI_GATEWAY_API_KEY environment variable.' },
            { status: 503 }
          );
        }

        const { messages, model, schema, userId, sqlBlocks } = await req.json();

        // Validate model against allowed list
        const requestedModel = model || DEFAULT_MODEL;

        // If we don't have a cached list yet, fetch models to populate it
        if (!allowedModelIds) {
          try {
            const result = await gateway.getAvailableModels();
            allowedModelIds = new Set(
              result.models
                .filter((m: GatewayModel) => isModelAllowed(m))
                .map((m: GatewayModel) => m.id)
            );
          } catch {
            // If we can't fetch models, only allow the default
            allowedModelIds = new Set([DEFAULT_MODEL]);
          }
        }

        if (!allowedModelIds.has(requestedModel)) {
          return Response.json(
            { error: `Model "${requestedModel}" is not allowed. Please select an approved model.` },
            { status: 403 }
          );
        }

        // Create the querySql tool with access to SQL blocks for CTE expansion
        const querySqlTool = createQuerySqlTool(sqlBlocks as SqlBlockInfo[] | undefined);

        const result = streamText({
          model: gateway(requestedModel),
          system: buildSystemPrompt({ schema, sqlBlocks: sqlBlocks as SqlBlockInfo[] | undefined }),
          messages: convertToModelMessages(messages),
          tools: {
            querySql: querySqlTool,
          },
          stopWhen: stepCountIs(10), // Allow up to 10 steps for agentic behavior
          providerOptions: {
            gateway: {
              user: userId,
            },
          },
        });

        return result.toUIMessageStreamResponse({
          sendReasoning: true, // Forward reasoning tokens from thinking models
        });
      },
    },

    '/api/models': {
      GET: async (req) => {
        if (!gateway) {
          return Response.json(
            { error: 'AI Gateway not configured' },
            { status: 503 }
          );
        }

        try {
          const result = await gateway.getAvailableModels();
          const url = new URL(req.url);
          const showAll = url.searchParams.get('all') === 'true';
          const showRaw = url.searchParams.get('raw') === 'true';

          // If raw, return full model data for inspection
          if (showRaw) {
            return Response.json({ models: result.models });
          }

          // Filter models by price and type
          const filteredModels = result.models.filter((model: GatewayModel) =>
            showAll || isModelAllowed(model)
          );

          // Update the cache of allowed model IDs
          allowedModelIds = new Set(
            result.models
              .filter((model: GatewayModel) => isModelAllowed(model))
              .map((model: GatewayModel) => model.id)
          );

          const models = filteredModels.map((model: GatewayModel) => {
            // Calculate price per million tokens for display
            const inputPriceMTok = model.pricing
              ? (parseFloat(model.pricing.input) * 1_000_000).toFixed(2)
              : null;
            const outputPriceMTok = model.pricing
              ? (parseFloat(model.pricing.output) * 1_000_000).toFixed(2)
              : null;

            return {
              id: model.id,
              name: model.name,
              description: model.description,
              provider: model.id.split('/')[0],
              pricing: inputPriceMTok && outputPriceMTok
                ? { input: `$${inputPriceMTok}/MTok`, output: `$${outputPriceMTok}/MTok` }
                : undefined,
            };
          });

          return Response.json({ models });
        } catch (error) {
          console.error('Failed to fetch models:', error);
          return Response.json(
            { error: 'Failed to fetch models' },
            { status: 500 }
          );
        }
      },
    },

    // Proxy schema to HN-SQL API
    '/api/schema': {
      GET: async () => {
        const response = await fetch(`${HN_SQL_API}/schema`);
        return Response.json(await response.json());
      },
    },

    // Proxy query to HN-SQL API
    '/api/query': {
      POST: async (req) => {
        const body = await req.json();
        const response = await fetch(`${HN_SQL_API}/query`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        return Response.json(await response.json());
      },
    },

    // Health check
    '/api/health': {
      GET: () => Response.json({ status: 'ok' }),
    },

    // Serve static files from public directory
    '/public/*': async (req) => {
      const url = new URL(req.url);
      const filePath = `./public${url.pathname.replace('/public', '')}`;
      const file = Bun.file(filePath);
      if (await file.exists()) {
        return new Response(file);
      }
      return new Response('Not found', { status: 404 });
    },
  },

  development: {
    hmr: true,
    console: true,
  },
});

console.log('Server running at http://localhost:5193');
