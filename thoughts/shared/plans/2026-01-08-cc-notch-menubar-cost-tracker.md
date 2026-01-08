# cc-notch: macOS Menu Bar Cost Tracker for Claude Code

## Overview

Create a simple macOS menu bar app that displays Claude Code usage costs using:
- **SwiftBar** (or xbar) - lightweight menu bar app framework for macOS
- **Bun** - fast TypeScript runtime
- **ccusage** - JavaScript API for reading Claude Code usage data

This approach is much simpler than the research document's suggestions (Electrobun, systray2) because SwiftBar/xbar handles all the menu bar complexity - we just write a Bun script that outputs formatted text.

## Current State Analysis

- No existing cc-notch project exists
- ccusage npm package (v17.2.1) provides a well-documented JavaScript API
- The `wts/` project provides a good template for Bun project structure in this repo
- SwiftBar is actively maintained and supports any executable script (including Bun)

## Desired End State

A working cc-notch system consisting of:
1. A Bun script that reads Claude Code usage via ccusage API
2. SwiftBar installed to display the script output in the macOS menu bar
3. Cost display in menu bar: `$36.91` (today's cost)
4. Dropdown showing: daily breakdown, model costs, token counts, refresh button

**Verification**: The menu bar shows current Claude Code cost, dropdown works, data refreshes automatically.

## What We're NOT Doing

- **NOT** using Electron, Tauri, or heavy frameworks
- **NOT** creating a Launch Agent (SwiftBar handles the refresh cycle)
- **NOT** using systray2 or other unmaintained npm packages
- **NOT** building a standalone binary - just a script run by SwiftBar

## Implementation Approach

SwiftBar/xbar plugins work by executing a script at regular intervals and parsing stdout. The script outputs:
1. **Menu bar text** (before `---` separator)
2. **Dropdown items** (after `---` separator)

This is a much simpler architecture than the research document proposed.

---

## Phase 1: Project Setup

### Overview
Create the cc-notch directory with Bun project structure.

### Changes Required:

#### 1. Create project structure
**Directory**: `cc-notch/`

```bash
mkdir -p cc-notch/src
cd cc-notch
bun init -y
```

#### 2. package.json
**File**: `cc-notch/package.json`

```json
{
  "name": "cc-notch",
  "version": "0.1.0",
  "description": "macOS menu bar cost tracker for Claude Code",
  "type": "module",
  "scripts": {
    "dev": "bun src/plugin.ts",
    "lint": "biome check src",
    "lint:fix": "biome check --write src",
    "format": "biome format --write src",
    "test": "bun test",
    "tsc:check": "bun tsc --noEmit",
    "install:swiftbar": "bun scripts/install.ts",
    "uninstall:swiftbar": "bun scripts/uninstall.ts"
  },
  "dependencies": {
    "ccusage": "^17.2.1"
  },
  "devDependencies": {
    "@biomejs/biome": "^2.3.9",
    "@types/bun": "latest"
  },
  "peerDependencies": {
    "typescript": "^5"
  }
}
```

#### 3. tsconfig.json
**File**: `cc-notch/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["bun"]
  },
  "include": ["src/**/*", "scripts/**/*"]
}
```

#### 4. biome.json
**File**: `cc-notch/biome.json`

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.4/schema.json",
  "vcs": { "enabled": true, "clientKind": "git", "useIgnoreFile": true },
  "organizeImports": { "enabled": true },
  "linter": {
    "enabled": true,
    "rules": { "recommended": true }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "tab"
  }
}
```

### Success Criteria:

#### Automated Verification:
- [x] `cd cc-notch && bun install` completes successfully
- [x] `bun tsc --noEmit` passes (no TypeScript errors)
- [x] `bun run lint` passes

#### Manual Verification:
- [x] Project structure matches template above

---

## Phase 2: Core Plugin Implementation

### Overview
Create the main SwiftBar plugin script that displays Claude Code costs.

### Changes Required:

#### 1. Plugin script
**File**: `cc-notch/src/plugin.ts`

```typescript
#!/usr/bin/env bun

// <xbar.title>Claude Code Cost Tracker</xbar.title>
// <xbar.version>v1.0</xbar.version>
// <xbar.author>Taras</xbar.author>
// <xbar.desc>Display Claude Code usage costs in menu bar</xbar.desc>
// <xbar.dependencies>bun,ccusage</xbar.dependencies>

// <swiftbar.hideRunInTerminal>true</swiftbar.hideRunInTerminal>
// <swiftbar.hideLastUpdated>false</swiftbar.hideLastUpdated>

import { loadDailyUsageData, loadMonthlyUsageData } from "ccusage/data-loader";

