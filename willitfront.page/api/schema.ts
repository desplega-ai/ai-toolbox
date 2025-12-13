import type { VercelRequest, VercelResponse } from '@vercel/node';
import { HN_SQL_API } from '../src/server/gateway';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).send('Method not allowed');
  }

  const response = await fetch(`${HN_SQL_API}/schema`);
  const data = await response.json();
  return res.json(data);
}
