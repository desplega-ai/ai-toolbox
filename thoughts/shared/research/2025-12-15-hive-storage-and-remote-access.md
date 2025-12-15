---
date: 2025-12-15T15:00:00Z
researcher: Claude
git_commit: 9e21b0505afee30a99059894d8956b2bc374d1c2
branch: main
repository: ai-toolbox
topic: "Hive Storage Architecture and Remote Access via Localtunnel"
tags: [research, hive, electron, storage, sqlite, json, localtunnel, authentication]
status: complete
last_updated: 2025-12-15
last_updated_by: Claude
related_research: ["2025-12-15-hive-electron-app-research.md"]
---

# Research: Hive Storage Architecture and Remote Access via Localtunnel

**Date**: 2025-12-15T15:00:00Z
**Researcher**: Claude
**Git Commit**: 9e21b0505afee30a99059894d8956b2bc374d1c2
**Branch**: main
**Repository**: ai-toolbox

## Research Question

How should Hive (Electron app) implement local persisted storage at `~/.hive/` and expose a server via localtunnel for mobile/web clients with static domains and authentication?

## Summary

**Storage Recommendation**: Hybrid approach
- **`~/.hive/hive.db`** (SQLite via `better-sqlite3`) for relational data (projects, sessions, worktrees)
- **`~/.hive/preferences.json`** (electron-store) for simple user preferences

**Remote Access**: The desplega-ai/localtunnel fork provides HTTP Basic Auth but **NOT** persistent subdomains. For reliable static URLs, consider self-hosting localtunnel-server or using alternatives like Cloudflare Tunnels.

**Authentication**: PIN-based device pairing with JWT tokens for long-lived sessions.

---

## Detailed Findings

### 1. Storage Architecture

#### Recommended Structure: `~/.hive/`

```
~/.hive/
├── hive.db                    # SQLite database (better-sqlite3)
├── hive.db-wal               # WAL journal (auto-created)
├── hive.db-shm               # Shared memory (auto-created)
├── preferences.json          # electron-store user prefs
├── paired-devices.json       # Device registry (or in SQLite)
└── logs/                     # Application logs
    └── hive-YYYY-MM-DD.log
```

#### SQLite vs JSON Decision Matrix

| Factor | SQLite (better-sqlite3) | JSON (electron-store) |
|--------|-------------------------|----------------------|
| **Query performance** | O(log n) with indexes | O(n) full scan |
| **Complex queries** | JOINs, filtering, sorting | Manual implementation |
| **Concurrency** | WAL mode handles multi-window | File-level conflicts |
| **Data relationships** | Foreign keys, cascades | Manual enforcement |
| **Migration** | Schema migrations | Version field + manual |
| **Bundle size** | +2-3MB (native) | +50KB (JS only) |
| **Setup complexity** | Needs electron-rebuild | Zero config |

**Verdict**: Use SQLite for hundreds of sessions/projects. Use JSON for simple preferences.

#### SQLite Schema for Hive

```sql
-- ~/.hive/hive.db schema

CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  directory TEXT NOT NULL UNIQUE,
  settings TEXT DEFAULT '{}',        -- JSON blob
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  claude_session_id TEXT,            -- Points to ~/.claude/projects/.../xxx.jsonl
  name TEXT NOT NULL,
  action_type TEXT CHECK(action_type IN ('research', 'plan', 'implement', 'freeform')),
  status TEXT DEFAULT 'idle' CHECK(status IN ('idle', 'running', 'awaiting_input', 'error')),
  metadata TEXT DEFAULT '{}',
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE TABLE worktrees (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  path TEXT NOT NULL UNIQUE,
  branch TEXT NOT NULL,
  description TEXT,
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE TABLE paired_devices (
  id TEXT PRIMARY KEY,
  name TEXT,
  platform TEXT,                     -- 'ios', 'android', 'web'
  paired_at INTEGER DEFAULT (strftime('%s', 'now')),
  last_seen_at INTEGER,
  revoked BOOLEAN DEFAULT FALSE
);

-- Indexes for common queries
CREATE INDEX idx_sessions_project ON sessions(project_id);
CREATE INDEX idx_sessions_status ON sessions(status);
CREATE INDEX idx_worktrees_project ON worktrees(project_id);
```

#### Implementation with better-sqlite3

