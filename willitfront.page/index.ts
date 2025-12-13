import index from './index.html';
import {
  handleChat,
  handleModels,
  handleSchema,
  handleQuery,
  handleHealth,
  handleDashboard,
  handleStatsTypes,
  handleAnalyzeIdea,
  handleGenerateTitle,
} from './src/server/handlers';

Bun.serve({
  port: process.env.PORT ? parseInt(process.env.PORT) : 5193,
  idleTimeout: 120, // 2 minutes for streaming responses
  routes: {
    '/': index,

    '/api/chat': {
      POST: handleChat,
    },

    '/api/models': {
      GET: handleModels,
    },

    '/api/schema': {
      GET: handleSchema,
    },

    '/api/query': {
      POST: handleQuery,
    },

    '/api/health': {
      GET: handleHealth,
    },

    '/api/stats/types': {
      GET: handleStatsTypes,
    },

    '/api/dashboard': {
      GET: handleDashboard,
    },

    '/api/analyze-idea': {
      POST: handleAnalyzeIdea,
    },

    '/api/generate-title': {
      POST: handleGenerateTitle,
    },

    // Serve static files from public directory
    '/public/*': async (req) => {
      const url = new URL(req.url);
      const filePath = `./public${url.pathname.replace('/public', '')}`;
      const file = Bun.file(filePath);
      if (await file.exists()) {
        return new Response(file);
      }
      return new Response('Not found', { status: 404 });
    },
  },

  development: {
    hmr: true,
    console: true,
  },
});

console.log('Server running at http://localhost:5193');
