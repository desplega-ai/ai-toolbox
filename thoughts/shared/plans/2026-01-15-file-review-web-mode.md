---
date: 2026-01-15T14:00:00-08:00
topic: "File Review Web Mode Implementation Plan"
author: claude
status: draft
tags: [plan, file-review, web-mode, implementation]
---

# File Review Web Mode Implementation Plan

## Overview

Add `--web` and `--tunnel` flags to file-review to enable browser-based usage. When running in web mode, the application serves the same frontend via an HTTP server instead of the native Tauri window. The optional `--tunnel` flag exposes the local server via localtunnel for remote access.

## Current State Analysis

### Existing Architecture
- **Entry point**: `src-tauri/src/main.rs:10-63` - CLI argument parsing
- **App bootstrap**: `src-tauri/src/lib.rs:17-181` - Tauri setup with window close handler
- **State management**: `src-tauri/src/file_ops.rs:6-12` - `AppState` struct
- **Comment operations**: `src-tauri/src/comments.rs` - Parsing, formatting, manipulation
- **Frontend**: `src/main.ts` - Uses `invoke()` to call Rust commands

### Key Observations
1. All comment logic is in pure Rust functions that don't depend on Tauri
2. `AppState` is simple and can be reused in web mode
3. Frontend uses `invoke()` for all backend calls - needs abstraction layer
4. Window close handler (`lib.rs:84-150`) outputs final report - needs equivalent for web

## Desired End State

```
file-review [OPTIONS] [FILE]
file-review --web [OPTIONS] [FILE]        # Start HTTP server mode
file-review --web --tunnel [OPTIONS] [FILE]  # With localtunnel
```

**Web mode behavior:**
1. CLI starts HTTP server on port 3456 (configurable via `--port`)
2. Opens browser to `http://localhost:3456`
3. Frontend detects web mode and uses fetch API instead of Tauri invoke
4. "Quit" button in toolbar triggers `/api/quit` endpoint
5. Server outputs final report to stdout and exits
6. If `--tunnel` flag: creates localtunnel and prints public URL

## Quick Verification Reference

Commands to verify the implementation:
- `cargo build --release --features web -p file-review` - Build the binary
- `./target/release/file-review --web test-file.md` - Test web mode
- `./target/release/file-review --web --tunnel test-file.md` - Test tunnel mode
- `bun run build` - Build frontend assets

Key files to check:
- `file-review/src-tauri/src/main.rs` - New flag parsing
- `file-review/src-tauri/src/web_server.rs` - New HTTP server module
- `file-review/src/api.ts` - New abstraction layer
- `file-review/src/main.ts` - Updated to use api.ts

## What We're NOT Doing

- No file picker dialog in web mode (file path required via CLI)
- No "Reveal in Finder" functionality in web mode
- No multi-session/concurrent user support
- No persistent authentication (auth handled by localtunnel if needed)
- No WebSocket for real-time updates (not needed for single-user file editing)

## Implementation Approach

The implementation is split into 4 phases:
1. **Backend HTTP Server** - Add axum server with REST endpoints
2. **Frontend Abstraction** - Create api.ts to abstract Tauri vs HTTP
3. **Web-specific UI** - Add quit button and disable unsupported features
4. **Tunnel Integration** - Add localtunnel support via Node.js subprocess

---

## Phase 1: Backend HTTP Server

### Overview
Add an axum-based HTTP server that can serve the frontend and handle API requests. The frontend assets will be embedded in the binary.

### Changes Required:

#### 1. Add dependencies to Cargo.toml
**File**: `file-review/src-tauri/Cargo.toml`
**Changes**: Add axum, tokio, tower-http for HTTP server; rust-embed for asset embedding