```typescript
// src/main/database.ts
import Database from 'better-sqlite3';
import { app } from 'electron';
import path from 'path';
import fs from 'fs';

const HIVE_DIR = path.join(app.getPath('home'), '.hive');
const DB_PATH = path.join(HIVE_DIR, 'hive.db');

// Ensure directory exists
if (!fs.existsSync(HIVE_DIR)) {
  fs.mkdirSync(HIVE_DIR, { recursive: true });
}

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrency (multiple windows)
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS projects (...);
  CREATE TABLE IF NOT EXISTS sessions (...);
  ...
`);

// Prepared statements for performance
export const queries = {
  getAllProjects: db.prepare(`
    SELECT * FROM projects ORDER BY updated_at DESC
  `),

  getSessionsByProject: db.prepare(`
    SELECT * FROM sessions WHERE project_id = ? ORDER BY updated_at DESC
  `),

  getActiveSession: db.prepare(`
    SELECT s.*, p.name as project_name, p.directory
    FROM sessions s
    JOIN projects p ON s.project_id = p.id
    WHERE s.status IN ('running', 'awaiting_input')
    ORDER BY s.updated_at DESC
    LIMIT 1
  `),

  searchSessions: db.prepare(`
    SELECT s.*, p.name as project_name
    FROM sessions s
    JOIN projects p ON s.project_id = p.id
    WHERE s.name LIKE ? OR p.name LIKE ?
    ORDER BY s.updated_at DESC
    LIMIT ?
  `),
};

export { db };
```

#### User Preferences with electron-store

```typescript
// src/main/preferences.ts
import Store from 'electron-store';
import path from 'path';
import { app } from 'electron';

interface PreferencesSchema {
  theme: 'light' | 'dark' | 'system';
  defaultModel: string;
  defaultActionType: 'research' | 'plan' | 'implement' | 'freeform';
  recentDirectories: string[];
  tunnel: {
    enabled: boolean;
    subdomain?: string;
  };
  notifications: {
    inputRequired: boolean;
    sessionComplete: boolean;
  };
}

export const preferences = new Store<PreferencesSchema>({
  name: 'preferences',
  cwd: path.join(app.getPath('home'), '.hive'),
  defaults: {
    theme: 'system',
    defaultModel: 'claude-sonnet-4-5',
    defaultActionType: 'freeform',
    recentDirectories: [],
    tunnel: { enabled: false },
    notifications: { inputRequired: true, sessionComplete: true }
  }
});
```

---

### 2. Claude Session Storage Reference

Claude Code stores sessions at `~/.claude/projects/[encoded-path]/[sessionId].jsonl`. Hive should **not** duplicate this data but store pointers:

```typescript
interface ClaudeSessionRef {
  // Stored in Hive's SQLite
  id: string;                    // Our internal ID
  claudeSessionId: string;       // UUID from Claude's JSONL filename
  projectPath: string;           // Absolute path to project

  // Derived from Claude's JSONL when needed
  // Located at: ~/.claude/projects/{encodedPath}/{claudeSessionId}.jsonl
}
```

**Key insight**: Claude session IDs (UUIDs) can be used with `claude --resume <sessionId>` to continue sessions programmatically.

---

### 3. Remote Access via Localtunnel

#### desplega-ai/localtunnel (Self-Hosted)

**Package**: `@desplega.ai/localtunnel`
**Server**: `https://lt.desplega.ai` (self-hosted by user)

**CLI Example**:
```bash
bunx @desplega.ai/localtunnel --port 5005 --host https://lt.desplega.ai -s test-12345 --print-requests
```

**What the self-hosted server provides**:
- HTTP Basic Auth (server-side implementation)
- Full control over subdomain reservation
- Static subdomains per user (implementable on server)
- Compatible with standard `lt` client

**Key advantage**: Since you control the server, subdomain persistence is a server-side concern, not a client limitation.

#### Tunnel Integration

