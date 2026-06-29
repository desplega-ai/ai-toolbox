# shot

A tiny, no-auth **screenshot service**. Give it a URL, get back a PNG (or JPEG).
Renders with **Playwright over CDP** — bundled Chromium by default, or any external
CDP backend you point it at.

```
GET /                       → help JSON (routes + examples)
GET /health                 → liveness + browser status
GET /screenshot?url=<URL>   → image/png (or jpeg)
GET /openapi.json           → OpenAPI 3.1 spec
```

## Quick start

### Docker (recommended)

```bash
cd shot
docker compose up --build
# or:
docker build -t shot .
docker run --rm -p 8080:8080 --shm-size=1g shot
```

Then:

```bash
curl 'http://localhost:8080/screenshot?url=https://example.com' -o shot.png
open shot.png
```

### Local dev

Requires Node 18+.

```bash
cd shot
npm install
npx playwright install chromium   # one-time: download the browser
npm run dev                        # single process: app launches its own Chromium
```

To exercise the container's two-process model locally (Chromium CDP server +
app, supervised):

```bash
npm run start:supervised
# If port 9222 is already in use (e.g. another Chrome with remote debugging):
CDP_PORT=9333 npm run start:supervised
```

## Endpoints

### `GET /screenshot`

| Param        | Type                                              | Default | Notes                                   |
| ------------ | ------------------------------------------------- | ------- | --------------------------------------- |
| `url`        | string (**required**)                             | —       | Absolute http(s) URL                    |
| `full_page`  | bool                                              | `false` | Capture full scrollable page            |
| `width`      | int                                               | `1280`  | Viewport width (CSS px)                 |
| `height`     | int                                               | `800`   | Viewport height (CSS px)                |
| `format`     | `png` \| `jpeg`                                   | `png`   |                                         |
| `quality`    | int 0–100                                         | `80`    | JPEG only                               |
| `scale`      | number                                            | `1`     | Device scale factor (DPR)               |
| `wait_until` | `load` \| `domcontentloaded` \| `networkidle` \| `commit` | `load`  | Playwright navigation condition |
| `delay`      | int ms                                            | `0`     | Extra wait after load                   |
| `timeout`    | int ms                                            | `30000` | Navigation timeout (capped by `MAX_TIMEOUT_MS`) |
| `dark`       | bool                                              | `false` | Emulate `prefers-color-scheme: dark`    |

Examples:

```bash
# viewport shot
curl 'http://localhost:8080/screenshot?url=https://example.com' -o a.png

# full page, retina, dark mode
curl 'http://localhost:8080/screenshot?url=https://news.ycombinator.com&full_page=true&scale=2&dark=true' -o b.png

# jpeg at 1080p
curl 'http://localhost:8080/screenshot?url=https://example.com&width=1920&height=1080&format=jpeg&quality=70' -o c.jpg
```

### `GET /health`

```json
{ "status": "ok", "backend": "chromium:bundled", "browserConnected": true, "uptimeSeconds": 12, "version": "0.1.0" }
```

Returns `503` if the browser backend is unreachable.

### `GET /` and `GET /openapi.json`

`/` returns a self-describing help document; `/openapi.json` returns the OpenAPI 3.1 spec.

## Configuration

All via environment variables (see [`.env.example`](./.env.example)):

| Var                       | Default     | Meaning                                              |
| ------------------------- | ----------- | ---------------------------------------------------- |
| `PORT` / `HOST`           | `8080` / `0.0.0.0` | Listen address                                |
| `CDP_URL`                 | _(unset)_   | Reuse an external CDP backend instead of launching Chromium |
| `CDP_PORT` / `CDP_BIND`   | `9222` / `127.0.0.1` | Port/bind for the supervisor's Chromium CDP server |
| `CDP_READY_TIMEOUT_MS`    | `30000`     | How long the supervisor waits for the CDP server before starting the app |
| `DEFAULT_WIDTH/HEIGHT`    | `1280`/`800`| Default viewport                                     |
| `DEFAULT_TIMEOUT_MS`      | `30000`     | Default navigation timeout                            |
| `MAX_TIMEOUT_MS`          | `60000`     | Ceiling for `timeout`                                |
| `NAV_WAIT_UNTIL`          | `load`      | Default wait condition                               |
| `MAX_CONCURRENCY`         | `4`         | Max simultaneous renders (rest queue)                |
| `MAX_WIDTH/HEIGHT`        | `3840`      | Viewport ceilings                                    |
| `MAX_DEVICE_SCALE_FACTOR` | `3`         | DPR ceiling                                          |
| `MAX_DELAY_MS`            | `15000`     | Ceiling for `delay`                                  |
| `ALLOW_PRIVATE_IPS`       | `false`     | Allow private/loopback targets (disables SSRF guard) |

## Security notes

- **No authentication** — as requested. Put it behind a reverse proxy / network
  policy if exposed beyond a trusted boundary.
- **SSRF guard (on by default):** requests whose URL resolves to a private,
  loopback, link-local, or cloud-metadata address (e.g. `169.254.169.254`) are
  refused with `403`. Set `ALLOW_PRIVATE_IPS=true` to screenshot intranet hosts.
  This is a guard rail, not airtight — it does not stop DNS rebinding or
  redirects to private hosts mid-navigation.
- Resource ceilings (`MAX_*`) bound viewport size, DPR, delay, timeout, and
  concurrency so a single caller can't trivially exhaust memory.

## Deployment

It's one Docker image — runs anywhere containers do. See **[DEPLOY.md](./DEPLOY.md)**
for provider-specific recipes (Fly.io, Cloud Run, Railway/Render, Dokploy on
Hetzner, plain docker compose) plus sizing and the "put it behind auth" checklist.

## Architecture

In the container, the entrypoint (`scripts/supervisor.mjs`) runs **two supervised
processes**, restarting either on failure:

```
                       ┌─────────────────────────────┐
 docker CMD ──▶ supervisor.mjs                        │
                       │  ├─ chromium-cdp  (CDP server on 127.0.0.1:9222)
                       │  └─ shot-server   (HTTP :8080, connectOverCDP → 9222)
                       └─────────────────────────────┘
```

This is the "reuse CDP servers" shape: the browser is a separate, long-lived CDP
server that the app attaches to. Set `CDP_URL` to point at an **external** CDP
backend (Chrome pool, browserless) and the supervisor skips launching Chromium and
just supervises the app against it.

Running `npm start` directly (local dev) is single-process: the app launches its
own Chromium via Playwright instead.

```
src/
  server.ts        HTTP routing, param parsing, error → JSON
  browser.ts       shared browser (launch or connectOverCDP) + render + concurrency
  ssrf.ts          private-address guard
  openapi.ts       OpenAPI 3.1 document
  config.ts        env-driven config
  errors.ts        HttpError
scripts/
  supervisor.mjs   2-process container entrypoint (CDP browser + app, restart-on-fail)
```

One browser is kept alive per process and reused; every request gets its own
isolated `BrowserContext` + `Page`, closed when the response is sent. If the CDP
backend drops, the app transparently reconnects on the next request.
