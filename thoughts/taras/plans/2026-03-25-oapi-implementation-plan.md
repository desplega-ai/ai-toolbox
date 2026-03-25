---
title: "oapi — Implementation Plan"
date: 2026-03-25
status: completed
type: plan
research: thoughts/taras/research/2026-03-25-oapi-dynamic-cli-from-openapi.md
autonomy: autopilot
---

# oapi — Implementation Plan

Dynamic CLI generator from OpenAPI specs. Based on [research](../research/2026-03-25-oapi-dynamic-cli-from-openapi.md).

## Architecture Overview

```
oapi/
├── src/
│   ├── index.ts              # Entry point, Commander setup
│   ├── commands/
│   │   ├── register.ts       # Register local/remote OpenAPI specs
│   │   ├── unregister.ts     # Remove registered APIs
│   │   ├── list.ts           # List registered APIs
│   │   ├── refresh.ts        # Refresh cached specs
│   │   ├── profile.ts        # Auth profile management (Phase 3)
│   │   └── execute.ts        # The `x` command — core execution
│   ├── config/
│   │   ├── index.ts          # loadConfig, saveConfig, ensureConfigDir
│   │   └── types.ts          # OapiConfig, ApiEntry, Profile interfaces
│   ├── spec/
│   │   ├── loader.ts         # Fetch remote / read local spec, cache
│   │   ├── parser.ts         # Parse OpenAPI → EndpointDef[], resolve $refs
│   │   └── helpers.ts        # anyOf nullable collapse, type mapping
│   ├── http/
│   │   └── client.ts         # Execute HTTP requests, handle responses
│   ├── validation/
│   │   └── index.ts          # ajv-based input validation (Phase 2)
│   └── output/
│       └── index.ts          # JSON formatting (pretty, raw, jq)
├── test/
│   ├── config.test.ts
│   ├── parser.test.ts
│   ├── execute.test.ts
│   └── helpers.test.ts
├── package.json
├── tsconfig.json
├── biome.json
├── .gitignore
└── README.md
```

## File/Config Layout on Disk

```
~/.oapi/
├── config.json               # APIs, profiles, defaults
└── specs/
    ├── swarm.json            # Cached full OpenAPI spec
    └── dokploy.json
```

---

## Phase 1: Core MVP

Goal: Register specs, list them, execute raw requests with JSON output.

### Step 1.1 — Project Scaffold

Create `oapi/` directory with all boilerplate files following the brain/wts pattern.

**Files to create:**

1. **`package.json`**
```json
{
  "name": "@desplega.ai/oapi",
  "version": "0.1.0",
  "description": "Dynamic CLI generator from OpenAPI specs",
  "type": "module",
  "bin": { "oapi": "./dist/index.js" },
  "files": ["dist"],
  "scripts": {
    "dev": "bun src/index.ts",
    "build": "bun build src/index.ts --outdir dist --target node --format esm",
    "prepublishOnly": "bun run build",
    "release": "bun run build && bun publish",
    "lint": "biome check src",
    "lint:fix": "biome check --write src",
    "format": "biome format --write src",
    "test": "bun test",
    "tsc": "bun tsc --noEmit"
  },
  "dependencies": {
    "chalk": "^5.4.1",
    "commander": "^12.1.0"
  },
  "devDependencies": {
    "@biomejs/biome": "^2.3.9",
    "@types/bun": "latest"
  },
  "peerDependencies": {
    "typescript": "^5"
  },
  "publishConfig": { "access": "public" },
  "repository": {
    "type": "git",
    "url": "https://github.com/desplega-ai/ai-toolbox.git",
    "directory": "oapi"
  },
  "keywords": ["openapi", "cli", "api", "rest", "swagger"],
  "license": "MIT",
  "author": "Desplega AI"
}
```

Note: `@scalar/openapi-parser` and `ajv` added in Phase 2. Phase 1 does manual JSON parsing of specs (good enough for MVP).

2. **`tsconfig.json`** — Copy from dokcli (ESNext, bundler resolution, `@/*` path alias, strict)

3. **`biome.json`** — Copy from dokcli (2-space indent, 100-char lines, double quotes, vcs root: "..")

