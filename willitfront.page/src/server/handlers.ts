import { streamText, streamObject, stepCountIs, convertToModelMessages } from 'ai';
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
import { ideaTestInputSchema, ideaTestReportSchema, type IdeaTestInput } from '../../lib/ideaTester/types';
import { buildAnalysisBundle } from '../../lib/ideaTester/analyze';
import { findSimilarPosts } from '../../lib/ideaTester/findSimilarPosts';
import { SYNTHESIS_SYSTEM_PROMPT } from '../../lib/ideaTester/synthesisPrompt';

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
      // Anthropic Claude 3.7+/4 extended thinking
      anthropic: {
        thinking: { type: 'enabled', budgetTokens: 10000 },
      },
      // OpenRouter reasoning (for DeepSeek R1, etc.)
      openrouter: {
        reasoning: { max_tokens: 10000 },
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

// Dashboard proxy handler - proxies /api/dashboard?path=... to HN_SQL_API/dashboard/...
export async function handleDashboard(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const subpath = url.searchParams.get('path');

  if (!subpath) {
    return Response.json({ error: 'Missing path parameter' }, { status: 400 });
  }

  // Build query string from remaining params (excluding 'path')
  const queryParams = new URLSearchParams();
  for (const [key, value] of url.searchParams.entries()) {
    if (key !== 'path') {
      queryParams.set(key, value);
    }
  }
  const queryString = queryParams.toString();
  const targetUrl = `${HN_SQL_API}/dashboard/${subpath}${queryString ? `?${queryString}` : ''}`;

  try {
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    return Response.json(await response.json());
  } catch (error) {
    console.error('Dashboard proxy error:', error);
    return Response.json({ error: 'Failed to fetch dashboard data' }, { status: 500 });
  }
}

// Stats proxy handler
export async function handleStatsTypes(): Promise<Response> {
  try {
    const response = await fetch(`${HN_SQL_API}/stats/types`);
    return Response.json(await response.json());
  } catch (error) {
    console.error('Stats types error:', error);
    return Response.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}

// Idea Tester handler
const DEFAULT_SYNTHESIS_MODEL = 'anthropic/claude-3-5-haiku-latest';

export async function handleAnalyzeIdea(req: Request): Promise<Response> {
  if (!gateway) {
    return Response.json(
      { error: 'AI Gateway not configured. Set AI_GATEWAY_API_KEY environment variable.' },
      { status: 503 }
    );
  }

  const body = await req.json();
  const { model: requestedModel, ...inputData } = body;

  // Validate input
  const parseResult = ideaTestInputSchema.safeParse(inputData);
  if (!parseResult.success) {
    return Response.json(
      { error: 'Invalid input', details: parseResult.error.issues },
      { status: 400 }
    );
  }

  const input: IdeaTestInput = parseResult.data;
  const model = requestedModel || DEFAULT_SYNTHESIS_MODEL;

  try {
    // Run deterministic analysis in parallel with similar posts query
    const similarPosts = await findSimilarPosts(input);
    const bundle = buildAnalysisBundle(input, similarPosts);

    // Stream structured response from LLM
    const result = streamObject({
      model: gateway(model),
      schema: ideaTestReportSchema,
      system: SYNTHESIS_SYSTEM_PROMPT,
      prompt: `Analyze this HN post idea and generate a structured report:

## Input
Title: "${input.title}"
URL: ${input.url || '(none - Ask HN style)'}
Type: ${input.type}
Planned Time: ${input.plannedTime || 'not specified'}

## Analysis Data
${JSON.stringify(bundle, null, 2)}

Generate a report evaluating this post's potential on Hacker News.
Use the analysis data to support your assessments.`,
    });

    return result.toTextStreamResponse();
  } catch (error) {
    console.error('Analysis error:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Analysis failed' },
      { status: 500 }
    );
  }
}
