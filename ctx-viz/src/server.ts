// HTTP server: API routes + static serving from ../public (relative to this
// source file). Binds 127.0.0.1 only.

import { join, resolve, sep, extname } from "node:path";
import { listSessions, getSession } from "./transcript.ts";
import { getTree } from "./tree.ts";
import { ensureStatsLoaded, statsFromCache, enqueueStats, getReadyStats, pendingCount } from "./stats.ts";

export interface ServerOptions {
  port: number;
  claudeDir: string;
  limit: number;
}

const PUBLIC_DIR = resolve(join(import.meta.dir, "..", "public"));

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".woff2": "font/woff2",
};

export function startServer(opts: ServerOptions) {
  const projectsRoot = resolve(join(opts.claudeDir, "projects"));

  return Bun.serve({
    hostname: "127.0.0.1",
    port: opts.port,
    idleTimeout: 120,
    async fetch(req: Request): Promise<Response> {
      const url = new URL(req.url);
      const pathname = url.pathname;

      // DNS-rebinding defense: we bind loopback, but a rebound hostname still
      // resolves here with a foreign Host header — reject anything non-local.
      const host = url.hostname;
      if (host !== "127.0.0.1" && host !== "localhost" && host !== "[::1]") {
        return pathname.startsWith("/api/")
          ? jsonError("forbidden host", 403)
          : new Response("Forbidden", { status: 403 });
      }

      if (pathname.startsWith("/api/")) {
        try {
          return await handleApi(pathname, url, opts, projectsRoot);
        } catch (err) {
          return jsonError(String((err as Error)?.message ?? err), 500);
        }
      }

      return serveStatic(pathname);
    },
  });
}

async function handleApi(
  pathname: string,
  url: URL,
  opts: ServerOptions,
  projectsRoot: string,
): Promise<Response> {
  if (pathname === "/api/sessions") {
    let limit = opts.limit;
    const limitParam = url.searchParams.get("limit");
    if (limitParam !== null) {
      const n = Number.parseInt(limitParam, 10);
      if (!Number.isFinite(n) || n < 0) return jsonError("invalid limit", 400);
      limit = n;
    }
    await ensureStatsLoaded();
    const list = await listSessions(opts.claudeDir, limit, statsFromCache);
    // Enqueue background stats computation for missing/stale entries AFTER
    // responding — setTimeout(0) fires once this handler has returned.
    const missing = list.sessions.filter((s) => s.stats === null).map((s) => s.path);
    if (missing.length > 0) setTimeout(() => enqueueStats(missing), 0);
    return json(list);
  }

  if (pathname === "/api/stats") {
    return json({ ready: await getReadyStats(), pending: pendingCount() });
  }

  if (pathname === "/api/session") {
    const rawPath = url.searchParams.get("path");
    if (!rawPath) return jsonError("missing path parameter", 400);
    const abs = resolve(rawPath);
    if (abs !== projectsRoot && !abs.startsWith(projectsRoot + sep)) {
      return jsonError("path outside allowed root", 403);
    }
    if (!(await Bun.file(abs).exists())) return jsonError("session file not found", 404);
    return json(await getSession(abs));
  }

  if (pathname === "/api/tree") {
    const cwd = url.searchParams.get("cwd");
    if (!cwd) return jsonError("missing cwd parameter", 400);
    const branch = url.searchParams.get("branch");
    const before = url.searchParams.get("before");
    return json(getTree(resolve(cwd), branch, before));
  }

  return jsonError("not found", 404);
}

async function serveStatic(pathname: string): Promise<Response> {
  let rel = pathname === "/" ? "/index.html" : pathname;
  let decoded: string;
  try {
    decoded = decodeURIComponent(rel);
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  if (decoded.includes("\0")) return new Response("Bad request", { status: 400 });

  const abs = resolve(join(PUBLIC_DIR, "." + decoded));
  if (abs !== PUBLIC_DIR && !abs.startsWith(PUBLIC_DIR + sep)) {
    return new Response("Forbidden", { status: 403 });
  }

  try {
    const file = Bun.file(abs);
    if (!(await file.exists())) return new Response("Not found", { status: 404 });
    const type = CONTENT_TYPES[extname(abs).toLowerCase()] ?? "application/octet-stream";
    return new Response(file, { headers: { "Content-Type": type } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function jsonError(message: string, status: number): Response {
  return json({ error: message }, status);
}
