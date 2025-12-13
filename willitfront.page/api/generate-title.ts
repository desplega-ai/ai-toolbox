import type { VercelRequest, VercelResponse } from '@vercel/node';
import { generateText } from 'ai';
import { gateway } from '../lib/gateway';

const TITLE_MODEL = 'google/gemini-2.5-flash-lite';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method not allowed');
  }

  if (!gateway) {
    return res.status(503).json({
      error: 'AI Gateway not configured',
    });
  }

  const { message } = req.body;

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Message is required' });
  }

  try {
    const { text } = await generateText({
      model: gateway(TITLE_MODEL),
      prompt: `Generate a very short title (3-6 words max) for a chat that starts with this message. Just output the title, nothing else:\n\n${message}`,
    });

    return res.json({ title: text.trim() });
  } catch (error) {
    console.error('Title generation error:', error);
    return res.status(500).json({ error: 'Failed to generate title' });
  }
}
