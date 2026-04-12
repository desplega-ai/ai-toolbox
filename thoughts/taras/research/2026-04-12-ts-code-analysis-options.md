---
date: 2026-04-12T18:00:00-07:00
researcher: Claude
git_commit: 3d38e51
branch: main
repository: ai-toolbox
topic: "Programmatic TypeScript code analysis options - LSP-like APIs for querying symbol information, types, and exports"
tags: [research, typescript, code-analysis, ts-morph, tree-sitter, oxc, swc, lsp, bun]
status: complete
autonomy: autopilot
last_updated: 2026-04-12
last_updated_by: Claude
---

# Research: Programmatic TypeScript Code Analysis Options

**Date**: 2026-04-12
**Researcher**: Claude
**Git Commit**: 3d38e51
**Branch**: main

## Research Question

What options exist for programmatically connecting to LSP-like information from TypeScript code? The goal is to build a TS library (running in Bun) that controls a list of TS scripts/SDKs and exposes an API to provide information about SDK symbols, function types, exports, etc.

## Summary

The landscape splits into two fundamental camps: **tools with full type resolution** (TypeScript Compiler API, ts-morph, Language Service, LSP/tsserver) and **tools without type resolution** that are parsers only (Tree-sitter, SWC, oxc-parser, ast-grep, Biome, Bun.Transpiler). The parsers are 10-50x faster but cannot resolve inferred types, generics, or cross-file type relationships.

For the stated goal — a Bun-based library analyzing TypeScript SDKs — **ts-morph** is the primary recommendation. It wraps the TS Compiler API with excellent DX, provides full type resolution, runs in Bun (pure JS), and offers an escape hatch to the raw compiler API when needed. For performance-critical structural queries (listing exports, finding imports), a **hybrid approach** pairing oxc-parser (fast path) with ts-morph (type resolution path) gives the best of both worlds.

