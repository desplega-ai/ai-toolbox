// Centralised, env-driven configuration. Everything has a sane default so the
// server runs with zero configuration: `docker run -p 8080:8080 shot`.

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    throw new Error(`Env ${name}="${raw}" is not a number`);
  }
  return n;
}

function bool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  return /^(1|true|yes|on)$/i.test(raw.trim());
}

function str(name: string, fallback: string): string {
  const raw = process.env[name];
  return raw === undefined || raw.trim() === "" ? fallback : raw.trim();
}

export const config = {
  /** HTTP port the screenshot service listens on. */
  port: num("PORT", 8080),
  /** Interface to bind. 0.0.0.0 so it works inside a container. */
  host: str("HOST", "0.0.0.0"),

  /**
   * Optional CDP endpoint to reuse instead of launching a browser (e.g. a Chrome
   * pool or browserless: `http://chrome:9222`). When unset, the service launches
   * its own bundled Chromium.
   */
  cdpUrl: process.env.CDP_URL?.trim() || undefined,

  /** Default viewport when the request doesn't specify width/height. */
  defaultWidth: num("DEFAULT_WIDTH", 1280),
  defaultHeight: num("DEFAULT_HEIGHT", 800),

  /** Navigation/screenshot timeout defaults and ceiling (milliseconds). */
  defaultTimeoutMs: num("DEFAULT_TIMEOUT_MS", 30_000),
  maxTimeoutMs: num("MAX_TIMEOUT_MS", 60_000),

  /** Default Playwright `waitUntil` for navigation. */
  defaultWaitUntil: str("NAV_WAIT_UNTIL", "load"),

  /** Hard ceilings on viewport size and post-load delay to bound resource use. */
  maxWidth: num("MAX_WIDTH", 3840),
  maxHeight: num("MAX_HEIGHT", 3840),
  maxDelayMs: num("MAX_DELAY_MS", 15_000),
  maxDeviceScaleFactor: num("MAX_DEVICE_SCALE_FACTOR", 3),

  /** Max screenshots rendered concurrently; further requests queue. */
  maxConcurrency: num("MAX_CONCURRENCY", 4),

  /** Max requests allowed to wait for a render slot before we shed load (503). */
  maxQueue: num("MAX_QUEUE", 64),

  /**
   * SSRF guard: when false (default), refuse URLs that resolve to private,
   * loopback, link-local or cloud-metadata addresses. Set ALLOW_PRIVATE_IPS=true
   * for fully-trusted/internal deployments that need to screenshot intranet hosts.
   */
  allowPrivateIps: bool("ALLOW_PRIVATE_IPS", false),
} as const;

export const VERSION = "0.1.0";