```toml
[dependencies]
# ... existing deps ...
axum = { version = "0.8", optional = true }
tokio = { version = "1", features = ["rt-multi-thread", "macros"], optional = true }
tower-http = { version = "0.6", features = ["fs", "cors"], optional = true }
rust-embed = { version = "8", optional = true }
open = { version = "5", optional = true }

[features]
default = []
web = ["axum", "tokio", "tower-http", "rust-embed", "open"]
```

#### 2. Create web server module
**File**: `file-review/src-tauri/src/web_server.rs` (new file)
**Changes**: HTTP server with REST endpoints mirroring Tauri commands

```rust
// Key endpoints:
// GET  /                      -> Serve index.html
// GET  /assets/*              -> Serve static assets
// GET  /api/version           -> Get version
// GET  /api/current-file      -> Get current file path
// POST /api/read-file         -> Read file content
// POST /api/write-file        -> Write file content
// POST /api/set-current-file  -> Set current file path
// GET  /api/is-stdin-mode     -> Check stdin mode
// GET  /api/config            -> Load config
// POST /api/config            -> Save config
// POST /api/parse-comments    -> Parse comments from content
// POST /api/insert-wrapped-comment -> Insert inline comment
// POST /api/insert-nextline-comment -> Insert line comment
// POST /api/remove-comment    -> Remove comment by ID
// POST /api/quit              -> Trigger quit (returns final report)
```

Key implementation details:
- Use `rust-embed` to embed `dist/` folder at compile time
- Share `AppState` between routes via axum's `Extension`
- `/api/quit` handler reads file, formats output, then signals shutdown
- CORS headers for development (localhost only)

#### 3. Update main.rs for web mode
**File**: `file-review/src-tauri/src/main.rs`
**Changes**: Add `--web`, `--tunnel`, `--port` flag parsing; conditionally start web server

```rust
// New flags:
// --web, -w       Start in web server mode
// --tunnel, -t    Enable localtunnel (requires --web)
// --port PORT     HTTP server port (default: 3456)

// Flow:
// 1. Parse flags including new --web, --tunnel, --port
// 2. If --web flag:
//    a. Build frontend assets (already built into binary)
//    b. Start HTTP server on specified port
//    c. Open browser to localhost URL
//    d. If --tunnel: spawn localtunnel subprocess, print URL
//    e. Wait for shutdown signal from /api/quit or Ctrl+C
// 3. Else: proceed with Tauri mode (existing behavior)
```

#### 4. Update build configuration
**File**: `file-review/src-tauri/build.rs`
**Changes**: Ensure dist/ folder is included in build when web feature enabled

### Success Criteria:

#### Automated Verification:
- [ ] `cargo build --release --features web -p file-review` compiles without errors
- [ ] `cargo test -p file-review` passes (if tests exist)

#### Manual Verification:
- [ ] `./target/release/file-review --web test.md` starts server and opens browser
- [ ] All API endpoints respond correctly (test with curl)
- [ ] `/api/quit` outputs comments and shuts down server

**Implementation Note**: After completing this phase, pause for manual confirmation.

---

## Phase 2: Frontend Abstraction Layer

### Overview
Create an abstraction layer that routes calls to either Tauri IPC or HTTP fetch based on the runtime environment.

### Changes Required:

#### 1. Create API abstraction module
**File**: `file-review/src/api.ts` (new file)
**Changes**: Unified interface for backend calls

```typescript
// Detection: window.__TAURI__ exists in Tauri mode

export const API = {
  async invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
    if (isTauri()) {
      return tauriInvoke(cmd, args);
    }
    return httpInvoke(cmd, args);
  },

  // Specific helpers for common operations
  async readFile(path: string): Promise<string>,
  async writeFile(path: string, content: string): Promise<void>,
  async getCurrentFile(): Promise<string | null>,
  async setCurrentFile(path: string): Promise<void>,
  async getVersion(): Promise<string>,
  async isStdinMode(): Promise<boolean>,
  async loadConfig(): Promise<AppConfig>,
  async saveConfig(config: AppConfig): Promise<void>,
  async parseComments(content: string): Promise<ReviewComment[]>,
  async insertWrappedComment(...): Promise<[string, string]>,
  async insertLineComment(...): Promise<[string, string]>,
  async removeComment(content: string, id: string): Promise<string>,
  async quit(): Promise<QuitResponse>,  // Web mode only
};
```

