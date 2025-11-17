# Monitor Manager

A simple macOS window position manager for multiple monitors. Save and restore window layouts automatically when connecting different monitors.

## Features

- 💾 **Save window layouts** - Capture all window positions with one command
- 🔄 **Restore layouts** - Restore saved window positions manually or automatically
- 🖥️ **Multi-monitor support** - Different layouts for different monitors (identified by UUID)
- 🤖 **Daemon mode** - Automatically restore windows when monitors connect
- 🚀 **Simple CLI** - Easy to use command-line interface

## Installation

### Using uv (recommended)

```bash
cd monitors
uv sync
```

### Run from anywhere with uvx

```bash
# No installation needed!
uvx --from /Users/taras/Documents/code/ai-toolbox/monitors monitor-manager --help
```

Or add an alias to your shell config:

```bash
alias mm='uvx --from /Users/taras/Documents/code/ai-toolbox/monitors monitor-manager'
```

## Usage

### Basic Commands

```bash
# Show connected monitors
monitor-manager info

# Save current window layout
monitor-manager save work-setup

# List saved profiles
monitor-manager list

# Restore a saved layout
monitor-manager restore work-setup

# Delete a profile
monitor-manager delete work-setup

# Run daemon mode (auto-restore on monitor change)
monitor-manager daemon
```

### Typical Workflow

1. **Set up your windows** - Arrange windows how you like them
2. **Save the layout** - `monitor-manager save home-setup`
3. **Connect to different monitor** - Your windows might get rearranged
4. **Restore the layout** - `monitor-manager restore home-setup`

Or use daemon mode to restore automatically:

```bash
monitor-manager daemon
# Leave this running, and it will auto-restore when you connect monitors
```

## Permissions

**Important:** Window restoration requires Accessibility permissions.

### Grant Accessibility Permission:

1. Open **System Preferences** > **Security & Privacy** > **Privacy**
2. Select **Accessibility** from the left sidebar
3. Click the lock icon to make changes
4. Add **Terminal** (or your Python executable) to the allowed list
5. Re-run the restore command

**Note:** Window capture (save/list/info) works without permissions. Only restore requires Accessibility access.

## How It Works

- **Monitor identification**: Uses monitor UUID (persistent across reconnects)
- **Window capture**: Uses macOS Quartz API to read window positions
- **Window restoration**: Uses Accessibility API to set window positions
- **Storage**: JSON file at `~/.config/monitor-manager/profiles.json`

## Limitations

- macOS only
- Some apps don't support window positioning via Accessibility API
- **Spaces (Virtual Desktops) Limitation** - This is the main limitation:
  - ✅ **Capture**: Works across ALL Spaces - captures all windows everywhere
  - ❌ **Restore**: Only works for windows in the CURRENT Space
  - **Why**: macOS Accessibility API can't access windows in inactive Spaces
  - **Workaround**: Switch to each Space and run `restore` again
  - **Expected**: ~30% success rate if you have windows across multiple Spaces
- Small utility windows (< 200x200) are automatically filtered out
- Full-screen windows may not restore correctly

## Examples

```bash
# Check what monitors are connected
$ monitor-manager info
Connected displays (2):

  Built-in Retina Display
    UUID: 37D8832A-2D66-02CA-B9F7-8F30A301B230
    Resolution: 1920x1080
    Position: (0, 0)
    Main display: Yes
    ...

# Save your current setup
$ monitor-manager save office-desk
Capturing windows on: Dell U2720Q
Monitor UUID: 9F2E8A3B-1C4D-03BA-A8E6-7D20B402C341

Captured 12 windows:
  - Google Chrome: GitHub [1920x1080 at 0,25]
  - Terminal: ~ [800x600 at 1920,25]
  ...

✓ Profile 'office-desk' saved successfully

# Later, restore it
$ monitor-manager restore office-desk
Restoring profile: office-desk
Monitor: Dell U2720Q
Windows: 12

Results:
  ✓ Restored: 10
  ✗ Failed: 0
  - Skipped (app not running): 2
```

## Troubleshooting

### "Accessibility permission required"

Grant permission in System Preferences (see Permissions section above).

### Windows don't restore

- Make sure the app is running
- Some apps don't support Accessibility API
- Try closing and reopening the app

### Daemon doesn't detect monitor changes

- Make sure you have Accessibility permissions
- Try disconnecting and reconnecting the monitor
- Check that the daemon is running

## Development

```bash
# Install dependencies
uv sync

# Run locally
uv run monitor-manager info

# Run from anywhere
uvx --from . monitor-manager info
```

## License

MIT - Do whatever you want with it!
