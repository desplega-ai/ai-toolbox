---
date: 2026-03-25T12:00:00Z
topic: "OpenAPI CLI Tooling Landscape"
type: research
---

# OpenAPI CLI Tooling Landscape Research

**Date:** 2026-03-25
**Context:** Evaluating tools, libraries, and patterns for building CLIs from OpenAPI specs. Focus on npm ecosystem, Bun compatibility, dynamic (runtime) vs static (codegen) approaches, and auth patterns.

---

## 1. CLI Generators from OpenAPI Specs

### Code-Generation Approach (Static)

| Package | Language | Stars | Downloads | Notes |
|---------|----------|-------|-----------|-------|
| [OpenAPI Generator](https://github.com/OpenAPITools/openapi-generator) | Java (npm wrapper) | 22k+ | ~600k/wk | The gorilla. Generates client SDKs, server stubs, docs. 60+ language targets. Requires JDK 11+. The npm package `@openapitools/openapi-generator-cli` is just a wrapper that downloads and invokes a JAR. Not suitable for lightweight TS/Bun tooling. |
| [openapi-cli-generator](https://github.com/danielgtaylor/openapi-cli-generator) | Go | ~200 | N/A | Generates Go CLIs from OpenAPI 3 specs. Auth support (API keys, Auth0), Cobra-based. Interesting prior art but Go-only. |
| [hey-api/openapi-ts](https://github.com/hey-api/openapi-ts) | TypeScript | 2k+ | Growing | Codegen for TypeScript SDKs, Zod schemas, TanStack Query hooks. Used by Vercel, PayPal. Not a CLI generator per se, but generates typed clients. |
| [openapi-typescript](https://github.com/openapi-ts/openapi-typescript) | TypeScript | 6k+ | High | Generates TS types from OpenAPI schemas. Companion `openapi-fetch` (6kb) provides type-safe fetch client. Good for typed API clients, not CLI generation. |

### Runtime/Dynamic Approach (No Codegen)

| Package | Language | Stars | Downloads | Notes |
|---------|----------|-------|-----------|-------|
| **[openapi-to-cli](https://github.com/EvilFreelancer/openapi-to-cli)** (ocli) | **TypeScript** | Small/new | Low | **Most relevant prior art.** Runtime CLI from OpenAPI/Swagger. BM25 search over commands. Supports auth profiles with base URLs, tokens, headers. `npm install -g openapi-to-cli`. Multi-API profile support. |
| [mcp2cli](https://github.com/knowsuchagency/mcp2cli) | Python | New | N/A | Converts MCP servers, OpenAPI specs, or GraphQL into CLI at runtime. Zero codegen. OAuth support built-in. Python-only, not relevant for Bun. Interesting for the "one CLI for all APIs" concept. |
| **dokcli** (this repo) | **TypeScript/Bun** | N/A | N/A | Our own. Parses Dokploy OpenAPI spec at runtime using `@apidevtools/swagger-parser` + Commander.js. Registers commands dynamically. Flat RPC-style paths (`/api/{tag}.{operation}`) -> `dokcli <tag> <operation>`. |

**Key takeaway:** The runtime/dynamic approach is relatively niche. `openapi-to-cli` is the closest open-source equivalent to what dokcli does, but it's newer and less mature. dokcli's approach (parse spec -> register Commander subcommands) is actually quite clean.

---

## 2. OpenAPI Parsing Libraries (TypeScript/JavaScript)

| Package | Stars | Downloads/wk | OpenAPI Versions | Notes |
|---------|-------|-------------|-----------------|-------|
| **[@apidevtools/swagger-parser](https://github.com/APIDevTools/swagger-parser)** | ~1.1k | ~900k | Swagger 2.0, OpenAPI 3.0 | **Currently used by dokcli.** Mature, stable. Validates, dereferences `$ref`s. No OpenAPI 3.1 support. Somewhat dormant maintenance. |
| **[@scalar/openapi-parser](https://github.com/scalar/openapi-parser)** | Part of scalar (36k+) | ~36k | **OpenAPI 3.2, 3.1, 3.0, Swagger 2.0** | Modern successor to swagger-parser. Written in TypeScript, runs in Node and browsers. Best error messages. Actively maintained. No polyfills needed. |
| [@readme/openapi-parser](https://github.com/readmeio/openapi-parser) | - | Growing | Swagger 2.0, OpenAPI 3.0, 3.1 | Hard fork of @apidevtools/swagger-parser with better validation errors and error leveling. |
| [openapi-types](https://www.npmjs.com/package/openapi-types) | - | High | All | Just TypeScript type definitions for OpenAPI objects. Already used by dokcli as a devDependency. |

**Recommendation:** If upgrading, `@scalar/openapi-parser` is the best modern choice -- supports 3.1/3.2, pure TypeScript, great errors. For dokcli's current needs, `@apidevtools/swagger-parser` works fine since Dokploy likely uses 3.0.

---

## 3. CLI Frameworks for Bun

| Package | Stars | Downloads/wk | Bun Support | Notes |
|---------|-------|-------------|-------------|-------|
| **[Commander.js](https://github.com/tj/commander.js)** | **28k** | **329M** | Works | **Currently used by dokcli.** The industry standard. Huge ecosystem, excellent docs. Works fine with Bun. Subcommands, options, help generation. Slightly imperative API. |
| **[yargs](https://github.com/yargs/yargs)** | 11.5k | 114M | Works | Second most popular. More declarative config. `yargs-parser` works standalone with Bun. More verbose than Commander. |
| **[citty](https://github.com/unjs/citty)** | ~1k | 16.6M (transitive) | **Designed for it** | UnJS ecosystem (Nuxt/Nitro). ESM-only, TypeScript-first, tiny. Uses `node:util.parseArgs` internally. Subcommands, typed args, lifecycle hooks. Very clean API. High downloads are mostly transitive via UnJS tools. |
| **[clerc](https://github.com/clercjs/clerc)** | Small | Low | **Explicit Bun support** | Designed for Node, Deno, and Bun. ESM-only, plugin system, chainable API. Strongly typed. Less adoption than alternatives. |
| **[bunli](https://github.com/AryaLabsHQ/bunli)** | New | Low | **Bun-native** | CLI framework built specifically for Bun. Standalone binary compilation, plugin system, interactive terminal UI. Very new, ecosystem not proven yet. |
| [oclif](https://github.com/oclif/oclif) | 9k+ | Moderate | Untested | By Salesforce. Heavy, plugin-based, great for large CLIs (Heroku CLI, Shopify CLI). Overkill for dynamic command registration. Has its own class-based command model that conflicts with dynamic registration. |
| [meow](https://github.com/sindresorhus/meow) | 3.5k | Moderate | Works | Minimal. Good for tiny CLIs. No subcommand support -- not suitable. |

**Recommendation:** Commander.js is the pragmatic choice. It works, has the biggest community, and dokcli already uses it. citty is worth watching for TypeScript-first projects in the UnJS ecosystem. For dynamic command registration (reading a spec and building commands at runtime), Commander's imperative `new Command()` + `.addCommand()` API is actually ideal.

---

## 4. Dynamic CLI Generation Patterns

### Approaches observed in the wild:

**A. Parse spec at startup, register commands (dokcli's approach)**
- Parse OpenAPI spec -> extract operations -> create Commander subcommands
- Pros: Full tab completion, `--help` works, standard CLI UX
- Cons: Startup cost (parsing spec), spec must be cached locally
- Used by: dokcli, openapi-to-cli

**B. Search-first with lazy execution (openapi-to-cli)**
- BM25 search engine over command names/descriptions/params
- User searches for commands, then executes them
- Good for very large APIs where browsing is impractical

**C. Config-driven with profiles (openapi-to-cli)**
- Multiple API profiles, each with its own base URL, spec URL, and auth
- `ocli api add`, `ocli api use`, `ocli search`, `ocli exec`
- More flexible but less "native CLI" feeling

**D. Spec-as-commands with flat mapping (dokcli)**
- Dokploy's RPC-style paths (`/api/{tag}.{operation}`) map 1:1 to `cli <tag> <operation>`
- Works beautifully for this specific API style
- Would need adaptation for RESTful APIs with path params (`/users/{id}/posts`)

### Key challenge: RESTful paths vs RPC paths
- RPC-style (`POST /api/project.create`) -> trivial to map to `cli project create`
- REST-style (`GET /users/{id}`, `POST /users`) -> harder to map. Need to decide: `cli users get --id 123` or `cli users 123`?
- openapi-to-cli solves this by using operationId for command naming

---

## 5. Auth Profiles / Credential Storage

### Patterns observed:

| Pattern | Used by | Mechanism | Security |
|---------|---------|-----------|----------|
| **Plain JSON config file** | dokcli, many CLIs | `~/.toolname/config.json` with `mode: 0o600` | Low (plaintext on disk). Standard for dev tools. |
| **Environment variables** | Universal | `TOOL_API_KEY`, `TOOL_SERVER_URL` | Medium. Good for CI/CD, ephemeral contexts. |
| **OS keychain** | GitHub CLI, 1Password CLI | `keytar`, `cross-keychain` npm packages | High. Uses macOS Keychain, Windows Credential Vault, Linux Secret Service. |
| **OAuth browser flow** | GitHub CLI, modern CLIs | Open browser -> auth -> callback with token | High. No static credentials. Complex to implement. |
| **Named profiles** | AWS CLI, openapi-to-cli | Multiple named configs (`--profile work`) | Medium. Convenient for multi-account/multi-server. |

### npm packages for credential storage:

| Package | Downloads/wk | Notes |
|---------|-------------|-------|
| [configstore](https://www.npmjs.com/package/configstore) | 11.7M | JSON config in `$XDG_CONFIG_HOME`. By Sindre Sorhus. Simple, proven. |
| [conf](https://www.npmjs.com/package/conf) | Moderate | Modern alternative to configstore. System-default config dirs. Schema validation. |
| [keytar](https://www.npmjs.com/package/keytar) | Moderate | Native module for OS keychain. macOS Keychain, Windows Vault, Linux Secret Service. Requires native compilation (N-API). |
| [cross-keychain](https://www.npmjs.com/package/cross-keychain) | Low | Native bindings with CLI fallback. Cross-platform. |

### dokcli's current approach:
- Plain JSON at `~/.dokcli/config.json` with `0o600` permissions
- Env var overrides (`DOKPLOY_API_KEY`, `DOKPLOY_SERVER_URL`)
- Single profile only (no named profiles)
- API key stored in plaintext

This is adequate for a dev tool. Named profiles would be a nice addition if multi-server support is needed.

---

## Summary & Recommendations

1. **For OpenAPI parsing:** `@apidevtools/swagger-parser` (current) is fine. Upgrade to `@scalar/openapi-parser` if OpenAPI 3.1+ support is needed.

2. **For CLI framework:** Commander.js (current) is the right choice. Its imperative API is actually best for dynamic command registration. No reason to switch.

3. **For dynamic CLI from OpenAPI:** dokcli's pattern (parse spec -> register Commander subcommands) is solid and aligns with what `openapi-to-cli` does. The main differentiator of dokcli is that Dokploy's RPC-style API maps perfectly to CLI subcommands.

4. **For auth:** Current plaintext JSON + env var approach is standard. Add named profiles only if multi-server is needed. OS keychain (`keytar`) is overkill for most dev tools.

5. **For making dokcli generic:** The main challenge would be handling REST-style paths (with path params) rather than just RPC-style. openapi-to-cli's approach of using operationId for command naming is worth studying.