#### 2. Update main.ts to use API layer
**File**: `file-review/src/main.ts`
**Changes**: Replace all `invoke()` calls with `API.*` methods

Replace:
```typescript
import { invoke } from "@tauri-apps/api/core";
const version = await invoke<string>("get_version");
```

With:
```typescript
import { API } from "./api";
const version = await API.getVersion();
```

#### 3. Update config.ts to use API layer
**File**: `file-review/src/config.ts`
**Changes**: Use API abstraction for config operations

#### 4. Update comments.ts to use API layer
**File**: `file-review/src/comments.ts`
**Changes**: Use API abstraction for comment operations

#### 5. Update file-picker.ts for web mode
**File**: `file-review/src/file-picker.ts`
**Changes**: Return null in web mode (file picker not supported)

```typescript
export async function showFilePicker(): Promise<string | null> {
  if (!isTauri()) {
    return null; // File picker not available in web mode
  }
  // existing Tauri dialog code
}
```

### Success Criteria:

#### Automated Verification:
- [ ] `bun run check` (tsc --noEmit) passes
- [ ] `bun run build` completes successfully

#### Manual Verification:
- [ ] Tauri mode still works: `bun run tauri dev`
- [ ] Web mode works with abstraction layer: `./file-review --web test.md`

**Implementation Note**: After completing this phase, pause for manual confirmation.

---

## Phase 3: Web-specific UI Changes

### Overview
Add a Quit button for web mode and disable features that require native APIs.

### Changes Required:

#### 1. Add Quit button to toolbar
**File**: `file-review/src/main.ts`
**Changes**: Add quit button that's visible only in web mode

```typescript
// In init():
if (!isTauri()) {
  // Add quit button to toolbar
  const quitBtn = createQuitButton();
  toolbar.appendChild(quitBtn);

  // Handle quit
  quitBtn.addEventListener('click', handleWebQuit);
}

async function handleWebQuit() {
  const result = await API.quit();
  // Show final report in modal before window closes
  showFinalReportModal(result);
}
```

#### 2. Update toolbar HTML
**File**: `file-review/index.html`
**Changes**: Add placeholder for quit button (or create dynamically in JS)

#### 3. Update styles for quit button
**File**: `file-review/src/styles.css`
**Changes**: Style for quit button (red/orange to indicate exit)

```css
.toolbar-btn.quit-btn {
  background: var(--danger-color);
  /* ... */
}
```

#### 4. Disable unsupported features in web mode
**File**: `file-review/src/main.ts`
**Changes**: Conditionally disable features

```typescript
// In init():
if (!isTauri()) {
  // Disable file picker button (show tooltip explaining why)
  const openBtn = document.getElementById('open-file-btn');
  if (openBtn) {
    openBtn.setAttribute('disabled', 'true');
    openBtn.title = 'File picker not available in web mode';
  }

  // Disable empty state open button
  const emptyOpenBtn = document.getElementById('empty-open-btn');
  if (emptyOpenBtn) {
    emptyOpenBtn.setAttribute('disabled', 'true');
  }

  // Update file name click behavior (no reveal in Finder)
  // Already handled in updateFileNameDisplay()
}
```

#### 5. Add final report modal
**File**: `file-review/src/main.ts` and `file-review/src/styles.css`
**Changes**: Modal to show final report before exit

```typescript
function showFinalReportModal(result: QuitResponse) {
  // Create modal overlay
  // Show formatted comments
  // "Close" button that closes the browser tab/window
}
```

### Success Criteria:

#### Automated Verification:
- [ ] `bun run check` passes
- [ ] `bun run build` succeeds