The future is worth watching: **tsgo** (TypeScript 7's Go port) promises 10x faster type checking with native LSP support, expected mid-2026.

## Detailed Findings

### 1. TypeScript Compiler API (Full Type Resolution)

The gold standard for type information. Three entry points depending on use case:

**`ts.createProgram`** — One-shot analysis. Parses ALL files + transitive deps upfront. Returns `Program` → `TypeChecker` for full type resolution. Good for: generating docs, one-time SDK analysis. Downside: no incremental reuse, several seconds startup for large projects, hundreds of MB RAM.

**`ts.createLanguageService`** — Interactive/incremental. Adds IDE features (completions, hover, go-to-def, find-refs, rename). Lazy evaluation — only parses/checks requested files. Version tracking via `getScriptVersion()`. Best for: tools that need repeated queries against evolving code.

**`ts.createWatchProgram`** — File watching with incremental updates. Tracks dependency graph, only re-checks changed files + dependents. Best for: long-running tools, dev servers.

**Key TypeChecker methods:**
- `getExportsOfModule(symbol)` — all exported symbols of a module
- `getTypeOfSymbolAtLocation(symbol, node)` — type of a symbol
- `getSignaturesOfType(type, SignatureKind.Call)` — call signatures
- `getReturnTypeOfSignature(sig)` — return type
- `typeToString(type, enclosingNode?, flags?)` — type as string
- `getPropertiesOfType(type)` — all properties (including inherited)
- `getBaseTypes(type)` — superclass, implemented interfaces
- `getAliasedSymbol(symbol)` — follow re-exports to original symbol

**Bun compatibility**: Works. Pure JS package. Gotcha: must use `import * as ts from "typescript"` (NOT named imports — CJS interop issue).

**`@typescript/vfs`** — In-memory TypeScript environment (powers TS Playground). Three modes: pure in-memory, FS-backed overlay, CDN-backed. Pairs with Language Service for sandboxed analysis. Known issues: `createFile` vs `updateFile` (#2972), module resolution (#2801).

---

### 2. ts-morph (Recommended Primary Tool)

**Stats**: v27.0.2, ~12.5M weekly downloads, ~5.8k stars, MIT, pure JS.
**Author**: David Sherret (dsherret)

Wraps the TypeScript Compiler API with dramatically better DX. Instead of manual `forEachChild` + `isFunctionDeclaration` checks, you get `sourceFile.getFunctions()`, `fn.getReturnType()`, etc.

**Critical APIs for SDK analysis:**

| Need | ts-morph API |
|------|-------------|
| All exports | `sourceFile.getExportedDeclarations()` → Map<name, declarations[]> |
| Function params | `fn.getParameters()` → getName(), getType(), isOptional() |
| Return type | `fn.getReturnType().getText()` |
| Class hierarchy | `cls.getBaseClass()`, `getDerivedClasses()`, `getImplements()` |
| Interface members | `iface.getProperties()`, `getMethods()`, `getBaseTypes()` |
| Type aliases | `alias.getType().getText()`, `getProperties()`, `getUnionTypes()` |
| Generics | `type.getTypeArguments()`, `getTargetType()` |
| JSDoc | `fn.getJsDocs()` → getDescription(), getTags() |
| Symbol info | `node.getSymbol()` → getName(), getDeclarations(), getExports() |
| Type checks | `type.isString()`, `isUnion()`, `isIntersection()`, `isClass()`, etc. |
| Call signatures | `type.getCallSignatures()`, `getConstructSignatures()` |

**Performance considerations:**
- `getExportedDeclarations()` has ~1s overhead per call (issue #644). Workaround: `getDescendantsOfKind(ExportKeyword)` for hot paths.
- Use `forgetNodesCreatedInBlock()` for large-scale analysis to avoid memory pressure.
- OOM reported at ~50 modules with `findReferences()` in 900-module project (issue #642).
- `@ts-morph/bootstrap` (48.4kB) — lightweight alternative that gives raw `ts.Program`/`ts.TypeChecker` without wrapper overhead.
- In-memory FS: `new Project({ useInMemoryFileSystem: true })` for testing (~80ms → ~30ms).

**Escape hatch** to raw API always available:
- `node.compilerNode` → raw `ts.Node`
- `project.getTypeChecker().compilerObject` → raw `ts.TypeChecker`
- `project.getProgram().compilerObject` → raw `ts.Program`

**Bun compatibility**: Works. Pure JS, confirmed by developers. Uses Node `fs` APIs — use in-memory FS to sidestep any issues.

**Long-term risk**: Issue #1621 discusses future with tsgo (Go-based tsc rewrite). Not imminent but worth monitoring.

---

### 3. Tree-sitter / ast-grep (Fast Structural Parsing, No Types)

**Fundamental limitation**: Tree-sitter operates on **syntax** (shape of code as written), NOT **semantics** (type relationships). Cannot: resolve types, infer types, do cross-file analysis, expand generics/utility types.

**What it CAN extract**: declarations, signatures, type annotations as written, import/export graph, JSDoc. Well-annotated SDK: ~70-80% coverage syntactically.

**Bindings for Bun:**

| Package | Type | Bun Status |
|---------|------|-----------|
| `tree-sitter` (native) | C addon via node-gyp | Risky — node-gyp, version issues |
| `web-tree-sitter` (WASM) | WebAssembly | Works — safer bet, ~2-5x slower |
| `@ast-grep/napi` (prebuilt) | Rust NAPI | Better — ships prebuilt bins, no node-gyp |

**ast-grep** is the most practical tree-sitter option:
- Pattern matching with metavariables: `root.findAll('export function $NAME($$$PARAMS): $RET { $$$ }')`
- Config-based rules with constraints
- Ships prebuilt binaries (better Bun compat than raw tree-sitter)
- Clean programmatic API via `@ast-grep/napi`

**Performance**: Tree-sitter's real advantage is incremental re-parsing (up to 70% faster). For batch/one-shot, marginal benefit over TSC's parser. Real win: avoiding loading the entire TS compiler when you don't need types.

**Hybrid approach pattern:**
- Phase 1 (fast, ast-grep/oxc-parser): Parse all files, extract exports, signatures, annotations as written
- Phase 2 (targeted, ts-morph): Resolve type aliases, expand utility types, resolve generics, infer return types

---

### 4. LSP Protocol / tsserver

**tsserver**: TypeScript's language server, same engine as VS Code. Communicates over stdin/stdout with custom JSON protocol (NOT standard LSP). Key commands: `quickinfo` (type at position), `completionInfo`, `definition`, `references`, `signatureHelp`, `navtree`, `navto`.

**typescript-language-server**: Wraps tsserver into standard LSP JSON-RPC.
**vtsls**: Alternative — wraps VS Code's TS extension directly. Some editors switching to it.

**Client libraries:**
- `ts-lsp-client` — standalone, minimal deps (~15k weekly downloads)
- `vscode-jsonrpc` + `vscode-languageserver-protocol` — low-level but typed
- `@typescript/server-harness` — Microsoft's official harness

**Performance**: Startup ~1-5s, memory 500MB-2GB+ for large projects, simple requests 10-50ms, complex 100-500ms+. No memory pressure management (caches grow unbounded, VS Code issue #140090).

**When to choose**: Need hover-style formatted info, completions, diagnostics, VS Code parity, process isolation.
**When NOT to choose**: Need raw Type objects, AST traversal, code transforms, avoiding IPC overhead.

**Bun compatibility**: Works — `Bun.spawn()` with pipe stdio. 60% faster spawning than Node. `typescript-language-server-bun` fork exists.

**Future**: tsgo ships with native LSP. 10x overall, 30x type checking, 2.9x less memory. Expected mid-2026.

---

### 5. Alternative Parsers (SWC, oxc-parser, Biome)

**Critical distinction**: These **parse** TypeScript (preserving type annotations as AST nodes) but do NOT **resolve** types. For well-annotated SDKs with explicit type annotations, this covers ~80% of the API surface.

**oxc-parser** — Best parser option:
- ESTree/TS-ESTree compatible AST (industry standard, same as typescript-eslint)
- Built-in `staticExports`/`staticImports` — no AST walking needed
- Built-in `Visitor` class
- Fastest: 26ms to parse typescript.js (3.2x faster than SWC)
- Bun: works via NAPI with prebuilt bins; `@oxc-parser/wasm` as fallback
- Powers Rolldown/Vite ecosystem, actively maintained

**SWC** (`@swc/core`) — Most mature alternative:
- Own AST format (NOT ESTree), needs `swc-walk` for traversal
- Rich TS AST: `TsTypeAnnotation`, `TsType`, `TsFunctionType`, `TsTypeReference`, etc.
- 16.3M weekly downloads, most battle-tested
- ~84ms to parse typescript.js
- Bun: likely works via NAPI; known issues on ARM/Docker

**Biome** — Not suitable for analysis:
- No AST access from JS (excellent internal parser, not exposed)
- v2 has partial type inference (~75% accuracy) for linting, but internal only
- Right tool for linting/formatting, wrong for programmatic analysis

**Bun.Transpiler** — Too limited:
- `scan(code)` → export **names** only (no signatures, no types)
- No AST access — explicitly rejected by Bun team (issue #12896, "not planned")
- Useful only as fast first pass for import/export names
- Type-only imports/exports are IGNORED

---

### 6. Bun-Specific Considerations

**Bun advantages for code analysis tools:**
- Startup: 8-15ms (vs Node 40-120ms) — 4-10x faster
- `Bun.Glob`: 3x faster than `fast-glob` for file discovery
- `Bun.file()`: lazy loading, ~2x faster I/O for large files
- `Bun.spawn()`: 60% faster process spawning
- Native WASM support for `web-tree-sitter`, `@oxc-parser/wasm`

**Bun compatibility matrix:**

| Package | Status | Notes |
|---------|--------|-------|
| `typescript` | Works | Pure JS, no native deps |
| `ts-morph` | Works | Pure JS wrapper, confirmed |
| `@ts-morph/bootstrap` | Works | Lightweight pure JS |
| `@typescript/vfs` | Works | Pure JS |
| `oxc-parser` (NAPI) | Works | Prebuilt platform bins |
| `@oxc-parser/wasm` | Works | Experimental fallback |
| `@ast-grep/napi` | Works | Prebuilt bins, no node-gyp |
| `web-tree-sitter` (WASM) | Works | v0.25.3 confirmed, watch ABI versions |
| `tree-sitter` (native) | Untested | N-API, needs verification |
| `@swc/core` | Problematic | ARM binding issues, Docker issues |

**Key gap**: No Bun-native AST API. `Bun.Transpiler` does not expose the parser's AST. You must bring your own parser/analyzer.

**No existing Bun code analysis reference implementations.** This would be pioneering work.

## Architecture Recommendation

### Tier 1: ts-morph (Primary — Full Analysis)

For comprehensive SDK analysis with type resolution:

```
SDK .d.ts files → ts-morph Project → getExportedDeclarations()
                                    → getType() / getReturnType()
                                    → getJsDocs()
                                    → Complete API surface with resolved types
```

**When**: You need complete, accurate type information. Accepts the cost of loading the TypeScript compiler (~60MB, multi-second startup).

### Tier 2: Hybrid (Performance-Sensitive)

For systems where latency matters:

```
Phase 1 (fast): oxc-parser / ast-grep
  → Extract exports, function signatures, type annotations AS WRITTEN
  → Build structural index in milliseconds

Phase 2 (targeted): ts-morph
  → Resolve specific types on demand (inferred returns, generics, utility types)
  → Only load TS compiler when needed
```

**When**: CLI tool with fast startup, interactive queries, large codebase analysis.

### Tier 3: tsserver/LSP (IDE Integration)

For tools that need VS Code-compatible behavior:

```
Bun.spawn() → tsserver → JSON protocol → quickinfo/signatureHelp/references
```

**When**: Building editor plugins, need hover info, completions, diagnostics.

### Quick Decision Guide

| If you need... | Use... |
|----------------|--------|
| Full type resolution + good DX | ts-morph |
| Full type resolution + minimal deps | TS Compiler API + @typescript/vfs |
| Fast structural queries (no types) | oxc-parser or ast-grep |
| IDE features (hover, completions) | tsserver / LSP |
| Just import/export names | Bun.Transpiler.scan() |
| Best of both worlds | oxc-parser (fast) + ts-morph (types on demand) |

## Comparison Matrix

| Tool | Type Resolution | Bun Compat | Speed | DX | Best For |
|------|----------------|------------|-------|----|----------|
| ts-morph | Full | Works | Slow (TS compiler) | Excellent | Primary SDK analysis |
| TS Compiler API | Full | Works | Slow | Verbose | Max control, min deps |
| @typescript/vfs | Full | Works | Slow | Good | In-memory/sandboxed |
| tsserver/LSP | Full | Works | Medium | Protocol-based | IDE integration |
| oxc-parser | Annotations only | Works (NAPI) | Fastest (26ms) | Good | Fast structural queries |
| SWC | Annotations only | Likely works | Fast (84ms) | OK | Mature alternative |
| ast-grep | Annotations only | Works | Fast | Good | Pattern matching |
| tree-sitter | Annotations only | WASM works | Fast | Low-level | Incremental re-parsing |
| Biome | None (internal) | N/A | N/A | N/A | Not suitable |
| Bun.Transpiler | None | Native | Fastest | Minimal | Import/export names only |

## npm Package Sizes

| Package | Size | Native? |
|---------|------|---------|
| `typescript` | ~60MB (installed) | No (pure JS) |
| `ts-morph` | ~2MB + typescript | No (pure JS) |
| `@ts-morph/bootstrap` | 48.4kB + typescript | No (pure JS) |
| `oxc-parser` | ~5MB (with platform binary) | Yes (NAPI) |
| `@swc/core` | ~30MB (with platform binary) | Yes (NAPI) |
| `web-tree-sitter` | ~400kB + grammar WASMs | No (WASM) |
| `@ast-grep/napi` | ~10MB (with platform binary) | Yes (NAPI) |

## Things to Watch

- **tsgo (TypeScript 7)**: Go port with 10x faster type checking, native LSP. When its programmatic API stabilizes, could replace ts-morph's backend. Expected mid-2026.
- **oxc type-aware features**: If oxc ships a general-purpose type inference API via tsgolint integration, could be a game-changer. Currently locked to linting internals.
- **Biome type inference**: ~75% accuracy, promising but not exposed as public API.
- **ts-morph + tsgo**: Issue #1621 discusses ts-morph's future. May need fundamentally different approach for Go-based compiler.

## Open Questions

- **Scale testing**: How does ts-morph handle analyzing 50+ SDK packages in a single Project? Memory pressure from `getExportedDeclarations()` (issue #644) may require batching strategies with `forgetNodesCreatedInBlock()`.
- **oxc-parser Bun NAPI**: Needs hands-on testing. If NAPI fails, `@oxc-parser/wasm` is the fallback but slower.
- **Incremental analysis**: If the tool needs to react to SDK updates, `ts.createWatchProgram` or Language Service may be better than one-shot `ts.createProgram`.
- **tsgo abstraction**: Worth building an abstraction layer that could swap ts-morph backend to tsgo when it matures?
- **Declaration files vs source**: Should the tool analyze `.d.ts` files (published types) or source `.ts` files? `.d.ts` is lighter but loses JSDoc and implementation details.
