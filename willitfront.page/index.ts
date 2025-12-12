import index from './index.html';

const HN_SQL_API = process.env.HN_SQL_API_URL || 'http://localhost:3123';

Bun.serve({
  port: process.env.PORT ? parseInt(process.env.PORT) : 5193,
  routes: {
    '/': index,

    // Proxy schema to HN-SQL API
    '/api/schema': {
      GET: async () => {
        const response = await fetch(`${HN_SQL_API}/schema`);
        return Response.json(await response.json());
      },
    },

    // Proxy query to HN-SQL API
    '/api/query': {
      POST: async (req) => {
        const body = await req.json();
        const response = await fetch(`${HN_SQL_API}/query`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        return Response.json(await response.json());
      },
    },

    // Health check
    '/api/health': {
      GET: () => Response.json({ status: 'ok' }),
    },
  },

  development: {
    hmr: true,
    console: true,
  },
});

console.log('Server running at http://localhost:5193');
