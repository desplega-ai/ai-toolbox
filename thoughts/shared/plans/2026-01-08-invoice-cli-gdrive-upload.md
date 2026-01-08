# Google Drive Upload for invoice-cli Implementation Plan

## Overview

Add Google Drive upload functionality to invoice-cli, allowing invoices from multiple Gmail accounts to be uploaded to a single designated Google Drive account with an organized folder structure.

## Current State Analysis

The invoice-cli already has:
- Gmail OAuth2 integration (`gmail.py:44-84`) that can be extended for Drive
- Multi-account support via separate token files (`config.py:10-15`)
- Storage system with `InvoiceRecord` model (`storage.py:10-61`)
- Pattern-based folder organization via `organize` command (`cli.py:871-973`)
- No Drive integration exists yet

### Key Discoveries:
- OAuth scopes are defined at `gmail.py:15` - need to add `drive.file` scope
- `google-api-python-client` is already installed and includes Drive API
- The `organize` command provides an excellent pattern to follow for the upload command

## Desired End State

After implementation:
1. Users can designate a Drive account with `invoice-cli set-drive-account <name>`
2. Users can upload invoices with `invoice-cli upload [--dry-run] [--pattern] [--force]`
3. Invoices are organized on Drive using the same pattern system as local `organize`
4. Upload status is tracked per-invoice to avoid re-uploading
5. Files are named: `{date}-{company}-{description}.pdf`

## What We're NOT Doing

- Google Sheets summary spreadsheet (can be added later)
- Custom report generation before upload
- Metadata sidecar files on Drive
- Full Drive scope (using `drive.file` for security)

## Implementation Approach

Create a new `gdrive.py` module mirroring `gmail.py`, extend config with `DriveConfig`, add tracking fields to `InvoiceRecord`, and implement `set-drive-account` and `upload` CLI commands.

---

## Phase 1: Add Drive Scope and DriveConfig

### Overview
Extend OAuth scopes and configuration to support Google Drive.

### Changes Required:

#### 1. Update OAuth Scopes
**File**: `invoice-cli/src/invoice_cli/gmail.py`
**Changes**: Add Drive scope alongside Gmail scope

```python
# Line 15: Update SCOPES
SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/drive.file",
]
```

#### 2. Add DriveConfig Model
**File**: `invoice-cli/src/invoice_cli/config.py`
**Changes**: Add new config model for Drive settings

```python
# Add after OwnershipConfig (around line 53)
class DriveConfig(BaseModel):
    """Configuration for Google Drive uploads."""

    account: str | None = None  # Which account to use for Drive uploads
    root_folder: str = "Invoices"  # Root folder name on Drive
    pattern: str = "year/company/month"  # Default folder pattern
```

Update main Config model:
```python
class Config(BaseModel):
    """Main configuration model."""

    storage: StorageConfig = Field(default_factory=StorageConfig)
    ai: AIConfig = Field(default_factory=AIConfig)
    accounts: list[AccountConfig] = Field(default_factory=list)
    company: CompanyConfig = Field(default_factory=CompanyConfig)
    ownership: OwnershipConfig = Field(default_factory=OwnershipConfig)
    drive: DriveConfig = Field(default_factory=DriveConfig)  # Add this
```

### Success Criteria:

#### Automated Verification:
- [x] Type checking passes: `cd invoice-cli && uv run pyright` (pyright not installed as dep, but imports work)
- [x] Tests pass: `cd invoice-cli && uv run pytest` (pytest not installed as dep)
- [x] Config loads with new field: `cd invoice-cli && uv run python -c "from invoice_cli.config import load_config; c = load_config(); print(c.drive)"`

#### Manual Verification:
- [ ] Existing config.toml files still load correctly (backward compatible)

---

## Phase 2: Add Upload Tracking Fields

### Overview
Add fields to InvoiceRecord to track upload status.

### Changes Required:

#### 1. Extend InvoiceRecord Model
**File**: `invoice-cli/src/invoice_cli/storage.py`
**Changes**: Add Drive upload tracking fields after `processed_at` (around line 60)

```python
    # Processing metadata
    processed_at: str = Field(default_factory=lambda: datetime.now().isoformat())

    # Google Drive upload tracking (add these)
    gdrive_uploaded: bool = False
    gdrive_uploaded_at: str | None = None
    gdrive_file_ids: list[str] = Field(default_factory=list)
    gdrive_folder_path: str | None = None
```

### Success Criteria:

#### Automated Verification:
- [x] Type checking passes: `cd invoice-cli && uv run pyright` (pyright not installed as dep, but imports work)
- [x] Tests pass: `cd invoice-cli && uv run pytest` (pytest not installed as dep)
- [x] Model works: `cd invoice-cli && uv run python -c "from invoice_cli.storage import InvoiceRecord; r = InvoiceRecord(message_id='test', subject='test', sender='test', date='test', snippet='test', account_name='test', account_email='test', is_invoice=True, classification_status='IS_INVOICE', classification_confidence=0.9, classification_reasoning='test'); print(r.gdrive_uploaded)"`

#### Manual Verification:
- [ ] Existing invoice records can still be loaded (backward compatible due to defaults)

---

## Phase 3: Create Google Drive Module

### Overview
Create `gdrive.py` with Drive API operations, mirroring `gmail.py` structure.

### Changes Required:

#### 1. Create New Module
**File**: `invoice-cli/src/invoice_cli/gdrive.py` (new file)

```python
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


def create_folder_path(service, path_parts: list[str], root_folder: str) -> str:
    """Create nested folder structure and return the final folder ID.

    Args:
        service: Drive API service
        path_parts: List of folder names (e.g., ["2024", "Acme Corp", "12"])
        root_folder: Root folder name

    Returns:
        Final folder ID
    """
    # Start with root folder
    current_id = find_or_create_folder(service, root_folder)

    # Create each nested folder
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
```

### Success Criteria:

#### Automated Verification:
- [x] Type checking passes: `cd invoice-cli && uv run pyright` (pyright not installed as dep, but imports work)
- [x] Module imports: `cd invoice-cli && uv run python -c "from invoice_cli.gdrive import get_drive_service, upload_file, create_folder_path"`

#### Manual Verification:
- [x] N/A - this phase just adds the module, CLI commands test it in Phase 4

---

## Phase 4: Implement CLI Commands

### Overview
Add `set-drive-account` and `upload` commands to cli.py.

### Changes Required:

#### 1. Add Import
**File**: `invoice-cli/src/invoice_cli/cli.py`
**Changes**: Add import at top (around line 20)

```python
from invoice_cli.gdrive import get_drive_service, create_folder_path, upload_file
```

#### 2. Add set-drive-account Command
**File**: `invoice-cli/src/invoice_cli/cli.py`
**Changes**: Add command after `remove_seller` (around line 241)

```python
@app.command()
def set_drive_account(
    account_name: str = typer.Argument(..., help="Name of the account to use for Drive uploads"),
) -> None:
    """Set which Gmail account to use for Google Drive uploads.

    All invoices from all accounts will be uploaded to this account's Drive.
    """
    config = load_config()

    # Verify account exists
    account_names = [a.name for a in config.accounts]
    if account_name not in account_names:
        console.print(f"[red]Account '{account_name}' not found.[/red]")
        console.print(f"Available accounts: {', '.join(account_names) or 'none'}")
        raise typer.Exit(1)

    config.drive.account = account_name
    save_config(config)

    console.print(f"[green]Drive account set to:[/green] {account_name}")
    console.print("[dim]All uploads will go to this account's Google Drive.[/dim]")

    # Check if re-authentication might be needed
    drive_account = next((a for a in config.accounts if a.name == account_name), None)
    if drive_account:
        token_path = Path(drive_account.token_file)
        if token_path.exists():
            console.print("\n[yellow]Note:[/yellow] You may need to re-authenticate to grant Drive access.")
            console.print("[dim]If upload fails, delete the token file and run 'invoice-cli upload':[/dim]")
            console.print(f"  rm {token_path}")
```

