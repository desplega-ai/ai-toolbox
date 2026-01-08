---
date: 2026-01-08T21:42:04Z
researcher: Claude
git_commit: ca539f72b0540b92c34b3fc32d86f789d4440f65
branch: main
repository: ai-toolbox
topic: "cc-notch: macOS Menu Bar Cost Tracker for Claude Code"
tags: [research, macos, menu-bar, ccusage, bun, cost-tracking]
status: complete
last_updated: 2026-01-08
last_updated_by: Claude
---

# Research: cc-notch - macOS Menu Bar Cost Tracker for Claude Code

**Date**: 2026-01-08T21:42:04Z
**Researcher**: Claude
**Git Commit**: ca539f72b0540b92c34b3fc32d86f789d4440f65
**Branch**: main
**Repository**: ai-toolbox

## Research Question

Create a new simple project called "cc-notch" - a macOS-only script that runs in the background (and on startup automatically) that tracks Claude Code usage costs and displays them in the macOS menu bar with a dropdown for detailed metrics.

## Summary

**Great news: ccusage has a JavaScript API** that can be imported directly into Bun, eliminating the need to shell out to `npx ccusage`. Combined with a menu bar framework, this creates a clean solution.

### Recommended Stack for cc-notch

| Component | Technology | Reason |
|-----------|------------|--------|
| Runtime | **Bun** | Fast, TypeScript-native |
| Data Source | **ccusage/data-loader** | Direct JS API, no CLI needed |
| Menu Bar | **Electrobun** or **systray2** | Native Bun support |
| Startup | **Launch Agent (plist)** | Standard macOS approach |

## Detailed Findings

### 1. ccusage JavaScript API

ccusage provides a programmatic JavaScript API via `ccusage/data-loader` that works perfectly with Bun:

```typescript
import { loadDailyUsageData, loadMonthlyUsageData, loadSessionData } from 'ccusage/data-loader';
import { calculateTotals, getTotalTokens } from 'ccusage/calculate-cost';

// Load today's data
const dailyData = await loadDailyUsageData();
const today = dailyData[0]; // Most recent day

console.log(`Today's cost: $${today.totalCostUSD}`);
console.log(`Models used: ${today.modelsUsed.join(', ')}`);

// Check for high usage
if (today.totalCostUSD > 10) {
  console.warn(`High usage detected: $${today.totalCostUSD}`);
}
```

**Available Functions:**
- `loadDailyUsageData()` - Returns array of daily usage objects
- `loadMonthlyUsageData()` - Returns monthly aggregated data
- `loadSessionData()` - Returns per-session breakdown
- `calculateTotals(entries)` - Calculate cost totals
- `getTotalTokens(entries)` - Sum all tokens

**Data Structure (per day):**
```typescript
interface DailyUsage {
  date: string;                    // "2026-01-08"
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  totalCost: number;               // In USD
  modelsUsed: string[];
  modelBreakdowns: ModelBreakdown[];
}
```

### 2. Menu Bar Options for Bun

#### Option A: Electrobun (Recommended)

Electrobun is purpose-built for Bun with native Tray API support:

```bash
bunx electrobun init
```

**Tray API Features:**
- `title` - Text displayed in system tray (your cost display)
- `image` - Optional icon
- `template` - macOS adaptive icons (light/dark mode)
- `setMenu()` - Dynamic dropdown menu
- `tray-clicked` / `tray-item-clicked` events

**Pros:**
- Ultra-small bundles (~14MB vs 150MB+ Electron)
- Fast startup (<50ms)
- Native Bun runtime
- Built-in Tray support

**Cons:**
- Early stage project
- Documentation still maturing

#### Option B: systray2 (Fallback)

Cross-platform systray using Go binaries:

```typescript
import SysTray from 'systray2';

const systray = new SysTray({
  menu: {
    icon: './icon.png',
    isTemplateIcon: true,  // macOS template icon
    title: '$36.91',
    tooltip: 'Claude Code Usage',
    items: [
      { title: 'Today: $36.91', enabled: true },
      { title: 'This Week: $150.23', enabled: true },
      SysTray.separator,
      { title: 'Refresh', enabled: true },
      { title: 'Quit', enabled: true }
    ]
  }
});
```

**Pros:**
- Simple API
- Cross-platform

**Cons:**
- Last updated 2021
- Uses child processes

#### Option C: BitBar/xbar (Simplest)

Write a simple Bun script that outputs menu items:

```typescript
#!/usr/bin/env bun
// cc-notch.5m.ts - runs every 5 minutes

import { loadDailyUsageData } from 'ccusage/data-loader';

const data = await loadDailyUsageData();
const today = data[0];

