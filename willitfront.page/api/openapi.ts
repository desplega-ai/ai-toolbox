import type { VercelRequest, VercelResponse } from '@vercel/node';
import { HN_SQL_API } from '../lib/constants';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).send('Method not allowed');
  }

  try {
    const response = await fetch(`${HN_SQL_API}/openapi.json`);
    const data = await response.json();
    return res.json(data);
  } catch (error) {
    console.error('OpenAPI error:', error);
    return res.status(500).json({ error: 'Failed to fetch OpenAPI spec' });
  }
}