Based on the pattern from [qa-use/lib/tunnel/index.ts](https://github.com/desplega-ai/qa-use/blob/main/lib/tunnel/index.ts):

```typescript
// src/main/tunnel-manager.ts
import localtunnel from '@desplega.ai/localtunnel';
import { BrowserWindow } from 'electron';
import crypto from 'crypto';

interface TunnelSession {
  tunnel: ReturnType<typeof localtunnel> | null;
  publicUrl: string | null;
  localPort: number;
  isActive: boolean;
  host: string;
}

interface TunnelOptions {
  subdomain?: string;
  localHost?: string;
  userSecret?: string;  // User's unique secret for deterministic subdomain
}

const DEFAULT_HOST = 'https://lt.desplega.ai';

class TunnelManager {
  private session: TunnelSession = {
    tunnel: null,
    publicUrl: null,
    localPort: 0,
    isActive: false,
    host: DEFAULT_HOST,
  };

  /**
   * Generate deterministic subdomain from user secret
   * Same secret always produces same subdomain
   */
  private generateSubdomain(userSecret: string): string {
    const hash = crypto.createHash('sha256').update(userSecret).digest('hex');
    return `hive-${hash.substring(0, 12)}`;
  }

  async startTunnel(
    port: number,
    options: TunnelOptions,
    mainWindow: BrowserWindow
  ): Promise<string> {
    if (this.session.isActive) {
      await this.stopTunnel();
    }

    const host = process.env.TUNNEL_HOST || DEFAULT_HOST;

    // Deterministic subdomain from user secret, or custom, or random
    const subdomain = options.subdomain
      || (options.userSecret ? this.generateSubdomain(options.userSecret) : undefined);

    const tunnel = await localtunnel({
      port,
      host,
      subdomain,
      local_host: options.localHost || 'localhost',
      auth: true,  // Enable server-side auth on lt.desplega.ai
    });

    this.session = {
      tunnel,
      publicUrl: tunnel.url,
      localPort: port,
      isActive: true,
      host,
    };

    tunnel.on('close', () => {
      this.session.isActive = false;
      this.session.publicUrl = null;
      mainWindow.webContents.send('tunnel:closed');
    });

    tunnel.on('error', (err: Error) => {
      mainWindow.webContents.send('tunnel:error', err.message);
    });

    return tunnel.url;
  }

  async stopTunnel(): Promise<void> {
    if (this.session.tunnel) {
      this.session.tunnel.close();
      this.session.tunnel = null;
      this.session.isActive = false;
      this.session.publicUrl = null;
    }
  }

  async checkHealth(): Promise<boolean> {
    if (!this.session.publicUrl) return false;

    try {
      const response = await fetch(this.session.publicUrl, { method: 'HEAD' });
      // 426 = Upgrade Required (WebSocket), also valid
      return response.status === 200 || response.status === 426;
    } catch {
      return false;
    }
  }

  getPublicUrl(): string | null {
    return this.session.publicUrl;
  }

  isActive(): boolean {
    return this.session.isActive;
  }
}

export const tunnelManager = new TunnelManager();
```

#### Subdomain Strategy

Three approaches supported:

1. **Deterministic** (recommended): Hash user's unique secret → same subdomain every time
   ```typescript
   // User secret stored in keytar, generates: hive-a1b2c3d4e5f6
   tunnelManager.startTunnel(3000, { userSecret: 'user-unique-id' }, mainWindow);
   ```

2. **Custom**: User-provided subdomain stored in preferences
   ```typescript
   tunnelManager.startTunnel(3000, { subdomain: 'taras-hive' }, mainWindow);
   ```

3. **Random**: Fallback if no subdomain specified (not recommended for Hive)

#### Server-Side Auth

When `auth: true` is passed, the tunnel returns a URL with Basic Auth credentials embedded:

```
https://hi:generated-password@hive-xxx.lt.desplega.ai
```

This means:
- **No separate auth layer needed** - credentials are in the URL
- **Pairing is URL sharing** - QR code or magic link containing the full URL
- **Password changes on reconnect** - mobile needs updated URL if tunnel restarts

#### Mobile Pairing Flow

```typescript
// Desktop: Generate QR code with authenticated URL
import QRCode from 'qrcode';

async function generatePairingQR(): Promise<string> {
  const url = tunnelManager.getPublicUrl();  // Already includes auth
  if (!url) throw new Error('Tunnel not active');

  // Generate QR code data URL for display
  return QRCode.toDataURL(url);
}

// Or generate magic link for sharing
function getMagicLink(): string {
  const url = tunnelManager.getPublicUrl();
  // Optionally encode for cleaner sharing: hive://connect?url=base64(url)
  return `hive://connect?url=${Buffer.from(url).toString('base64url')}`;
}
```

```typescript
// Mobile: Decode and connect
function parseHiveLink(magicLink: string): string {
  const url = new URL(magicLink);
  const encoded = url.searchParams.get('url');
  return Buffer.from(encoded, 'base64url').toString('utf-8');
}
```

**UX consideration**: Since password changes on tunnel restart, mobile should gracefully handle 401 errors and prompt user to re-scan QR.

---

### 4. Authentication Flow for Mobile/Web Clients

Since the tunnel URL includes Basic Auth credentials, the pairing flow is simple:

#### Pairing Flow

1. **Desktop**: User clicks "Connect Mobile" → Shows QR code containing authenticated tunnel URL
2. **Mobile**: Scans QR → Stores URL (with embedded credentials)
3. **Connection**: Mobile makes requests to the URL - Basic Auth handled automatically
4. **Reconnection**: If tunnel restarts (new password), mobile gets 401 → prompts re-scan

#### Device Tracking (Optional)

If you want to track paired devices for audit/revocation:

```typescript
// src/main/devices.ts
import { db } from './database';
import { nanoid } from 'nanoid';

