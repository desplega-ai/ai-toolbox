import type { VercelRequest, VercelResponse } from '@vercel/node';
import { gateway, isModelAllowed, type GatewayModel } from '../lib/gateway';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).send('Method not allowed');
  }

  if (!gateway) {
    return res.status(503).json({ error: 'AI Gateway not configured' });
  }

  try {
    const result = await gateway.getAvailableModels();
    const showAll = req.query.all === 'true';
    const showRaw = req.query.raw === 'true';

    if (showRaw) {
      return res.json({ models: result.models });
    }

    const filteredModels = result.models.filter((model: GatewayModel) =>
      showAll || isModelAllowed(model)
    );

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

    return res.json({ models });
  } catch (error) {
    console.error('Failed to fetch models:', error);
    return res.status(500).json({ error: 'Failed to fetch models' });
  }
}
