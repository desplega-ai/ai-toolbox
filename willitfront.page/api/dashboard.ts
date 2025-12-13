import type { VercelRequest, VercelResponse } from '@vercel/node';
import { HN_SQL_API } from '../lib/constants';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).send('Method not allowed');
  }

  // Get the subpath from query param (e.g., ?path=overview/total-stories)
  const subpath = req.query.path;
  if (!subpath || typeof subpath !== 'string') {
    return res.status(400).json({ error: 'Missing path parameter' });
  }

  // Build query string from remaining query params
  const queryParams = new URLSearchParams();
  for (const [key, value] of Object.entries(req.query)) {
    if (key !== 'path' && value !== undefined) {
      queryParams.set(key, Array.isArray(value) ? value[0] : value);
    }
  }
  const queryString = queryParams.toString();
  const url = `${HN_SQL_API}/dashboard/${subpath}${queryString ? `?${queryString}` : ''}`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    const data = await response.json();
    return res.json(data);
  } catch (error) {
    console.error('Dashboard proxy error:', error);
    return res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
}
