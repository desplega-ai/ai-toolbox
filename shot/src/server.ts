import http from "node:http";
import { config, VERSION } from "./config";
import { HttpError } from "./errors";
import { assertUrlAllowed } from "./ssrf";
import {
  backendDescription,
  closeBrowser,
  getBrowser,
  takeScreenshot,
  type ShotOptions,
} from "./browser";
import { openapiSpec } from "./openapi";

const startedAt = Date.now();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function sendError(res: http.ServerResponse, status: number, message: string): void {
  if (status === 503 && !res.headersSent) res.setHeader("retry-after", "1");
  sendJson(res, status, { error: { status, message } });
}

const WAIT_UNTIL = new Set(["load", "domcontentloaded", "networkidle", "commit"]);

/** Turn the query string into validated, clamped screenshot options. */
function parseShotOptions(params: URLSearchParams, url: string): ShotOptions {
  const intParam = (name: string, fallback: number): number => {
    const raw = params.get(name);
    if (raw === null) return fallback;
    const n = Number(raw);
    if (!Number.isFinite(n)) throw new HttpError(400, `Parameter "${name}" must be a number`);
    return Math.trunc(n);
  };
  const boolParam = (name: string): boolean => {
    const raw = params.get(name);
    return raw !== null && /^(1|true|yes|on|)$/i.test(raw);
  };

  const format = (params.get("format") ?? "png").toLowerCase();
  if (format !== "png" && format !== "jpeg" && format !== "jpg") {
    throw new HttpError(400, `Parameter "format" must be png or jpeg`);
  }

  const waitUntil = (params.get("wait_until") ?? params.get("waitUntil") ?? config.defaultWaitUntil) as string;
  if (!WAIT_UNTIL.has(waitUntil)) {
    throw new HttpError(400, `Parameter "wait_until" must be one of ${[...WAIT_UNTIL].join(", ")}`);
  }

  const floatParam = (names: string[], fallback: number): number => {
    for (const name of names) {
      const raw = params.get(name);
      if (raw === null) continue;
      const n = Number(raw);
      if (!Number.isFinite(n)) throw new HttpError(400, `Parameter "${name}" must be a number`);
      return n;
    }
    return fallback;
  };

  const quality = clamp(intParam("quality", 80), 0, 100);
  const scale = clamp(floatParam(["scale", "device_scale_factor"], 1), 0.1, config.maxDeviceScaleFactor);

  return {
    url,
    fullPage: boolParam("full_page") || boolParam("fullPage"),
    width: clamp(intParam("width", config.defaultWidth), 1, config.maxWidth),
    height: clamp(intParam("height", config.defaultHeight), 1, config.maxHeight),
    deviceScaleFactor: scale,
    format: format === "jpg" ? "jpeg" : (format as "png" | "jpeg"),
    quality,
    waitUntil: waitUntil as ShotOptions["waitUntil"],
    timeout: clamp(intParam("timeout", config.defaultTimeoutMs), 1_000, config.maxTimeoutMs),
    delay: clamp(intParam("delay", 0), 0, config.maxDelayMs),
    colorScheme: boolParam("dark") ? "dark" : undefined,
  };
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

function helpDocument(): unknown {
  const base = `http://localhost:${config.port}`;
  return {
    name: "shot",
    version: VERSION,
    description:
      "No-auth screenshot service. Renders a URL to an image using Playwright over CDP.",
    backend: backendDescription(),
    routes: {
      "GET /": "This help document.",
      "GET /health": "Liveness probe + browser backend status.",
      "GET /screenshot?url=<URL>": "Render a page to PNG (default) or JPEG.",
      "GET /openapi.json": "OpenAPI 3.1 specification.",
    },
    screenshot_params: {
      url: "required — absolute http(s) URL to capture",
      full_page: "bool (default false) — capture full scrollable page",
      width: "int (default 1280) — viewport width",
      height: "int (default 800) — viewport height",
      format: "png | jpeg (default png)",
      quality: "int 0-100 (jpeg only, default 80)",
      scale: "number (default 1) — device scale factor / DPR",
      wait_until: "load | domcontentloaded | networkidle | commit (default load)",
      delay: "int ms (default 0) — extra wait after load",
      timeout: `int ms (default ${config.defaultTimeoutMs}, max ${config.maxTimeoutMs})`,
      dark: "bool (default false) — emulate prefers-color-scheme: dark",
    },
    examples: [
      `${base}/screenshot?url=https://example.com`,
      `${base}/screenshot?url=https://news.ycombinator.com&full_page=true`,
      `${base}/screenshot?url=https://example.com&width=1920&height=1080&format=jpeg&quality=80`,
      `${base}/screenshot?url=https://example.com&dark=true&scale=2`,
      `curl '${base}/screenshot?url=https://example.com' -o shot.png`,
    ],
    notes: [
      "No authentication. By default, requests to private/loopback/metadata addresses are refused (set ALLOW_PRIVATE_IPS=true to allow).",
      "Rendered by Chromium — bundled by default, or an external CDP backend via CDP_URL.",
    ],
  };
}

async function handleHealth(res: http.ServerResponse): Promise<void> {
  let browserConnected = false;
  try {
    const browser = await getBrowser();
    browserConnected = browser.isConnected();
  } catch {
    browserConnected = false;
  }
  const body = {
    status: browserConnected ? "ok" : "degraded",
    backend: backendDescription(),
    browserConnected,
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    version: VERSION,
  };
  sendJson(res, browserConnected ? 200 : 503, body);
}

async function handleScreenshot(res: http.ServerResponse, params: URLSearchParams): Promise<void> {
  const rawUrl = params.get("url");
  if (!rawUrl) {
    throw new HttpError(400, 'Missing required query parameter "url"');
  }
  const validated = await assertUrlAllowed(rawUrl);
  const opts = parseShotOptions(params, validated.toString());

  let image: Buffer;
  try {
    image = await takeScreenshot(opts);
  } catch (err) {
    if (err instanceof HttpError) throw err; // e.g. 503 queue-full — preserve status
    const message = err instanceof Error ? err.message : String(err);
    throw new HttpError(502, `Failed to render ${opts.url}: ${message}`);
  }

  res.writeHead(200, {
    "content-type": opts.format === "jpeg" ? "image/jpeg" : "image/png",
    "content-length": image.length,
    "cache-control": "no-store",
    "content-disposition": `inline; filename="screenshot.${opts.format === "jpeg" ? "jpg" : "png"}"`,
  });
  res.end(image);
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = http.createServer((req, res) => {
  void route(req, res).catch((err) => {
    if (res.headersSent) {
      res.destroy();
      return;
    }
    if (err instanceof HttpError) {
      sendError(res, err.status, err.message);
    } else {
      const message = err instanceof Error ? err.message : String(err);
      sendError(res, 500, `Internal error: ${message}`);
    }
  });
});

async function route(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const method = req.method ?? "GET";
  const parsed = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const path = parsed.pathname;

  if (method !== "GET" && method !== "HEAD") {
    throw new HttpError(405, `Method ${method} not allowed`);
  }

  switch (path) {
    case "/":
      return sendJson(res, 200, helpDocument());
    case "/health":
    case "/healthz":
      return handleHealth(res);
    case "/openapi.json":
      return sendJson(res, 200, openapiSpec());
    case "/screenshot":
      return handleScreenshot(res, parsed.searchParams);
    case "/favicon.ico":
      res.writeHead(204);
      res.end();
      return;
    default:
      throw new HttpError(404, `Not found: ${path}. See GET / for available routes.`);
  }
}

server.listen(config.port, config.host, () => {
  // eslint-disable-next-line no-console
  console.log(
    `shot v${VERSION} listening on http://${config.host}:${config.port} (backend: ${backendDescription()}, ssrf-guard: ${config.allowPrivateIps ? "off" : "on"})`,
  );
});

// Graceful shutdown.
let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  // eslint-disable-next-line no-console
  console.log(`Received ${signal}, shutting down…`);
  server.close();
  await closeBrowser();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