export function registerDevice(info: { name: string; platform: string; userAgent: string }) {
  const id = nanoid();
  db.prepare(`
    INSERT INTO paired_devices (id, name, platform, paired_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, info.name, info.platform, Date.now(), Date.now());
  return id;
}

export function updateLastSeen(deviceId: string) {
  db.prepare('UPDATE paired_devices SET last_seen_at = ? WHERE id = ?')
    .run(Date.now(), deviceId);
}

export function revokeDevice(deviceId: string) {
  // Note: Can't actually revoke access since auth is in tunnel URL
  // Would need to restart tunnel with new password to force re-auth
  db.prepare('UPDATE paired_devices SET revoked = TRUE WHERE id = ?')
    .run(deviceId);
}
```

**Note**: True device revocation requires restarting the tunnel (generates new password). Track devices for UX/audit, but understand the security model.

---

### 5. Complete Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Hive Electron App                            │
├─────────────────────────────────────────────────────────────────────┤
│  Main Process                                                       │
│  ├── database.ts        → SQLite (better-sqlite3) at ~/.hive/hive.db│
│  ├── preferences.ts     → JSON (electron-store) at ~/.hive/         │
│  ├── tunnel-manager.ts  → @desplega.ai/localtunnel                  │
│  ├── auth.ts            → PIN pairing + JWT                         │
│  ├── server.ts          → Express/Socket.IO for mobile API          │
│  └── claude-sdk.ts      → @anthropic-ai/claude-agent-sdk            │
├─────────────────────────────────────────────────────────────────────┤
│  Storage                                                            │
│  ~/.hive/                                                           │
│  ├── hive.db            → Projects, sessions, worktrees, devices    │
│  ├── hive.db-wal        → SQLite WAL journal                        │
│  └── preferences.json   → Theme, defaults, tunnel settings          │
│                                                                     │
│  ~/.claude/                                                         │
│  └── projects/          → Actual Claude session JSONL files         │
│      └── {path}/                                                    │
│          └── {sessionId}.jsonl                                      │
├─────────────────────────────────────────────────────────────────────┤
│  Remote Access                                                      │
│                                                                     │
│  Desktop ──► localtunnel ──► https://hive-xxx.lt.desplega.ai       │
│                    │                                                │
│                    └──► Mobile/Web (Bearer JWT auth)                │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Decisions Made

1. **Storage**: Hybrid SQLite (`~/.hive/hive.db`) + electron-store (`~/.hive/preferences.json`)
2. **Location**: `~/.hive/` for all Hive data
3. **Claude sessions**: Store pointers (session IDs), not copies
4. **Tunneling**: `@desplega.ai/localtunnel` with `auth: true` → URL contains Basic Auth
5. **Mobile pairing**: QR code / magic link with authenticated tunnel URL
6. **Subdomain**: Deterministic from user secret (SHA-256 hash)

## Open Questions (Deferred)

1. **Offline mode**: How should mobile handle desktop offline? Cached data? Push notification when back?
2. **Multi-user**: Single-user assumption OK for v1?
3. **Device revocation UX**: Restart tunnel to invalidate all devices, or accept shared-secret model?

## NPM Packages

| Purpose | Package |
|---------|---------|
| SQLite | `better-sqlite3` |
| SQLite types | `@types/better-sqlite3` |
| Rebuild for Electron | `@electron/rebuild` |
| User preferences | `electron-store` |
| Tunneling | `@desplega.ai/localtunnel` |
| Unique IDs | `nanoid` |
| QR codes | `qrcode` |
| HTTP server | `express` |
| WebSocket | `socket.io` |
| Security headers | `helmet` |

## External Resources

- [better-sqlite3 with Electron](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/troubleshooting.md)
- [electron-store](https://github.com/sindresorhus/electron-store)
- [desplega-ai/localtunnel](https://github.com/desplega-ai/localtunnel)
- [Claude Session Storage](~/.claude/projects/)
- [keytar for Electron](https://github.com/atom/node-keytar)
