"""Monitor detection and information utilities."""

from Quartz import (
    CGMainDisplayID,
    CGGetActiveDisplayList,
    CGDisplayBounds,
    CGDisplaySerialNumber,
    CGDisplayVendorNumber,
    CGDisplayModelNumber,
)
from Cocoa import NSScreen
import hashlib


def get_display_uuid(display_id, serial, vendor, model):
    """
    Get a persistent identifier for a display.

    Uses a hash of serial/vendor/model to create a stable UUID-like identifier.
    Falls back to display_id if no unique identifiers available.
    """
    # Create a stable identifier from available info
    # This will be consistent across reconnects as long as the same monitor is used
    identifier_parts = [str(vendor), str(model), str(serial)]
    identifier_string = "-".join(identifier_parts)

    # Create a hash to make it UUID-like
    hash_obj = hashlib.sha256(identifier_string.encode())
    hash_hex = hash_obj.hexdigest()

    # Format as UUID-like string (8-4-4-4-12)
    uuid_str = f"{hash_hex[0:8]}-{hash_hex[8:12]}-{hash_hex[12:16]}-{hash_hex[16:20]}-{hash_hex[20:32]}"

    return uuid_str


def get_all_displays():
    """Get information about all connected displays."""
    max_displays = 32
    (err, active_displays, display_count) = CGGetActiveDisplayList(max_displays, None, None)

    if err:
        return []

    displays = []
    for display_id in active_displays[:display_count]:
        bounds = CGDisplayBounds(display_id)
        serial = CGDisplaySerialNumber(display_id)
        vendor = CGDisplayVendorNumber(display_id)
        model = CGDisplayModelNumber(display_id)
        uuid = get_display_uuid(display_id, serial, vendor, model)

        # Get friendly name from NSScreen
        name = None
        screens = NSScreen.screens()
        for screen in screens:
            desc = screen.deviceDescription()
            screen_id = desc.get('NSScreenNumber', None)
            if screen_id == display_id:
                name = desc.get('NSDeviceDescriptionKey', None)
                if not name:
                    # Try to get localized name
                    name = screen.localizedName() if hasattr(screen, 'localizedName') else None
                break

        displays.append({
            'id': display_id,
            'uuid': uuid,
            'name': name or f"Display {display_id}",
            'bounds': {
                'x': bounds.origin.x,
                'y': bounds.origin.y,
                'width': bounds.size.width,
                'height': bounds.size.height,
            },
            'serial': serial,
            'vendor': vendor,
            'model': model,
            'is_main': display_id == CGMainDisplayID(),
        })

    return displays


def get_current_monitor_uuid():
    """Get UUID of the main display."""
    main_display_id = CGMainDisplayID()
    serial = CGDisplaySerialNumber(main_display_id)
    vendor = CGDisplayVendorNumber(main_display_id)
    model = CGDisplayModelNumber(main_display_id)
    return get_display_uuid(main_display_id, serial, vendor, model)