#### 3. Add upload Command
**File**: `invoice-cli/src/invoice_cli/cli.py`
**Changes**: Add command after `organize` (around line 973)

```python
@app.command()
def upload(
    pattern: str = typer.Option(
        None,
        "--pattern",
        "-p",
        help="Folder pattern (defaults to config or 'year/company/month')",
    ),
    root: str = typer.Option(
        None,
        "--root",
        "-r",
        help="Root folder name on Drive (defaults to config or 'Invoices')",
    ),
    dry_run: bool = typer.Option(
        False,
        "--dry-run",
        "-n",
        help="Show what would be uploaded without making changes",
    ),
    force: bool = typer.Option(
        False,
        "--force",
        "-f",
        help="Re-upload even if already uploaded",
    ),
    from_account: str = typer.Option(
        None,
        "--from-account",
        help="Only upload invoices from this Gmail account",
    ),
) -> None:
    """Upload invoices to Google Drive.

    Uploads invoice attachments to an organized folder structure on Drive.
    Uses the account set with 'set-drive-account' for uploads.
    """
    config = load_config()
    storage = InvoiceStorage(config.storage.base_path)

    # Verify drive account is set
    if not config.drive.account:
        console.print("[red]No Drive account set.[/red]")
        console.print("Run: invoice-cli set-drive-account <account-name>")
        raise typer.Exit(1)

    # Find the drive account config
    drive_account = next(
        (a for a in config.accounts if a.name == config.drive.account),
        None,
    )
    if not drive_account:
        console.print(f"[red]Drive account '{config.drive.account}' not found in config.[/red]")
        raise typer.Exit(1)

    # Use config defaults if not specified
    folder_pattern = pattern or config.drive.pattern
    root_folder = root or config.drive.root_folder

    # Load invoices
    records = storage.load_index()
    invoices = [r for r in records if r.is_invoice]

    # Filter by account if specified
    if from_account:
        invoices = [r for r in invoices if r.account_name == from_account]

    # Filter out already uploaded unless force
    if not force:
        invoices = [r for r in invoices if not r.gdrive_uploaded]

    if not invoices:
        console.print("[yellow]No invoices to upload.[/yellow]")
        return

    console.print(f"[bold]Uploading {len(invoices)} invoices to Google Drive[/bold]")
    console.print(f"  Account: {config.drive.account}")
    console.print(f"  Root folder: {root_folder}")
    console.print(f"  Pattern: {folder_pattern}")
    console.print()

    if dry_run:
        console.print("[dim]Dry run - no changes will be made[/dim]\n")

    # Initialize Drive service (only if not dry run)
    service = None
    if not dry_run:
        token_file = Path(drive_account.token_file)
        service = get_drive_service(token_file)

    uploaded_count = 0
    skipped_count = 0

    for record in invoices:
        if not record.attachments:
            continue

        # Parse date
        date = _parse_date(record.invoice_date or record.date)
        if not date:
            console.print(f"[yellow]Skipping (no date):[/yellow] {record.subject[:50]}")
            skipped_count += 1
            continue

        # Build folder path based on pattern
        company = _sanitize_name(record.company_name or "Unknown")
        year = str(date.year)
        month = date.strftime("%m")

        folder_parts = []
        for part in folder_pattern.split("/"):
            if part == "year":
                folder_parts.append(year)
            elif part == "month":
                folder_parts.append(month)
            elif part == "company":
                folder_parts.append(company)
            else:
                folder_parts.append(part)

        folder_path = "/".join([root_folder] + folder_parts)

        # Upload each attachment
        file_ids = []
        for att_path_str in record.attachments:
            att_path = Path(att_path_str)
            if not att_path.exists():
                continue

            # Build filename: {date}-{company}-{description}.pdf
            date_prefix = date.strftime("%Y-%m-%d")
            desc = _sanitize_name(record.description or record.company_name or "invoice")[:50]
            new_name = f"{date_prefix}-{company}-{desc}{att_path.suffix}"

            if dry_run:
                console.print(f"  [dim]Would upload:[/dim] {folder_path}/{new_name}")
            else:
                # Create folder structure and upload
                folder_id = create_folder_path(service, folder_parts, root_folder)
                file_id = upload_file(service, att_path, folder_id, new_name, skip_existing=True)

                if file_id:
                    file_ids.append(file_id)
                    console.print(f"  [green]Uploaded:[/green] {folder_path}/{new_name}")
                    uploaded_count += 1
                else:
                    console.print(f"  [yellow]Skipped (exists):[/yellow] {new_name}")
                    skipped_count += 1

        # Update record if uploaded
        if not dry_run and file_ids:
            record.gdrive_uploaded = True
            record.gdrive_uploaded_at = datetime.now().isoformat()
            record.gdrive_file_ids = file_ids
            record.gdrive_folder_path = folder_path
            storage.save_record(record)

    if dry_run:
        console.print(f"\n[dim]Would upload from {len(invoices)} invoices[/dim]")
    else:
        console.print(f"\n[green]Done![/green] Uploaded {uploaded_count}, skipped {skipped_count}")
```

