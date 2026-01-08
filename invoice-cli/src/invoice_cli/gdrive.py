"""Google Drive API integration for invoice-cli."""

from pathlib import Path

from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload

from invoice_cli.gmail import authenticate


def get_drive_service(token_file: Path):
    """Build Google Drive API service.

    Args:
        token_file: Path to the token file

    Returns:
        Drive API service instance
    """
    creds = authenticate(token_file)
    return build("drive", "v3", credentials=creds)


def find_or_create_folder(service, name: str, parent_id: str | None = None) -> str:
    """Find or create a folder in Drive.

    Args:
        service: Drive API service
        name: Folder name
        parent_id: Parent folder ID (None for root)

    Returns:
        Folder ID
    """
    # Search for existing folder
    query = f"name = '{name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false"
    if parent_id:
        query += f" and '{parent_id}' in parents"
    else:
        query += " and 'root' in parents"

    results = service.files().list(
        q=query,
        spaces="drive",
        fields="files(id, name)",
    ).execute()

    files = results.get("files", [])
    if files:
        return files[0]["id"]

    # Create new folder
    file_metadata = {
        "name": name,
        "mimeType": "application/vnd.google-apps.folder",
    }
    if parent_id:
        file_metadata["parents"] = [parent_id]

    folder = service.files().create(
        body=file_metadata,
        fields="id",
    ).execute()

    return folder["id"]


def create_folder_path(
    service,
    path_parts: list[str],
    root_folder: str | None = None,
    root_folder_id: str | None = None,
) -> str:
    """Create nested folder structure and return the final folder ID.

    Args:
        service: Drive API service
        path_parts: List of folder names (e.g., ["2024", "Acme Corp", "12"])
        root_folder: Root folder path (can be nested, e.g., "Business/Invoices")
        root_folder_id: Direct folder ID (overrides root_folder if provided)

    Returns:
        Final folder ID
    """
    # Start with root folder ID if provided, otherwise create from path
    if root_folder_id:
        current_id = root_folder_id
    else:
        current_id = None
        if root_folder:
            for root_part in root_folder.split("/"):
                root_part = root_part.strip()
                if root_part:
                    current_id = find_or_create_folder(service, root_part, current_id)

    # Create each nested folder from pattern
    for part in path_parts:
        current_id = find_or_create_folder(service, part, current_id)

    return current_id


def file_exists(service, name: str, folder_id: str) -> str | None:
    """Check if a file exists in a folder.

    Args:
        service: Drive API service
        name: File name
        folder_id: Parent folder ID

    Returns:
        File ID if exists, None otherwise
    """
    query = f"name = '{name}' and '{folder_id}' in parents and trashed = false"

    results = service.files().list(
        q=query,
        spaces="drive",
        fields="files(id)",
    ).execute()

    files = results.get("files", [])
    return files[0]["id"] if files else None


def upload_file(
    service,
    local_path: Path,
    folder_id: str,
    name: str,
    skip_existing: bool = True,
) -> str | None:
    """Upload a file to Google Drive.

    Args:
        service: Drive API service
        local_path: Path to local file
        folder_id: Target folder ID
        name: File name on Drive
        skip_existing: If True, skip files that already exist

    Returns:
        File ID if uploaded, None if skipped
    """
    # Check if file exists
    existing_id = file_exists(service, name, folder_id)
    if existing_id and skip_existing:
        return None  # Skip existing

    # Determine mime type
    suffix = local_path.suffix.lower()
    mime_types = {
        ".pdf": "application/pdf",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
    }
    mime_type = mime_types.get(suffix, "application/octet-stream")

    file_metadata = {
        "name": name,
        "parents": [folder_id],
    }

    media = MediaFileUpload(str(local_path), mimetype=mime_type, resumable=True)

    file = service.files().create(
        body=file_metadata,
        media_body=media,
        fields="id",
    ).execute()

    return file["id"]
