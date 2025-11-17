"""Profile storage and management."""

import json
import os
from pathlib import Path
from datetime import datetime


def get_storage_path():
    """Get the path to the profiles JSON file."""
    # Store in the project directory for now
    # Could use ~/.config/monitor-manager/ for system-wide storage
    home = Path.home()
    config_dir = home / '.config' / 'monitor-manager'
    config_dir.mkdir(parents=True, exist_ok=True)
    return config_dir / 'profiles.json'


def load_profiles():
    """Load all profiles from storage."""
    storage_path = get_storage_path()

    if not storage_path.exists():
        return {}

    try:
        with open(storage_path, 'r') as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError) as e:
        print(f"Warning: Could not load profiles: {e}")
        return {}


def save_profiles(profiles):
    """Save all profiles to storage."""
    storage_path = get_storage_path()

    try:
        with open(storage_path, 'w') as f:
            json.dump(profiles, f, indent=2)
        return True
    except IOError as e:
        print(f"Error: Could not save profiles: {e}")
        return False


def save_profile(profile_name, monitor_uuid, monitor_name, windows):
    """
    Save a window layout profile.

    Args:
        profile_name: Name of the profile
        monitor_uuid: UUID of the monitor
        monitor_name: Friendly name of the monitor
        windows: List of window dictionaries
    """
    profiles = load_profiles()

    profile_data = {
        'monitor_uuid': monitor_uuid,
        'monitor_name': monitor_name,
        'created': datetime.now().isoformat(),
        'window_count': len(windows),
        'windows': windows,
    }

    profiles[profile_name] = profile_data

    if save_profiles(profiles):
        return True
    return False


def get_profile(profile_name):
    """Get a specific profile by name."""
    profiles = load_profiles()
    return profiles.get(profile_name)


def list_profiles():
    """List all saved profiles."""
    profiles = load_profiles()
    return profiles


def delete_profile(profile_name):
    """Delete a profile."""
    profiles = load_profiles()

    if profile_name not in profiles:
        return False

    del profiles[profile_name]
    return save_profiles(profiles)


def find_profile_by_monitor(monitor_uuid):
    """Find a profile matching the given monitor UUID."""
    profiles = load_profiles()

    for name, data in profiles.items():
        if data.get('monitor_uuid') == monitor_uuid:
            return name, data

    return None, None
