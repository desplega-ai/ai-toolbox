---
date: 2025-12-15T14:30:00Z
researcher: Claude
git_commit: 9e21b0505afee30a99059894d8956b2bc374d1c2
branch: main
repository: ai-toolbox
topic: "Hive - Electron Forge + Vite + pnpm Setup"
tags: [research, hive, electron-forge, vite, pnpm, typescript, desktop-app]
status: complete
last_updated: 2025-12-15
last_updated_by: Claude
supersedes: ["2025-12-15-hive-electron-forge-bun-setup.md"]
related: ["2025-12-15-hive-electron-app-research.md"]
---

# Research: Hive - Electron Forge + Vite + pnpm Setup

**Date**: 2025-12-15T14:30:00Z
**Researcher**: Claude
**Git Commit**: 9e21b0505afee30a99059894d8956b2bc374d1c2
**Branch**: main
**Repository**: ai-toolbox

## Research Question

How to set up Hive using:
- Electron Forge + Vite template
- pnpm for package management
- 100% TypeScript

## Summary

**Electron Forge + Vite + pnpm** is a fully supported, production-ready stack. pnpm works seamlessly with Electron Forge and provides fast, disk-efficient dependency management.

## Project Setup

### Initialize Project

```bash
# Create project with Electron Forge + Vite + TypeScript
pnpm dlx create-electron-app@latest hive --template=vite-typescript

cd hive
pnpm install
```

### Project Structure

```
hive/
├── src/
│   ├── main.ts              # Main process entry
│   ├── preload.ts           # Preload script
│   ├── renderer.ts          # Renderer entry
│   └── shared/              # Shared types (add this)
│       └── ipc-types.ts
├── index.html               # HTML entry
├── forge.config.ts          # Forge configuration
├── vite.main.config.mjs     # Vite config for main
├── vite.preload.config.mjs  # Vite config for preload
├── vite.renderer.config.mjs # Vite config for renderer
├── tsconfig.json
├── package.json
└── pnpm-lock.yaml
```

### package.json

```json
{
  "name": "hive",
  "productName": "Hive",
  "version": "1.0.0",
  "main": ".vite/build/main.js",
  "scripts": {
    "start": "electron-forge start",
    "package": "electron-forge package",
    "make": "electron-forge make",
    "lint": "eslint --ext .ts,.tsx .",
    "postinstall": "electron-rebuild"
  },
  "devDependencies": {
    "@electron-forge/cli": "^7.10.2",
    "@electron-forge/maker-deb": "^7.10.2",
    "@electron-forge/maker-dmg": "^7.10.2",
    "@electron-forge/maker-squirrel": "^7.10.2",
    "@electron-forge/maker-zip": "^7.10.2",
    "@electron-forge/plugin-vite": "^7.10.2",
    "@electron/rebuild": "^3.6.0",
    "electron": "^33.2.0",
    "typescript": "^5.7.2",
    "vite": "^5.4.11"
  },
  "dependencies": {
    "@anthropic-ai/claude-agent-sdk": "^0.1.0"
  }
}
```

### forge.config.ts

```typescript
import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { MakerDeb } from '@electron-forge/maker-deb';
import { VitePlugin } from '@electron-forge/plugin-vite';

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    icon: './resources/icon',
    // macOS-specific
    appBundleId: 'com.hive.app',
    appCategoryType: 'public.app-category.developer-tools',
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({}),
    new MakerZIP({}, ['darwin']),
    new MakerDMG({
      format: 'ULFO',
    }),
    new MakerDeb({
      options: {
        maintainer: 'Hive',
        homepage: 'https://github.com/your-repo/hive',
      },
    }),
  ],
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: 'src/main.ts',
          config: 'vite.main.config.mjs',
          target: 'main',
        },
        {
          entry: 'src/preload.ts',
          config: 'vite.preload.config.mjs',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.mjs',
        },
      ],
    }),
  ],
};

export default config;
```

## TypeScript Configuration

### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "paths": {
      "@shared/*": ["./src/shared/*"]
    }
  },
  "include": ["src/**/*.ts", "src/**/*.tsx", "src/**/*.d.ts"]
}
```

### src/electron.d.ts (Global Types)

```typescript
// Vite HMR globals for main process
declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string;
declare const MAIN_WINDOW_VITE_NAME: string;

