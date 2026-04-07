import type { GraphData } from "./types.ts";

import index from "../web/index.html";

export function startServer(graphData: GraphData, port: number) {
  Bun.serve({
    port,
    routes: {
      "/": index,
      "/api/graph": {
        GET: () => Response.json(graphData),
      },
    },
    development: {
      hmr: true,
      console: true,
    },
  });
}
