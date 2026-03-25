---
title: "oapi - Dynamic CLI Generator from OpenAPI Specs"
date: 2026-03-25
status: complete
autonomy: autopilot
type: research
---

# oapi — Dynamic CLI Generator from OpenAPI Specs

## 1. Problem Statement

We need a lightweight CLI tool (`@desplega.ai/oapi`) that:
- Registers OpenAPI specs (local files or remote URLs)
- Generates CLI commands dynamically at runtime (no code generation)
- Validates input against the spec (with bypass option)
- Always outputs JSON (jq-compatible)
- Supports auth profiles for multi-API credential management
- Ships to npm for `npx @desplega.ai/oapi` / `bunx @desplega.ai/oapi` usage

## 2. Reference CLIs

### 2.1 `vercel api` (Vercel CLI)

**Syntax:** `vercel api [endpoint]`

Key design decisions:
- **Interactive mode** when no endpoint given — searches/selects from OpenAPI spec
- **Auto-detects method**: defaults to GET, switches to POST if body provided
- `-F key=value` for typed body params (auto-parses numbers, booleans)
- `-f key=value` for raw string params (no type parsing)
- `--input <file>` for full request body from file (stdin via `-`)
- `-H key:value` for custom headers
- `--paginate` for multi-page results
- `--raw` for compact JSON (no pretty-print)
- `--generate=curl` outputs equivalent curl command
- **Auth is automatic** from CLI session (inherits vercel login)
- `vercel api ls` lists all available endpoints

**Takeaways for oapi:**
- Interactive endpoint discovery is valuable
- `-F` (typed) vs `-f` (raw) distinction is clever
- Auto-method detection (GET default, POST when body present) reduces friction
- `--generate=curl` is nice for debugging

### 2.2 `gh api` (GitHub CLI)

**Syntax:** `gh api <endpoint> [flags]`

Key design decisions:
- Placeholder interpolation: `{owner}`, `{repo}`, `{branch}` auto-filled from git context
- `-F key=value` typed params, `-f key=value` raw string params (same pattern as Vercel)
- Nested params: `key[subkey]=value`, arrays: `key[]=value`
- `--input <file>` for body from file
- `-q` / `--jq` for built-in jq filtering
- `-t` / `--template` for Go template formatting
- `--paginate` + `--slurp` for pagination
- `--cache <duration>` for response caching
- `--silent`, `--verbose`, `-i` (include headers) output modes
- Auth automatic from `gh auth login` or `GH_TOKEN` env var
- `-p` / `--preview` for API feature previews

**Takeaways for oapi:**
- `--jq` built-in is essential for scripting — **must have**
- Nested params via `key[subkey]=value` syntax — nice to have
- `--paginate` + `--slurp` pattern is standard
- `--cache` could be useful for expensive calls
- `--silent` and `--verbose` are low-cost high-value additions

### 2.3 Combined Design Inspiration

| Feature | vercel api | gh api | oapi (proposed) |
|---------|-----------|--------|-----------------|
| Typed params (`-F`) | Yes | Yes | Yes |
| Raw params (`-f`) | Yes | Yes | Yes |
| Body from file (`--input`) | Yes | Yes | Yes |
| jq filtering | No | `--jq` | `--jq` |
| Auto method detection | Yes | Yes | Yes (spec-aware) |
| Pagination | `--paginate` | `--paginate` + `--slurp` | Later |
| Interactive discovery | Yes (no-arg mode) | No | `--help` on api name |
| Auth | Session-based | Session/env-based | Profile-based |
| Curl export | `--generate=curl` | No | `--dry-run` |

## 3. Test OpenAPI Spec Analysis

Tested against: `https://api.business-use.desplega.agent-swarm.dev/openapi.json`

**Spec details:**
- **OpenAPI 3.1.0** (latest — uses `anyOf` nullable pattern, not `nullable: true`)
- **12 endpoints** across GET/POST/PUT/DELETE
- **No formal security scheme** — uses a convention `header_name` query param (default `X-Api-Key`)
- **No tags** — endpoints grouped by path structure (`/v1/nodes/*`, `/v1/events*`, etc.)
- **No response schemas** — all 200 responses have empty `schema: {}`
- **FastAPI-generated** operation IDs (verbose, e.g., `create_node_v1_nodes_post`)

