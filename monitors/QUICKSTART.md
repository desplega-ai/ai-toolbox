# Quick Start Guide

## Installation

```bash
cd /Users/taras/Documents/code/ai-toolbox/monitors
uv sync
```

## Create an alias (recommended)

Add to your `~/.zshrc` or `~/.bashrc`:

```bash
alias mm='uvx --from /Users/taras/Documents/code/ai-toolbox/monitors monitor-manager'
```

Then reload your shell:

```bash
source ~/.zshrc  # or ~/.bashrc
```

Now you can use `mm` from anywhere!

## Basic Usage

```bash
# See connected monitors
mm info

# Save current window layout
mm save work-desk

# List saved layouts
mm list

# Restore a layout (requires Accessibility permission)
mm restore work-desk

# Auto-restore on monitor change
mm daemon
```

## First Time Setup - Accessibility Permission

When you first try to restore windows, macOS will ask for Accessibility permission:

1. Go to **System Preferences** → **Security & Privacy** → **Privacy**
2. Select **Accessibility** from the left sidebar
3. Click the lock icon to make changes
4. Click **+** and add **Terminal** (or **Warp** if using Warp terminal)
5. Try the restore command again

## Typical Workflow

### One-time setup per monitor:

1. Connect your external monitor
2. Arrange your windows how you like them
3. Run: `mm save office-desk`
4. Disconnect and reconnect - windows get scrambled
5. Run: `mm restore office-desk` - windows back in place!

### Or use daemon mode:

```bash
# Start the daemon
mm daemon

# Leave it running in the background
# Now when you connect/disconnect monitors, it automatically restores layouts
```

## Tips

- Profiles are stored in `~/.config/monitor-manager/profiles.json`
- Each monitor is identified by a unique UUID based on vendor/model/serial
- Window capture works without permissions, only restore needs Accessibility access
- You can have different profiles for the same monitor (e.g., "work-morning", "work-afternoon")
- **Captures windows from all Spaces** (virtual desktops), not just the current one
- Automatically filters out:
  - System UI (Dock, Notification Centre, Spotlight, etc.)
  - Tiny windows smaller than 200x200 pixels
  - Off-screen utility windows

## Examples

```bash
# Create profiles for different monitors
mm save home-desk        # For your home setup
mm save office-desk      # For office monitor
mm save coffee-shop      # For laptop-only work

# Switch between them
mm restore home-desk
mm restore office-desk
mm restore coffee-shop
```

## Troubleshooting

**"Only some windows restore" (COMMON)**
- ⚠️ **This is expected!** Windows in inactive Spaces can't be restored
- macOS Accessibility API limitation - can only restore windows in current Space
- **Solution**: Switch to each Space (Ctrl+←/→) and run `mm restore <profile>` again
- Expected: ~30-40% success rate if you use multiple Spaces

**"Accessibility permission required"**
- Follow the permission setup steps above
- Make sure to add the correct terminal app

**"Profile not found"**
- Make sure you saved it first: `mm save <name>`
- Check available profiles: `mm list`

**Windows don't restore (other reasons)**
- Some apps don't support Accessibility API (rare)
- Try closing and reopening the app
- Use `mm restore <profile> --verbose` to see detailed errors

**Daemon doesn't detect changes**
- Make sure you have Accessibility permissions
- Try disconnecting and reconnecting the monitor
- Press Ctrl+C to stop the daemon and restart it
