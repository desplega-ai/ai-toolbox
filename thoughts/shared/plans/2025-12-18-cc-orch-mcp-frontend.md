# CC-Orch-MCP Frontend Implementation Plan

## Overview

Build a Bloomberg terminal-style dashboard for monitoring and managing AI agent swarms. The frontend will be a React SPA using Joy UI (MUI), React Query, and Vite, deployed to Vercel from `cc-orch-mcp/ui/`. The design emphasizes data density, neon accents, glowing status indicators, and smooth animations.

## Current State Analysis

### Backend (`cc-orch-mcp/src/http.ts`)
- Node.js `createHttpServer` with manual routing
- CORS enabled globally via `setCorsHeaders()`
- Optional Bearer token auth (when `API_KEY` env is set)
- Existing endpoints: `/health`, `/me`, `/ping`, `/close`, `/mcp`

### Database Functions Available (`cc-orch-mcp/src/be/db.ts`)
| Function | Returns | Notes |
|----------|---------|-------|
| `getAllAgents()` | `Agent[]` | Ordered by name |
| `getAgentById(id)` | `Agent \| null` | |
| `getAllAgentsWithTasks()` | `AgentWithTasks[]` | Agent + tasks array |
| `getAgentWithTasks(id)` | `AgentWithTasks \| null` | |
| `getAllTasks(status?)` | `AgentTask[]` | Optional status filter |
| `getTaskById(id)` | `AgentTask \| null` | |
| `getTasksByAgentId(agentId)` | `AgentTask[]` | |
| `getAllLogs(limit?)` | `AgentLog[]` | Optional limit, DESC order |
| `getLogsByAgentId(agentId)` | `AgentLog[]` | |
| `getLogsByTaskId(taskId)` | `AgentLog[]` | |
| `getLogsByTaskIdChronological(taskId)` | `AgentLog[]` | ASC order |

### Types (`cc-orch-mcp/src/types.ts`)
- `Agent`: id, name, isLead, status (idle/busy/offline), createdAt, lastUpdatedAt
- `AgentTask`: id, agentId, task, status (pending/in_progress/completed/failed), progress, output, failureReason, timestamps
- `AgentLog`: id, eventType, agentId?, taskId?, oldValue?, newValue?, metadata?, createdAt

## Desired End State

A single-page dashboard application with:

1. **Config Modal** (blocking on first load)
   - API URL input (default: `https://desplega.sh`)
   - API Key input (optional, for authenticated servers)
   - Save to localStorage
   - "Reset to Defaults" button
   - Accessible via settings icon in top-right corner

2. **Bloomberg-Style Dashboard**
   - Dark theme with neon green/cyan/amber accents
   - Data-dense grid layout
   - Glowing status indicators with pulse animations
   - Real-time auto-refresh (5-second polling)
   - In-page drill-downs (expandable sections)

3. **Dashboard Sections**
   - **Header**: Title, connection status indicator, settings icon
   - **Stats Bar**: Quick counts (total agents, active tasks, etc.) with animated counters
   - **Agents Panel**: List of agents with status badges, expandable to show tasks
   - **Tasks Panel**: Filterable task list, expandable to show details + logs
   - **Activity Feed**: Recent log entries (scrolling ticker style)

### Verification
- Frontend loads and displays config modal on first visit
- After config, dashboard fetches and displays data
- Status indicators animate correctly
- Drill-downs expand in-place
- Settings icon re-opens config modal
- Reset to defaults clears localStorage and resets form

## What We're NOT Doing

- Creating/deleting agents or tasks (read-only dashboard)
- User authentication system (just API key storage)
- Multiple pages/routing (single dashboard view)
- WebSocket real-time updates (polling is sufficient)
- Mobile-responsive design (desktop-focused like Bloomberg)
- Deployment automation (manual Vercel setup)

## Implementation Approach

We'll implement in 4 phases:
1. **Phase 1**: Backend REST endpoints
2. **Phase 2**: Frontend project setup
3. **Phase 3**: Core components (config modal, layout, panels)
4. **Phase 4**: Polish (animations, Bloomberg styling, activity feed)

---

## Phase 1: Backend REST Endpoints

### Overview
Add REST endpoints to expose agent swarm data. No authentication header required (uses existing Bearer token flow if API_KEY is set).

### Changes Required:

#### 1. Update HTTP Server
**File**: `cc-orch-mcp/src/http.ts`

**Add imports** (after line 11):
```typescript
import {
  closeDb,
  getAgentById,
  getAllAgents,
  getAllAgentsWithTasks,
  getAgentWithTasks,
  getAllTasks,
  getTaskById,
  getAllLogs,
  getLogsByAgentId,
  getLogsByTaskId,
  getDb,
  updateAgentStatus,
} from "./be/db";
```

**Add helper function** (after `setCorsHeaders` function, around line 37):
```typescript
function parseQueryParams(url: string): URLSearchParams {
  const queryIndex = url.indexOf("?");
  if (queryIndex === -1) return new URLSearchParams();
  return new URLSearchParams(url.slice(queryIndex + 1));
}

function getPathSegments(url: string): string[] {
  const pathEnd = url.indexOf("?");
  const path = pathEnd === -1 ? url : url.slice(0, pathEnd);
  return path.split("/").filter(Boolean);
}
```

**Add REST endpoints** (after the `/close` endpoint, before the `/mcp` check at line 169):

```typescript
  // ============================================================================
  // REST API Endpoints (for frontend dashboard)
  // ============================================================================

  const pathSegments = getPathSegments(req.url || "");
  const queryParams = parseQueryParams(req.url || "");

  // GET /api/agents - List all agents (optionally with tasks)
  if (req.method === "GET" && pathSegments[0] === "api" && pathSegments[1] === "agents" && !pathSegments[2]) {
    const includeTasks = queryParams.get("include") === "tasks";
    const agents = includeTasks ? getAllAgentsWithTasks() : getAllAgents();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ agents }));
    return;
  }

  // GET /api/agents/:id - Get single agent (optionally with tasks)
  if (req.method === "GET" && pathSegments[0] === "api" && pathSegments[1] === "agents" && pathSegments[2]) {
    const agentId = pathSegments[2];
    const includeTasks = queryParams.get("include") === "tasks";
    const agent = includeTasks ? getAgentWithTasks(agentId) : getAgentById(agentId);

    if (!agent) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Agent not found" }));
      return;
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(agent));
    return;
  }

  // GET /api/tasks - List all tasks (optionally filtered by status)
  if (req.method === "GET" && pathSegments[0] === "api" && pathSegments[1] === "tasks" && !pathSegments[2]) {
    const status = queryParams.get("status") as import("./types").AgentTaskStatus | null;
    const tasks = getAllTasks(status || undefined);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ tasks }));
    return;
  }

  // GET /api/tasks/:id - Get single task with logs
  if (req.method === "GET" && pathSegments[0] === "api" && pathSegments[1] === "tasks" && pathSegments[2]) {
    const taskId = pathSegments[2];
    const task = getTaskById(taskId);

    if (!task) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Task not found" }));
      return;
    }

    const logs = getLogsByTaskId(taskId);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ...task, logs }));
    return;
  }

  // GET /api/logs - List recent logs
  if (req.method === "GET" && pathSegments[0] === "api" && pathSegments[1] === "logs") {
    const limitParam = queryParams.get("limit");
    const limit = limitParam ? parseInt(limitParam, 10) : 100;
    const logs = getAllLogs(limit);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ logs }));
    return;
  }

  // GET /api/stats - Dashboard summary stats
  if (req.method === "GET" && pathSegments[0] === "api" && pathSegments[1] === "stats") {
    const agents = getAllAgents();
    const tasks = getAllTasks();

    const stats = {
      agents: {
        total: agents.length,
        idle: agents.filter(a => a.status === "idle").length,
        busy: agents.filter(a => a.status === "busy").length,
        offline: agents.filter(a => a.status === "offline").length,
      },
      tasks: {
        total: tasks.length,
        pending: tasks.filter(t => t.status === "pending").length,
        in_progress: tasks.filter(t => t.status === "in_progress").length,
        completed: tasks.filter(t => t.status === "completed").length,
        failed: tasks.filter(t => t.status === "failed").length,
      },
    };

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(stats));
    return;
  }
```

