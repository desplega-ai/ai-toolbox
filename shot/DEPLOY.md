# Deploying `shot`

`shot` is a single Docker image (`Dockerfile` at `shot/`). Anywhere that runs a
container works. Below are concrete recipes for a few providers, ordered roughly
by least → most effort, plus the cross-cutting things that actually bite you
(memory, `/dev/shm`, and the fact that there's **no auth**).

> **Read this first — there is no authentication.** Anyone who can reach the port
> can screenshot any URL your network can reach. Always put `shot` behind one of:
> a private network, a reverse proxy that adds auth (basic auth / API key /
> mTLS), or an API gateway. The built-in SSRF guard (refuses private/loopback/
> metadata targets) is on by default but is **not** a substitute for auth. See
> [Security notes in the README](./README.md#security-notes).

## Sizing & requirements (applies everywhere)

| Resource     | Recommendation                                                        |
| ------------ | --------------------------------------------------------------------- |
| Memory       | **≥ 1 GB**, 2 GB comfortable. Chromium is the memory hog.             |
| CPU          | 1 vCPU works; 2 vCPU for parallel renders.                            |
| `/dev/shm`   | Give it **1 GB** if you can. The image already passes `--disable-dev-shm-usage`, so it survives the tiny default, but more shm = fewer crashes on heavy pages. |
| Port         | `8080` (override with `PORT`).                                        |
| Health check | `GET /health` → `200` when the browser backend is reachable.         |
| Image size   | ~2.8 GB (Playwright base + Chromium). First push is slow; layers cache after. |

Tune behaviour with the env vars in the [README config table](./README.md#configuration)
— most useful in prod: `MAX_CONCURRENCY`, `MAX_TIMEOUT_MS`, `ALLOW_PRIVATE_IPS`.

---

## Fly.io — recommended for this workload

Good fit: persistent container, cheap, global regions, real `/dev/shm`.

```bash
cd shot
fly launch --no-deploy        # generates fly.toml; pick an app name + region
```

Then set `fly.toml` to something like:

```toml
app = "shot"
primary_region = "iad"

[build]
  dockerfile = "Dockerfile"

[http_service]
  internal_port = 8080
  force_https = true
  auto_stop_machines = "stop"   # scale to zero when idle
  auto_start_machines = true
  min_machines_running = 0

[[http_service.checks]]
  method = "get"
  path = "/health"
  interval = "30s"
  timeout = "5s"

[[vm]]
  size = "shared-cpu-1x"
  memory = "1gb"                 # bump to 2gb for heavy pages
```

```bash
fly deploy
```

Add auth at the edge with a Fly app secret + a tiny proxy, or run `shot` on the
private 6PN network and only expose your auth proxy publicly.

---

## Google Cloud Run — serverless, scale-to-zero

Good fit: bursty/low traffic, pay-per-use, managed TLS. Use the **gen2**
execution environment (Chromium needs the fuller syscall surface).

```bash
cd shot
gcloud run deploy shot \
  --source . \
  --port 8080 \
  --memory 2Gi --cpu 2 \
  --execution-environment gen2 \
  --health-check-path /health \
  --no-allow-unauthenticated      # require IAM auth; or front with API Gateway
```

Notes:
- Cold starts include booting Chromium (a few seconds). Set `--min-instances 1`
  if you need it warm.
- Cloud Run injects `PORT` automatically — the app honours it.
- `--no-allow-unauthenticated` gives you IAM auth for free; clients send a Google
  identity token. Use `--allow-unauthenticated` only behind your own gateway.

---

## Railway / Render — easiest "connect a repo" flow

**Railway:** New Project → Deploy from Repo → set **Root Directory** to `shot`
(it auto-detects the `Dockerfile`). Set the service to ≥ 1 GB RAM. Add a health
check on `/health`. Railway provides a public URL + TLS — add auth before sharing.

**Render:** New → **Web Service** → Docker → **Root Directory** `shot`,
**Health Check Path** `/health`, instance type with ≥ 1 GB (Standard). Render
terminates TLS for you.

Neither adds auth — gate it (Render: a proxy/IP allowlist; Railway: a front
service) before exposing.

---

## Dokploy on a Hetzner VPS — desplega's own stack

1. Provision a Hetzner box with headroom — **CPX21** (2 vCPU / 4 GB) is plenty.
   (See the `hcloud` skill / `dokcli` in this repo.)
2. In Dokploy: **Create Application → Docker / Compose**, point it at this repo
   with build context `shot/` (or paste `shot/docker-compose.yml`).
3. Expose port `8080`, attach Dokploy's Traefik domain, and **enable Basic Auth /
   an auth middleware on the route** — that's your authentication layer.
4. Deploy. Dokploy handles TLS + restarts.

---

## Any Docker host / docker compose (VPS, homelab, bare metal)

```bash
cd shot
docker compose up -d --build
# or without compose:
docker build -t shot .
docker run -d --name shot --restart unless-stopped \
  -p 127.0.0.1:8080:8080 --shm-size=1g shot
```

Binding to `127.0.0.1` keeps it private; put Caddy/Traefik/nginx in front for
TLS **and** auth (e.g. Caddy `basicauth`, or an API-key check). Example Caddy:

```caddyfile
shot.example.com {
  basicauth { admin <bcrypt-hash> }
  reverse_proxy 127.0.0.1:8080
}
```

---

## Other options (same image, no special steps)

- **AWS** — ECS Fargate (1 vCPU / 2 GB task) or App Runner. Front with ALB +
  Cognito / WAF for auth.
- **DigitalOcean** — App Platform (Dockerfile, ≥ 1 GB instance) or a Droplet with
  the docker-compose recipe above.
- **Kubernetes** — `Deployment` + `Service`; set `resources.requests.memory: 1Gi`,
  mount an `emptyDir` with `medium: Memory` at `/dev/shm` for extra headroom, and
  use `/health` for both liveness and readiness probes.

---

## Post-deploy smoke test

```bash
BASE=https://your-deployment.example.com   # include creds if behind basic auth

curl -fsS "$BASE/health"
curl -fsS "$BASE/screenshot?url=https://example.com" -o shot.png && file shot.png
```

`/health` should return `{"status":"ok","browserConnected":true,...}` and the
screenshot should be a valid PNG.
