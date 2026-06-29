// Container entrypoint: run two supervised processes and restart either on
// failure.
//
//   1. chromium-cdp — a long-lived Chromium exposing a CDP server on
//      127.0.0.1:$CDP_PORT (the rendering backend; the reusable "cdp server").
//   2. shot-server  — the Playwright screenshot HTTP server, pointed at that CDP
//      endpoint via CDP_URL (so it connectOverCDP instead of launching its own).
//
// Both run under a tiny supervisor: crash → restart with capped exponential
// backoff. SIGTERM/SIGINT are forwarded to children for clean shutdown.

import { spawn } from "node:child_process";
import { chromium } from "playwright";

// If CDP_URL is already set, reuse that external CDP backend (e.g. a Chrome pool
// or browserless) and don't launch our own Chromium.
const EXTERNAL_CDP = process.env.CDP_URL?.trim();
const CDP_PORT = process.env.CDP_PORT ?? "9222";
const CDP_BIND = process.env.CDP_BIND ?? "127.0.0.1";
const INTERNAL_CDP_URL = `http://127.0.0.1:${CDP_PORT}`;
const READY_TIMEOUT_MS = Number(process.env.CDP_READY_TIMEOUT_MS ?? 30_000);

const CHROMIUM_ARGS = [
  "--headless=new",
  "--no-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
  "--hide-scrollbars",
  "--mute-audio",
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-background-networking",
  `--remote-debugging-address=${CDP_BIND}`,
  `--remote-debugging-port=${CDP_PORT}`,
  "--user-data-dir=/tmp/shot-chrome",
  "about:blank",
];

const children = new Set();
let shuttingDown = false;

function log(msg) {
  console.log(`[supervisor] ${msg}`);
}

/** Spawn `name` and keep it alive (restart on exit with backoff). */
function supervise(name, command, args, env = {}) {
  let restarts = 0;
  const start = () => {
    if (shuttingDown) return;
    const child = spawn(command, args, {
      stdio: "inherit",
      env: { ...process.env, ...env },
    });
    children.add(child);
    child.on("exit", (code, signal) => {
      children.delete(child);
      if (shuttingDown) return;
      restarts += 1;
      const delay = Math.min(10_000, 250 * 2 ** Math.min(restarts, 6));
      log(`${name} exited (code=${code} signal=${signal}); restart #${restarts} in ${delay}ms`);
      setTimeout(start, delay);
    });
    child.on("error", (err) => {
      log(`${name} spawn error: ${err.message}`);
    });
  };
  start();
}

/** Poll the CDP server's version endpoint until it answers (or time out). */
async function waitForCdp(cdpUrl) {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (shuttingDown) return;
    try {
      const res = await fetch(`${cdpUrl}/json/version`);
      if (res.ok) {
        log(`CDP server ready at ${cdpUrl}`);
        return;
      }
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  log(`CDP server not ready after ${READY_TIMEOUT_MS}ms; starting shot-server anyway (it will retry)`);
}

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  log(`received ${signal}, terminating children…`);
  for (const child of children) child.kill("SIGTERM");
  // Hard exit if children linger.
  setTimeout(() => process.exit(0), 5_000).unref();
  // Exit once all children are gone.
  const check = setInterval(() => {
    if (children.size === 0) {
      clearInterval(check);
      process.exit(0);
    }
  }, 100);
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// --- boot -------------------------------------------------------------------

const SERVER_ARGS = ["--import", "tsx", "src/server.ts"];

if (EXTERNAL_CDP) {
  log(`reusing external CDP backend at ${EXTERNAL_CDP}; not launching Chromium`);
  await waitForCdp(EXTERNAL_CDP);
  // CDP_URL is already in the environment, inherited by the child.
  supervise("shot-server", process.execPath, SERVER_ARGS);
} else {
  const chromiumPath = chromium.executablePath();
  log(`chromium: ${chromiumPath}`);
  supervise("chromium-cdp", chromiumPath, CHROMIUM_ARGS);
  await waitForCdp(INTERNAL_CDP_URL);
  supervise("shot-server", process.execPath, SERVER_ARGS, { CDP_URL: INTERNAL_CDP_URL });
}
