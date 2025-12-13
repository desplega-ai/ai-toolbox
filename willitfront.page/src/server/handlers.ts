import { streamText, stepCountIs, convertToModelMessages } from 'ai';
import { createQuerySqlTool } from './tools/querySql';
import { buildSystemPrompt, type SqlBlockInfo } from './buildSystemPrompt';
import { DEFAULT_MODEL } from '../lib/constants';
import {
  gateway,
  HN_SQL_API,
  getAllowedModelIds,
  updateAllowedModelIds,
  isModelAllowed,
  type GatewayModel,
} from './gateway';

export async function handleChat(req: Request): Promise<Response> {
  if (!gateway) {
    return Response.json(
      { error: 'AI Gateway not configured. Set AI_GATEWAY_API_KEY environment variable.' },
      { status: 503 }
    );
  }

  const { messages, model, schema, userId, sqlBlocks } = await req.json();
  const requestedModel = model || DEFAULT_MODEL;

  const allowedModelIds = await getAllowedModelIds();

  if (!allowedModelIds.has(requestedModel)) {
    return Response.json(
      { error: `Model "${requestedModel}" is not allowed. Please select an approved model.` },
      { status: 403 }
    );
  }

  const querySqlTool = createQuerySqlTool(sqlBlocks as SqlBlockInfo[] | undefined);

  const result = streamText({
    model: gateway(requestedModel),
    system: buildSystemPrompt({ schema, sqlBlocks: sqlBlocks as SqlBlockInfo[] | undefined }),
    messages: convertToModelMessages(messages),
    tools: {
      querySql: querySqlTool,
    },
    stopWhen: stepCountIs(10),
    providerOptions: {
      gateway: {
        user: userId,
      },
    },
  });

  return result.toUIMessageStreamResponse({
    sendReasoning: true,
  });
}

export async function handleModels(req: Request): Promise<Response> {
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

    if (showRaw) {
      return Response.json({ models: result.models });
    }

    const filteredModels = result.models.filter((model: GatewayModel) =>
      showAll || isModelAllowed(model)
    );

    // Update the cache
    updateAllowedModelIds(result.models);

    const models = filteredModels.map((model: GatewayModel) => {
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
}

export async function handleSchema(): Promise<Response> {
  const response = await fetch(`${HN_SQL_API}/schema`);
  return Response.json(await response.json());
}

export async function handleQuery(req: Request): Promise<Response> {
  const body = await req.json();
  const response = await fetch(`${HN_SQL_API}/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return Response.json(await response.json());
}

export function handleHealth(): Response {
  return Response.json({ status: 'ok' });
}