console.log(`$${today.totalCost.toFixed(2)}`);
console.log('---');
console.log(`Today: $${today.totalCost.toFixed(2)}`);
console.log(`Tokens: ${today.totalTokens.toLocaleString()}`);
console.log('---');
today.modelBreakdowns.forEach(m => {
  console.log(`${m.modelName}: $${m.cost.toFixed(2)}`);
});
```

Place in `~/Library/Application Support/xbar/plugins/` with executable permission.

### 3. Startup on Login (Launch Agent)

Create `~/Library/LaunchAgents/com.cc-notch.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.cc-notch</string>

    <key>ProgramArguments</key>
    <array>
        <string>/Users/taras/.bun/bin/bun</string>
        <string>/Users/taras/projects/cc-notch/index.ts</string>
    </array>

    <key>RunAtLoad</key>
    <true/>

    <key>KeepAlive</key>
    <true/>

    <key>StandardOutPath</key>
    <string>/tmp/cc-notch.log</string>

    <key>StandardErrorPath</key>
    <string>/tmp/cc-notch.err</string>

    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/Users/taras/.bun/bin:/usr/local/bin:/usr/bin:/bin</string>
    </dict>
</dict>
</plist>
```

**Load/unload commands:**
```bash
# Load (start on login)
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.cc-notch.plist

# Unload (stop)
launchctl bootout gui/$(id -u)/com.cc-notch

# Check status
launchctl list | grep cc-notch
```

### 4. Proposed Project Structure

```
cc-notch/
├── package.json
├── tsconfig.json
├── index.ts              # Main entry point
├── src/
│   ├── tray.ts           # Menu bar setup
│   ├── data.ts           # ccusage data fetching
│   └── formatter.ts      # Format costs/tokens
├── scripts/
│   ├── install.sh        # Install launch agent
│   └── uninstall.sh      # Remove launch agent
└── com.cc-notch.plist    # Launch agent template
```

### 5. Minimal Implementation Example

```typescript
// index.ts
import { loadDailyUsageData } from 'ccusage/data-loader';
import SysTray from 'systray2';

async function getData() {
  const daily = await loadDailyUsageData();
  return daily[0]; // Today's data
}

async function main() {
  const today = await getData();

  const systray = new SysTray({
    menu: {
      icon: './icon.png',
      isTemplateIcon: true,
      title: `$${today.totalCost.toFixed(2)}`,
      tooltip: 'Claude Code Cost Tracker',
      items: [
        { title: `Today: $${today.totalCost.toFixed(2)}`, enabled: false },
        { title: `Tokens: ${today.totalTokens.toLocaleString()}`, enabled: false },
        SysTray.separator,
        ...today.modelBreakdowns.map(m => ({
          title: `${m.modelName.replace('claude-', '')}: $${m.cost.toFixed(2)}`,
          enabled: false
        })),
        SysTray.separator,
        { title: 'Refresh', enabled: true },
        { title: 'Quit', enabled: true }
      ]
    }
  });

  systray.onClick(action => {
    if (action.item.title === 'Quit') {
      systray.kill();
    } else if (action.item.title === 'Refresh') {
      // Rebuild menu with fresh data
      getData().then(data => {
        systray.sendAction({
          type: 'update-menu',
          menu: { title: `$${data.totalCost.toFixed(2)}` }
        });
      });
    }
  });
}

main();
```

## Architecture Documentation

### Data Flow

```
┌─────────────────────┐
│ ~/.claude/projects/ │  JSONL usage files
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ ccusage/data-loader │  Parse & aggregate
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│     cc-notch        │  Format & display
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│   macOS Menu Bar    │  System tray
└─────────────────────┘
```

### Refresh Strategy

| Option | Interval | Pro | Con |
|--------|----------|-----|-----|
| Timer | Every 5 min | Simple, predictable | May miss updates |
| File watcher | On change | Real-time | More complex |
| Manual only | On click | Minimal resources | User must remember |

**Recommended:** Timer every 5 minutes + manual refresh button.

## Code References

- ccusage data-loader: [ccusage/data-loader](https://github.com/ryoppippi/ccusage/blob/main/docs/guide/library-usage.md)
- Electrobun Tray API: [blackboardsh/electrobun](https://github.com/blackboardsh/electrobun)
- systray2: [felixhao28/node-systray](https://github.com/felixhao28/node-systray)
- launchd plist reference: [launchd.info](https://www.launchd.info/)

## Design Decisions

1. **Menu bar display**: Just the cost - `$36.91`

2. **Dropdown details**: Full - Include token counts, cache stats, model breakdown

3. **Refresh frequency**: Every 5 minutes

4. **Color coding** (spending thresholds):
   - 🔴 **Red**: < $50/day (low usage)
   - 🟠 **Orange**: $50-100/day (moderate)
   - 🟢 **Green**: > $100/day (high usage)

## Open Questions

1. **Which menu bar library?** Electrobun is newer but more native; systray2 is simpler but older. Need to test both with Bun.

## Next Steps for Implementation

1. Initialize Bun project: `bun init cc-notch`
2. Add ccusage: `bun add ccusage`
3. Test ccusage API works with Bun
4. Try Electrobun for menu bar, fall back to systray2
5. Create launch agent plist
6. Add install/uninstall scripts
