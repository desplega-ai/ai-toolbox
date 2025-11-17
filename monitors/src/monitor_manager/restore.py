"""Window position restoration utilities."""

import Quartz
import time
from Cocoa import (
    NSWorkspace,
    NSRunningApplication,
)
from Quartz import (
    CGEventCreateKeyboardEvent,
    CGEventPost,
    CGEventSetFlags,
    kCGHIDEventTap,
    kCGEventFlagMaskControl,
)

# Import Accessibility API functions
try:
    from ApplicationServices import (
        AXIsProcessTrusted,
        AXUIElementCreateApplication,
        AXUIElementCopyAttributeValue,
        AXUIElementSetAttributeValue,
        AXValueCreate,
        kAXWindowsAttribute,
        kAXTitleAttribute,
        kAXPositionAttribute,
        kAXSizeAttribute,
        kAXValueCGPointType,
        kAXValueCGSizeType,
        kAXErrorSuccess,
    )
except ImportError:
    # If ApplicationServices import fails, try to get them from other places
    try:
        from Quartz import (
            AXIsProcessTrusted,
            AXUIElementCreateApplication,
            AXUIElementCopyAttributeValue,
            AXUIElementSetAttributeValue,
            AXValueCreate,
            kAXWindowsAttribute,
            kAXTitleAttribute,
            kAXPositionAttribute,
            kAXSizeAttribute,
            kAXValueCGPointType,
            kAXValueCGSizeType,
            kAXErrorSuccess,
        )
    except (ImportError, AttributeError):
        # Last resort: create dummy function
        def AXIsProcessTrusted():
            return False
        raise ImportError("Could not import Accessibility API functions. Install pyobjc-framework-ApplicationServices")


def check_accessibility_permission():
    """
    Check if the app has Accessibility permissions.

    Returns:
        bool: True if permissions are granted, False otherwise
    """
    return AXIsProcessTrusted()


def switch_to_space(space_number, verbose=False):
    """
    Switch to a specific Space using keyboard shortcuts (Ctrl+<number>).

    Args:
        space_number: Space number (1-9)
        verbose: Print debug info

    Note:
        Requires "Mission Control" keyboard shortcuts to be enabled in System Preferences.
    """
    if space_number < 1 or space_number > 9:
        return

    if verbose:
        print(f"  Switching to Space {space_number}...")

    # Key codes for numbers 1-9
    key_codes = {
        1: 18,  # 1
        2: 19,  # 2
        3: 20,  # 3
        4: 21,  # 4
        5: 23,  # 5
        6: 22,  # 6
        7: 26,  # 7
        8: 28,  # 8
        9: 25,  # 9
    }

    key_code = key_codes.get(space_number)
    if not key_code:
        return

    # Create key down event with Control modifier
    key_down = CGEventCreateKeyboardEvent(None, key_code, True)
    CGEventSetFlags(key_down, kCGEventFlagMaskControl)

    # Create key up event
    key_up = CGEventCreateKeyboardEvent(None, key_code, False)

    # Post the events
    CGEventPost(kCGHIDEventTap, key_down)
    time.sleep(0.05)
    CGEventPost(kCGHIDEventTap, key_up)

    # Wait for Space to switch (macOS animation time)
    time.sleep(1.5)


def get_running_app_by_name(app_name):
    """Get a running application by name."""
    workspace = NSWorkspace.sharedWorkspace()
    running_apps = workspace.runningApplications()

    for app in running_apps:
        if app.localizedName() == app_name:
            return app

    return None


def get_running_app_by_pid(pid):
    """Get a running application by PID."""
    return NSRunningApplication.runningApplicationWithProcessIdentifier_(pid)