// Exposed electron API
export interface ElectronAPI {
  invoke: <T>(channel: string, ...args: unknown[]) => Promise<T>;
  on: (channel: string, callback: (...args: unknown[]) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
```

## Vite Configurations

### vite.main.config.mjs

```javascript
import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared'),
    },
  },
  build: {
    rollupOptions: {
      external: [
        'electron',
        '@anthropic-ai/claude-agent-sdk',
        'chokidar',
        'electron-store',
      ],
    },
  },
});
```

### vite.preload.config.mjs

```javascript
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      external: ['electron'],
    },
  },
});
```

### vite.renderer.config.mjs

```javascript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/renderer'),
      '@shared': path.resolve(__dirname, 'src/shared'),
    },
  },
});
```

## Main Process (src/main.ts)

```typescript
import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,

    // macOS-specific
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 15, y: 10 },
    vibrancy: 'sidebar',

    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Load app
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)
    );
  }
}

// IPC Handlers
ipcMain.handle('dialog:open-directory', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory'],
  });
  return result.canceled ? null : result.filePaths[0];
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
```

## Preload Script (src/preload.ts)

```typescript
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  invoke: <T>(channel: string, ...args: unknown[]): Promise<T> => {
    return ipcRenderer.invoke(channel, ...args);
  },
  on: (channel: string, callback: (...args: unknown[]) => void) => {
    const subscription = (_event: Electron.IpcRendererEvent, ...args: unknown[]) =>
      callback(...args);
    ipcRenderer.on(channel, subscription);
    return () => ipcRenderer.removeListener(channel, subscription);
  },
});
```

## Type-Safe IPC Pattern

```typescript
// src/shared/ipc-types.ts
export interface Session {
  id: string;
  name: string;
  directory: string;
  status: 'idle' | 'running' | 'error';
}

export interface IpcHandlers {
  'session:list': () => Promise<Session[]>;
  'session:create': (params: { name: string; directory: string }) => Promise<Session>;
  'session:send': (params: { sessionId: string; message: string }) => Promise<void>;
  'dialog:open-directory': () => Promise<string | null>;
}

export interface IpcEvents {
  'session:output': { sessionId: string; content: string };
  'session:status': { sessionId: string; status: Session['status'] };
}
```

## Development Workflow

### Commands

```bash
# Install dependencies
pnpm install

# Start development server (with HMR)
pnpm start

# Package app (unsigned)
pnpm package

# Create distributables (.dmg, .deb, etc.)
pnpm make

# Rebuild native modules after electron update
pnpm exec electron-rebuild
```

### Adding React (Not included in vite-typescript template)

```bash
pnpm add react react-dom
pnpm add -D @types/react @types/react-dom @vitejs/plugin-react
```

### Adding Dependencies from Original Research

```bash
# Core dependencies
pnpm add @anthropic-ai/claude-agent-sdk
pnpm add electron-store chokidar electron-window-state
pnpm add react-resizable-panels zustand

# Dev dependencies
pnpm add -D @electron/rebuild
```

## Notes

### Vite Plugin Status

Vite support in Electron Forge is **experimental** (v7.x). Breaking changes may occur in minor releases, but it's been stable for most use cases.

### pnpm Hoisting

If you encounter module resolution issues, add to `.npmrc`:

```ini
shamefully-hoist=true
```

This is sometimes needed for Electron's native module resolution.

### Native Modules

Native modules are automatically rebuilt via the `postinstall` script. If you add new native dependencies:

```bash
pnpm exec electron-rebuild
```

## External Resources

**Official Documentation:**
- [Electron Forge](https://www.electronforge.io/)
- [Electron Forge Vite Plugin](https://www.electronforge.io/config/plugins/vite)
- [Electron Forge TypeScript Config](https://www.electronforge.io/config/typescript-configuration)
- [pnpm Documentation](https://pnpm.io/)

**GitHub:**
- [Electron Forge Releases](https://github.com/electron/forge/releases)
- [@electron/rebuild](https://github.com/electron/rebuild)

**Community Templates:**
- [electron-forge-react-vite-boilerplate](https://github.com/flaviodelgrosso/electron-forge-react-vite-boilerplate)
- [template-electron-forge-vite-react-ts](https://github.com/julillermo/template-electron-forge-vite-react-ts)

## Related Research

- [2025-12-15-hive-electron-app-research.md](./2025-12-15-hive-electron-app-research.md) - Original Electron research with electron-vite approach (more detailed on Claude SDK integration, file watching, notifications)