4. **`.gitignore`** — `node_modules/`, `dist/`, `.DS_Store`

5. **`src/index.ts`** — Entry point:
```typescript
#!/usr/bin/env node
import { Command } from "commander";
import pkg from "../package.json";
// import commands...

const program = new Command();
program.name("oapi").description(pkg.description).version(pkg.version);
// register commands...
program.parse();
```

**Verification:**
```bash
cd oapi && bun install
bun src/index.ts --version   # → 0.1.0
bun src/index.ts --help      # → shows description + commands
```

### Step 1.2 — Config Module

Create config management at `~/.oapi/`.

**Files:**

1. **`src/config/types.ts`**
```typescript
export interface ApiEntry {
  source: "local" | "remote";
  url?: string;          // remote URL for spec
  path?: string;         // absolute local path
  baseUrl: string;       // API base URL for requests
  lastRefreshed: string; // ISO 8601
}

export interface Profile {
  type: "header" | "bearer" | "basic" | "query";
  headerName?: string;   // for type: "header" (default: "Authorization")
  queryParam?: string;   // for type: "query"
  value: string;
}

export interface OapiConfig {
  apis: Record<string, ApiEntry>;
  profiles: Record<string, Profile>;
  defaults: Record<string, string>; // api name → default profile name
}

export const DEFAULT_CONFIG: OapiConfig = {
  apis: {},
  profiles: {},
  defaults: {},
};
```

2. **`src/config/index.ts`**
- `CONFIG_DIR = ~/.oapi`, `CONFIG_PATH = ~/.oapi/config.json`, `SPECS_DIR = ~/.oapi/specs`
- `ensureConfigDir()` — create dirs with 0o700
- `loadConfig(): OapiConfig` — read file, merge with defaults, handle missing/corrupt
- `saveConfig(config: OapiConfig)` — write with 0o600
- `getApi(name: string): ApiEntry | undefined`
- `getProfile(name: string): Profile | undefined`
- `getDefaultProfile(apiName: string): Profile | undefined`

Pattern: Follow dokcli's `loadConfig`/`saveConfig` but with env var overrides for `OAPI_CONFIG_DIR`.

**Verification:**
```bash
bun src/index.ts --help  # No crash, config dir created lazily
ls ~/.oapi/              # Should not exist yet (lazy creation)
```

### Step 1.3 — Register Command

Register local or remote OpenAPI specs.

**File: `src/commands/register.ts`**

```
oapi register --name <name> --local <file>
oapi register --name <name> --remote <url> [--base-url <url>]
```

Logic:
1. Validate: `--name` required, exactly one of `--local` or `--remote`
2. If `--local`: resolve to absolute path, verify file exists, read & parse JSON
3. If `--remote`: fetch URL, parse JSON response
4. Validate it's a valid OpenAPI spec (check `openapi` field exists, `paths` exists)
5. Auto-derive `baseUrl` from `spec.servers[0].url` if not provided via `--base-url`
   - If no servers defined and remote: derive from the URL (strip `/openapi.json` or similar)
   - If no servers defined and local: require `--base-url` or warn
6. Save spec to `~/.oapi/specs/<name>.json`
7. Save API entry to config
8. Print summary: name, source, baseUrl, endpoint count, OpenAPI version

**Verification:**
```bash
bun src/index.ts register --name swarm --remote https://api.business-use.desplega.agent-swarm.dev/openapi.json
# → "Registered 'swarm' (12 endpoints, OpenAPI 3.1.0)"
# → ~/.oapi/specs/swarm.json exists
# → ~/.oapi/config.json has swarm entry

cat ~/.oapi/config.json | jq '.apis.swarm'
# → { source: "remote", url: "...", baseUrl: "...", lastRefreshed: "..." }
```

### Step 1.4 — List Command

**File: `src/commands/list.ts`**

```
oapi list
```

Logic:
1. Load config
2. If no APIs registered: print "No APIs registered. Use `oapi register` to add one."
3. For each API: print name, source, baseUrl, endpoint count (from cached spec), last refreshed
4. Format as aligned table with chalk