interface DailyUsage {
  date: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalCost: number;
  modelsUsed: string[];
  modelBreakdowns: Record<string, { inputTokens: number; outputTokens: number; totalCost: number }>;
}

function formatCost(cost: number): string {
  return `$${cost.toFixed(2)}`;
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(1)}M`;
  }
  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(1)}K`;
  }
  return tokens.toString();
}

function getCostColor(cost: number): string {
  // Color coding based on daily spend
  // Green: < $10, Orange: $10-50, Red: > $50
  if (cost < 10) return "#4CAF50"; // green
  if (cost < 50) return "#FF9800"; // orange
  return "#F44336"; // red
}

async function main() {
  try {
    const dailyData = await loadDailyUsageData({ order: "desc" });
    const monthlyData = await loadMonthlyUsageData({ order: "desc" });

    const today = dailyData[0] as DailyUsage | undefined;
    const thisMonth = monthlyData[0];

    const todayCost = today?.totalCost ?? 0;
    const monthCost = thisMonth?.totalCost ?? 0;

    // Menu bar display (before ---)
    const color = getCostColor(todayCost);
    console.log(`${formatCost(todayCost)} | color=${color} font=SF\\ Mono size=12`);

    // Dropdown separator
    console.log("---");

    // Today's summary
    console.log(`Today: ${formatCost(todayCost)} | size=14`);
    if (today) {
      console.log(`--Tokens: ${formatTokens(today.inputTokens + today.outputTokens)} | color=#888888`);
      console.log(`--Input: ${formatTokens(today.inputTokens)} | color=#888888`);
      console.log(`--Output: ${formatTokens(today.outputTokens)} | color=#888888`);
      if (today.cacheReadTokens > 0) {
        console.log(`--Cache Read: ${formatTokens(today.cacheReadTokens)} | color=#888888`);
      }
    }

    // Monthly summary
    console.log("---");
    console.log(`This Month: ${formatCost(monthCost)} | size=14`);

    // Model breakdown (if available)
    if (today?.modelBreakdowns && Object.keys(today.modelBreakdowns).length > 0) {
      console.log("---");
      console.log("Models Used Today:");
      for (const [model, breakdown] of Object.entries(today.modelBreakdowns)) {
        const shortModel = model.replace("claude-", "").replace("-20", " ");
        console.log(`--${shortModel}: ${formatCost(breakdown.totalCost)} | color=#888888`);
      }
    }

    // Actions
    console.log("---");
    console.log("Refresh | refresh=true");
    console.log("Open ccusage | bash=/usr/bin/open param1=https://github.com/ryoppippi/ccusage terminal=false");

  } catch (error) {
    // Show error in menu bar
    console.log("⚠️ Error | color=red");
    console.log("---");
    console.log(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
    console.log("---");
    console.log("Refresh | refresh=true");
  }
}

main();
```

### Success Criteria:

#### Automated Verification:
- [x] `bun run dev` outputs valid SwiftBar format (text before `---`, menu items after)
- [x] `bun tsc --noEmit` passes
- [x] `bun run lint` passes

#### Manual Verification:
- [x] Output looks correct with real ccusage data (run `bun src/plugin.ts` manually)

---

## Phase 3: Install/Uninstall Scripts

### Overview
Create scripts to symlink the plugin into SwiftBar's plugin directory.

### Changes Required:

#### 1. Install script
**File**: `cc-notch/scripts/install.ts`

```typescript
#!/usr/bin/env bun

import { $ } from "bun";

const PLUGIN_NAME = "cc-notch.5m.ts";
const SWIFTBAR_PLUGINS_DIR = `${process.env.HOME}/Library/Application Support/SwiftBar/Plugins`;
const XBAR_PLUGINS_DIR = `${process.env.HOME}/Library/Application Support/xbar/plugins`;

const SOURCE_PATH = new URL("../src/plugin.ts", import.meta.url).pathname;

async function findPluginDir(): Promise<string | null> {
  // Check SwiftBar first (preferred)
  const swiftbarFile = Bun.file(SWIFTBAR_PLUGINS_DIR);
  if (await Bun.file(`${SWIFTBAR_PLUGINS_DIR}/../..`).exists()) {
    try {
      await $`mkdir -p ${SWIFTBAR_PLUGINS_DIR}`;
      return SWIFTBAR_PLUGINS_DIR;
    } catch {}
  }

  // Fall back to xbar
  const xbarFile = Bun.file(XBAR_PLUGINS_DIR);
  if (await Bun.file(`${XBAR_PLUGINS_DIR}/../..`).exists()) {
    try {
      await $`mkdir -p ${XBAR_PLUGINS_DIR}`;
      return XBAR_PLUGINS_DIR;
    } catch {}
  }

  return null;
}

async function main() {
  console.log("Installing cc-notch plugin...\n");

  // Check if SwiftBar or xbar is installed
  const pluginDir = await findPluginDir();

  if (!pluginDir) {
    console.log("Neither SwiftBar nor xbar found.");
    console.log("\nPlease install SwiftBar first:");
    console.log("  brew install --cask swiftbar");
    console.log("\nOr install xbar:");
    console.log("  brew install --cask xbar");
    process.exit(1);
  }

  const targetPath = `${pluginDir}/${PLUGIN_NAME}`;

  // Remove existing symlink if present
  try {
    await $`rm -f ${targetPath}`;
  } catch {}

  // Create symlink
  await $`ln -s ${SOURCE_PATH} ${targetPath}`;

  // Make executable
  await $`chmod +x ${SOURCE_PATH}`;

  console.log(`✅ Plugin installed to: ${targetPath}`);
  console.log(`\nThe plugin will refresh every 5 minutes.`);
  console.log(`If SwiftBar/xbar is running, it should appear in your menu bar shortly.`);
}

main();
```

#### 2. Uninstall script
**File**: `cc-notch/scripts/uninstall.ts`

```typescript
#!/usr/bin/env bun

import { $ } from "bun";

const PLUGIN_NAME = "cc-notch.5m.ts";
const SWIFTBAR_PLUGINS_DIR = `${process.env.HOME}/Library/Application Support/SwiftBar/Plugins`;
const XBAR_PLUGINS_DIR = `${process.env.HOME}/Library/Application Support/xbar/plugins`;

async function main() {
  console.log("Uninstalling cc-notch plugin...\n");

  let removed = false;

  // Try SwiftBar
  try {
    await $`rm -f ${SWIFTBAR_PLUGINS_DIR}/${PLUGIN_NAME}`;
    console.log(`Removed from SwiftBar plugins`);
    removed = true;
  } catch {}

  // Try xbar
  try {
    await $`rm -f ${XBAR_PLUGINS_DIR}/${PLUGIN_NAME}`;
    console.log(`Removed from xbar plugins`);
    removed = true;
  } catch {}

  if (removed) {
    console.log("\n✅ Plugin uninstalled successfully");
  } else {
    console.log("Plugin was not found in any location");
  }
}

main();
```

### Success Criteria:

#### Automated Verification:
- [x] `bun tsc --noEmit` passes
- [x] `bun run lint` passes

#### Manual Verification:
- [x] `bun run install:swiftbar` creates symlink in correct location
- [x] `bun run uninstall:swiftbar` removes the symlink

---

## Phase 4: End-to-End Testing

### Overview
Install SwiftBar and verify the full integration works.

### Steps:

1. **Install SwiftBar** (if not already installed):
   ```bash
   brew install --cask swiftbar
   ```

2. **Launch SwiftBar** and configure plugin directory when prompted

3. **Install the plugin**:
   ```bash
   cd cc-notch
   bun install
   bun run install:swiftbar
   ```

4. **Verify in menu bar**:
   - Look for cost display (e.g., `$12.34`)
   - Click to see dropdown with daily/monthly breakdown
   - Click "Refresh" to manually refresh data

### Success Criteria:

#### Manual Verification:
- [x] SwiftBar is installed and running
- [x] cc-notch appears in menu bar showing today's cost
- [x] Dropdown shows today's cost, tokens, monthly cost
- [x] Dropdown shows model breakdown (if multiple models used)
- [x] Refresh button works
- [x] Plugin auto-refreshes every 5 minutes

---

## Testing Strategy

### Unit Tests (Optional Future Enhancement):
- Mock ccusage data loading
- Test formatting functions
- Test color thresholds

### Manual Testing Steps:
1. Run `bun src/plugin.ts` directly and verify output format
2. Install to SwiftBar and verify menu bar display
3. Use Claude Code to generate some usage, then refresh and verify costs update
4. Test with no usage data (should show $0.00)

## File Summary

```
cc-notch/
├── package.json
├── tsconfig.json
├── biome.json
├── src/
│   └── plugin.ts          # Main SwiftBar plugin
└── scripts/
    ├── install.ts         # Install plugin to SwiftBar/xbar
    └── uninstall.ts       # Remove plugin
```

## References

- Research document: `thoughts/shared/research/2026-01-08-cc-notch-macos-menubar-cost-tracker.md`
- ccusage API: https://github.com/ryoppippi/ccusage
- SwiftBar: https://github.com/swiftbar/SwiftBar
- Similar Bun project in repo: `wts/package.json`
