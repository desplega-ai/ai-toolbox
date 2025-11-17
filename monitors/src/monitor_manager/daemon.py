"""Daemon mode for automatic window restoration on monitor changes."""

import time
import objc
from Foundation import (
    NSNotificationCenter,
    NSObject,
    NSRunLoop,
    NSDefaultRunLoopMode,
)
try:
    from AppKit import NSApplication
except ImportError:
    # Fallback if AppKit is not available
    NSApplication = None

from .monitor_info import get_all_displays
from .storage import find_profile_by_monitor
from .restore import restore_window_positions


class ScreenChangeObserver(NSObject):
    """Observer for screen configuration changes."""

    def init(self):
        """Initialize the observer."""
        self = objc.super(ScreenChangeObserver, self).init()
        if self is None:
            return None
        self.last_check_time = 0
        self.debounce_delay = 2.0  # Wait 2 seconds after change to restore
        return self

    def screenParametersChanged_(self, notification):
        """Handle screen configuration changes."""
        current_time = time.time()

        # Debounce - only process if enough time has passed
        if current_time - self.last_check_time < self.debounce_delay:
            return

        self.last_check_time = current_time

        print("\n[Monitor change detected]")

        # Wait a bit for things to settle
        time.sleep(1.0)

        # Get current displays
        displays = get_all_displays()

        print(f"Connected displays: {len(displays)}")
        for display in displays:
            print(f"  - {display['name']} (UUID: {display['uuid']})")

        # Try to find and restore profiles for connected monitors
        for display in displays:
            monitor_uuid = display['uuid']
            profile_name, profile_data = find_profile_by_monitor(monitor_uuid)

            if profile_name and profile_data:
                print(f"\nFound profile '{profile_name}' for {display['name']}")
                print(f"Restoring {profile_data['window_count']} windows...")

                windows = profile_data['windows']
                stats = restore_window_positions(windows)

                print(f"Results: {stats['successful']} restored, {stats['failed']} failed, {stats['skipped']} skipped")


def run_daemon():
    """Run the daemon to monitor for screen changes."""
    print("Monitor Manager Daemon Started")
    print("Watching for display configuration changes...")
    print("Press Ctrl+C to stop\n")

    if not NSApplication:
        print("Error: AppKit not available. Daemon mode requires AppKit.")
        return False

    # Create observer
    observer = ScreenChangeObserver.alloc().init()

    # Get notification center
    notification_center = NSNotificationCenter.defaultCenter()

    # Register for screen configuration change notifications
    notification_center.addObserver_selector_name_object_(
        observer,
        'screenParametersChanged:',
        'NSApplicationDidChangeScreenParametersNotification',
        None
    )

    print("Daemon is running. Connect/disconnect monitors to trigger restoration.\n")

    # Run the event loop
    try:
        app = NSApplication.sharedApplication()
        app.run()
    except KeyboardInterrupt:
        print("\nDaemon stopped.")
        notification_center.removeObserver_(observer)
        return True

    return True