Output example:
```
Name     Source  Base URL                                              Endpoints  Refreshed
swarm    remote  https://api.business-use.desplega.agent-swarm.dev    12         2026-03-25
dokploy  local   https://app.dokploy.com                              106        2026-03-20
```

**Verification:**
```bash
bun src/index.ts list
# → Shows table with swarm entry from Step 1.3
```

### Step 1.5 — Unregister Command

**File: `src/commands/unregister.ts`**

```
oapi unregister <name>
```

Logic:
1. Check API exists in config
2. Remove from `config.apis`
3. Delete cached spec file
4. Remove any default profile mapping
5. Print confirmation

**Verification:**
```bash
bun src/index.ts register --name test --remote https://api.business-use.desplega.agent-swarm.dev/openapi.json
bun src/index.ts unregister test
bun src/index.ts list  # → test not shown
ls ~/.oapi/specs/test.json  # → not found
```

### Step 1.6 — Refresh Command

**File: `src/commands/refresh.ts`**

```
oapi refresh <name>
oapi refresh --all
```

Logic:
1. If `--all`: iterate all APIs, refresh each
2. If `<name>`: find API in config, re-fetch/re-read spec, update cache + timestamp
3. For local: re-read from stored absolute path
4. For remote: re-fetch from stored URL
5. Print summary of what changed (endpoint count diff if any)

**Verification:**
```bash
bun src/index.ts refresh swarm
# → "Refreshed 'swarm' (12 endpoints, OpenAPI 3.1.0)"

bun src/index.ts refresh --all
# → Refreshes all registered APIs
```

### Step 1.7 — Spec Parser (Minimal)

**File: `src/spec/parser.ts`**

Minimal parser for Phase 1 — no `@scalar/openapi-parser` yet, just raw JSON traversal with manual `$ref` resolution.

```typescript
export interface EndpointDef {
  path: string;           // e.g., "/v1/nodes/{node_id}"
  method: string;         // GET, POST, PUT, DELETE, PATCH
  summary: string;        // from operation summary/description
  operationId?: string;
  pathParams: string[];   // extracted from path template
  queryParams: ParamDef[];
  bodySchema?: object;    // raw JSON schema for request body
  hasRequiredBody: boolean;
}

export interface ParamDef {
  name: string;
  type: string;       // string, integer, number, boolean, array
  required: boolean;
  description: string;
  enum?: string[];
}
```

Logic:
1. Load cached spec JSON
2. Inline-resolve `$ref` pointers (simple recursive resolver — specs are typically <100KB)
3. Iterate `spec.paths`, for each path iterate all HTTP methods
4. Extract path params from `{param}` patterns in path string
5. Extract query params from `parameters[]` where `in === "query"`
6. Extract body schema from `requestBody.content.application/json.schema`
7. Return `EndpointDef[]`

**Verification:**
```bash
bun test test/parser.test.ts
# Tests: parse test spec → 12 endpoints, correct methods, correct path params
```

### Step 1.8 — HTTP Client

**File: `src/http/client.ts`**

```typescript
export interface RequestOptions {
  baseUrl: string;
  path: string;
  method: string;
  headers?: Record<string, string>;
  queryParams?: Record<string, string>;
  body?: unknown;
}

export interface ApiResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
  ok: boolean;
}
```

Logic:
1. Build full URL from baseUrl + path
2. Substitute path params in URL
3. Append query params
4. Set `Content-Type: application/json` for body requests
5. Execute with `fetch()`
6. Parse response as JSON (graceful fallback to text if not JSON)
7. Return `ApiResponse`

**Verification:**
```bash
bun test test/client.test.ts
# Test: mock fetch, verify URL construction, header setting, body serialization
```

### Step 1.9 — Output Module

**File: `src/output/index.ts`**

```typescript
export function printJson(data: unknown, options: { raw?: boolean }): void
export function printError(message: string, details?: unknown): void
```

- `printJson`: Pretty-printed colored JSON by default, compact with `--raw`
- `printError`: Writes to stderr with chalk.red, extracts validation details from API errors
- Exit codes: handled by caller (0 for 2xx, 1 for 4xx/5xx, 2 for CLI errors)

