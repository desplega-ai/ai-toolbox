import type { VercelRequest, VercelResponse } from '@vercel/node';

const HN_SQL_API = process.env.HN_SQL_API_URL || 'http://localhost:3123';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).send('Method not allowed');
  }

  try {
    const response = await fetch(`${HN_SQL_API}/schema`);
    const data = await response.json();
    return res.json(data);
  } catch (error) {
    console.error('Schema error:', error);
    return res.status(500).json({ error: 'Failed to fetch schema' });
  }
}