**Patterns important for CLI generation:**
1. `anyOf: [{type: "X"}, {type: "null"}]` for optionals — must collapse to "optional type X"
2. Inline array bodies (e.g., `POST /v1/events-batch` takes `Array<EventBatchItem>` directly)
3. Nested `$ref` chains need recursive resolution
4. Enum types should map to CLI choices
5. `additionalProperties: true` fields need free-form JSON input support
6. `header_name` meta-param should be handled as infrastructure config, not exposed per-command

**Implications:**
- Parser must handle OpenAPI 3.1 properly (rules out `@apidevtools/swagger-parser`)
- Need graceful handling of missing response schemas
- Path-based grouping when tags are absent
- Derive short command names from path + method, not verbose operationIds

## 4. Existing Tools Landscape

### 4.1 Code Generators (not what we want)
- **OpenAPI Generator** (22k stars) — Java-based, 60+ static targets. Overkill for dynamic CLI.
- **hey-api/openapi-ts**, **openapi-typescript** — generate TypeScript types, not CLIs.

### 4.2 Dynamic/Runtime CLIs (closest competitors)
- **openapi-to-cli** — TypeScript, npm. Runtime CLI from specs with BM25 search, multi-API profiles, auth. Most similar to what we want. However, it's a thin project without strong adoption.
- **mcp2cli** — Python. Handles MCP/OpenAPI/GraphQL at runtime. Different ecosystem.
- **dokcli** (our own) — Already does dynamic CLI from OpenAPI for Dokploy specifically.

**Conclusion:** No dominant player in this space. Building a general-purpose tool fills a real gap.

### 4.3 OpenAPI Parsers

| Package | OAS 3.1 | Downloads/wk | Status |
|---------|---------|-------------|--------|
| `@apidevtools/swagger-parser` | No | ~900k | Dormant |
| `@scalar/openapi-parser` | Yes (3.1/3.0/2.0) | Growing | Active, modern |
| `@readme/openapi-parser` | Yes | Moderate | Hard fork of swagger-parser |

**Recommendation:** Use `@scalar/openapi-parser` — modern, TypeScript-native, handles 3.1 spec parsing/dereferencing/validation, actively maintained. Note: the parser resolves `$ref` chains and validates specs, but does **not** simplify `anyOf` nullable patterns for you — oapi will need its own utility to collapse `anyOf: [{type: "X"}, {type: "null"}]` into "optional type X" for CLI display and validation purposes.

### 4.4 CLI Frameworks

| Framework | Stars | Downloads/wk | Bun compat | Notes |
|-----------|-------|-------------|-----------|-------|
| Commander.js | 28k | 329M | Yes | Already used in brain/wts/dokcli |
| citty | - | 16.6M | Yes | UnJS, clean API |
| yargs | 11.5k | 114M | Yes | More verbose |
| clerc | - | Low | Yes (explicit) | Plugin system |

**Recommendation:** Stick with **Commander.js** — proven in our monorepo, dynamic `addCommand()` is ideal for runtime command registration, massive ecosystem.

## 5. Repo Conventions (from brain/wts/dokcli)

All TypeScript CLI tools in ai-toolbox follow this pattern:

```
<tool>/
├── src/
│   ├── index.ts              # Entry point with Commander
│   ├── commands/             # Modular command files
│   ├── config/               # Config loading/saving
│   └── utils/                # Utilities
├── package.json              # @desplega.ai/<tool>
├── tsconfig.json
├── biome.json
└── README.md
```

**package.json conventions:**
- Name: `@desplega.ai/oapi`
- `bin: { "oapi": "./dist/index.js" }`
- Build: `bun build src/index.ts --outdir dist --target node --format esm` (note: `--target node` not `--target bun`, for npx compatibility)
- Dev: `bun src/index.ts`
- Release: `bun run build && bun publish`
- `publishConfig: { access: "public" }`
- Dependencies: `commander`, `chalk`
- Dev deps: `@biomejs/biome`, `@types/bun`

