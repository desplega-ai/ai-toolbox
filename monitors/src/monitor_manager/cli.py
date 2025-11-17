"""Command-line interface for monitor-manager."""

import sys
import argparse
from datetime import datetime

from .capture import capture_window_positions, filter_relevant_windows
from .monitor_info import get_all_displays, get_current_monitor_uuid
from .storage import (
    save_profile,
    get_profile,
    list_profiles,
    delete_profile,
    get_storage_path,
)
from .restore import restore_window_positions, check_accessibility_permission
from .daemon import run_daemon


def cmd_save(args):
    """Save current window layout to a profile."""
    profile_name = args.profile

    # Get current monitor info
    displays = get_all_displays()
    if not displays:
        print("Error: No displays found")
        return 1

    # Use main display for the profile
    main_display = next((d for d in displays if d['is_main']), displays[0])

    print(f"Capturing windows on: {main_display['name']}")
    print(f"Monitor UUID: {main_display['uuid']}\n")

    # Capture window positions
    windows = capture_window_positions()

    if not windows:
        print("No windows found to save")
        return 1

    # Filter out tiny windows and system UI
    windows = filter_relevant_windows(windows, min_size=200)

    print(f"Captured {len(windows)} windows:")

    # Group by position to show overlapping windows (different Spaces)
    position_map = {}
    for window in windows:
        title = window['title'] or '(no title)'
        bounds = window['bounds']
        pos_key = f"{bounds['x']},{bounds['y']},{bounds['width']},{bounds['height']}"

        if pos_key not in position_map:
            position_map[pos_key] = []
        position_map[pos_key].append(window['app'])

        overlap_marker = ""
        if len(position_map[pos_key]) > 1:
            overlap_marker = " [overlaps - likely different Space]"

        print(f"  - {window['app']}: {title} [{bounds['width']}x{bounds['height']} at {bounds['x']},{bounds['y']}]{overlap_marker}")

    # Save profile
    success = save_profile(
        profile_name,
        main_display['uuid'],
        main_display['name'],
        windows
    )

    if success:
        print(f"\n✓ Profile '{profile_name}' saved successfully")
        print(f"Storage: {get_storage_path()}")
        return 0
    else:
        print("\n✗ Failed to save profile")
        return 1


def cmd_restore(args):
    """Restore window layout from a profile."""
    profile_name = args.profile

    # Check accessibility permission first
    if not check_accessibility_permission():
        print("✗ Error: Accessibility permission required!")
        print("\nTo grant permission:")
        print("1. Open System Preferences > Security & Privacy > Privacy")
        print("2. Select 'Accessibility' from the list")
        print("3. Click the lock to make changes")
        print("4. Add Terminal (or your Python executable) to the allowed list")
        print("5. Re-run this command")
        return 1

    # Load profile
    profile = get_profile(profile_name)

    if not profile:
        print(f"✗ Profile '{profile_name}' not found")
        print("\nAvailable profiles:")
        cmd_list(args)
        return 1

    print(f"Restoring profile: {profile_name}")
    print(f"Monitor: {profile['monitor_name']}")
    print(f"Windows: {profile['window_count']}\n")

    # Restore windows
    windows = profile['windows']
    verbose = args.verbose if hasattr(args, 'verbose') else False
    stats = restore_window_positions(windows, verbose=verbose)

    if 'error' in stats:
        return 1

    # Print results
    print(f"\nResults:")
    print(f"  ✓ Restored: {stats['successful']}")
    print(f"  ✗ Failed: {stats['failed']}")
    print(f"  - Skipped (app not running): {stats['skipped']}")

    return 0 if stats['successful'] > 0 else 1


def cmd_list(args):
    """List all saved profiles."""
    profiles = list_profiles()

    if not profiles:
        print("No profiles saved yet")
        print(f"\nStorage location: {get_storage_path()}")
        print(f"Use 'monitor-manager save <name>' to create a profile")
        return 0

    print(f"Saved profiles ({len(profiles)}):\n")

    for name, data in profiles.items():
        created = datetime.fromisoformat(data['created']).strftime('%Y-%m-%d %H:%M')
        print(f"  {name}")
        print(f"    Monitor: {data['monitor_name']}")
        print(f"    UUID: {data['monitor_uuid']}")
        print(f"    Windows: {data['window_count']}")
        print(f"    Created: {created}")
        print()

    print(f"Storage: {get_storage_path()}")
    return 0


def cmd_info(args):
    """Show information about connected monitors."""
    displays = get_all_displays()

    if not displays:
        print("No displays found")
        return 1

    print(f"Connected displays ({len(displays)}):\n")

    for display in displays:
        print(f"  {display['name']}")
        print(f"    UUID: {display['uuid']}")
        print(f"    Resolution: {int(display['bounds']['width'])}x{int(display['bounds']['height'])}")
        print(f"    Position: ({int(display['bounds']['x'])}, {int(display['bounds']['y'])})")
        print(f"    Main display: {'Yes' if display['is_main'] else 'No'}")
        print(f"    Serial: {display['serial']}")
        print(f"    Vendor: {display['vendor']}")
        print(f"    Model: {display['model']}")
        print()

    return 0


def cmd_delete(args):
    """Delete a saved profile."""
    profile_name = args.profile

    success = delete_profile(profile_name)

    if success:
        print(f"✓ Profile '{profile_name}' deleted")
        return 0
    else:
        print(f"✗ Profile '{profile_name}' not found")
        return 1


def cmd_daemon(args):
    """Run in daemon mode to auto-restore on monitor changes."""
    # Check accessibility permission first
    if not check_accessibility_permission():
        print("✗ Error: Accessibility permission required for daemon mode!")
        print("\nTo grant permission:")
        print("1. Open System Preferences > Security & Privacy > Privacy")
        print("2. Select 'Accessibility' from the list")
        print("3. Click the lock to make changes")
        print("4. Add Terminal (or your Python executable) to the allowed list")
        print("5. Re-run this command")
        return 1

    run_daemon()
    return 0


def main():
    """Main entry point for the CLI."""
    parser = argparse.ArgumentParser(
        description='macOS window position manager for multiple monitors',
        prog='monitor-manager'
    )

    subparsers = parser.add_subparsers(dest='command', help='Commands')

    # Save command
    save_parser = subparsers.add_parser('save', help='Save current window layout')
    save_parser.add_argument('profile', help='Profile name')

    # Restore command
    restore_parser = subparsers.add_parser('restore', help='Restore window layout')
    restore_parser.add_argument('profile', help='Profile name')
    restore_parser.add_argument('-v', '--verbose', action='store_true', help='Show detailed progress')

    # List command
    list_parser = subparsers.add_parser('list', help='List saved profiles')

    # Info command
    info_parser = subparsers.add_parser('info', help='Show monitor information')

    # Delete command
    delete_parser = subparsers.add_parser('delete', help='Delete a profile')
    delete_parser.add_argument('profile', help='Profile name')

    # Daemon command
    daemon_parser = subparsers.add_parser('daemon', help='Run in daemon mode (auto-restore on monitor change)')

    # Parse arguments
    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        return 0

    # Execute command
    commands = {
        'save': cmd_save,
        'restore': cmd_restore,
        'list': cmd_list,
        'info': cmd_info,
        'delete': cmd_delete,
        'daemon': cmd_daemon,
    }

    cmd_func = commands.get(args.command)
    if cmd_func:
        return cmd_func(args)
    else:
        parser.print_help()
        return 1


if __name__ == '__main__':
    sys.exit(main())