### Success Criteria:

#### Automated Verification:
- [x] REST endpoints added to http.ts
- [ ] Server starts without errors: `cd cc-orch-mcp && bun run src/http.ts`
- [ ] Health check works: `curl http://localhost:3013/health`
- [ ] Agents endpoint works: `curl http://localhost:3013/api/agents`
- [ ] Tasks endpoint works: `curl http://localhost:3013/api/tasks`
- [ ] Logs endpoint works: `curl http://localhost:3013/api/logs`
- [ ] Stats endpoint works: `curl http://localhost:3013/api/stats`
- [ ] TypeScript compiles: `cd cc-orch-mcp && bun run tsc:check`

#### Manual Verification:
- [ ] Test with auth: Set `API_KEY=test` and verify `Authorization: Bearer test` header works
- [ ] Verify query params work: `curl "http://localhost:3013/api/agents?include=tasks"`
- [ ] Verify status filter: `curl "http://localhost:3013/api/tasks?status=pending"`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to Phase 2.

---

## Phase 2: Frontend Project Setup

### Overview
Initialize the React SPA with Vite, Joy UI, React Query, and Tailwind CSS in `cc-orch-mcp/ui/`.

### Changes Required:

#### 1. Create Project Structure
**Directory**: `cc-orch-mcp/ui/`

```
cc-orch-mcp/ui/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── vercel.json
├── index.html
├── postcss.config.js
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── index.css
│   ├── lib/
│   │   ├── api.ts           # API client with fetch
│   │   ├── config.ts        # Config storage (localStorage)
│   │   └── theme.ts         # Joy UI Bloomberg theme
│   ├── hooks/
│   │   ├── useConfig.ts     # Config modal state
│   │   └── queries.ts       # React Query hooks
│   ├── components/
│   │   ├── ConfigModal.tsx
│   │   ├── Dashboard.tsx
│   │   ├── Header.tsx
│   │   ├── StatsBar.tsx
│   │   ├── AgentsPanel.tsx
│   │   ├── TasksPanel.tsx
│   │   ├── ActivityFeed.tsx
│   │   └── StatusBadge.tsx
│   └── types/
│       └── api.ts           # API response types
```

#### 2. Package.json
**File**: `cc-orch-mcp/ui/package.json`

```json
{
  "name": "agent-swarm-ui",
  "private": true,
  "version": "0.0.1",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "typecheck": "tsc --noEmit",
    "preview": "vite preview"
  },
  "dependencies": {
    "@emotion/react": "^11.14.0",
    "@emotion/styled": "^11.14.0",
    "@mui/joy": "^5.0.0-beta.51",
    "@tanstack/react-query": "^5.62.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.4",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.49",
    "tailwindcss": "^3.4.17",
    "typescript": "^5.7.2",
    "vite": "^6.0.3"
  }
}
```