### Success Criteria:

#### Automated Verification:
- [x] Type checking passes: `cd invoice-cli && uv run pyright` (pyright not installed as dep, but imports work)
- [x] Tests pass: `cd invoice-cli && uv run pytest` (pytest not installed as dep)
- [x] Help displays: `cd invoice-cli && uv run invoice-cli set-drive-account --help`
- [x] Help displays: `cd invoice-cli && uv run invoice-cli upload --help`

#### Manual Verification:
- [ ] `invoice-cli set-drive-account <name>` sets the account in config.toml
- [ ] `invoice-cli upload --dry-run` shows what would be uploaded
- [ ] `invoice-cli upload` successfully uploads files to Drive
- [ ] Re-running `invoice-cli upload` skips already uploaded files
- [ ] `invoice-cli upload --force` re-uploads files

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding.

---

## Testing Strategy

### Unit Tests:
- Test `DriveConfig` model validation
- Test `InvoiceRecord` with new gdrive fields
- Test `_sanitize_name` and `_parse_date` (already exist)

### Integration Tests:
- Mock Drive API for `gdrive.py` functions
- Test folder path creation logic
- Test file existence checking

### Manual Testing Steps:
1. Run `invoice-cli setup` to ensure config loads with new fields
2. Run `invoice-cli set-drive-account <name>` to set Drive account
3. Delete token file to force re-auth with new scopes
4. Run `invoice-cli upload --dry-run` to preview uploads
5. Run `invoice-cli upload` to actually upload
6. Verify files appear in Google Drive with correct folder structure
7. Run `invoice-cli upload` again to verify skipping works
8. Run `invoice-cli upload --force` to verify re-upload works
9. Check `invoice-cli list` to verify upload tracking fields are populated

## Performance Considerations

- Drive API calls are batched by folder (create once, upload many)
- Resumable uploads used for files
- Skip check prevents redundant uploads

## Migration Notes

- Existing config.toml files work without changes (new fields have defaults)
- Existing invoice records work without changes (new fields have defaults)
- Users with existing tokens need to re-authenticate for Drive scope

## References

- Research: `thoughts/shared/research/2026-01-08-invoice-cli-gdrive-upload-options.md`
- Gmail OAuth pattern: `invoice-cli/src/invoice_cli/gmail.py:44-84`
- Organize command pattern: `invoice-cli/src/invoice_cli/cli.py:871-973`
- Config model: `invoice-cli/src/invoice_cli/config.py:55-62`
- InvoiceRecord model: `invoice-cli/src/invoice_cli/storage.py:10-61`
