---
name: oapi-expert
description: OpenAPI CLI expert for @desplega.ai/oapi. Use when users want to register OpenAPI specs, execute API requests, manage auth profiles, explore API endpoints, or work with REST APIs from the terminal.
---

# OAPI Expert

You are an expert on `@desplega.ai/oapi`, a CLI tool that dynamically generates CLIs from OpenAPI specs. It lets you register any API, explore its endpoints, and execute requests — all from the terminal.

## Install

**CLI:**

```bash
npm install -g @desplega.ai/oapi
```

**Skill (Claude Code plugin):**

```bash
/plugin install oapi@desplega-ai-toolbox
```

**Skill (npx):**

```bash
# All skills from ai-toolbox
npx skills add desplega-ai/ai-toolbox

# Just this skill
npx skills add https://github.com/desplega-ai/ai-toolbox --skill oapi-expert
```

**Browse:** https://skills.sh/desplega-ai/ai-toolbox/oapi-expert

## First Thing: Learn the API

**IMPORTANT:** When you are unfamiliar with oapi or invoked without a specific command, ALWAYS start by learning what's available. Do not guess — use these commands to self-learn:

```bash
# 1. See all commands
oapi --help

# 2. General usage guide and workflow (no API name needed)
oapi docs

# 3. See what APIs are registered
oapi list

# 4. See all endpoints for a specific API
oapi docs <api-name>

# 5. See parameter details for a specific endpoint
oapi docs <api-name> <path>
oapi docs <api-name> <path> <method>
```

**Always run `oapi docs` before attempting to use an API you haven't seen before.** The docs command generates contextual examples with correct field names and types — use them as templates for your requests.

## Quick Reference

| Command | Description |
|---------|-------------|
| `oapi register --name <n> --remote <url>` | Register API from remote spec |
| `oapi register --name <n> --local <file>` | Register API from local spec |
| `oapi list` | List registered APIs |
| `oapi unregister <name>` | Remove API and cached spec |
| `oapi refresh <name>` | Re-fetch/re-read cached spec |
| `oapi refresh --all` | Refresh all specs |
| `oapi x <api> <path> [method]` | Execute API request |
| `oapi x <api> --help` | List all endpoints |
| `oapi x <api> <path> --help` | Show endpoint params |
| `oapi docs` | General usage guide |
| `oapi docs <api>` | API overview + all endpoints |
| `oapi docs <api> <path>` | Endpoint detail + params |
| `oapi docs <api> <path> <method>` | Single method detail |
| `oapi profile add ...` | Create auth profile |
| `oapi profile list` | List profiles |
| `oapi profile rm <name>` | Remove profile |
| `oapi profile set-default <api> <profile>` | Set default auth for API |

## Dynamic Discovery

oapi is dynamic — the endpoints available depend entirely on which APIs the user has registered. **Never guess endpoints or parameters.** Instead, discover them at runtime:

1. `oapi list` — what APIs exist?
2. `oapi docs <api>` — what endpoints does this API have?
3. `oapi docs <api> <path>` — what parameters does this endpoint take?
4. `oapi x <api> --help` — quick endpoint listing
5. `oapi x <api> <path> --help` — quick parameter listing

The `docs` command generates complete example commands you can copy and adapt.

## Execute Command

```bash
oapi x <api-name> <path> [method] [options]
```

### Method Resolution (when omitted)

- If the path has only one method in the spec → use it
- If `-F`/`--input` is provided → use POST
- Otherwise → use GET

### Typed Fields (`-F`)

Auto-convert values by type:

| Input | Becomes |
|-------|---------|
| `123` | integer |
| `3.14` | float |
| `true` / `false` | boolean |
| `null` | null |
| `'{"a":1}'` or `'[1,2]'` | parsed JSON |
| `@file.json` | file contents (auto-parsed if JSON) |

**Dot notation** for nested objects:

```bash
-F handler.type=http -F handler.url=https://example.com
# → { "handler": { "type": "http", "url": "https://example.com" } }
```