#### Manual Verification:
- [ ] Quit button visible only in web mode
- [ ] Quit button shows final report modal
- [ ] File picker buttons disabled in web mode
- [ ] Tauri mode unchanged (no quit button, file picker works)

**Implementation Note**: After completing this phase, pause for manual confirmation.

---

## Phase 4: Tunnel Integration

### Overview
Add `--tunnel` flag support using localtunnel via a Node.js subprocess.

### Changes Required:

#### 1. Add tunnel subprocess management
**File**: `file-review/src-tauri/src/tunnel.rs` (new file)
**Changes**: Spawn and manage localtunnel Node.js process

```rust
// Spawn: npx @desplega.ai/localtunnel --port PORT --auth
// Parse stdout for tunnel URL
// Handle process cleanup on shutdown

pub struct TunnelManager {
    process: Option<Child>,
    public_url: Option<String>,
}

impl TunnelManager {
    pub async fn start(port: u16) -> Result<Self, Error>;
    pub fn get_url(&self) -> Option<&str>;
    pub async fn stop(&mut self);
}
```

Alternative: Use Rust HTTP client to call localtunnel server API directly (more complex but avoids Node.js dependency).

**Decision**: Use Node.js subprocess for simplicity (localtunnel client is battle-tested).

#### 2. Update main.rs for tunnel flag
**File**: `file-review/src-tauri/src/main.rs`
**Changes**: Handle `--tunnel` flag

```rust
if web_mode {
    let server_handle = start_web_server(port, state).await;

    if tunnel_enabled {
        let tunnel = TunnelManager::start(port).await?;
        println!("Tunnel URL: {}", tunnel.get_url().unwrap());
    } else {
        println!("Local URL: http://localhost:{}", port);
    }

    // Open browser (local URL even with tunnel - user can share tunnel URL)
    open::that(format!("http://localhost:{}", port))?;

    // Wait for shutdown...
}
```

#### 3. Update help text
**File**: `file-review/src-tauri/src/main.rs`
**Changes**: Document new flags in `print_help()`

```rust
fn print_help() {
    // ... existing help ...
    println!("WEB MODE:");
    println!("    -w, --web        Start in web server mode (opens browser)");
    println!("    -t, --tunnel     Enable localtunnel for remote access (requires --web)");
    println!("    --port PORT      HTTP server port (default: 3456)");
}
```

### Success Criteria:

#### Automated Verification:
- [ ] `cargo build --release --features web -p file-review` compiles
- [ ] Help text shows new flags

#### Manual Verification:
- [ ] `./file-review --web test.md` works without tunnel
- [ ] `./file-review --web --tunnel test.md` prints tunnel URL
- [ ] Tunnel URL is accessible from external network
- [ ] Ctrl+C cleanly shuts down both server and tunnel

**Implementation Note**: After completing this phase, the feature is complete.

---

## Testing Strategy

### Unit Tests
- Comment parsing functions (already pure, can add tests)
- API endpoint handlers (mock file system)

### Integration Tests
- Start web server, make HTTP requests, verify responses
- Test quit flow outputs correct format

### Manual Testing Checklist
- [ ] Web mode: Start, edit file, add comments, quit - verify output
- [ ] Tunnel mode: Start, access via tunnel URL, verify functionality
- [ ] Tauri mode: Verify no regressions
- [ ] Stdin mode: Verify works in both Tauri and web modes
- [ ] JSON output: Verify `--json` flag works with `--web`
- [ ] Silent mode: Verify `--silent` flag works with `--web`

## References

- Research document: `thoughts/shared/research/2026-01-15-file-review-web-mode-research.md`
- Localtunnel usage pattern: `/Users/taras/Documents/code/qa-use/lib/tunnel/index.ts`
- Axum documentation: https://docs.rs/axum/latest/axum/
- rust-embed documentation: https://docs.rs/rust-embed/latest/rust_embed/
