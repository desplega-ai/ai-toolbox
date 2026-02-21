# dokcli

CLI tool for [Dokploy](https://dokploy.com) — auto-generated from the OpenAPI spec.

Commands are dynamically registered from the Dokploy API spec, so every API endpoint is available as a CLI command.

## Installation

```bash
npm install -g @desplega.ai/dokcli
```

Or run directly with bun:

```bash
bunx @desplega.ai/dokcli
```

## Quick Start

```bash
# Set your API key
export DOKPLOY_API_KEY=your-api-key
# Or save it to config
dokcli login --key your-api-key --server https://your-dokploy.com

# Fetch and cache the OpenAPI spec from your server
dokcli spec fetch

# List all projects
dokcli project all

# Get Dokploy version
dokcli settings getDokployVersion

# Create a project
dokcli project create --name "my-project"
```

## Authentication

API key can be provided in two ways (in priority order):

1. **Environment variable**: `DOKPLOY_API_KEY`
2. **Config file**: `~/.dokcli/config.json` (via `dokcli login`)

Server URL resolution:

1. `DOKPLOY_SERVER_URL` env var
2. `~/.dokcli/config.json`
3. Default: `https://app.dokploy.com`

## Commands

### Static Commands

| Command | Description |
|---------|-------------|
| `dokcli login` | Configure server URL and API key |
| `dokcli config show` | Show current configuration |
| `dokcli config set <key> <value>` | Set a config value |
| `dokcli config unset <key>` | Remove a config value |
| `dokcli spec fetch` | Fetch and cache the OpenAPI spec |
| `dokcli spec show` | Show cached spec info |

### Dynamic Commands

All API endpoints are available as `dokcli <tag> <operation> [options]`:

```bash
dokcli project all
dokcli application create --name myapp --projectId abc123
dokcli compose one --composeId xyz789
dokcli settings getDokployVersion
dokcli docker getContainers
```

Run `dokcli --help` to see all available tag groups, and `dokcli <tag> --help` for operations within a tag.

### Global Options

| Option | Description |
|--------|-------------|
| `--json` | Output raw JSON (pipe-friendly) |
| `--server <url>` | Override server URL |
| `--api-key <key>` | Override API key |

## How It Works

dokcli parses the Dokploy OpenAPI spec and dynamically registers CLI commands for each endpoint. The spec is cached locally after `dokcli spec fetch`. A bundled fallback spec is included for `--help` before authentication.

The Dokploy API uses flat RPC-style paths (`/api/{tag}.{operation}`), which map directly to CLI commands (`dokcli <tag> <operation>`).

## License

MIT