Use `-f` (raw field) to send values as literal strings with no type conversion.

### Path Parameters

Both forms work:

```bash
# Template form — substitute via field
oapi x myapi /v1/items/{item_id} DELETE -F item_id=abc123

# Literal form — auto-matched against spec
oapi x myapi /v1/items/abc123 DELETE
```

### Execute Options

| Flag | Description |
|------|-------------|
| `-F key=value` | Typed field (auto-parses numbers, booleans, JSON, `@file`) |
| `-f key=value` | Raw string field (no type conversion) |
| `-H Key:Value` | Custom header |
| `--input <file>` | Request body from file (`-` for stdin) |
| `--raw` | Compact JSON output (no pretty-printing) |
| `--no-validate` | Skip JSON Schema validation |
| `--dry-run` | Print equivalent curl command instead of executing |
| `--verbose` | Show request/response headers on stderr |
| `--jq <expr>` | Filter output with jq (requires system jq) |
| `--profile <name>` | Use a specific auth profile |
| `--help` | Contextual help (endpoint list or param details) |

## Auth Profiles

### Profile Types

| Type | Header Sent |
|------|-------------|
| `header` | Custom header (default: `Authorization`, customizable with `--header-name`) |
| `bearer` | `Authorization: Bearer <value>` |
| `basic` | `Authorization: Basic <base64(value)>` |
| `query` | Appends `?param=value` to URL (requires `--query-param`) |

### Setup Workflow

```bash
# 1. Create a profile
oapi profile add --name prod-key --type header --header-name X-Api-Key --value sk-123

# 2. Set as default for an API
oapi profile set-default myapi prod-key

# 3. Auth is now applied automatically
oapi x myapi /v1/items   # X-Api-Key header attached automatically

# 4. Override per-request
oapi x myapi /v1/items --profile other-key
```

## Common Workflows

### Register and Explore a New API

```bash
oapi register --name myapi --remote https://api.example.com/openapi.json
oapi docs myapi              # See all endpoints
oapi docs myapi /v1/items    # See params for /v1/items
```

### Set Up Auth and Make First Request

```bash
oapi profile add --name mytoken --type bearer --value sk-abc123
oapi profile set-default myapi mytoken
oapi x myapi /v1/items       # Authenticated GET
```

### Debug a Failing Request

```bash
# See the curl command that would be sent
oapi x myapi /v1/items POST -F name=test --dry-run

# See full request/response headers
oapi x myapi /v1/items POST -F name=test --verbose

# Skip validation if schema seems wrong
oapi x myapi /v1/items POST -F name=test --no-validate
```

### Filter Output with jq

```bash
oapi x myapi /v1/items --jq '.[].id'
oapi x myapi /v1/items --jq 'length'
```

### Complex Request Bodies

```bash
# From a file
oapi x myapi /v1/items POST --input payload.json

# From stdin
echo '{"name":"test"}' | oapi x myapi /v1/items POST --input -

# Nested objects via dot notation
oapi x myapi /v1/webhooks POST -F url=https://example.com -F config.retries=3 -F config.timeout=30
```

## Configuration

Config stored at `~/.oapi/` (override with `OAPI_CONFIG_DIR`):

```
~/.oapi/
├── config.json    # APIs, profiles, default mappings
└── specs/
    └── myapi.json # Cached OpenAPI specs
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| API not found | Run `oapi list` to check registered APIs, or `oapi register` to add it |
| Spec outdated | Run `oapi refresh <name>` to re-fetch |
| Validation failed | Check field types with `oapi docs <api> <path>`, or use `--no-validate` |
| Method not available | Check `oapi docs <api> <path>` for available methods |
| Auth errors | Verify profile with `oapi profile list`, check `set-default` mapping |
| jq not working | Install jq: `brew install jq` |
| Wrong base URL | Re-register with `--base-url` override |
| Command not found | Install: `npm install -g @desplega.ai/oapi` |
