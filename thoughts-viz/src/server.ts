import { join } from "node:path";
import type { GraphData } from "./types.ts";

import index from "../web/index.html";

/** Dev/single mode: serves in-memory graph data at /api/graph */
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

/** Production/multi mode: serves static data files from public/data/ */
export function startProductionServer(port: number) {
  const publicDataDir = join(import.meta.dir, "../public/data");

  Bun.serve({
    port,
    routes: {
      "/": index,
      "/data/*": async (req) => {
        const url = new URL(req.url);
        const filePath = join(publicDataDir, url.pathname.replace("/data/", ""));
        const file = Bun.file(filePath);
        if (await file.exists()) {
          return new Response(file, {
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response("Not found", { status: 404 });
      },
    },
    development: {
      hmr: true,
      console: true,
    },
  });
}
