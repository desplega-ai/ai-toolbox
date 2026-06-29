// Browser lifecycle + screenshot rendering.
//
// One shared browser is kept alive for the process and reused across requests;
// every request gets its own isolated BrowserContext + Page. The browser is
// either:
//   - launched locally (bundled Chromium) when CDP_URL is unset — renders pixels;
//   - or attached to an external CDP endpoint via connectOverCDP(CDP_URL) — lets
//     you reuse a Chrome pool / browserless server.

import { chromium, type Browser, type BrowserContext } from "playwright";
import { config } from "./config";
import { HttpError } from "./errors";

/**
 * Minimal FIFO semaphore bounding concurrent renders, with a bounded wait queue.
 * Once `max` renders are in flight and `maxQueue` requests are already waiting,
 * further acquires are rejected (503) instead of piling up unbounded — otherwise
 * an unauthenticated flood could exhaust memory/file descriptors.
 */
class Semaphore {
  private active = 0;
  private readonly queue: Array<() => void> = [];
  constructor(
    private readonly max: number,
    private readonly maxQueue: number,
  ) {}

  acquire(): Promise<void> {
    if (this.active < this.max) {
      this.active++;
      return Promise.resolve();
    }
    if (this.queue.length >= this.maxQueue) {
      return Promise.reject(
        new HttpError(503, "Server busy: render queue full, retry shortly"),
      );
    }
    return new Promise<void>((resolve) => this.queue.push(resolve));
  }

  release(): void {
    const next = this.queue.shift();
    if (next) next(); // hand the slot directly to the next waiter
    else this.active--;
  }
}

const LAUNCH_ARGS = [
  "--no-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
  "--hide-scrollbars",
  "--mute-audio",
];

let browserPromise: Promise<Browser> | null = null;

/**
 * A safe label for the rendering backend, exposed on the unauthenticated `/` and
 * `/health` responses. A CDP URL can embed credentials (userinfo, or a token in
 * the query string, e.g. browserless), so we strip everything but scheme+host:port
 * — never the raw value.
 */
export function backendDescription(): string {
  if (!config.cdpUrl) return "chromium:bundled";
  try {
    const u = new URL(config.cdpUrl);
    const auth = u.username ? "***@" : ""; // signal creds exist without leaking them
    return `cdp:${u.protocol}//${auth}${u.host}`;
  } catch {
    return "cdp:external";
  }
}

async function createBrowser(): Promise<Browser> {
  const browser = config.cdpUrl
    ? await chromium.connectOverCDP(config.cdpUrl)
    : await chromium.launch({ headless: true, args: LAUNCH_ARGS });

  // If the backend drops (crash, remote restart), force a reconnect next time.
  browser.on("disconnected", () => {
    browserPromise = null;
  });
  return browser;
}

/** Lazily create (and transparently re-create) the shared browser. */
export async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = createBrowser().catch((err) => {
      browserPromise = null; // don't cache the failure
      throw err;
    });
  }
  const browser = await browserPromise;
  if (!browser.isConnected()) {
    browserPromise = null;
    return getBrowser();
  }
  return browser;
}

export async function closeBrowser(): Promise<void> {
  const pending = browserPromise;
  browserPromise = null;
  if (!pending) return;
  try {
    const browser = await pending;
    await browser.close();
  } catch {
    // best-effort on shutdown
  }
}

export interface ShotOptions {
  url: string;
  fullPage: boolean;
  width: number;
  height: number;
  deviceScaleFactor: number;
  format: "png" | "jpeg";
  quality: number | undefined;
  waitUntil: "load" | "domcontentloaded" | "networkidle" | "commit";
  timeout: number;
  delay: number;
  colorScheme: "light" | "dark" | undefined;
}

// Bound the number of pages rendering at once to keep memory predictable.
const semaphore = new Semaphore(Math.max(1, config.maxConcurrency), Math.max(0, config.maxQueue));

/** Render a URL to an image buffer. */
export async function takeScreenshot(opts: ShotOptions): Promise<Buffer> {
  await semaphore.acquire();
  let context: BrowserContext | undefined;
  try {
    const browser = await getBrowser();
    context = await browser.newContext({
      viewport: { width: opts.width, height: opts.height },
      deviceScaleFactor: opts.deviceScaleFactor,
      colorScheme: opts.colorScheme,
      ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();
    page.setDefaultNavigationTimeout(opts.timeout);
    await page.goto(opts.url, { waitUntil: opts.waitUntil, timeout: opts.timeout });
    if (opts.delay > 0) await page.waitForTimeout(opts.delay);
    return await page.screenshot({
      fullPage: opts.fullPage,
      type: opts.format,
      quality: opts.format === "jpeg" ? opts.quality : undefined,
    });
  } finally {
    if (context) await context.close().catch(() => {});
    semaphore.release();
  }
}
