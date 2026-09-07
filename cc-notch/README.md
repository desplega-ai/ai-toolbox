# cc-notch

macOS menu bar cost tracker for coding agents using SwiftBar and ccusage.

## Prerequisites

- [Bun](https://bun.sh/) - `brew install bun`
- [SwiftBar](https://github.com/swiftbar/SwiftBar) - `brew install --cask swiftbar`

## Installation

```bash
cd cc-notch
bun install
bun run install:swiftbar
```

Then launch SwiftBar and point it to `~/Library/Application Support/SwiftBar/Plugins` when prompted.

## Features

- Shows today's combined coding-agent cost in the menu bar
- Color-coded by spend: red (≤$50), orange (≤$100), green (>$100)
- Dropdown shows:
  - Today's total cost and token breakdown
  - Agent-by-agent breakdown for all sources returned by ccusage, including Claude Code, Codex, OpenCode, Amp, and pi-agent when present
  - Current month's total cost
  - Model-by-model cost breakdown under each agent
- Auto-refreshes every 5 minutes
- Prices come from ccusage in online mode (LiteLLM and models.dev tables), so new models get a price as soon as those tables list them. If the fetch fails, ccusage falls back to its embedded price table, which lags behind new models and reports $0 for them.
- A trailing `!` in the menu bar means a ccusage source failed or timed out. The dropdown names the source. Its cost is missing from the totals.

## Uninstall

```bash
bun run uninstall:swiftbar
```
