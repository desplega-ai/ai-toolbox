<p align="center">
  <img src="public/hive_logo.png" alt="Hive Logo" width="128" height="128">
</p>

# Hive

A macOS desktop application for managing Claude Code sessions with an intuitive GUI.

## What is Hive?

Hive is an Electron-based desktop app that wraps the Claude Agent SDK, providing a visual interface for running Claude Code sessions. It supports multi-tab workflows, permission management, a thoughts/notes pane, git diff viewing, and native notifications.

Built with:
- Electron + Vite + React + TypeScript
- Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`)
- SQLite (better-sqlite3) for local storage at `~/.hive/`
- Solarized theme with shadcn/ui components

## Core Features

- **Session Management** - Create, run, resume, and interrupt Claude sessions
- **Multi-Tab Interface** - Independent tabs for different projects/sessions
- **Permission System** - Approve/deny tool usage with hash-based pre-approval
- **Thoughts Pane** - Monaco markdown editor for project notes with comment system
- **Diff Tab** - View git changes made during a session with side-by-side diff
- **Model Selection** - Choose Opus, Sonnet, or Haiku per session
- **Native Notifications** - Alerts when input is required or tasks complete
- **Theme Support** - Solarized Light/Dark themes

## Installation & Running Locally

```bash
# Install dependencies
pnpm install

# Start development mode
pnpm start

# Package for distribution
pnpm make
```

Data is stored at `~/.hive/` (database, preferences, auth config).

## Research & Documentation

Implementation plans and research documents are in:
- `thoughts/shared/plans/2025-12-15-hive-v0.1-foundation-setup.md` - Foundation setup
- `thoughts/shared/plans/2025-12-15-hive-v0.2-claude-sdk-integration.md` - Claude SDK integration
- `thoughts/shared/plans/2025-12-15-hive-phase-8-thoughts-pane.md` - Thoughts pane
- `thoughts/shared/plans/2025-12-15-hive-phase-9-diff-tab.md` - Diff tab

External resources:
- [Claude Agent SDK](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk)
- [Electron Forge](https://www.electronforge.io/)
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3)

## License

MIT License - desplega labs 2025-2026
