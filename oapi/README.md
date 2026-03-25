# oapi

Dynamic CLI generator from OpenAPI specs. Register any API, explore its endpoints, and execute requests — all from the terminal.

## Install

```sh
npm install -g @desplega.ai/oapi
```

Or run directly:

```sh
npx @desplega.ai/oapi --help
```

## Quick Start

```sh
# Register an API from a remote OpenAPI spec
oapi register --name myapi --remote https://api.example.com/openapi.json

# List registered APIs
oapi list

# Explore available endpoints
oapi x myapi --help

# Execute a GET request
oapi x myapi /health

# Execute a POST with typed fields
oapi x myapi /v1/items POST -F name=widget -F type=a -F count=5

# Pipe output through jq
oapi x myapi /v1/items --jq '.[].id'
```

## Commands

### `register`

Register a local or remote OpenAPI spec.

```sh
oapi register --name <name> --remote <url> [--base-url <url>]
oapi register --name <name> --local <file> [--base-url <url>]
```

The base URL is auto-derived from the spec's `servers[0].url` when not provided.

### `list`

List all registered APIs with endpoint counts and refresh timestamps.

```sh
oapi list
```

### `unregister`

Remove a registered API and its cached spec.

```sh
oapi unregister <name>
```

### `refresh`

Re-fetch/re-read a cached spec.

```sh
oapi refresh <name>
oapi refresh --all
```

### `x` (execute)

Execute an API request.

```sh
oapi x <api-name> <path> [method] [options]
```

**Method resolution** (when method is omitted):
- If the path has only one method in the spec, use it
- If `-F`/`--input` is provided, use POST
- Otherwise, use GET

**Options:**

| Flag | Description |
|------|-------------|
| `-F key=value` | Typed field — numbers, booleans, JSON, `@file` are auto-parsed |
| `-f key=value` | Raw string field — no type conversion |
| `-H Key:Value` | Custom header |
| `--input <file>` | Request body from file (`-` for stdin) |
| `--raw` | Compact JSON output |
| `--no-validate` | Skip schema validation |
| `--dry-run` | Print curl command instead of executing |
| `--verbose` | Show request/response headers on stderr |
| `--jq <expr>` | Filter output with jq (requires system jq) |
| `--profile <name>` | Use a specific auth profile |
| `--help` | Show contextual help (endpoint list or param details) |

**Typed fields (`-F`)** auto-convert values:
- `123` → integer, `3.14` → float, `true`/`false` → boolean, `null` → null
- `'{"a":1}'` or `'[1,2]'` → parsed JSON
- `@file.json` → file contents
- Dot notation: `-F handler.type=http` → `{ handler: { type: "http" } }`

**Path parameters** work both ways:

```sh
# Template form
oapi x myapi /v1/items/{item_id} DELETE -F item_id=abc123

# Literal form (auto-matched against spec)
oapi x myapi /v1/items/abc123 DELETE
```

**Contextual help:**

```sh
oapi x myapi --help              # List all endpoints
oapi x myapi /v1/items --help    # Show endpoint details + params
```

### `profile`

Manage auth profiles.

```sh
oapi profile add --name <name> --type <header|bearer|basic|query> --value <value> [--header-name <name>] [--query-param <name>]
oapi profile list
oapi profile rm <name>
oapi profile set-default <api-name> <profile-name>
```

Auth is applied automatically when a default profile is set:

```sh
oapi profile add --name prod-key --type header --header-name X-Api-Key --value sk-123
oapi profile set-default myapi prod-key
oapi x myapi /v1/items   # X-Api-Key header attached automatically
```

Profile types:
- `header` — custom header (default name: `Authorization`)
- `bearer` — `Authorization: Bearer <value>`
- `basic` — `Authorization: Basic <base64(value)>`
- `query` — appends `?param=value` to URL

## Configuration

Config is stored at `~/.oapi/`:

```
~/.oapi/
├── config.json    # APIs, profiles, defaults
└── specs/
    └── myapi.json # Cached OpenAPI specs
```

Set `OAPI_CONFIG_DIR` to use a different location.

## Development

```sh
cd oapi
bun install
bun src/index.ts --help    # Run from source
bun test                   # Run tests
bun run build              # Build to dist/
bun run lint               # Lint with biome
bun run tsc                # Type check
```

## License

MIT