**Verification:**
```bash
echo '{"test": true}' | bun src/index.ts  # (later, for piping)
```

### Step 1.10 — Execute Command (`x`)

**File: `src/commands/execute.ts`**

```
oapi x <api-name> <path> [method] [options]
```

Phase 1 implementation (minimal, no validation):

1. Parse args: `<api-name>` and `<path>` are positional. `[method]` is optional positional (detect by checking if 3rd arg is an HTTP method).
2. Load API config + cached spec
3. Find endpoint in spec by path + method match
4. **Method resolution** (when method not specified):
   a. If path has only one method in spec → use it
   b. If `-F`/`--input` provided → POST
   c. Otherwise → GET
   d. If ambiguous → error listing available methods
5. Build request:
   - Base URL from config
   - Path params: substitute `{param}` from `--param-name value` options or from literal path
   - Query params for GET: from remaining options
   - Body for POST/PUT/PATCH: from `-F key=value` pairs or `--input <file>`
   - Headers: from `-H key:value`
6. Execute via HTTP client
7. Output response JSON via output module
8. Exit with appropriate code

**Commander setup for `x`:**

The challenge: `x` is a single command that takes variadic, spec-dependent options. Can't pre-register all options since they vary per API/endpoint.

Approach: Use Commander's `allowUnknownOption()` + `allowExcessArguments(true)` and parse the remaining args manually. Register only the global flags:

```typescript
const executeCmd = new Command("x")
  .description("Execute an API request")
  .argument("<api-name>", "Registered API name")
  .argument("<path>", "API endpoint path")
  .argument("[method]", "HTTP method (GET, POST, PUT, DELETE, PATCH)")
  .option("-F, --field <fields...>", "Typed body/query field (key=value)")
  .option("-f, --raw-field <fields...>", "Raw string field (key=value)")
  .option("-H, --header <headers...>", "Custom header (key:value)")
  .option("--input <file>", "Request body from file (- for stdin)")
  .option("--raw", "Output compact JSON")
  .option("--no-validate", "Skip input validation")
  .option("--dry-run", "Show curl command instead of executing")
  .option("--verbose", "Show request/response headers")
  .option("--jq <expr>", "Filter output with jq")
  .option("--profile <name>", "Auth profile to use")
  .passThroughOptions()
  .action(async (apiName, path, method, options) => { ... });
```

**Verification:**
```bash
# Register test API first
bun src/index.ts register --name swarm --remote https://api.business-use.desplega.agent-swarm.dev/openapi.json

# GET request
bun src/index.ts x swarm /health
# → { "status": "ok" } (or whatever the API returns)

# GET with query params
bun src/index.ts x swarm /v1/events -F limit=5

# POST with body
bun src/index.ts x swarm /v1/nodes POST -F flow=test -F id=node1 -F type=trigger

# With ad-hoc auth header
bun src/index.ts x swarm /v1/nodes -H "X-Api-Key:test-key-123"

# Raw output (compact JSON, pipeable to jq)
bun src/index.ts x swarm /v1/nodes --raw | jq '.'

# Method auto-detection (GET when no body)
bun src/index.ts x swarm /v1/nodes
# → GET (since /v1/nodes has both GET and POST, and no body provided → defaults to GET)
```

### Step 1.11 — Wire Everything Together

Update `src/index.ts` to register all commands:

```typescript
program.addCommand(registerCommand);
program.addCommand(unregisterCommand);
program.addCommand(listCommand);
program.addCommand(refreshCommand);
program.addCommand(executeCommand);
```

**Verification (E2E):**
```bash
# Full flow
bun src/index.ts register --name swarm --remote https://api.business-use.desplega.agent-swarm.dev/openapi.json
bun src/index.ts list
bun src/index.ts x swarm /health
bun src/index.ts x swarm /v1/status
bun src/index.ts x swarm /v1/nodes -H "X-Api-Key:$SWARM_API_KEY"
bun src/index.ts x swarm /v1/nodes --raw | jq '.[] | .id'
bun src/index.ts refresh swarm
bun src/index.ts unregister swarm
bun src/index.ts list  # → empty
```

