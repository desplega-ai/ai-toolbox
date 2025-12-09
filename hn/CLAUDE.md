---
description: HN Tracker - Bun-based HackerNews activity tracker with PM2 and Redis
globs: "*.ts, *.tsx, *.html, *.css, *.js, *.jsx, package.json"
alwaysApply: false
---

# HN Tracker

A HackerNews activity tracker built with Bun, React, SQLite, and Redis. Tracks posts and comments from HN users with thread-based views and incremental background syncing.

## Architecture

- **Web Server** (`src/index.ts`): Bun.serve() with React frontend and REST API
- **Sync Worker** (`src/sync-worker.ts`): Background process for incremental HN syncing
- **Database**: SQLite (`bun:sqlite`) for local storage
- **Cache**: Redis for sync coordination and state
- **Process Manager**: PM2 for production deployment

## Prerequisites

- Bun installed
- Redis server running (currently on `localhost:6380`)
- PM2 installed globally: `bun add pm2 -g`

## Running the Project

### Development Mode

```bash
# Terminal 1: Run web server with hot reload
bun run dev

# Terminal 2: Run sync worker with hot reload
bun run dev:worker
```

### Production Mode with PM2

```bash
# Start both web server and sync worker
bun run pm2:start

# View logs
bun run pm2:logs

# Monitor processes
bun run pm2:monit

# Check status
bun run pm2:status

# Restart all
bun run pm2:restart

# Stop all
bun run pm2:stop
```

## How It Works

### Incremental Syncing

The sync worker uses HN's `/maxitem` API endpoint to incrementally sync new items:

1. Fetches current max item ID from HN
2. Compares with last synced ID (stored in Redis)
3. Processes items in batches of 100
4. Stores only items from tracked users
5. Updates Redis state after each batch

This is much more efficient than fetching each user's submissions separately.

### Thread-Based Views

Items are organized as threads:
- **Posts**: Stories you posted + all their replies
- **Comments**: Your comments + full conversation context (parent story → your comment → child replies)

### Bun-Specific Guidelines

Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun build <file.html|file.ts|file.css>` instead of `webpack` or `esbuild`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Bun automatically loads .env, so don't use dotenv.

## APIs

- `Bun.serve()` supports WebSockets, HTTPS, and routes. Don't use `express`.
- `bun:sqlite` for SQLite. Don't use `better-sqlite3`.
- `Bun.redis` for Redis. Don't use `ioredis`.
- `Bun.sql` for Postgres. Don't use `pg` or `postgres.js`.
- `WebSocket` is built-in. Don't use `ws`.
- Prefer `Bun.file` over `node:fs`'s readFile/writeFile
- Bun.$`ls` instead of execa.

## Testing

Use `bun test` to run tests.

```ts#index.test.ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```

## Frontend

Use HTML imports with `Bun.serve()`. Don't use `vite`. HTML imports fully support React, CSS, Tailwind.

Server:

```ts#index.ts
import index from "./index.html"

Bun.serve({
  routes: {
    "/": index,
    "/api/users/:id": {
      GET: (req) => {
        return new Response(JSON.stringify({ id: req.params.id }));
      },
    },
  },
  // optional websocket support
  websocket: {
    open: (ws) => {
      ws.send("Hello, world!");
    },
    message: (ws, message) => {
      ws.send(message);
    },
    close: (ws) => {
      // handle close
    }
  },
  development: {
    hmr: true,
    console: true,
  }
})
```

HTML files can import .tsx, .jsx or .js files directly and Bun's bundler will transpile & bundle automatically. `<link>` tags can point to stylesheets and Bun's CSS bundler will bundle.

```html#index.html
<html>
  <body>
    <h1>Hello, world!</h1>
    <script type="module" src="./frontend.tsx"></script>
  </body>
</html>
```

With the following `frontend.tsx`:

```tsx#frontend.tsx
import React from "react";

// import .css files directly and it works
import './index.css';

import { createRoot } from "react-dom/client";

const root = createRoot(document.body);

export default function Frontend() {
  return <h1>Hello, world!</h1>;
}

root.render(<Frontend />);
```

Then, run index.ts

```sh
bun --hot ./index.ts
```

For more information, read the Bun API docs in `node_modules/bun-types/docs/**.md`.
