import type { VercelRequest, VercelResponse } from '@vercel/node';
import { HN_SQL_API } from '../src/server/gateway';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method not allowed');
  }

  const response = await fetch(`${HN_SQL_API}/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req.body),
  });

  const data = await response.json();
  return res.json(data);
}
