"""Window position capture utilities."""

from Quartz import (
    CGWindowListCopyWindowInfo,
    kCGWindowListOptionAll,
    kCGWindowListExcludeDesktopElements,
    kCGNullWindowID,
)
from .monitor_info import get_all_displays


def get_window_monitor(window_bounds, displays):
    """
    Determine which monitor a window is on based on its position.

    Args:
        window_bounds: Dict with x, y, width, height
        displays: List of display dictionaries

    Returns:
        Monitor UUID or None
    """
    window_center_x = window_bounds['x'] + window_bounds['width'] / 2
    window_center_y = window_bounds['y'] + window_bounds['height'] / 2

    for display in displays:
        bounds = display['bounds']
        if (bounds['x'] <= window_center_x <= bounds['x'] + bounds['width'] and
            bounds['y'] <= window_center_y <= bounds['y'] + bounds['height']):
            return display['uuid']

    # If not found, return main display UUID
    main = next((d for d in displays if d['is_main']), displays[0] if displays else None)
    return main['uuid'] if main else None


def capture_window_positions():
    """
    Capture positions of all windows across all Spaces and monitors.

    Returns:
        list: List of window dictionaries with app, title, bounds, and monitor UUID.
    """
    # Get all connected displays
    displays = get_all_displays()

    # Get all windows (including those in other Spaces)
    # Using kCGWindowListOptionAll instead of kCGWindowListOptionOnScreenOnly
    window_list = CGWindowListCopyWindowInfo(
        kCGWindowListOptionAll | kCGWindowListExcludeDesktopElements,
        kCGNullWindowID
    )

    if not window_list:
        return []

    windows = []
    for window in window_list:
        # Get window properties
        owner_name = window.get('kCGWindowOwnerName', '')
        window_name = window.get('kCGWindowName', '')
        bounds = window.get('kCGWindowBounds', {})
        window_number = window.get('kCGWindowNumber', 0)
        owner_pid = window.get('kCGWindowOwnerPID', 0)
        layer = window.get('kCGWindowLayer', 0)

        # Skip windows without owner or bounds
        if not owner_name or not bounds:
            continue

        # Skip menu bar and other system UI (layer 0 is normal windows)
        # Negative layers are often system UI
        if layer < 0:
            continue

        # Create window record
        window_bounds = {
            'x': int(bounds.get('X', 0)),
            'y': int(bounds.get('Y', 0)),
            'width': int(bounds.get('Width', 0)),
            'height': int(bounds.get('Height', 0)),
        }

        # Determine which monitor this window is on
        monitor_uuid = get_window_monitor(window_bounds, displays)

        window_data = {
            'app': owner_name,
            'title': window_name or '',
            'pid': owner_pid,
            'window_number': window_number,
            'bounds': window_bounds,
            'layer': layer,
            'monitor_uuid': monitor_uuid,
        }

        windows.append(window_data)

    return windows


def filter_relevant_windows(windows, min_size=100):
    """
    Filter out tiny windows, system UI, and duplicates.

    Args:
        windows: List of window dictionaries
        min_size: Minimum width or height to keep

    Returns:
        list: Filtered window list
    """
    # System apps to exclude
    excluded_apps = {
        'Dock', 'Notification Centre', 'Control Centre', 'Spotlight',
        'loginwindow', 'WindowManager', 'Window Server', 'Raycast',
        'CursorUIViewService', 'AutoFill', 'Open and Save Panel Service',
        'Homerow', 'Privacy & Security', 'System Settings'
    }

    filtered = []
    seen_windows = []  # Track all filtered windows for fuzzy matching

    def is_near_duplicate(new_window, existing_windows, threshold=5):
        """Check if a window is a near-duplicate of an existing one."""
        new_bounds = new_window['bounds']
        new_app = new_window['app']

        for existing in existing_windows:
            if existing['app'] != new_app:
                continue

            existing_bounds = existing['bounds']

            # Check if positions and sizes are within threshold
            if (abs(new_bounds['x'] - existing_bounds['x']) <= threshold and
                abs(new_bounds['y'] - existing_bounds['y']) <= threshold and
                abs(new_bounds['width'] - existing_bounds['width']) <= threshold and
                abs(new_bounds['height'] - existing_bounds['height']) <= threshold):
                return True

        return False

    for window in windows:
        # Skip excluded system apps
        if window['app'] in excluded_apps:
            continue

        bounds = window['bounds']

        # Skip tiny windows
        if bounds['width'] < min_size or bounds['height'] < min_size:
            continue

        # Skip windows with weird positions (off-screen system UI)
        # Normal screen positions should be reasonable
        if abs(bounds['x']) > 10000 or abs(bounds['y']) > 10000:
            continue

        # Skip placeholder/minimized windows (500x500 at specific positions)
        # These are often off-screen or minimized windows
        if bounds['width'] == 500 and bounds['height'] == 500:
            # If it's at position (0, 482) or similar, likely a placeholder
            if bounds['x'] == 0 and bounds['y'] > 400 and bounds['y'] < 500:
                continue

        # Skip near-duplicates (windows within 5 pixels of each other)
        if is_near_duplicate(window, seen_windows):
            continue

        seen_windows.append(window)
        filtered.append(window)

    return filtered
