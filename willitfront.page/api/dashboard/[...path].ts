import type { VercelRequest, VercelResponse } from '@vercel/node';
import { HN_SQL_API } from '../../lib/constants';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).send('Method not allowed');
  }

  // Get the path segments after /api/dashboard/
  const pathSegments = req.query.path;
  const path = Array.isArray(pathSegments) ? pathSegments.join('/') : pathSegments || '';

  // Build query string from remaining query params
  const queryParams = new URLSearchParams();
  for (const [key, value] of Object.entries(req.query)) {
    if (key !== 'path' && value !== undefined) {
      queryParams.set(key, Array.isArray(value) ? value[0] : value);
    }
  }
  const queryString = queryParams.toString();
  const url = `${HN_SQL_API}/dashboard/${path}${queryString ? `?${queryString}` : ''}`;

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
