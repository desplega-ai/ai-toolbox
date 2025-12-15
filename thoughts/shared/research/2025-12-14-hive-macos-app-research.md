---
date: 2025-12-14T20:44:21Z
researcher: Claude
git_commit: 51d3d876ba8db6861e119de29c3ed1964f588292
branch: main
repository: ai-toolbox
topic: "Hive - macOS App for Managing AI CLI Agents"
tags: [research, hive, tauri, claude-code, claude-cli, desktop-app]
status: superseded
superseded_by: "2025-12-15-hive-electron-app-research.md"
superseded_reason: "Tauri WebView lacks Node.js runtime required for Claude Agent SDK. Switched to Electron approach."
last_updated: 2025-12-15
last_updated_by: Claude
last_updated_note: "Marked as superseded - switching to Electron approach"
---

> **SUPERSEDED**: This research has been superseded by [Hive Electron App Research](./2025-12-15-hive-electron-app-research.md).
>
> **Reason**: Tauri's WebView environment lacks Node.js runtime, which is required by the Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`). The Electron approach allows direct SDK integration in the main process.
>
> This document is preserved for historical context.

# Research: Hive - macOS App for Managing AI CLI Agents

**Date**: 2025-12-14T20:44:21Z
**Researcher**: Claude
**Git Commit**: 51d3d876ba8db6861e119de29c3ed1964f588292
**Branch**: main
**Repository**: ai-toolbox

## Research Question

How to build a macOS desktop app (using Tauri) to manage Claude Code sessions across multiple projects, with:
- Dashboard view of all projects and sessions
- Four action types: Research, Plan, Implement, Free-form
- Side-by-side thoughts/ directory viewing and editing
- Google Docs-like commenting that agents can pick up
- Window management (split panes, multiple windows, named sessions)
- Notifications on input required
- Auto-installation of cc-plugin

## Summary