**Config pattern:** JSON file at `~/.oapi/config.json` with `0o600` permissions, env var overrides. Note: `0o600` protects against other users but not other processes running as the same user. For a dev tool this is an acceptable trade-off (same approach as `gh`, `dokcli`, and most CLI tools). If a future version needs stronger isolation, consider OS keychain via `keytar`.

## 6. Proposed Architecture

### 6.1 Config Structure (`~/.oapi/config.json`)

```jsonc
{
  "apis": {
    "swarm": {
      "source": "remote",
      "url": "https://api.business-use.desplega.agent-swarm.dev/openapi.json",
      // local: "source": "local", "path": "/abs/path/to/openapi.json"
      "baseUrl": "https://api.business-use.desplega.agent-swarm.dev",
      "lastRefreshed": "2026-03-25T10:00:00Z"
    }
  },
  "profiles": {
    "swarm-prod": {
      "type": "header",        // "header" | "bearer" | "basic" | "query"
      "headerName": "X-Api-Key",
      "value": "sk-..."
    },
    "swarm-dev": {
      "type": "bearer",
      "value": "eyJ..."
    }
  },
  "defaults": {
    // optional: default profile per API
    "swarm": "swarm-prod"
  }
}
```

**Design decisions:**
- Specs are **cached locally** at `~/.oapi/specs/<name>.json` for offline use and fast startup
- `source` + `url`/`path` stored for `refresh` command
- `baseUrl` auto-derived from spec's `servers[0].url` but overridable
- Profiles are standalone (not nested under APIs) so one profile can be used across multiple APIs
- `defaults` maps API names to default profiles

### 6.2 Cached Specs

```
~/.oapi/
├── config.json
└── specs/
    ├── swarm.json      # cached OpenAPI spec
    └── dokploy.json    # another cached spec
```

Specs are fetched/copied on `register` and `refresh`, then parsed from the local cache on every `x` invocation. This keeps startup fast.

### 6.3 Command Structure

```
oapi register --name <name> --local <file>
oapi register --name <name> --remote <url> [--base-url <url>]
oapi unregister <name>
oapi list
oapi refresh <name>
oapi refresh --all
oapi profile add --name <name> --type <header|bearer|basic|query> [--header-name <name>] --value <value>
oapi profile list
oapi profile rm <name>
oapi x <api-name> <path> [method] [options]
oapi x <api-name> --help
```

### 6.4 The `x` (execute) Command

This is the core. Inspired by `vercel api` and `gh api`:

```bash
# Basic GET
oapi x swarm /v1/nodes
# → GET https://api.business-use.desplega.agent-swarm.dev/v1/nodes

# Explicit method (supports GET/POST/PUT/PATCH/DELETE)
oapi x swarm /v1/nodes POST -F flow=main -F id=node1 -F type=trigger

# Path params (auto-substituted)
oapi x swarm /v1/nodes/{node_id} DELETE --node-id abc123
# Or positional: oapi x swarm /v1/nodes/abc123 DELETE

# Body from file (use - for stdin)
oapi x swarm /v1/events-batch POST --input events.json
cat events.json | oapi x swarm /v1/events-batch POST --input -

# Ad-hoc header (Phase 1 — before profiles exist)
oapi x swarm /v1/nodes -H "X-Api-Key:sk-..."

# With profile auth (Phase 3)
oapi x swarm /v1/nodes --profile swarm-prod

# jq filtering
oapi x swarm /v1/events --jq '.[].type'

# Skip validation
oapi x swarm /v1/nodes POST --no-validate -F custom=anything

# Dry run (show curl)
oapi x swarm /v1/nodes --dry-run

# Verbose (show request + response headers)
oapi x swarm /v1/nodes --verbose
```

**Method resolution:** When no method is specified, auto-detect:
1. If the path has only one method defined in the spec, use it.
2. If body params (`-F`/`--input`) are provided, default to POST.
3. Otherwise, default to GET.
4. If ambiguous, error with the available methods for that path.

### 6.5 Input Validation

