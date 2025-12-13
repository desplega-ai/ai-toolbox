import type { VercelRequest, VercelResponse } from '@vercel/node';
import { streamObject } from 'ai';
import { gateway, getAllowedModelIds } from '../lib/gateway';
import { ideaTestInputSchema, ideaTestReportSchema, type IdeaTestInput } from '../lib/ideaTester/types';
import { buildAnalysisBundle } from '../lib/ideaTester/analyze';
import { findSimilarPosts } from '../lib/ideaTester/findSimilarPosts';
import { SYNTHESIS_SYSTEM_PROMPT } from '../lib/ideaTester/synthesisPrompt';

const DEFAULT_SYNTHESIS_MODEL = 'google/gemini-2.5-flash';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method not allowed');
  }

  if (!gateway) {
    return res.status(503).json({
      error: 'AI Gateway not configured. Set AI_GATEWAY_API_KEY environment variable.',
    });
  }

  const { model: requestedModel, ...inputData } = req.body;

  // Validate input
  const parseResult = ideaTestInputSchema.safeParse(inputData);
  if (!parseResult.success) {
    return res.status(400).json({
      error: 'Invalid input',
      details: parseResult.error.issues,
    });
  }

  const input: IdeaTestInput = parseResult.data;
  const model = requestedModel || DEFAULT_SYNTHESIS_MODEL;

  // Check if model is allowed
  const allowedModelIds = await getAllowedModelIds();
  if (!allowedModelIds.has(model)) {
    return res.status(403).json({
      error: `Model "${model}" is not allowed. Please select an approved model.`,
    });
  }

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
Text: ${input.text || '(none)'}
Type: ${input.type}
Planned Time: ${input.plannedTime || 'not specified'}

## Metadata & Similar Posts
${JSON.stringify(bundle, null, 2)}

Generate a report evaluating this post's potential on Hacker News.
You have full scoring responsibility - determine the front page probability and expected score range based on your analysis.`,
    });

    // Stream response
    const response = result.toTextStreamResponse();

    res.setHeader('Content-Type', response.headers.get('Content-Type') || 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const reader = response.body?.getReader();
    if (!reader) {
      return res.status(500).json({ error: 'Failed to create stream' });
    }

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
    res.end();
  } catch (error) {
    console.error('Analysis error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Analysis failed',
    });
  }
}