---

## Phase 1 Manual Review Point

Pause here for Taras to test the MVP flow end-to-end with the swarm API. Confirm:
- [ ] Register works (local + remote)
- [ ] List shows correct info
- [ ] `x` executes requests and returns JSON
- [ ] `-H` works for auth
- [ ] `-F` works for body params
- [ ] `--raw` output is jq-compatible
- [ ] Error messages are clear
- [ ] Unregister/refresh work

---

## Phase 2: Validation & UX

Goal: Schema-based input validation, auto-help, `-F`/`-f` param typing, dry-run.

### Step 2.1 — Add Dependencies

```bash
cd oapi
bun add @scalar/openapi-parser ajv ajv-formats
```

Update `src/spec/parser.ts` to use `@scalar/openapi-parser` for proper `$ref` resolution and validation instead of the manual resolver from Phase 1.

**Verification:**
```bash
bun src/index.ts x swarm /health  # Still works after parser swap
bun test  # All existing tests pass
```

### Step 2.2 — Schema Helpers

**File: `src/spec/helpers.ts`**

Utilities for working with OpenAPI 3.1 schemas:

1. `collapseNullable(schema)` — Convert `anyOf: [{type: "X"}, {type: "null"}]` → `{type: "X", nullable: true}`
2. `getSchemaType(schema)` — Return human-readable type string (e.g., "string", "integer", "enum(a|b|c)")
3. `isRequired(name, schema)` — Check if field is in `required` array
4. `extractEnumValues(schema)` — Return enum values if present
5. `flattenProperties(schema)` — Flatten nested `allOf`/`oneOf` into a flat property map

**Verification:**
```bash
bun test test/helpers.test.ts
# Test: anyOf nullable collapse, enum extraction, type mapping
```

### Step 2.3 — Input Validation

**File: `src/validation/index.ts`**

```typescript
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";

export function validateInput(schema: object, data: unknown): { valid: boolean; errors: string[] }
```

Logic:
1. Create ajv instance with JSON Schema 2020-12 support
2. Compile endpoint's request body schema
3. Validate provided data against it
4. Return human-readable error messages
5. Skip if `--no-validate` flag is set

Integration with `x` command:
- After building body from `-F` flags, validate before sending
- On validation failure: print errors to stderr, suggest `--no-validate` to bypass, exit 2
- On validation success: proceed with request

**Verification:**
```bash
# Missing required field
bun src/index.ts x swarm /v1/nodes POST -F flow=test
# → Error: Missing required field: id, type. Use --no-validate to bypass.

# Invalid enum value
bun src/index.ts x swarm /v1/nodes POST -F flow=test -F id=n1 -F type=invalid
# → Error: 'type' must be one of: generic, trigger, hook

# Bypass
bun src/index.ts x swarm /v1/nodes POST -F flow=test --no-validate
# → Sends request as-is
```

### Step 2.4 — Auto-Generated Help

Enhance the `x` command to support:

```
oapi x <api-name> --help          # List all endpoints
oapi x <api-name> <path> --help   # Show endpoint details
oapi x <api-name> <path> <method> --help  # Show method-specific details
```

**API-level help** (from research Section 6.7):
```
API: swarm (https://api.business-use.desplega.agent-swarm.dev)
Spec: OpenAPI 3.1.0 | 12 endpoints | Last refreshed: 2026-03-25

Endpoints:
  GET    /health                    Health Check
  GET    /v1/status                 Get Status
  GET    /v1/nodes                  List Nodes
  POST   /v1/nodes                  Create Node
  ...
```

**Endpoint-level help:**
```
POST /v1/nodes — Create Node

Body parameters:
  --flow        string (required)   Flow identifier
  --id          string (required)   Node ID
  --type        enum   (required)   generic | trigger | hook
  --description string              Node description
  --dep-ids     array               Dependency node IDs (use --input for arrays)

Query parameters:
  --header-name string (default: "X-Api-Key")

Use: oapi x swarm /v1/nodes POST -F flow=main -F id=node1 -F type=trigger
```