def set_window_position(app_name, window_title, bounds, pid=None, verbose=False):
    """
    Set a window's position and size using Accessibility API.

    Args:
        app_name: Name of the application
        window_title: Title of the window (can be empty)
        bounds: Dictionary with x, y, width, height
        pid: Optional process ID for faster lookup
        verbose: Print debug info

    Returns:
        tuple: (success: bool, error_message: str)
    """
    if not check_accessibility_permission():
        return False, "No accessibility permission"

    # Get the running app
    if pid:
        app = get_running_app_by_pid(pid)
    else:
        app = get_running_app_by_name(app_name)

    if not app:
        return False, "App not found"

    # Create accessibility element for the app
    app_ref = AXUIElementCreateApplication(app.processIdentifier())

    # Get all windows
    err, windows = AXUIElementCopyAttributeValue(
        app_ref,
        kAXWindowsAttribute,
        None
    )

    if err != kAXErrorSuccess:
        return False, f"Can't access windows (error {err})"

    if not windows:
        return False, "No windows found"

    if verbose:
        print(f"    Found {len(windows)} window(s)")

    # Find the matching window
    target_window = None

    for window in windows:
        # If we have a window title, try to match it
        if window_title:
            err, title = AXUIElementCopyAttributeValue(
                window,
                kAXTitleAttribute,
                None
            )
            if err == kAXErrorSuccess and title == window_title:
                target_window = window
                if verbose:
                    print(f"    Matched by title: '{title}'")
                break
        else:
            # If no title specified, use the first window
            target_window = window
            if verbose:
                print(f"    Using first window (no title to match)")
            break

    # If we didn't find a match by title, use the first window
    if not target_window and windows:
        target_window = windows[0]
        if verbose:
            print(f"    Title match failed, using first window")

    if not target_window:
        return False, "No target window"

    # Set position
    position = AXValueCreate(
        kAXValueCGPointType,
        (bounds['x'], bounds['y'])
    )
    err = AXUIElementSetAttributeValue(
        target_window,
        kAXPositionAttribute,
        position
    )

    if err != kAXErrorSuccess:
        return False, f"Can't set position (error {err})"

    # Set size
    size = AXValueCreate(
        kAXValueCGSizeType,
        (bounds['width'], bounds['height'])
    )
    err = AXUIElementSetAttributeValue(
        target_window,
        kAXSizeAttribute,
        size
    )

    if err != kAXErrorSuccess:
        return False, f"Can't set size (error {err})"

    return True, "Success"


def restore_window_positions(windows, verbose=False):
    """
    Restore positions for a list of windows across all Spaces.

    This function automatically switches through Spaces 1-9 and restores
    windows in each Space.

    Args:
        windows: List of window dictionaries
        verbose: If True, print detailed progress

    Returns:
        dict: Statistics about restoration (successful, failed)
    """
    if not check_accessibility_permission():
        print("Error: Accessibility permission required!")
        print("Go to: System Preferences > Security & Privacy > Accessibility")
        print("Add Terminal or your Python executable to the allowed list.")
        return {'successful': 0, 'failed': len(windows), 'error': 'no_permission'}

    print("Restoring windows across all Spaces...")
    print("Note: This will switch through Spaces 1-9 automatically.\n")

    stats = {'successful': 0, 'failed': 0, 'skipped': 0}

    # Try restoring in Spaces 1-9
    for space_num in range(1, 10):
        if verbose:
            print(f"\n=== Space {space_num} ===")

        # Switch to this Space
        switch_to_space(space_num, verbose=verbose)

        # Try to restore windows in this Space
        space_stats = {'successful': 0, 'failed': 0}

        for i, window in enumerate(windows, 1):
            app_name = window['app']
            title = window.get('title', '')
            bounds = window['bounds']
            pid = window.get('pid')

            # Check if app is running
            if pid:
                app = get_running_app_by_pid(pid)
            else:
                app = get_running_app_by_name(app_name)

            if not app:
                continue  # Don't count as skipped in each Space

            # Try to restore position
            success, error_msg = set_window_position(app_name, title, bounds, app.processIdentifier(), verbose=False)

            if success:
                stats['successful'] += 1
                space_stats['successful'] += 1
                if verbose:
                    print(f"  ✓ {app_name}: {title or '(no title)'}")
            elif error_msg != "No windows found":
                # Only count as failed if it's not just "window not in this Space"
                space_stats['failed'] += 1

        # Print summary for this Space
        if space_stats['successful'] > 0 or verbose:
            print(f"Space {space_num}: {space_stats['successful']} restored")

    # Count skipped apps (apps not running at all)
    running_apps = set()
    for window in windows:
        app_name = window['app']
        pid = window.get('pid')

        if pid:
            app = get_running_app_by_pid(pid)
        else:
            app = get_running_app_by_name(app_name)

        if app:
            running_apps.add(app_name)

    total_apps = len(set(w['app'] for w in windows))
    stats['skipped'] = total_apps - len(running_apps)
    stats['failed'] = len(windows) - stats['successful'] - stats['skipped']

    return stats