Building "Hive" is highly feasible using **Tauri 2.0** with the **Claude CLI** (spawned as a child process via Tauri's shell plugin). The Claude Agent SDK was initially considered but **cannot be used** because it requires Node.js runtime, which is not available in Tauri's WebView environment. Instead, we spawn the `claude` CLI with `--output-format stream-json` to get streaming JSON output.

## Detailed Findings

### 1. Claude CLI Integration (via Tauri Shell Plugin)

**Why not the SDK?** The Claude Agent SDK requires Node.js runtime (`crypto.randomUUID()` etc.), which is not available in Tauri's WebView (browser) environment. Instead, we spawn the `claude` CLI as a child process.

**Detailed Research**: [Claude CLI Integration](./2025-12-15-hive-claude-cli-integration.md)

**Key CLI Options:**

| Option | Purpose |
|--------|---------|
| `--output-format stream-json` | JSON output per line for streaming |
| `--print all` | Non-interactive mode with all message types |
| `-p <prompt>` | The user's prompt |
| `--resume <session_id>` | Resume an existing session |
| `--model <model>` | Specify model (sonnet, opus, etc.) |
| `--permission-mode <mode>` | Set permission mode |

**Starting a Session:**
```typescript
import { Command } from '@tauri-apps/plugin-shell'

const command = Command.create('claude', [
  '--output-format', 'stream-json',
  '--print', 'all',
  '-p', prompt
], { cwd: projectPath })

command.stdout.on('data', (line) => {
  const parsed = JSON.parse(line)
  // Handle message...
})

await command.spawn()
```

**Message Types (stream-json output):**
- `system` (subtype: 'init' with session_id)
- `assistant` (Claude's response with text/tool_use blocks)
- `user` (user input echo)
- `result` (final stats: duration_ms, total_cost_usd)

**Session Resume:**
```typescript
const command = Command.create('claude', [
  '--output-format', 'stream-json',
  '--print', 'all',
  '--resume', sessionId,
  '-p', prompt
])
```

### 2. Existing Reference: Opcode (Claudia)

**URL**: https://github.com/getAsterisk/claudia

Opcode is an open-source Tauri 2 desktop app that wraps Claude Code. Key architectural insights:

| Component | Technology |
|-----------|------------|
| Frontend | React 18 + TypeScript + Vite |
| Backend | Rust + Tauri 2 |
| Database | SQLite (rusqlite) |
| UI | Tailwind CSS + shadcn/ui |

**Features implemented:**
- Project browser for `~/.claude/projects/`
- Session history with resume
- Custom agent creation with sandboxed execution
- Usage analytics and cost tracking
- MCP server management
- Timeline/checkpoint system with session forking
- CLAUDE.md editor

This provides a solid reference for Hive's architecture.

### 3. Tauri 2.0 Framework

**Core Architecture:**
- Rust backend + Web frontend (any framework)
- Uses OS native WebView (minimal binary size ~600KB vs Electron ~100MB)
- Memory-safe via Rust

**Recommended Plugins for Hive:**

| Plugin | Purpose |
|--------|---------|
| `tauri-plugin-shell` | **Required** - Spawn Claude CLI as child process |
| `tauri-plugin-dialog` | Directory picker for project selection |
| `tauri-plugin-fs` | File system access and watching for thoughts/ |
| `tauri-plugin-store` | State persistence across restarts |
| `tauri-plugin-window-state` | Window position/size persistence |

**IPC Patterns:**

1. **Commands** (type-safe, request-response):
```rust
#[tauri::command]
async fn start_session(app: tauri::AppHandle, project_path: String) -> Result<String, String> {
    // Start Claude session, return session_id
}
```

2. **Events** (fire-and-forget, streaming):
```rust
app.emit("claude-message", payload)?;
```

3. **Channels** (high-performance streaming):
For streaming Claude output to the frontend.

**Window Management:**
- Multiple windows via `WebviewWindowBuilder`
- Split panes: implement in frontend (CSS/JS) for cross-platform consistency
- macOS-specific: `tauri-nssplitview` plugin for native NSSplitView

**File Watching (for thoughts/):**
```javascript
import { watchImmediate } from '@tauri-apps/plugin-fs';

const stop = await watchImmediate('thoughts/', (event) => {
  console.log('thoughts changed:', event);
}, { recursive: true });
```

### 4. Plugin Auto-Installation

**Method 1: Marketplace Approach**

Create a marketplace structure:
```
cc-plugin/
├── .claude-plugin/
│   └── marketplace.json
├── commands/
│   ├── research.md
│   ├── create-plan.md
│   └── implement-plan.md
└── agents/
    └── ...
```

Then execute via CLI:
```bash
/plugin marketplace add /path/to/cc-plugin
/plugin install base@ai-toolbox
```

**Method 2: Settings Configuration**

Configure `.claude/settings.json` in the project:
```json
{
  "extraKnownMarketplaces": {
    "ai-toolbox": {
      "source": {
        "source": "github",
        "repo": "desplega-ai/ai-toolbox"
      }
    }
  },
  "enabledPlugins": {
    "base@ai-toolbox": true
  }
}
```

When Claude Code starts in that project and the user trusts the folder, plugins install automatically.

### 5. thoughts/ Directory Structure

**Standard Layout:**
```
thoughts/
├── shared/           # Git-tracked, shared with team
│   ├── plans/        # Implementation plans
│   └── research/     # Research documents
└── local/            # Gitignored, personal notes
```

**File Naming Convention:**
- Pattern: `YYYY-MM-DD-description.md`
- Examples: `2025-12-14-hive-macos-app-research.md`

**Research Document Format (YAML frontmatter):**
```yaml
---
date: 2025-12-14T20:44:21Z
researcher: Claude
git_commit: abc123
branch: main
repository: ai-toolbox
topic: "Research Topic"
tags: [tag1, tag2]
status: complete
last_updated: 2025-12-14
last_updated_by: Claude
---
```

**Plan Document Format:**
- No frontmatter
- Starts with `# Title`
- Phases separated by `---`
- Each phase has: Overview, Changes Required, Success Criteria

### 6. Notification Hooks

The existing `cc-hooks/` provides a pattern for notifications:

**Hook Events (from SDK):**
- `permission_prompt` - Tool needs approval
- `idle_prompt` - Claude is waiting for input
- `elicitation_dialog` - Need user information

**Input JSON Structure:**
```json
{
  "session_id": "abc123",
  "transcript_path": "/Users/.../.claude/projects/.../session.jsonl",
  "cwd": "/Users/.../project",
  "permission_mode": "default",
  "hook_event_name": "Notification",
  "message": "Claude needs your permission to use Bash",
  "notification_type": "permission_prompt"
}
```

For Hive, instead of using system AppleScript notifications, capture these via the SDK's hook system and display in-app notifications.

### 7. Hive Comment Syntax

**Proposed Format:**
```markdown
<!-- hive-comment(uuid): This is feedback for Claude to address -->
Some markdown content here
<!-- hive-comment(uuid) -->
```

**Implementation Approach:**
1. Parse markdown files for `<!-- hive-comment -->` blocks
2. Display inline in the UI with highlighting
3. "Send to Claude" button generates a prompt:
   ```
   Check @thoughts/shared/plans/2025-12-14-feature.md at line 45.

   Comments:
   - [Line 45] This is feedback for Claude to address
   ```
4. Use SDK with `permissionMode: 'default'` so user reviews edits

## Architecture Recommendation

```
hive/
├── src/                          # Frontend (React/Svelte)
│   ├── components/
│   │   ├── Dashboard.tsx         # Project overview
│   │   ├── SessionView.tsx       # Claude session UI
│   │   ├── ThoughtsPanel.tsx     # Side-by-side thoughts viewer
│   │   ├── CommentEditor.tsx     # Inline comment UI
│   │   ├── PermissionDialog.tsx  # Tool approval modal
│   │   └── ActionBar.tsx         # Research/Plan/Implement/Free-form buttons
│   ├── lib/
│   │   ├── claude-client.ts      # SDK wrapper
│   │   └── thoughts-parser.ts    # Parse hive-comment blocks
│   └── stores/
│       └── sessions.ts           # Session state management
├── src-tauri/                    # Rust backend
│   ├── src/
│   │   ├── commands/             # Tauri IPC commands
│   │   ├── sessions.rs           # Session management
│   │   ├── projects.rs           # Project persistence
│   │   └── db.rs                 # SQLite
│   └── Cargo.toml
├── package.json
└── tauri.conf.json
```

**Tech Stack:**
- **Frontend**: React + TypeScript + Vite + Tailwind CSS
- **Backend**: Rust + Tauri 2.0
- **State**: tauri-plugin-store for preferences and recent directories
- **Claude**: CLI spawned via tauri-plugin-shell (not SDK - incompatible with WebView)

## Code References

- `cc-plugin/base/commands/research.md:1-200` - Research command implementation
- `cc-plugin/base/commands/create-plan.md:1-415` - Plan command implementation
- `cc-plugin/base/commands/implement-plan.md:1-90` - Implement command
- `cc-hooks/mac-notify.py:1-53` - Notification hook example
- `cc-hooks/setup.py:1-43` - Hook installation pattern

## Decisions Made

1. **Frontend Framework**: React (larger ecosystem, matches Opcode reference)
2. **Session Persistence**: Yes - sessions survive app restarts via SDK resume
3. **Comment Syntax**: `<!-- hive-comment(id): ... -->` confirmed
4. **Package Manager**: pnpm (battle-tested with Tauri, fewer edge cases than Bun, matches Opcode reference)
5. **Notifications**: System-level (macOS native) with deep linking to specific Claude pane

## Future Considerations

1. **Web UI / Mobile App**: Remote interaction capability - architecture should support:
   - Extracting core logic into a reusable service layer
   - API-first design for session management
   - WebSocket or similar for real-time streaming
   - Consider: Tauri mobile (iOS/Android) vs React Native vs web-only

2. **Git Worktrees**: Multiple branches of thoughts/ideas on same project

## Open Questions (Deferred)

1. **State Management**: Zustand vs Jotai vs native React state?
2. **Multi-user**: Will multiple people use Hive on the same project? (affects comment sync)
3. **Remote Architecture**: REST API vs WebSocket vs both for future web/mobile clients?

## Implementation Plan

- [Hive Initial Setup](../plans/2025-12-14-hive-initial-setup.md) - Phase 1-5 implementation plan for project scaffolding, dashboard, Claude SDK integration, thoughts panel, and polish

## Related Research

- [Claude CLI Integration](./2025-12-15-hive-claude-cli-integration.md) - How Hive spawns Claude CLI via Tauri shell plugin, message formats, session management
- [Tauri Window Management Patterns](./2025-12-14-tauri-window-management-patterns.md) - Single vs multiple windows, split panes, keyboard shortcuts, layout persistence
- [Markdown Comment Parsing & Persistence](./2025-12-14-markdown-comment-parsing-persistence.md) - Parser libraries, position tracking, conflict resolution, UUID generation

## External Resources

**Official Documentation:**
- [Claude Code CLI Documentation](https://docs.anthropic.com/en/docs/claude-code)
- [Tauri 2.0 Documentation](https://v2.tauri.app/)
- [Tauri Shell Plugin](https://v2.tauri.app/plugin/shell/)

**GitHub Repositories:**
- [Opcode (Claudia) - Reference Tauri App](https://github.com/getAsterisk/claudia)
- [tauri-plugin-shell](https://github.com/tauri-apps/plugins-workspace/tree/v2/plugins/shell)

## Further Research Needed

The following areas require deeper investigation before or during implementation:

### 1. macOS Native Notifications with Deep Linking
- **Question**: How to open a specific pane/session when user clicks a macOS notification?
- **Areas to explore**:
  - Tauri's `tauri-plugin-notification` capabilities
  - Custom URL schemes (e.g., `hive://session/abc123`)
  - macOS `NSUserNotificationCenter` vs `UNUserNotificationCenter`
  - Handling notification clicks when app is closed vs backgrounded
- **Why**: Critical for the "redirect to specific Claude pane" requirement

### 2. Tauri + Bun Integration ✅ RESOLVED
- **Question**: What's the current state of Bun support in Tauri 2.0?
- **Decision**: Use **pnpm** instead of Bun
- **Rationale**:
  - Bun is officially supported since Tauri 1.5.0, but has more edge cases
  - Known issues: iOS development (Xcode can't find Bun), CI/CD requires extra setup, lockfile detection bugs (fixed in 2.4.0+), ESM strict mode errors with `--bun` flag
  - pnpm is battle-tested with Tauri, has more community resources, matches Opcode reference implementation
  - Speed difference is marginal for desktop app development (saves ~10 seconds per install)
- **Commands to use**:
  ```bash
  pnpm create tauri-app
  pnpm install
  pnpm tauri dev
  pnpm tauri build
  ```

### 3. Claude Integration Approach ✅ RESOLVED
- **Question**: How to integrate with Claude Code programmatically?
- **Initial Approach**: Claude Agent SDK
- **Problem**: SDK requires Node.js runtime (`crypto.randomUUID()` etc.) which is not available in Tauri's WebView
- **Solution**: Spawn `claude` CLI as child process via `tauri-plugin-shell`
- **Detailed Research**: [Claude CLI Integration](./2025-12-15-hive-claude-cli-integration.md)
- **Key Findings**:
  - Use `--output-format stream-json` for streaming JSON output
  - Use `--resume <session_id>` flag to resume sessions
  - Sessions still stored as JSONL in `~/.claude/projects/` by the CLI
  - Forking available via `--fork-session` flag

### 4. Remote Access Architecture
- **Question**: How to expose Hive sessions to web/mobile clients?
- **Areas to explore**:
  - Running Claude CLI on a backend server vs local-only
  - WebSocket streaming patterns for real-time output
  - Authentication and authorization for remote access
  - Tauri mobile (v2) capabilities vs separate React Native app
  - Security implications of remote Claude session control
- **Why**: Future web UI / mobile app requirement

### 5. Markdown Comment Parsing & Persistence ✅ COMPLETED
- **Question**: Best approach for tracking inline comments in markdown?
- **Detailed Research**: [Markdown Comment Parsing & Persistence](./2025-12-14-markdown-comment-parsing-persistence.md)
- **Key Findings**:
  - **Parser**: unified/remark ecosystem recommended for AST support and position tracking
  - **ID format**: nanoid (21 chars, URL-safe) for compact, readable comment identifiers
  - **Position tracking**: Anchor-based approach with contextual fallbacks (preceding text, nearest heading)
  - **Conflict resolution**: Last-write-wins with anchor recovery - file on disk is source of truth
  - **Comment syntax**: `<!-- hive-comment(nanoid): content -->` with closing tag

### 6. Window Management Patterns in Tauri ✅ COMPLETED
- **Question**: Best practices for tmux-like window management?
- **Detailed Research**: [Tauri Window Management Patterns](./2025-12-14-tauri-window-management-patterns.md)
- **Key Findings**:
  - **Recommendation**: Single window with frontend-managed panes using `react-resizable-panels`
  - Better performance (single WebView process), simpler state management, cross-platform consistency
  - Use `tauri-plugin-window-state` for native window state, `tauri-plugin-store` for custom layout persistence
  - Global shortcuts: `tauri-plugin-global-shortcut`; In-app shortcuts: native React handlers with tmux-style prefix
  - Multiple windows can be added later for "pop-out" functionality
- **Libraries Recommended**:
  - `react-resizable-panels` - Primary split pane library (accessible, auto-persistence, 5k+ stars)
  - `react-mosaic` - Alternative for complex IDE-like tiling layouts

### 7. Opcode (Claudia) Deep Dive
- **Question**: What can we learn/reuse from the existing implementation?
- **Areas to explore**:
  - Their session management approach
  - Database schema for projects and sessions
  - How they handle Claude Code subprocess management
  - Licensing and code reuse possibilities
- **Why**: Avoid reinventing the wheel, learn from existing patterns