**Verification:**
```bash
bun src/index.ts x swarm --help
# → Shows all 12 endpoints with methods and summaries

bun src/index.ts x swarm /v1/nodes POST --help
# → Shows params for POST /v1/nodes
```

### Step 2.5 — Typed Field Parsing (`-F` / `-f`)

Enhance `-F` and `-f` handling:

**`-F key=value` (typed):**
- Numbers: `"123"` → `123`, `"3.14"` → `3.14`
- Booleans: `"true"` → `true`, `"false"` → `false`
- Null: `"null"` → `null`
- JSON: values starting with `{` or `[` are parsed as JSON
- File: `@file.json` reads file content as value
- Everything else: kept as string

**`-f key=value` (raw):**
- Always string, no type conversion

**Dot notation for nested objects:**
- `handler.type=http_request` → `{ handler: { type: "http_request" } }`
- Follows the `key.subkey.subsubkey=value` pattern

**Verification:**
```bash
# Typed: number
bun src/index.ts x swarm /v1/events -F limit=5
# → limit sent as integer 5

# Typed: JSON
bun src/index.ts x swarm /v1/nodes POST -F 'dep_ids=["a","b"]'
# → dep_ids sent as array

# Raw: always string
bun src/index.ts x swarm /v1/nodes POST -f type=trigger
# → type sent as string "trigger"

# File content
bun src/index.ts x swarm /v1/events-batch POST -F 'data=@payload.json'
# → data field contains parsed JSON from file
```

### Step 2.6 — Path Param Substitution

Handle `{param}` in paths:

```bash
# Template form (matched against spec)
bun src/index.ts x swarm /v1/nodes/{node_id} PUT -F node_id=abc123
# → PUT /v1/nodes/abc123

# Direct form (literal path)
bun src/index.ts x swarm /v1/nodes/abc123 DELETE
# → DELETE /v1/nodes/abc123 (matched against spec pattern /v1/nodes/{node_id})
```

Logic for matching literal paths against spec templates:
1. Try exact match first
2. If no match, try pattern matching: split both paths by `/`, compare segment by segment, allow `{...}` to match any segment
3. Extract param values from matched segments

**Verification:**
```bash
bun src/index.ts x swarm /v1/nodes/{node_id} DELETE -F node_id=test123
# → DELETE https://.../v1/nodes/test123

bun src/index.ts x swarm /v1/nodes/test123 DELETE
# → Same result (pattern matched)
```

### Step 2.7 — Body from File/Stdin (`--input`)

```bash
# From file
bun src/index.ts x swarm /v1/events-batch POST --input events.json

# From stdin
cat events.json | bun src/index.ts x swarm /v1/events-batch POST --input -

# Stdin with pipe
echo '{"flow":"test","id":"n1","type":"trigger"}' | bun src/index.ts x swarm /v1/nodes POST --input -
```

Logic:
1. If `--input -`: read all of stdin, parse as JSON
2. If `--input <file>`: read file, parse as JSON
3. If both `--input` and `-F` provided: error (mutually exclusive)
4. Validate body against schema (unless `--no-validate`)

**Verification:**
```bash
echo '{"flow":"test","id":"n1","type":"trigger"}' | bun src/index.ts x swarm /v1/nodes POST --input -
# → Creates node

echo '[{"flow":"test","id":"e1","run_id":"r1","type":"generic","data":{},"ts":"2026-03-25T00:00:00Z"}]' | bun src/index.ts x swarm /v1/events-batch POST --input -
# → Batch creates events (inline array body)
```

### Step 2.8 — Dry Run (`--dry-run`)

```bash
bun src/index.ts x swarm /v1/nodes POST -F flow=test -F id=n1 -F type=trigger --dry-run
```

Output:
```bash
curl -X POST 'https://api.business-use.desplega.agent-swarm.dev/v1/nodes' \
  -H 'Content-Type: application/json' \
  -d '{"flow":"test","id":"n1","type":"trigger"}'
```

Does not execute the request. Useful for debugging and sharing.

**Verification:**
```bash
bun src/index.ts x swarm /v1/nodes --dry-run
# → Shows curl GET command

bun src/index.ts x swarm /v1/nodes POST -F flow=test -F id=n1 -F type=trigger -H "X-Api-Key:sk-123" --dry-run
# → Shows curl POST with headers and body
```

