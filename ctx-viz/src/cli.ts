#!/usr/bin/env bun
// ctx-viz CLI: parse args, start the server, open the browser.

import { homedir } from "node:os";
import { join } from "node:path";
import { startServer } from "./server.ts";

const USAGE = `ctx-viz — replay Claude Code sessions to visualize context usage

Usage: ctx-viz [options]

Options:
  -p, --port <n>        port to listen on (default: 7433)
  --claude-dir <path>   Claude home; transcripts under <dir>/projects (default: ~/.claude)
  --limit <n>           max sessions to deep-scan for the list endpoint (default: 500)
  --no-open             do not open the browser
  -h, --help            show this help
`;

function fail(message: string): never {
  console.error(`ctx-viz: ${message}\n`);
  console.error(USAGE);
  process.exit(1);
}

function parseArgs(argv: string[]) {
  let port = 7433;
  let claudeDir = join(homedir(), ".claude");
  let limit = 500;
  let open = true;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    switch (arg) {
      case "-p":
      case "--port": {
        const v = argv[++i];
        if (v === undefined) fail(`${arg} requires a value`);
        port = Number.parseInt(v, 10);
        if (!Number.isInteger(port) || port < 1 || port > 65535) fail(`invalid port: ${v}`);
        break;
      }
      case "--claude-dir": {
        const v = argv[++i];
        if (v === undefined) fail("--claude-dir requires a value");
        claudeDir = v;
        break;
      }
      case "--limit": {
        const v = argv[++i];
        if (v === undefined) fail("--limit requires a value");
        limit = Number.parseInt(v, 10);
        if (!Number.isInteger(limit) || limit < 0) fail(`invalid limit: ${v}`);
        break;
      }
      case "--no-open":
        open = false;
        break;
      case "-h":
      case "--help":
        console.log(USAGE);
        process.exit(0);
      default:
        fail(`unknown option: ${arg}`);
    }
  }

  return { port, claudeDir, limit, open };
}

const opts = parseArgs(process.argv.slice(2));

try {
  startServer({ port: opts.port, claudeDir: opts.claudeDir, limit: opts.limit });
} catch (err) {
  console.error(`ctx-viz: failed to start server: ${(err as Error)?.message ?? err}`);
  process.exit(1);
}

const url = `http://127.0.0.1:${opts.port}`;
console.log(`ctx-viz serving ${url}`);

if (opts.open) {
  const opener = process.platform === "darwin" ? "open" : "xdg-open";
  try {
    Bun.spawn([opener, url], { stdout: "ignore", stderr: "ignore" });
  } catch {
    // browser opening is best-effort
  }
}
