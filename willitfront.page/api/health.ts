import { handleHealth } from '../src/server/handlers';

export default function handler(req: Request): Response {
  if (req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }
  return handleHealth();
}