---

## Phase 2 Manual Review Point

Pause here for Taras to test validation + UX features:
- [ ] Validation catches missing required fields
- [ ] Validation catches invalid enum values
- [ ] `--no-validate` bypasses validation
- [ ] `--help` shows endpoints and params
- [ ] `-F` types correctly (numbers, booleans, JSON)
- [ ] `-f` keeps everything as string
- [ ] Path params work (template + literal)
- [ ] `--input` works (file + stdin)
- [ ] `--dry-run` shows correct curl

---

## Phase 3: Auth & Polish

Goal: Profile-based auth, jq filtering, verbose mode, publish.

### Step 3.1 — Profile Management

**File: `src/commands/profile.ts`**

```
oapi profile add --name <name> --type <header|bearer|basic|query> [--header-name <name>] --value <value>
oapi profile list
oapi profile rm <name>
oapi profile set-default <api-name> <profile-name>
```

**`profile add`:**
1. Validate type is one of header/bearer/basic/query
2. For `header`: require `--header-name` (default: "Authorization")
3. For `query`: require `--query-param` (e.g., "api_key")
4. Store in config.profiles
5. Mask value in output (`sk-1***`)

**`profile list`:**
```
Name        Type     Header/Param    API Default
swarm-prod  header   X-Api-Key       swarm
swarm-dev   bearer   Authorization   —
```

**`profile rm`:** Remove from config, clear any default mappings.

**`profile set-default`:** Map API name → profile name in `config.defaults`.

**Verification:**
```bash
bun src/index.ts profile add --name swarm-prod --type header --header-name X-Api-Key --value sk-test123
bun src/index.ts profile list
# → Shows swarm-prod with masked value

bun src/index.ts profile set-default swarm swarm-prod
bun src/index.ts x swarm /v1/nodes
# → Automatically includes X-Api-Key header
```

### Step 3.2 — Auth Integration in Execute

Update `x` command to auto-attach auth:

1. If `--profile <name>` specified: use that profile
2. Else if API has a default profile: use it
3. Else: no auth (use `-H` for manual)

**Auth application by type:**
- `header`: Set `headerName: value` header
- `bearer`: Set `Authorization: Bearer <value>` header
- `basic`: Set `Authorization: Basic <base64(value)>` header
- `query`: Append `queryParam=value` to URL

**Verification:**
```bash
# With explicit profile
bun src/index.ts x swarm /v1/nodes --profile swarm-prod
# → Request includes X-Api-Key header

# With default profile (set in 3.1)
bun src/index.ts x swarm /v1/nodes
# → Same, auto-attached

# Override with -H (manual takes precedence)
bun src/index.ts x swarm /v1/nodes -H "X-Api-Key:different-key"
# → Uses the manually provided key
```

### Step 3.3 — jq Filtering (`--jq`)

```bash
bun src/index.ts x swarm /v1/events --jq '.[].type'
```

Implementation:
1. Check if system `jq` is available (`which jq`)
2. If available: pipe JSON through `jq <expr>` via child process
3. If not available: print error suggesting `brew install jq` or similar
4. `--jq` implies `--raw` (compact output for clean piping)

**Verification:**
```bash
bun src/index.ts x swarm /v1/nodes --jq '.[].id'
# → Prints node IDs, one per line

bun src/index.ts x swarm /v1/nodes --jq 'length'
# → Prints count
```

### Step 3.4 — Verbose Mode

```bash
bun src/index.ts x swarm /v1/nodes --verbose
```

Output to stderr:
```
> GET /v1/nodes HTTP/1.1
> Host: api.business-use.desplega.agent-swarm.dev
> X-Api-Key: sk-1***
> Accept: application/json

< HTTP/1.1 200 OK
< Content-Type: application/json
< X-Request-Id: abc123
```

Then response body to stdout (normal JSON output).

**Verification:**
```bash
bun src/index.ts x swarm /v1/nodes --verbose 2>/dev/null | jq '.'
# → JSON only on stdout (headers went to stderr)
```