#### 3. Vite Config
**File**: `cc-orch-mcp/ui/vite.config.ts`

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      "/api": {
        target: "http://localhost:3013",
        changeOrigin: true,
      },
    },
  },
});
```

#### 4. TypeScript Config
**File**: `cc-orch-mcp/ui/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "esModuleInterop": true
  },
  "include": ["src"]
}
```

#### 5. Vercel Config
**File**: `cc-orch-mcp/ui/vercel.json`

```json
{
  "buildCommand": "pnpm run build",
  "installCommand": "pnpm install",
  "outputDirectory": "dist",
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

#### 6. HTML Entry
**File**: `cc-orch-mcp/ui/index.html`

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Agent Swarm Dashboard</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

#### 7. PostCSS Config
**File**: `cc-orch-mcp/ui/postcss.config.js`

```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

#### 8. Tailwind Config
**File**: `cc-orch-mcp/ui/tailwind.config.js`

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        terminal: {
          bg: "#0a0a0a",
          surface: "#111111",
          border: "#1a1a1a",
          green: "#00ff88",
          cyan: "#00d4ff",
          amber: "#ffaa00",
          red: "#ff4444",
          dimmed: "#666666",
        },
      },
      fontFamily: {
        mono: ["JetBrains Mono", "monospace"],
        sans: ["Inter", "sans-serif"],
      },
      animation: {
        pulse: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        glow: "glow 2s ease-in-out infinite alternate",
      },
      keyframes: {
        glow: {
          "0%": { boxShadow: "0 0 5px currentColor, 0 0 10px currentColor" },
          "100%": { boxShadow: "0 0 10px currentColor, 0 0 20px currentColor, 0 0 30px currentColor" },
        },
      },
    },
  },
  plugins: [],
};
```

#### 9. Main Entry
**File**: `cc-orch-mcp/ui/src/main.tsx`

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { CssVarsProvider } from "@mui/joy/styles";
import CssBaseline from "@mui/joy/CssBaseline";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { theme } from "./lib/theme";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchInterval: 5000, // Auto-refresh every 5 seconds
      staleTime: 2000,
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <CssVarsProvider theme={theme} defaultMode="dark">
        <CssBaseline />
        <App />
      </CssVarsProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
```

#### 10. Index CSS
**File**: `cc-orch-mcp/ui/src/index.css`

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  font-family: "Inter", sans-serif;
  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

body {
  margin: 0;
  background: #0a0a0a;
  color: #ffffff;
  min-height: 100vh;
}

/* Bloomberg-style scrollbar */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: #0a0a0a;
}

::-webkit-scrollbar-thumb {
  background: #333;
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: #444;
}

/* Glowing text effect */
.glow-green {
  text-shadow: 0 0 10px #00ff88, 0 0 20px #00ff88;
}

.glow-cyan {
  text-shadow: 0 0 10px #00d4ff, 0 0 20px #00d4ff;
}

.glow-amber {
  text-shadow: 0 0 10px #ffaa00, 0 0 20px #ffaa00;
}

.glow-red {
  text-shadow: 0 0 10px #ff4444, 0 0 20px #ff4444;
}
```

#### 11. Joy UI Theme
**File**: `cc-orch-mcp/ui/src/lib/theme.ts`

```typescript
import { extendTheme } from "@mui/joy/styles";

export const theme = extendTheme({
  colorSchemes: {
    dark: {
      palette: {
        background: {
          body: "#0a0a0a",
          surface: "#111111",
          level1: "#1a1a1a",
          level2: "#222222",
          level3: "#2a2a2a",
        },
        text: {
          primary: "#ffffff",
          secondary: "#888888",
          tertiary: "#666666",
        },
        primary: {
          50: "#e6fff5",
          100: "#b3ffe0",
          200: "#80ffcc",
          300: "#4dffb8",
          400: "#1affa3",
          500: "#00ff88", // Main terminal green
          600: "#00cc6d",
          700: "#009952",
          800: "#006637",
          900: "#00331c",
        },
        success: {
          500: "#00ff88",
        },
        warning: {
          500: "#ffaa00",
        },
        danger: {
          500: "#ff4444",
        },
        neutral: {
          50: "#f5f5f5",
          100: "#e0e0e0",
          200: "#c0c0c0",
          300: "#a0a0a0",
          400: "#808080",
          500: "#666666",
          600: "#4d4d4d",
          700: "#333333",
          800: "#1a1a1a",
          900: "#0a0a0a",
        },
      },
    },
  },
  fontFamily: {
    body: "'Inter', sans-serif",
    display: "'Inter', sans-serif",
    code: "'JetBrains Mono', monospace",
  },
  components: {
    JoyCard: {
      styleOverrides: {
        root: {
          backgroundColor: "#111111",
          borderColor: "#1a1a1a",
          borderWidth: "1px",
          borderStyle: "solid",
        },
      },
    },
    JoyInput: {
      styleOverrides: {
        root: {
          fontFamily: "'JetBrains Mono', monospace",
        },
      },
    },
    JoyButton: {
      styleOverrides: {
        root: {
          fontWeight: 600,
        },
      },
    },
  },
});
```

#### 12. App Component (placeholder)
**File**: `cc-orch-mcp/ui/src/App.tsx`

```tsx
import { useState, useEffect } from "react";
import Box from "@mui/joy/Box";
import { getConfig } from "./lib/config";
import ConfigModal from "./components/ConfigModal";
import Dashboard from "./components/Dashboard";

export default function App() {
  const [configOpen, setConfigOpen] = useState(false);
  const [isConfigured, setIsConfigured] = useState(false);

  useEffect(() => {
    const config = getConfig();
    if (!config.apiUrl) {
      setConfigOpen(true);
    } else {
      setIsConfigured(true);
    }
  }, []);

  const handleConfigSave = () => {
    setConfigOpen(false);
    setIsConfigured(true);
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        bgcolor: "background.body",
      }}
    >
      <ConfigModal
        open={configOpen || !isConfigured}
        onClose={() => isConfigured && setConfigOpen(false)}
        onSave={handleConfigSave}
        blocking={!isConfigured}
      />
      {isConfigured && (
        <Dashboard onSettingsClick={() => setConfigOpen(true)} />
      )}
    </Box>
  );
}
```

#### 13. Config Storage
**File**: `cc-orch-mcp/ui/src/lib/config.ts`

```typescript
const STORAGE_KEY = "agent-swarm-config";

export interface Config {
  apiUrl: string;
  apiKey: string;
}

const DEFAULT_CONFIG: Config = {
  apiUrl: "https://desplega.sh",
  apiKey: "",
};

export function getConfig(): Config {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...DEFAULT_CONFIG, ...JSON.parse(stored) };
    }
  } catch (e) {
    console.error("Failed to load config:", e);
  }
  return DEFAULT_CONFIG;
}

export function saveConfig(config: Config): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function resetConfig(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function getDefaultConfig(): Config {
  return { ...DEFAULT_CONFIG };
}
```

#### 14. API Types
**File**: `cc-orch-mcp/ui/src/types/api.ts`

```typescript
export type AgentStatus = "idle" | "busy" | "offline";
export type TaskStatus = "pending" | "in_progress" | "completed" | "failed";

export interface Agent {
  id: string;
  name: string;
  isLead: boolean;
  status: AgentStatus;
  createdAt: string;
  lastUpdatedAt: string;
}

export interface AgentTask {
  id: string;
  agentId: string;
  task: string;
  status: TaskStatus;
  createdAt: string;
  lastUpdatedAt: string;
  finishedAt?: string;
  failureReason?: string;
  output?: string;
  progress?: string;
}

export interface AgentWithTasks extends Agent {
  tasks: AgentTask[];
}

export interface AgentLog {
  id: string;
  eventType: string;
  agentId?: string;
  taskId?: string;
  oldValue?: string;
  newValue?: string;
  metadata?: string;
  createdAt: string;
}

export interface Stats {
  agents: {
    total: number;
    idle: number;
    busy: number;
    offline: number;
  };
  tasks: {
    total: number;
    pending: number;
    in_progress: number;
    completed: number;
    failed: number;
  };
}

// API Response wrappers
export interface AgentsResponse {
  agents: Agent[] | AgentWithTasks[];
}

export interface TasksResponse {
  tasks: AgentTask[];
}

export interface LogsResponse {
  logs: AgentLog[];
}

export interface TaskWithLogs extends AgentTask {
  logs: AgentLog[];
}
```

### Success Criteria:

#### Automated Verification:
- [ ] Dependencies install: `cd cc-orch-mcp/ui && pnpm install`
- [ ] TypeScript compiles: `cd cc-orch-mcp/ui && pnpm run typecheck`
- [ ] Vite dev server starts: `cd cc-orch-mcp/ui && pnpm run dev`
- [ ] Build succeeds: `cd cc-orch-mcp/ui && pnpm run build`

#### Manual Verification:
- [ ] Dev server accessible at http://localhost:5174
- [ ] Page loads without console errors
- [ ] Dark theme renders correctly

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to Phase 3.

---

## Phase 3: Core Components

### Overview
Implement the main UI components: ConfigModal, Header, Dashboard layout, StatsBar, AgentsPanel, and TasksPanel.

### Changes Required:

#### 1. API Client
**File**: `cc-orch-mcp/ui/src/lib/api.ts`

```typescript
import { getConfig } from "./config";
import type {
  AgentsResponse,
  TasksResponse,
  LogsResponse,
  Stats,
  AgentWithTasks,
  TaskWithLogs,
} from "../types/api";

class ApiClient {
  private getHeaders(): HeadersInit {
    const config = getConfig();
    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };
    if (config.apiKey) {
      headers["Authorization"] = `Bearer ${config.apiKey}`;
    }
    return headers;
  }

  private getBaseUrl(): string {
    const config = getConfig();
    // In development, use relative URL (proxied by Vite)
    // In production, use configured API URL
    if (import.meta.env.DEV && config.apiUrl === "http://localhost:3013") {
      return "";
    }
    return config.apiUrl;
  }

  async fetchAgents(includeTasks = true): Promise<AgentsResponse> {
    const url = `${this.getBaseUrl()}/api/agents${includeTasks ? "?include=tasks" : ""}`;
    const res = await fetch(url, { headers: this.getHeaders() });
    if (!res.ok) throw new Error(`Failed to fetch agents: ${res.status}`);
    return res.json();
  }

  async fetchAgent(id: string, includeTasks = true): Promise<AgentWithTasks> {
    const url = `${this.getBaseUrl()}/api/agents/${id}${includeTasks ? "?include=tasks" : ""}`;
    const res = await fetch(url, { headers: this.getHeaders() });
    if (!res.ok) throw new Error(`Failed to fetch agent: ${res.status}`);
    return res.json();
  }

  async fetchTasks(status?: string): Promise<TasksResponse> {
    const url = `${this.getBaseUrl()}/api/tasks${status ? `?status=${status}` : ""}`;
    const res = await fetch(url, { headers: this.getHeaders() });
    if (!res.ok) throw new Error(`Failed to fetch tasks: ${res.status}`);
    return res.json();
  }

  async fetchTask(id: string): Promise<TaskWithLogs> {
    const url = `${this.getBaseUrl()}/api/tasks/${id}`;
    const res = await fetch(url, { headers: this.getHeaders() });
    if (!res.ok) throw new Error(`Failed to fetch task: ${res.status}`);
    return res.json();
  }

  async fetchLogs(limit = 100): Promise<LogsResponse> {
    const url = `${this.getBaseUrl()}/api/logs?limit=${limit}`;
    const res = await fetch(url, { headers: this.getHeaders() });
    if (!res.ok) throw new Error(`Failed to fetch logs: ${res.status}`);
    return res.json();
  }

  async fetchStats(): Promise<Stats> {
    const url = `${this.getBaseUrl()}/api/stats`;
    const res = await fetch(url, { headers: this.getHeaders() });
    if (!res.ok) throw new Error(`Failed to fetch stats: ${res.status}`);
    return res.json();
  }

  async checkHealth(): Promise<{ status: string; version: string }> {
    const url = `${this.getBaseUrl()}/health`;
    const res = await fetch(url, { headers: this.getHeaders() });
    if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
    return res.json();
  }
}

export const api = new ApiClient();
```

#### 2. React Query Hooks
**File**: `cc-orch-mcp/ui/src/hooks/queries.ts`

```typescript
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { AgentWithTasks } from "../types/api";

export function useAgents() {
  return useQuery({
    queryKey: ["agents"],
    queryFn: () => api.fetchAgents(true),
    select: (data) => data.agents as AgentWithTasks[],
  });
}

export function useAgent(id: string) {
  return useQuery({
    queryKey: ["agent", id],
    queryFn: () => api.fetchAgent(id),
    enabled: !!id,
  });
}

export function useTasks(status?: string) {
  return useQuery({
    queryKey: ["tasks", status],
    queryFn: () => api.fetchTasks(status),
    select: (data) => data.tasks,
  });
}

export function useTask(id: string) {
  return useQuery({
    queryKey: ["task", id],
    queryFn: () => api.fetchTask(id),
    enabled: !!id,
  });
}

export function useLogs(limit = 50) {
  return useQuery({
    queryKey: ["logs", limit],
    queryFn: () => api.fetchLogs(limit),
    select: (data) => data.logs,
  });
}

export function useStats() {
  return useQuery({
    queryKey: ["stats"],
    queryFn: () => api.fetchStats(),
  });
}

export function useHealth() {
  return useQuery({
    queryKey: ["health"],
    queryFn: () => api.checkHealth(),
    retry: false,
  });
}
```

#### 3. Config Modal
**File**: `cc-orch-mcp/ui/src/components/ConfigModal.tsx`

```tsx
import { useState, useEffect } from "react";
import Modal from "@mui/joy/Modal";
import ModalDialog from "@mui/joy/ModalDialog";
import Typography from "@mui/joy/Typography";
import Input from "@mui/joy/Input";
import Button from "@mui/joy/Button";
import FormControl from "@mui/joy/FormControl";
import FormLabel from "@mui/joy/FormLabel";
import Stack from "@mui/joy/Stack";
import Box from "@mui/joy/Box";
import Divider from "@mui/joy/Divider";
import { getConfig, saveConfig, resetConfig, getDefaultConfig } from "../lib/config";

interface ConfigModalProps {
  open: boolean;
  onClose: () => void;
  onSave: () => void;
  blocking?: boolean;
}

export default function ConfigModal({ open, onClose, onSave, blocking }: ConfigModalProps) {
  const [apiUrl, setApiUrl] = useState("");
  const [apiKey, setApiKey] = useState("");

  useEffect(() => {
    if (open) {
      const config = getConfig();
      setApiUrl(config.apiUrl);
      setApiKey(config.apiKey);
    }
  }, [open]);

  const handleSave = () => {
    saveConfig({ apiUrl, apiKey });
    onSave();
  };

  const handleReset = () => {
    const defaults = getDefaultConfig();
    setApiUrl(defaults.apiUrl);
    setApiKey(defaults.apiKey);
    resetConfig();
  };

  return (
    <Modal open={open} onClose={blocking ? undefined : onClose}>
      <ModalDialog
        sx={{
          bgcolor: "background.surface",
          border: "1px solid",
          borderColor: "neutral.700",
          boxShadow: "0 0 40px rgba(0, 255, 136, 0.1)",
          minWidth: 400,
        }}
      >
        <Typography
          level="h4"
          sx={{
            fontFamily: "code",
            color: "primary.500",
            textShadow: "0 0 10px rgba(0, 255, 136, 0.5)",
          }}
        >
          ⚡ CONFIGURATION
        </Typography>

        <Divider sx={{ my: 2, bgcolor: "neutral.700" }} />

        <Stack spacing={2}>
          <FormControl>
            <FormLabel sx={{ fontFamily: "code", color: "text.secondary" }}>
              API URL
            </FormLabel>
            <Input
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
              placeholder="https://desplega.sh"
              sx={{
                fontFamily: "code",
                bgcolor: "background.level1",
                "&:focus-within": {
                  borderColor: "primary.500",
                  boxShadow: "0 0 10px rgba(0, 255, 136, 0.3)",
                },
              }}
            />
          </FormControl>

          <FormControl>
            <FormLabel sx={{ fontFamily: "code", color: "text.secondary" }}>
              API KEY (optional)
            </FormLabel>
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Enter API key if required"
              sx={{
                fontFamily: "code",
                bgcolor: "background.level1",
                "&:focus-within": {
                  borderColor: "primary.500",
                  boxShadow: "0 0 10px rgba(0, 255, 136, 0.3)",
                },
              }}
            />
          </FormControl>
        </Stack>

        <Divider sx={{ my: 2, bgcolor: "neutral.700" }} />

        <Box sx={{ display: "flex", gap: 1, justifyContent: "space-between" }}>
          <Button
            variant="outlined"
            color="neutral"
            onClick={handleReset}
            sx={{
              fontFamily: "code",
              borderColor: "neutral.600",
              "&:hover": {
                borderColor: "warning.500",
                color: "warning.500",
              },
            }}
          >
            RESET DEFAULTS
          </Button>
          <Box sx={{ display: "flex", gap: 1 }}>
            {!blocking && (
              <Button
                variant="outlined"
                color="neutral"
                onClick={onClose}
                sx={{
                  fontFamily: "code",
                  borderColor: "neutral.600",
                }}
              >
                CANCEL
              </Button>
            )}
            <Button
              onClick={handleSave}
              sx={{
                fontFamily: "code",
                bgcolor: "primary.500",
                color: "black",
                fontWeight: 700,
                "&:hover": {
                  bgcolor: "primary.400",
                  boxShadow: "0 0 20px rgba(0, 255, 136, 0.5)",
                },
              }}
            >
              CONNECT
            </Button>
          </Box>
        </Box>
      </ModalDialog>
    </Modal>
  );
}
```

#### 4. Status Badge Component
**File**: `cc-orch-mcp/ui/src/components/StatusBadge.tsx`

```tsx
import Chip from "@mui/joy/Chip";
import type { AgentStatus, TaskStatus } from "../types/api";

interface StatusBadgeProps {
  status: AgentStatus | TaskStatus;
  size?: "sm" | "md" | "lg";
}

const statusConfig = {
  // Agent statuses
  idle: { color: "primary" as const, label: "IDLE", glow: "rgba(0, 255, 136, 0.5)" },
  busy: { color: "warning" as const, label: "BUSY", glow: "rgba(255, 170, 0, 0.5)" },
  offline: { color: "neutral" as const, label: "OFFLINE", glow: "rgba(102, 102, 102, 0.3)" },
  // Task statuses
  pending: { color: "neutral" as const, label: "PENDING", glow: "rgba(102, 102, 102, 0.3)" },
  in_progress: { color: "warning" as const, label: "IN PROGRESS", glow: "rgba(255, 170, 0, 0.5)" },
  completed: { color: "success" as const, label: "COMPLETED", glow: "rgba(0, 255, 136, 0.5)" },
  failed: { color: "danger" as const, label: "FAILED", glow: "rgba(255, 68, 68, 0.5)" },
};

export default function StatusBadge({ status, size = "sm" }: StatusBadgeProps) {
  const config = statusConfig[status];
  const isActive = status === "busy" || status === "in_progress";

  return (
    <Chip
      size={size}
      color={config.color}
      variant="soft"
      sx={{
        fontFamily: "code",
        fontWeight: 600,
        fontSize: size === "sm" ? "0.65rem" : "0.75rem",
        letterSpacing: "0.05em",
        boxShadow: `0 0 10px ${config.glow}`,
        animation: isActive ? "pulse 2s infinite" : undefined,
        "@keyframes pulse": {
          "0%, 100%": { opacity: 1 },
          "50%": { opacity: 0.7 },
        },
      }}
    >
      {config.label}
    </Chip>
  );
}
```

#### 5. Header Component
**File**: `cc-orch-mcp/ui/src/components/Header.tsx`

```tsx
import Box from "@mui/joy/Box";
import Typography from "@mui/joy/Typography";
import IconButton from "@mui/joy/IconButton";
import Chip from "@mui/joy/Chip";
import { useHealth } from "../hooks/queries";

interface HeaderProps {
  onSettingsClick: () => void;
}

export default function Header({ onSettingsClick }: HeaderProps) {
  const { data: health, isError, isLoading } = useHealth();

  const connectionStatus = isLoading
    ? "connecting"
    : isError
      ? "error"
      : "connected";

  const statusColors = {
    connected: { bg: "rgba(0, 255, 136, 0.1)", border: "#00ff88", text: "#00ff88" },
    connecting: { bg: "rgba(255, 170, 0, 0.1)", border: "#ffaa00", text: "#ffaa00" },
    error: { bg: "rgba(255, 68, 68, 0.1)", border: "#ff4444", text: "#ff4444" },
  };

  const colors = statusColors[connectionStatus];

  return (
    <Box
      component="header"
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        px: 3,
        py: 2,
        borderBottom: "1px solid",
        borderColor: "neutral.800",
        bgcolor: "background.surface",
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
        <Typography
          level="h3"
          sx={{
            fontFamily: "code",
            fontWeight: 700,
            background: "linear-gradient(90deg, #00ff88 0%, #00d4ff 100%)",
            backgroundClip: "text",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            textShadow: "0 0 30px rgba(0, 255, 136, 0.3)",
          }}
        >
          AGENT SWARM
        </Typography>
        <Chip
          size="sm"
          sx={{
            fontFamily: "code",
            fontSize: "0.65rem",
            bgcolor: colors.bg,
            border: "1px solid",
            borderColor: colors.border,
            color: colors.text,
            animation: connectionStatus === "connecting" ? "pulse 1s infinite" : undefined,
          }}
        >
          {connectionStatus === "connected" && health?.version
            ? `v${health.version}`
            : connectionStatus.toUpperCase()}
        </Chip>
      </Box>

      <IconButton
        variant="outlined"
        onClick={onSettingsClick}
        sx={{
          fontFamily: "code",
          borderColor: "neutral.700",
          color: "text.secondary",
          "&:hover": {
            borderColor: "primary.500",
            color: "primary.500",
            boxShadow: "0 0 10px rgba(0, 255, 136, 0.3)",
          },
        }}
      >
        ⚙
      </IconButton>
    </Box>
  );
}
```

#### 6. Stats Bar Component
**File**: `cc-orch-mcp/ui/src/components/StatsBar.tsx`

```tsx
import Box from "@mui/joy/Box";
import Typography from "@mui/joy/Typography";
import { useStats } from "../hooks/queries";

interface StatItemProps {
  label: string;
  value: number;
  color: string;
  glow: string;
}

function StatItem({ label, value, color, glow }: StatItemProps) {
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        px: 3,
        py: 1,
        borderRight: "1px solid",
        borderColor: "neutral.800",
        "&:last-child": { borderRight: "none" },
      }}
    >
      <Typography
        sx={{
          fontFamily: "code",
          fontSize: "1.75rem",
          fontWeight: 700,
          color,
          textShadow: `0 0 20px ${glow}`,
        }}
      >
        {value}
      </Typography>
      <Typography
        sx={{
          fontFamily: "code",
          fontSize: "0.65rem",
          color: "text.tertiary",
          letterSpacing: "0.1em",
        }}
      >
        {label}
      </Typography>
    </Box>
  );
}

export default function StatsBar() {
  const { data: stats } = useStats();

  if (!stats) return null;

  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "center",
        bgcolor: "background.surface",
        borderBottom: "1px solid",
        borderColor: "neutral.800",
        py: 1,
      }}
    >
      <StatItem
        label="TOTAL AGENTS"
        value={stats.agents.total}
        color="#00d4ff"
        glow="rgba(0, 212, 255, 0.5)"
      />
      <StatItem
        label="ACTIVE"
        value={stats.agents.busy}
        color="#ffaa00"
        glow="rgba(255, 170, 0, 0.5)"
      />
      <StatItem
        label="IDLE"
        value={stats.agents.idle}
        color="#00ff88"
        glow="rgba(0, 255, 136, 0.5)"
      />
      <StatItem
        label="TASKS PENDING"
        value={stats.tasks.pending}
        color="#888888"
        glow="rgba(136, 136, 136, 0.3)"
      />
      <StatItem
        label="IN PROGRESS"
        value={stats.tasks.in_progress}
        color="#ffaa00"
        glow="rgba(255, 170, 0, 0.5)"
      />
      <StatItem
        label="COMPLETED"
        value={stats.tasks.completed}
        color="#00ff88"
        glow="rgba(0, 255, 136, 0.5)"
      />
      <StatItem
        label="FAILED"
        value={stats.tasks.failed}
        color="#ff4444"
        glow="rgba(255, 68, 68, 0.5)"
      />
    </Box>
  );
}
```

#### 7. Agents Panel Component
**File**: `cc-orch-mcp/ui/src/components/AgentsPanel.tsx`

```tsx
import { useState } from "react";
import Box from "@mui/joy/Box";
import Card from "@mui/joy/Card";
import Typography from "@mui/joy/Typography";
import Table from "@mui/joy/Table";
import IconButton from "@mui/joy/IconButton";
import Collapse from "@mui/material/Collapse";
import { useAgents } from "../hooks/queries";
import StatusBadge from "./StatusBadge";
import type { AgentWithTasks } from "../types/api";

interface AgentRowProps {
  agent: AgentWithTasks;
  expanded: boolean;
  onToggle: () => void;
}

function AgentRow({ agent, expanded, onToggle }: AgentRowProps) {
  const activeTasks = agent.tasks.filter(
    (t) => t.status === "pending" || t.status === "in_progress"
  ).length;

  return (
    <>
      <tr
        onClick={onToggle}
        style={{ cursor: "pointer" }}
      >
        <td>
          <IconButton
            size="sm"
            variant="plain"
            sx={{ color: "text.tertiary" }}
          >
            {expanded ? "▼" : "▶"}
          </IconButton>
        </td>
        <td>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Typography
              sx={{
                fontFamily: "code",
                fontWeight: 600,
                color: agent.isLead ? "primary.500" : "text.primary",
              }}
            >
              {agent.name}
            </Typography>
            {agent.isLead && (
              <Typography
                sx={{
                  fontFamily: "code",
                  fontSize: "0.6rem",
                  color: "primary.500",
                  textShadow: "0 0 10px rgba(0, 255, 136, 0.5)",
                }}
              >
                ★ LEAD
              </Typography>
            )}
          </Box>
        </td>
        <td>
          <StatusBadge status={agent.status} />
        </td>
        <td>
          <Typography
            sx={{
              fontFamily: "code",
              fontSize: "0.8rem",
              color: activeTasks > 0 ? "warning.500" : "text.tertiary",
            }}
          >
            {activeTasks} active / {agent.tasks.length} total
          </Typography>
        </td>
        <td>
          <Typography
            sx={{
              fontFamily: "code",
              fontSize: "0.7rem",
              color: "text.tertiary",
            }}
          >
            {new Date(agent.lastUpdatedAt).toLocaleTimeString()}
          </Typography>
        </td>
      </tr>
      <tr>
        <td colSpan={5} style={{ padding: 0, border: "none" }}>
          <Collapse in={expanded}>
            <Box
              sx={{
                bgcolor: "background.level1",
                p: 2,
                borderTop: "1px solid",
                borderColor: "neutral.800",
              }}
            >
              {agent.tasks.length === 0 ? (
                <Typography
                  sx={{
                    fontFamily: "code",
                    fontSize: "0.8rem",
                    color: "text.tertiary",
                    fontStyle: "italic",
                  }}
                >
                  No tasks assigned
                </Typography>
              ) : (
                <Table size="sm" sx={{ "--TableCell-paddingY": "4px" }}>
                  <thead>
                    <tr>
                      <th style={{ width: "40%" }}>Task</th>
                      <th style={{ width: "15%" }}>Status</th>
                      <th style={{ width: "25%" }}>Progress</th>
                      <th style={{ width: "20%" }}>Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agent.tasks.slice(0, 5).map((task) => (
                      <tr key={task.id}>
                        <td>
                          <Typography
                            sx={{
                              fontFamily: "code",
                              fontSize: "0.75rem",
                              color: "text.secondary",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              maxWidth: 300,
                            }}
                          >
                            {task.task}
                          </Typography>
                        </td>
                        <td>
                          <StatusBadge status={task.status} size="sm" />
                        </td>
                        <td>
                          <Typography
                            sx={{
                              fontFamily: "code",
                              fontSize: "0.7rem",
                              color: "text.tertiary",
                            }}
                          >
                            {task.progress || "—"}
                          </Typography>
                        </td>
                        <td>
                          <Typography
                            sx={{
                              fontFamily: "code",
                              fontSize: "0.7rem",
                              color: "text.tertiary",
                            }}
                          >
                            {new Date(task.lastUpdatedAt).toLocaleTimeString()}
                          </Typography>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
              {agent.tasks.length > 5 && (
                <Typography
                  sx={{
                    fontFamily: "code",
                    fontSize: "0.7rem",
                    color: "text.tertiary",
                    mt: 1,
                  }}
                >
                  + {agent.tasks.length - 5} more tasks
                </Typography>
              )}
            </Box>
          </Collapse>
        </td>
      </tr>
    </>
  );
}

export default function AgentsPanel() {
  const { data: agents, isLoading, isError } = useAgents();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <Card
      sx={{
        bgcolor: "background.surface",
        border: "1px solid",
        borderColor: "neutral.800",
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: 2,
          py: 1.5,
          borderBottom: "1px solid",
          borderColor: "neutral.800",
          bgcolor: "background.level1",
        }}
      >
        <Typography
          sx={{
            fontFamily: "code",
            fontWeight: 600,
            color: "primary.500",
            letterSpacing: "0.05em",
          }}
        >
          ◆ AGENTS
        </Typography>
        <Typography
          sx={{
            fontFamily: "code",
            fontSize: "0.7rem",
            color: "text.tertiary",
          }}
        >
          {agents?.length || 0} registered
        </Typography>
      </Box>

      {isLoading ? (
        <Box sx={{ p: 3, textAlign: "center" }}>
          <Typography sx={{ fontFamily: "code", color: "text.tertiary" }}>
            Loading...
          </Typography>
        </Box>
      ) : isError ? (
        <Box sx={{ p: 3, textAlign: "center" }}>
          <Typography sx={{ fontFamily: "code", color: "danger.500" }}>
            Failed to load agents
          </Typography>
        </Box>
      ) : agents?.length === 0 ? (
        <Box sx={{ p: 3, textAlign: "center" }}>
          <Typography sx={{ fontFamily: "code", color: "text.tertiary" }}>
            No agents registered
          </Typography>
        </Box>
      ) : (
        <Table
          sx={{
            "--TableCell-headBackground": "transparent",
            "--TableCell-paddingY": "8px",
            "& thead th": {
              fontFamily: "code",
              fontSize: "0.7rem",
              color: "text.tertiary",
              letterSpacing: "0.05em",
              borderBottom: "1px solid",
              borderColor: "neutral.800",
            },
            "& tbody tr:hover": {
              bgcolor: "background.level1",
            },
          }}
        >
          <thead>
            <tr>
              <th style={{ width: 40 }}></th>
              <th>Name</th>
              <th style={{ width: 120 }}>Status</th>
              <th style={{ width: 150 }}>Tasks</th>
              <th style={{ width: 100 }}>Updated</th>
            </tr>
          </thead>
          <tbody>
            {agents?.map((agent) => (
              <AgentRow
                key={agent.id}
                agent={agent}
                expanded={expandedId === agent.id}
                onToggle={() =>
                  setExpandedId(expandedId === agent.id ? null : agent.id)
                }
              />
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  );
}
```

#### 8. Tasks Panel Component
**File**: `cc-orch-mcp/ui/src/components/TasksPanel.tsx`

```tsx
import { useState } from "react";
import Box from "@mui/joy/Box";
import Card from "@mui/joy/Card";
import Typography from "@mui/joy/Typography";
import Table from "@mui/joy/Table";
import Select from "@mui/joy/Select";
import Option from "@mui/joy/Option";
import IconButton from "@mui/joy/IconButton";
import Collapse from "@mui/material/Collapse";
import { useTasks, useTask } from "../hooks/queries";
import StatusBadge from "./StatusBadge";
import type { AgentTask, TaskStatus } from "../types/api";

interface TaskRowProps {
  task: AgentTask;
  expanded: boolean;
  onToggle: () => void;
}

function TaskRow({ task, expanded, onToggle }: TaskRowProps) {
  const { data: taskDetails } = useTask(expanded ? task.id : "");

  return (
    <>
      <tr onClick={onToggle} style={{ cursor: "pointer" }}>
        <td>
          <IconButton size="sm" variant="plain" sx={{ color: "text.tertiary" }}>
            {expanded ? "▼" : "▶"}
          </IconButton>
        </td>
        <td>
          <Typography
            sx={{
              fontFamily: "code",
              fontSize: "0.8rem",
              color: "text.primary",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              maxWidth: 400,
            }}
          >
            {task.task}
          </Typography>
        </td>
        <td>
          <StatusBadge status={task.status} />
        </td>
        <td>
          <Typography
            sx={{
              fontFamily: "code",
              fontSize: "0.7rem",
              color: "text.tertiary",
            }}
          >
            {task.progress || "—"}
          </Typography>
        </td>
        <td>
          <Typography
            sx={{
              fontFamily: "code",
              fontSize: "0.7rem",
              color: "text.tertiary",
            }}
          >
            {new Date(task.lastUpdatedAt).toLocaleTimeString()}
          </Typography>
        </td>
      </tr>
      <tr>
        <td colSpan={5} style={{ padding: 0, border: "none" }}>
          <Collapse in={expanded}>
            <Box
              sx={{
                bgcolor: "background.level1",
                p: 2,
                borderTop: "1px solid",
                borderColor: "neutral.800",
              }}
            >
              <Box sx={{ display: "flex", gap: 4, mb: 2 }}>
                <Box>
                  <Typography
                    sx={{
                      fontFamily: "code",
                      fontSize: "0.65rem",
                      color: "text.tertiary",
                      mb: 0.5,
                    }}
                  >
                    TASK ID
                  </Typography>
                  <Typography
                    sx={{ fontFamily: "code", fontSize: "0.75rem", color: "text.secondary" }}
                  >
                    {task.id.slice(0, 8)}...
                  </Typography>
                </Box>
                <Box>
                  <Typography
                    sx={{
                      fontFamily: "code",
                      fontSize: "0.65rem",
                      color: "text.tertiary",
                      mb: 0.5,
                    }}
                  >
                    AGENT ID
                  </Typography>
                  <Typography
                    sx={{ fontFamily: "code", fontSize: "0.75rem", color: "text.secondary" }}
                  >
                    {task.agentId.slice(0, 8)}...
                  </Typography>
                </Box>
                <Box>
                  <Typography
                    sx={{
                      fontFamily: "code",
                      fontSize: "0.65rem",
                      color: "text.tertiary",
                      mb: 0.5,
                    }}
                  >
                    CREATED
                  </Typography>
                  <Typography
                    sx={{ fontFamily: "code", fontSize: "0.75rem", color: "text.secondary" }}
                  >
                    {new Date(task.createdAt).toLocaleString()}
                  </Typography>
                </Box>
                {task.finishedAt && (
                  <Box>
                    <Typography
                      sx={{
                        fontFamily: "code",
                        fontSize: "0.65rem",
                        color: "text.tertiary",
                        mb: 0.5,
                      }}
                    >
                      FINISHED
                    </Typography>
                    <Typography
                      sx={{ fontFamily: "code", fontSize: "0.75rem", color: "text.secondary" }}
                    >
                      {new Date(task.finishedAt).toLocaleString()}
                    </Typography>
                  </Box>
                )}
              </Box>

              {task.output && (
                <Box sx={{ mb: 2 }}>
                  <Typography
                    sx={{
                      fontFamily: "code",
                      fontSize: "0.65rem",
                      color: "text.tertiary",
                      mb: 0.5,
                    }}
                  >
                    OUTPUT
                  </Typography>
                  <Box
                    sx={{
                      bgcolor: "background.level2",
                      p: 1,
                      borderRadius: 1,
                      maxHeight: 100,
                      overflow: "auto",
                    }}
                  >
                    <Typography
                      sx={{
                        fontFamily: "code",
                        fontSize: "0.75rem",
                        color: "primary.500",
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {task.output}
                    </Typography>
                  </Box>
                </Box>
              )}

              {task.failureReason && (
                <Box sx={{ mb: 2 }}>
                  <Typography
                    sx={{
                      fontFamily: "code",
                      fontSize: "0.65rem",
                      color: "danger.500",
                      mb: 0.5,
                    }}
                  >
                    FAILURE REASON
                  </Typography>
                  <Typography
                    sx={{
                      fontFamily: "code",
                      fontSize: "0.75rem",
                      color: "danger.400",
                    }}
                  >
                    {task.failureReason}
                  </Typography>
                </Box>
              )}

              {taskDetails?.logs && taskDetails.logs.length > 0 && (
                <Box>
                  <Typography
                    sx={{
                      fontFamily: "code",
                      fontSize: "0.65rem",
                      color: "text.tertiary",
                      mb: 0.5,
                    }}
                  >
                    ACTIVITY LOG ({taskDetails.logs.length})
                  </Typography>
                  <Box
                    sx={{
                      bgcolor: "background.level2",
                      borderRadius: 1,
                      maxHeight: 150,
                      overflow: "auto",
                    }}
                  >
                    {taskDetails.logs.slice(0, 10).map((log) => (
                      <Box
                        key={log.id}
                        sx={{
                          display: "flex",
                          gap: 2,
                          px: 1,
                          py: 0.5,
                          borderBottom: "1px solid",
                          borderColor: "neutral.800",
                          "&:last-child": { borderBottom: "none" },
                        }}
                      >
                        <Typography
                          sx={{
                            fontFamily: "code",
                            fontSize: "0.65rem",
                            color: "text.tertiary",
                            minWidth: 70,
                          }}
                        >
                          {new Date(log.createdAt).toLocaleTimeString()}
                        </Typography>
                        <Typography
                          sx={{
                            fontFamily: "code",
                            fontSize: "0.65rem",
                            color: "warning.500",
                          }}
                        >
                          {log.eventType}
                        </Typography>
                        {log.newValue && (
                          <Typography
                            sx={{
                              fontFamily: "code",
                              fontSize: "0.65rem",
                              color: "text.secondary",
                            }}
                          >
                            → {log.newValue}
                          </Typography>
                        )}
                      </Box>
                    ))}
                  </Box>
                </Box>
              )}
            </Box>
          </Collapse>
        </td>
      </tr>
    </>
  );
}

export default function TasksPanel() {
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "all">("all");
  const { data: tasks, isLoading, isError } = useTasks(
    statusFilter === "all" ? undefined : statusFilter
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <Card
      sx={{
        bgcolor: "background.surface",
        border: "1px solid",
        borderColor: "neutral.800",
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: 2,
          py: 1.5,
          borderBottom: "1px solid",
          borderColor: "neutral.800",
          bgcolor: "background.level1",
        }}
      >
        <Typography
          sx={{
            fontFamily: "code",
            fontWeight: 600,
            color: "warning.500",
            letterSpacing: "0.05em",
          }}
        >
          ◆ TASKS
        </Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <Select
            size="sm"
            value={statusFilter}
            onChange={(_, value) => setStatusFilter(value as TaskStatus | "all")}
            sx={{
              fontFamily: "code",
              fontSize: "0.75rem",
              minWidth: 120,
              bgcolor: "background.level2",
            }}
          >
            <Option value="all">ALL</Option>
            <Option value="pending">PENDING</Option>
            <Option value="in_progress">IN PROGRESS</Option>
            <Option value="completed">COMPLETED</Option>
            <Option value="failed">FAILED</Option>
          </Select>
          <Typography
            sx={{
              fontFamily: "code",
              fontSize: "0.7rem",
              color: "text.tertiary",
            }}
          >
            {tasks?.length || 0} tasks
          </Typography>
        </Box>
      </Box>

      {isLoading ? (
        <Box sx={{ p: 3, textAlign: "center" }}>
          <Typography sx={{ fontFamily: "code", color: "text.tertiary" }}>
            Loading...
          </Typography>
        </Box>
      ) : isError ? (
        <Box sx={{ p: 3, textAlign: "center" }}>
          <Typography sx={{ fontFamily: "code", color: "danger.500" }}>
            Failed to load tasks
          </Typography>
        </Box>
      ) : tasks?.length === 0 ? (
        <Box sx={{ p: 3, textAlign: "center" }}>
          <Typography sx={{ fontFamily: "code", color: "text.tertiary" }}>
            No tasks found
          </Typography>
        </Box>
      ) : (
        <Box sx={{ maxHeight: 400, overflow: "auto" }}>
          <Table
            sx={{
              "--TableCell-headBackground": "transparent",
              "--TableCell-paddingY": "8px",
              "& thead th": {
                fontFamily: "code",
                fontSize: "0.7rem",
                color: "text.tertiary",
                letterSpacing: "0.05em",
                borderBottom: "1px solid",
                borderColor: "neutral.800",
                position: "sticky",
                top: 0,
                bgcolor: "background.surface",
              },
              "& tbody tr:hover": {
                bgcolor: "background.level1",
              },
            }}
          >
            <thead>
              <tr>
                <th style={{ width: 40 }}></th>
                <th>Task</th>
                <th style={{ width: 120 }}>Status</th>
                <th style={{ width: 150 }}>Progress</th>
                <th style={{ width: 100 }}>Updated</th>
              </tr>
            </thead>
            <tbody>
              {tasks?.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  expanded={expandedId === task.id}
                  onToggle={() =>
                    setExpandedId(expandedId === task.id ? null : task.id)
                  }
                />
              ))}
            </tbody>
          </Table>
        </Box>
      )}
    </Card>
  );
}
```

#### 9. Activity Feed Component
**File**: `cc-orch-mcp/ui/src/components/ActivityFeed.tsx`

```tsx
import Box from "@mui/joy/Box";
import Card from "@mui/joy/Card";
import Typography from "@mui/joy/Typography";
import { useLogs } from "../hooks/queries";

const eventTypeColors: Record<string, string> = {
  agent_joined: "#00ff88",
  agent_status_change: "#00d4ff",
  agent_left: "#ff4444",
  task_created: "#ffaa00",
  task_status_change: "#00d4ff",
  task_progress: "#888888",
};

export default function ActivityFeed() {
  const { data: logs } = useLogs(30);

  return (
    <Card
      sx={{
        bgcolor: "background.surface",
        border: "1px solid",
        borderColor: "neutral.800",
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: 2,
          py: 1.5,
          borderBottom: "1px solid",
          borderColor: "neutral.800",
          bgcolor: "background.level1",
        }}
      >
        <Typography
          sx={{
            fontFamily: "code",
            fontWeight: 600,
            color: "#00d4ff",
            letterSpacing: "0.05em",
          }}
        >
          ◆ ACTIVITY FEED
        </Typography>
        <Box
          sx={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            bgcolor: "#00ff88",
            animation: "pulse 2s infinite",
            boxShadow: "0 0 10px #00ff88",
          }}
        />
      </Box>

      <Box sx={{ maxHeight: 300, overflow: "auto" }}>
        {logs?.map((log, index) => (
          <Box
            key={log.id}
            sx={{
              display: "flex",
              alignItems: "flex-start",
              gap: 2,
              px: 2,
              py: 1,
              borderBottom: "1px solid",
              borderColor: "neutral.800",
              bgcolor: index === 0 ? "rgba(0, 255, 136, 0.02)" : "transparent",
              animation: index === 0 ? "fadeIn 0.5s ease-out" : undefined,
              "@keyframes fadeIn": {
                from: { opacity: 0, transform: "translateX(-10px)" },
                to: { opacity: 1, transform: "translateX(0)" },
              },
            }}
          >
            <Typography
              sx={{
                fontFamily: "code",
                fontSize: "0.65rem",
                color: "text.tertiary",
                minWidth: 70,
              }}
            >
              {new Date(log.createdAt).toLocaleTimeString()}
            </Typography>
            <Box
              sx={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                bgcolor: eventTypeColors[log.eventType] || "#666",
                mt: 0.5,
                flexShrink: 0,
                boxShadow: `0 0 6px ${eventTypeColors[log.eventType] || "#666"}`,
              }}
            />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography
                sx={{
                  fontFamily: "code",
                  fontSize: "0.7rem",
                  color: eventTypeColors[log.eventType] || "#666",
                }}
              >
                {log.eventType.replace(/_/g, " ").toUpperCase()}
              </Typography>
              <Typography
                sx={{
                  fontFamily: "code",
                  fontSize: "0.65rem",
                  color: "text.tertiary",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {log.oldValue && log.newValue
                  ? `${log.oldValue} → ${log.newValue}`
                  : log.newValue || log.oldValue || "—"}
              </Typography>
            </Box>
          </Box>
        ))}
        {(!logs || logs.length === 0) && (
          <Box sx={{ p: 2, textAlign: "center" }}>
            <Typography
              sx={{ fontFamily: "code", fontSize: "0.75rem", color: "text.tertiary" }}
            >
              No recent activity
            </Typography>
          </Box>
        )}
      </Box>
    </Card>
  );
}
```

#### 10. Dashboard Component
**File**: `cc-orch-mcp/ui/src/components/Dashboard.tsx`

```tsx
import Box from "@mui/joy/Box";
import Header from "./Header";
import StatsBar from "./StatsBar";
import AgentsPanel from "./AgentsPanel";
import TasksPanel from "./TasksPanel";
import ActivityFeed from "./ActivityFeed";

interface DashboardProps {
  onSettingsClick: () => void;
}

export default function Dashboard({ onSettingsClick }: DashboardProps) {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <Header onSettingsClick={onSettingsClick} />
      <StatsBar />

      <Box
        sx={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: "1fr 350px",
          gridTemplateRows: "1fr 1fr",
          gap: 2,
          p: 2,
          bgcolor: "background.body",
        }}
      >
        {/* Left column - Agents (top) and Tasks (bottom) */}
        <Box sx={{ gridRow: "1 / 2" }}>
          <AgentsPanel />
        </Box>
        <Box sx={{ gridRow: "2 / 3" }}>
          <TasksPanel />
        </Box>

        {/* Right column - Activity Feed (full height) */}
        <Box sx={{ gridRow: "1 / 3" }}>
          <ActivityFeed />
        </Box>
      </Box>
    </Box>
  );
}
```

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compiles: `cd cc-orch-mcp/ui && pnpm run typecheck`
- [ ] Build succeeds: `cd cc-orch-mcp/ui && pnpm run build`
- [ ] No console errors when dev server starts

#### Manual Verification:
- [ ] Config modal appears on first load (blocking)
- [ ] After config save, dashboard loads
- [ ] Settings icon in header re-opens config modal
- [ ] Reset defaults button works
- [ ] Stats bar shows correct counts
- [ ] Agents panel shows agents with expandable rows
- [ ] Tasks panel shows tasks with status filter
- [ ] Activity feed shows recent logs with animations
- [ ] 5-second auto-refresh updates data

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to Phase 4.

---

## Phase 4: Polish & Bloomberg Styling

### Overview
Add final visual polish, enhanced animations, and Bloomberg terminal feel.

### Changes Required:

#### 1. Enhanced CSS Animations
**File**: `cc-orch-mcp/ui/src/index.css` (update)

Add to existing file:
```css
/* Scanline effect for terminal feel */
.scanlines::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(
    transparent 50%,
    rgba(0, 0, 0, 0.05) 50%
  );
  background-size: 100% 4px;
  pointer-events: none;
  z-index: 1000;
}

/* Flicker animation for critical elements */
@keyframes flicker {
  0%, 19%, 21%, 23%, 25%, 54%, 56%, 100% {
    opacity: 1;
  }
  20%, 24%, 55% {
    opacity: 0.8;
  }
}

.flicker {
  animation: flicker 4s infinite;
}

/* Counter animation */
@keyframes countUp {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.count-up {
  animation: countUp 0.3s ease-out;
}

/* Gradient border glow */
.glow-border {
  position: relative;
}

.glow-border::before {
  content: "";
  position: absolute;
  inset: -1px;
  background: linear-gradient(90deg, #00ff88, #00d4ff, #ffaa00);
  border-radius: inherit;
  z-index: -1;
  opacity: 0.3;
  filter: blur(4px);
}

/* Data stream animation for activity feed */
@keyframes dataStream {
  0% {
    background-position: 0% 0%;
  }
  100% {
    background-position: 0% 100%;
  }
}

.data-stream {
  background: linear-gradient(
    180deg,
    transparent 0%,
    rgba(0, 255, 136, 0.03) 50%,
    transparent 100%
  );
  background-size: 100% 200%;
  animation: dataStream 3s linear infinite;
}
```

#### 2. Update App for Scanline Effect (Optional)
**File**: `cc-orch-mcp/ui/src/App.tsx` (update)

Add `scanlines` class to main Box if desired for full Bloomberg effect (can be toggled via config):
```tsx
<Box
  className="scanlines"  // Optional: adds subtle CRT scanline effect
  sx={{
    minHeight: "100vh",
    bgcolor: "background.body",
    position: "relative",
  }}
>
```

#### 3. Add Keyboard Shortcut for Settings
**File**: `cc-orch-mcp/ui/src/App.tsx` (update)

Add keyboard listener:
```tsx
import { useState, useEffect, useCallback } from "react";

// ... inside App component:
const handleKeyDown = useCallback((e: KeyboardEvent) => {
  // Ctrl/Cmd + , to open settings
  if ((e.metaKey || e.ctrlKey) && e.key === ",") {
    e.preventDefault();
    setConfigOpen(true);
  }
}, []);

useEffect(() => {
  window.addEventListener("keydown", handleKeyDown);
  return () => window.removeEventListener("keydown", handleKeyDown);
}, [handleKeyDown]);
```

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compiles: `cd cc-orch-mcp/ui && pnpm run typecheck`
- [ ] Build succeeds: `cd cc-orch-mcp/ui && pnpm run build`

#### Manual Verification:
- [ ] Animations are smooth and not distracting
- [ ] Status badges glow appropriately
- [ ] Activity feed has streaming data effect
- [ ] Ctrl+, keyboard shortcut opens settings
- [ ] Overall aesthetic matches Bloomberg terminal feel
- [ ] Performance is acceptable (no lag during auto-refresh)

**Implementation Note**: After completing this phase and all verification passes, the implementation is complete.

---

## Testing Strategy

### Unit Tests:
Not required for initial implementation (dashboard is primarily presentational).

### Integration Tests:
- Test API endpoints return correct data shapes
- Test frontend renders without errors given mock data

### Manual Testing Steps:
1. Start backend: `cd cc-orch-mcp && bun run src/http.ts`
2. Start frontend: `cd cc-orch-mcp/ui && pnpm run dev`
3. Verify config modal appears on first load
4. Enter API URL and save
5. Verify dashboard loads with data
6. Expand an agent row - verify tasks appear
7. Expand a task row - verify logs appear
8. Change task status filter - verify list updates
9. Wait 5+ seconds - verify auto-refresh works
10. Click settings icon - verify modal re-opens
11. Click reset defaults - verify form resets

## Performance Considerations

- React Query handles caching and deduplication
- 5-second polling interval balances freshness vs server load
- Expandable rows only fetch details when expanded
- Log limit prevents loading excessive data

## Migration Notes

No migration required - this is a new feature addition. Existing MCP functionality is unchanged.

## References

- Research document: `thoughts/shared/research/2025-12-18-cc-orch-mcp-frontend-api-research.md`
- Existing HTTP server: `cc-orch-mcp/src/http.ts`
- Database queries: `cc-orch-mcp/src/be/db.ts`
- Types: `cc-orch-mcp/src/types.ts`
- Similar frontend pattern: `willitfront.page/` (structure reference, not UI library)
