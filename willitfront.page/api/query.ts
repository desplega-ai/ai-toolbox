import type { VercelRequest, VercelResponse } from '@vercel/node';

const HN_SQL_API = process.env.HN_SQL_API_URL || 'http://localhost:3123';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method not allowed');
  }

  try {
    const response = await fetch(`${HN_SQL_API}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    });

    const data = await response.json();
    return res.json(data);
  } catch (error) {
    console.error('Query error:', error);
    return res.status(500).json({ error: 'Failed to execute query' });
  }
}