### Step 3.5 — Error Messages with Schema Hints

When a request fails with 4xx, enhance error output:

```bash
bun src/index.ts x swarm /v1/nodes POST -F flow=test
```

```
Error 422: Validation Error

Details:
  - field 'id' is required (type: string)
  - field 'type' is required (enum: generic | trigger | hook)

Hint: Use 'oapi x swarm /v1/nodes POST --help' to see all parameters.
```

**Verification:**
```bash
bun src/index.ts x swarm /v1/nonexistent
# → Error: Path '/v1/nonexistent' not found in 'swarm' spec.
#   Did you mean: /v1/nodes, /v1/events?

bun src/index.ts x swarm /v1/nodes PATCH
# → Error: Method PATCH not available for /v1/nodes.
#   Available: GET, POST
```

### Step 3.6 — Build, Test, Publish

1. Run full test suite
2. Build: `bun run build`
3. Test built artifact: `node dist/index.js --version`
4. Test via npx: `npx . register --name swarm --remote ...`
5. Write README.md
6. Publish: `bun run release`

**Verification:**
```bash
cd oapi
bun test                          # All tests pass
bun run build                     # Builds to dist/
node dist/index.js --version      # → 0.1.0
node dist/index.js --help         # → Shows all commands
bun run tsc                       # No type errors
bun run lint                      # No lint errors
```

---

## Phase 3 Manual Review Point + Final E2E

Full end-to-end test with the swarm API:

```bash
# Install globally
cd oapi && bun link

# Register
oapi register --name swarm --remote https://api.business-use.desplega.agent-swarm.dev/openapi.json

# Add auth profile
oapi profile add --name swarm-key --type header --header-name X-Api-Key --value "$SWARM_API_KEY"
oapi profile set-default swarm swarm-key

# List
oapi list

# Explore endpoints
oapi x swarm --help

# Execute
oapi x swarm /health
oapi x swarm /v1/status
oapi x swarm /v1/nodes
oapi x swarm /v1/nodes --jq 'length'
oapi x swarm /v1/nodes POST -F flow=test -F id=test-node -F type=trigger
oapi x swarm /v1/nodes/test-node DELETE

# Verbose + dry-run
oapi x swarm /v1/nodes --verbose
oapi x swarm /v1/nodes POST -F flow=x -F id=y -F type=trigger --dry-run

# Input from file
echo '[{"flow":"test","id":"e1","run_id":"r1","type":"generic","data":{},"ts":"2026-03-25T00:00:00Z"}]' > /tmp/events.json
oapi x swarm /v1/events-batch POST --input /tmp/events.json

# Refresh
oapi refresh swarm

# Cleanup
oapi unregister swarm
oapi profile rm swarm-key
```

---

## Dependency Summary

| Phase | Package | Purpose |
|-------|---------|---------|
| 1 | `commander` | CLI framework |
| 1 | `chalk` | Terminal colors |
| 2 | `@scalar/openapi-parser` | OpenAPI spec parsing + $ref resolution |
| 2 | `ajv` + `ajv-formats` | JSON Schema validation |
| Dev | `@biomejs/biome` | Linting + formatting |
| Dev | `@types/bun` | Type definitions |

## Key Design Decisions

1. **`--target node` not `--target bun`** — ensures `npx` compatibility across environments
2. **No interactive prompts** — fully scriptable, no `inquirer` dependency
3. **`x` as the execute verb** — short, memorable, avoids conflict with other commands
4. **Profiles decoupled from APIs** — one profile can be reused across multiple APIs
5. **Spec cached locally** — fast startup, offline-capable after first register
6. **`-F`/`-f` distinction** — matches `vercel api` and `gh api` conventions
7. **`--no-validate` bypass** — always available for edge cases
8. **JSON-only output** — keeps it simple, jq-compatible, no YAML/table formats for now
9. **Phase 1 has `-H` for auth** — usable before profiles exist in Phase 3
10. **Manual `$ref` resolution in Phase 1** — avoids adding heavy dependency before we know the parser works for our use case; swap to `@scalar/openapi-parser` in Phase 2
