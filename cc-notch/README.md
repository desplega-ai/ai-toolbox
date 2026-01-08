# cc-notch

macOS menu bar cost tracker for Claude Code using SwiftBar.

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

- Shows today's Claude Code cost in the menu bar
- Color-coded by spend: red (≤$50), orange (≤$100), green (>$100)
- Dropdown shows:
  - Today's cost and token breakdown
  - Current month's total cost
  - Model-by-model cost breakdown
- Auto-refreshes every 5 minutes

## Uninstall

```bash
bun run uninstall:swiftbar
```