For each endpoint, the CLI should:
1. **Resolve the path** — match against spec paths, extract path params
2. **Validate method** — check the method is defined for that path
3. **Validate required params** — check all required query/path/body params are present
4. **Type-check values** — validate against schema types (string, integer, enum, etc.)
5. **Validate body** — if request body is required, ensure it's provided via `-F` flags or `--input`

**Bypass:** `--no-validate` skips steps 3-5, allowing arbitrary requests.

**Validation library:** Use `ajv` (JSON Schema validator) since OpenAPI 3.1 uses JSON Schema 2020-12. Lightweight, fast, well-maintained. **Important:** Must use `import Ajv2020 from "ajv/dist/2020"` (not the default export) to get full draft-2020-12 support.

### 6.6 Output

- **Always JSON** — `stdout` is valid JSON, `stderr` for errors/warnings
- **Pretty-printed by default** — use `chalk` for colored JSON
- **`--raw`** — compact JSON (single line, no color) for piping
- **`--jq <expr>`** — filter output (use a lightweight jq implementation like `node-jq` or shell out to `jq` if installed)
- **Exit code** — 0 for 2xx, 1 for 4xx/5xx, 2 for CLI errors

### 6.7 `--help` Auto-Generation

`oapi x <name> --help` should print:

```
API: swarm (https://api.business-use.desplega.agent-swarm.dev)
Spec: OpenAPI 3.1.0 | 12 endpoints | Last refreshed: 2026-03-25

Endpoints:
  GET    /health                    Health Check
  GET    /v1/status                 Get Status
  GET    /v1/nodes                  List Nodes
  POST   /v1/nodes                  Create Node
  PUT    /v1/nodes/{node_id}        Update Node
  DELETE /v1/nodes/{node_id}        Delete Node
  GET    /v1/events                 List Events
  POST   /v1/events-batch           Batch Create Events
  POST   /v1/run-eval               Run Eval
  POST   /v1/reeval-running-flows   Re-eval Running Flows
  GET    /v1/eval-outputs           List Eval Outputs
  POST   /v1/nodes/scan             Scan Upload

Use: oapi x swarm <path> [method] [options]
```

And `oapi x <name> <path> --help` should print endpoint-specific details:

```
POST /v1/nodes — Create Node

Parameters:
  --flow        string (required)   Flow identifier
  --id          string (required)   Node ID
  --type        enum   (required)   generic | trigger | hook
  --description string              Node description
  --dep-ids     array               Dependency node IDs
  ...

Auth: X-Api-Key header (use --profile <name>)
```

## 7. Dependency Choices

| Dependency | Purpose | Why |
|-----------|---------|-----|
| `commander` | CLI framework | Proven in monorepo, dynamic subcommands |
| `chalk` | Terminal colors | Standard, already used everywhere |
| `@scalar/openapi-parser` | Parse/dereference/validate OpenAPI specs | Handles 3.1, TypeScript-native, active (now lives in scalar/scalar monorepo) |
| `ajv` + `ajv-formats` | JSON Schema validation | Industry standard, handles 2020-12 |

**Considered and rejected:**
- `node-jq` — too heavy (bundles jq binary). Instead: shell out to `jq` if available, or use a lightweight JS jq subset like `jmespath` or `jsonata`.
- `keytar` — OS keychain for secrets. Overkill for v1; plaintext config with `0o600` is fine for dev tools.
- `inquirer`/`prompts` — interactive prompts. Not needed for v1; the tool should be fully scriptable.

## 8. Implementation Approach

### Phase 1: Core (MVP)
1. Project scaffold (following brain/wts pattern)
2. Config management (`~/.oapi/config.json` + `~/.oapi/specs/`)
3. `register` command (local + remote) + `unregister`
4. `list` command
5. `refresh` command
6. `x` command — basic request execution (no validation), with `-H key:value` for ad-hoc headers (needed to authenticate before profiles exist)
7. JSON output (pretty + raw)

### Phase 2: Validation & UX
1. Input validation against schema (with `--no-validate` bypass)
2. Auto-generated `--help` per API and per endpoint
3. `-F`/`-f` param syntax
4. Path param substitution (including mid-path params like `/v1/nodes/{node_id}/actions`)
5. `--input` for body from file/stdin
6. `--dry-run` (curl output)

