import type { VercelRequest, VercelResponse } from '@vercel/node';
import { streamText, stepCountIs, convertToModelMessages } from 'ai';
import { DEFAULT_MODEL } from './_lib/constants';
import { gateway, getAllowedModelIds } from './_lib/gateway';
import { buildSystemPrompt, type SqlBlockInfo } from './_lib/systemPrompt';
import { createQuerySqlTool } from './_lib/querySqlTool';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method not allowed');
  }

  if (!gateway) {
    return res.status(503).json({
      error: 'AI Gateway not configured. Set AI_GATEWAY_API_KEY environment variable.',
    });
  }

  const { messages, model, schema, userId, sqlBlocks } = req.body;
  const requestedModel = model || DEFAULT_MODEL;

  const allowedIds = await getAllowedModelIds();

  if (!allowedIds.has(requestedModel)) {
    return res.status(403).json({
      error: `Model "${requestedModel}" is not allowed. Please select an approved model.`,
    });
  }

  const querySqlTool = createQuerySqlTool(sqlBlocks as SqlBlockInfo[] | undefined);

  const result = streamText({
    model: gateway(requestedModel),
    system: buildSystemPrompt(schema, sqlBlocks as SqlBlockInfo[] | undefined),
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

  const response = result.toUIMessageStreamResponse({
    sendReasoning: true,
  });

  res.setHeader('Content-Type', response.headers.get('Content-Type') || 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const reader = response.body?.getReader();
  if (!reader) {
    return res.status(500).json({ error: 'Failed to create stream' });
  }

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
    res.end();
  } catch (error) {
    console.error('Stream error:', error);
    res.end();
  }
}
