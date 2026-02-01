import index from "./index.html";

const port = process.env.PORT ? parseInt(process.env.PORT) : 5294;

Bun.serve({
  port,
  routes: {
    "/": index,
  },
  development: {
    hmr: true,
    console: true,
  },
});

console.log(`Dev server running at http://localhost:${port}`);