### Phase 3: Auth & Polish
1. Profile management (add/list/rm)
2. Auto-attach auth from profiles (replaces manual `-H` for auth)
3. `--jq` filtering (shell out to jq, fallback to built-in)
4. `--verbose` mode
5. Error messages with schema hints
6. npm publish + README

### Future (if needed)
- Pagination support
- Response caching (`--cache`)
- Interactive endpoint search (fzf-style)
- Tab completion generation
- OpenAPI spec diffing on refresh

## 9. Open Questions

1. **jq approach:** Shell out to system `jq` (requires user to have it installed) vs bundle a JS jq implementation? Recommendation: shell out with graceful fallback message.
2. **Spec storage:** Store the full spec or a pre-processed/indexed version? Full spec is simpler; pre-processed would be faster for large specs. For v1, full spec is fine (the test spec is only 33KB).
3. **Path matching:** Exact match only, or fuzzy? e.g., should `oapi x swarm /nodes` match `/v1/nodes`? Recommendation: exact match only for v1, with clear error suggesting the correct path.
4. **Body building from `-F` flags:** For nested objects and arrays, support `key.subkey=value` and `key[]=value` (gh-style) or require `--input` for complex bodies? Recommendation: support dot notation for v1, arrays via `--input`.

## 9.1 Edge Cases to Address

1. **Content-type negotiation:** Some endpoints accept `multipart/form-data` or `application/x-www-form-urlencoded`, not just `application/json`. The `x` command should default to `application/json` but allow `--content-type` override, and eventually auto-detect from spec.
2. **Inline array bodies:** The test spec has `POST /v1/events-batch` taking `Array<EventBatchItem>` as the body (not wrapped in an object). `-F` flags won't work here — must use `--input`. The help output should make this clear when an endpoint expects a non-object body.
3. **Enum validation:** When spec defines enum values, validation should check against them. The `--help` per-endpoint output should list valid enum values.
4. **`additionalProperties: true`:** Fields with this allow arbitrary keys. Validation must not reject unknown keys for these schemas.
5. **Empty response schemas (`schema: {}`):** The test spec has empty response schemas for all 200 responses. The output formatter must handle this gracefully — print whatever JSON comes back without trying to validate it.
6. **Multiple servers in spec:** Some specs define multiple `servers[]` entries (e.g., prod vs staging). `baseUrl` auto-derives from `servers[0].url` but `register --base-url` should allow override. Consider a `--server-index` option for multi-server specs.
7. **Path params in the middle of paths:** e.g., `/v1/nodes/{node_id}/actions` — must correctly extract and substitute all path params, not just trailing ones.

## 10. Prior Art in This Repo

**dokcli** (`/Users/taras/Documents/code/ai-toolbox/dokcli/`) is the most relevant prior art:
- Already generates a CLI from an OpenAPI spec
- Uses `@apidevtools/swagger-parser` (doesn't support 3.1)
- Uses Commander.js
- Has config at `~/.dokcli/config.json`
- Is Dokploy-specific (not general-purpose)

The key difference: dokcli is a **static** generator (generates commands at build/dev time from a specific spec), while oapi is a **dynamic** runtime tool that works with any spec registered by the user.

**Patterns to reuse from dokcli:**
- Config module pattern (`config/index.ts`): `loadConfig()`, `saveConfig()`, `ensureAuth()` with env var overrides — clean and proven
- Spec caching with stale-age warnings (`spec/index.ts`): cache → fallback → error cascade
- `coerceValue()` approach for type conversion from CLI string args
- Output module separating `formatOutput` / `formatError` with JSON modes
- `0o600`/`0o700` permission pattern for config dir and files

**Patterns to avoid from dokcli:**
- Parser only handles GET and POST (`for (const method of ["get", "post"]`) — oapi must handle all HTTP methods
- Dokploy-specific path pattern matching (`/{tag}.{operation}`) — oapi needs generic path-based grouping
- `--target bun` in build script — oapi should use `--target node` for broader npx/bunx compatibility
- Bundled fallback spec — not applicable for a general-purpose tool
- No input validation against schema — body params are passed through without checking required fields or types
