---
date: 2026-01-08T20:57:51+0000
researcher: Claude
git_commit: ca539f72b0540b92c34b3fc32d86f789d4440f65
branch: main
repository: ai-toolbox
topic: "Google Drive Upload Options for invoice-cli"
tags: [research, codebase, invoice-cli, google-drive, upload]
status: complete
last_updated: 2026-01-08
last_updated_by: Claude
---

# Research: Google Drive Upload Options for invoice-cli

**Date**: 2026-01-08T20:57:51+0000
**Researcher**: Claude
**Git Commit**: ca539f72b0540b92c34b3fc32d86f789d4440f65
**Branch**: main
**Repository**: ai-toolbox

## Research Question

What options exist for uploading invoices from invoice-cli to Google Drive in a specific format? How can invoices from multiple Gmail accounts be uploaded to a single Google Drive account?

## Summary

The invoice-cli is a Python CLI tool that fetches invoice emails from Gmail, classifies them using AI, and stores them locally. Currently, **there is no Google Drive upload functionality** - this would need to be implemented as a new feature.

The tool already uses Google OAuth2 for Gmail access, making it straightforward to extend for Drive API access. A recommended approach is to designate a single "drive account" that receives all invoices from all email accounts.

## Detailed Findings

### Current invoice-cli Architecture

The invoice-cli has the following structure:

```
invoice-cli/
├── src/invoice_cli/
│   ├── cli.py         # Typer-based CLI commands
│   ├── config.py      # Pydantic config models (TOML-based)
│   ├── gmail.py       # Gmail API integration with OAuth2
│   ├── storage.py     # Local storage management (JSON + files)
│   ├── classifier.py  # AI invoice classification
│   ├── pdf.py         # PDF text extraction
│   └── tui.py         # Terminal UI for ownership management
└── baml_src/          # BAML schemas for AI extraction
```

### Existing Commands

| Command | Description |
|---------|-------------|
| `setup` | Initialize config and storage directories |
| `add-account` | Add Gmail account via OAuth2 |
| `fetch` | Fetch and classify invoice emails |
| `process` | Extract detailed info from PDF attachments |
| `list` | Display invoices in a table |
| `get` | Show detailed invoice information |
| `organize` | Create symlinked folder structure locally |
| `set-ownership` | Manually set invoice ownership |

### Data Available for Upload

From `src/invoice_cli/storage.py:10-60`, the `InvoiceRecord` model stores:

**Core Invoice Data:**
- `message_id`, `subject`, `sender`, `date`
- `company_name`, `invoice_number`, `amount`, `currency`
- `invoice_date`, `due_date`, `description`

**Enhanced Data (from PDF processing):**
- `seller_vat_id`, `buyer_name`, `buyer_vat_id`
- `seller_address`, `buyer_address` (dict)
- `bank_details` (dict)
- `line_items` (list of dicts)
- `tax_amount`, `subtotal`

**Attachments:**
- `attachments` - list of file paths to downloaded PDFs/images

### Current Storage Structure

```
~/invoices/
├── attachments/          # Downloaded files
│   └── <message_id>/
│       └── invoice.pdf
├── metadata/
│   ├── emails/           # Per-email JSON records
│   │   └── <message_id>.json
│   └── index.json        # Master index
└── organized/            # Symlinks by pattern
    └── 2024/
        └── Acme Corp/
            └── 12/
                └── 2024-12-15-description.pdf
```

### OAuth2 Implementation

From `src/invoice_cli/gmail.py:14-15`:
```python
SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"]
```

The OAuth flow in `gmail.py:44-84` already handles:
- Token storage/refresh
- Browser-based authentication
- Multi-account support via separate token files

### Configuration System

From `src/invoice_cli/config.py:55-62`:
```python
class Config(BaseModel):
    storage: StorageConfig
    ai: AIConfig
    accounts: list[AccountConfig]
    company: CompanyConfig
    ownership: OwnershipConfig
```

Config is stored at `~/.config/invoice-cli/config.toml`.

## Upload Options Analysis

### Option A: Direct File Upload

Upload original PDF/image attachments to Google Drive preserving folder structure.

**Pros:** Simple, preserves original files
**Cons:** No searchable metadata on Drive

### Option B: Metadata + Files

Upload files with JSON metadata sidecar files.

**Pros:** Metadata preserved alongside files
**Cons:** Cluttered folder structure

### Option C: Google Sheets Summary

Create a spreadsheet with all invoice data for searching/filtering.

**Pros:** Searchable, sortable, shareable
**Cons:** Files stored separately, two places to check

### Option D: Hybrid Approach (Recommended)

Organized folders with files + summary spreadsheet.

**Pros:** Best of both worlds
**Cons:** More complex implementation

### Option E: Custom Report Format

Generate formatted PDFs/reports before uploading.

**Pros:** Professional output
**Cons:** High implementation effort

## Multi-Account Design

For uploading invoices from all Gmail accounts to a single Drive:

```
Gmail Account: personal → ┐
Gmail Account: work     → ├─→ All invoices → Single Google Drive Account
Gmail Account: business → ┘
```

This requires:
1. A config setting for `drive_account`
2. Adding Drive scope to OAuth
3. Using designated account's credentials for all uploads

## Code References

- `src/invoice_cli/cli.py:1-1173` - All CLI commands
- `src/invoice_cli/gmail.py:14-15` - Current OAuth scopes
- `src/invoice_cli/gmail.py:44-84` - OAuth authentication flow
- `src/invoice_cli/config.py:55-62` - Config model structure
- `src/invoice_cli/storage.py:10-60` - InvoiceRecord model
- `src/invoice_cli/storage.py:63-189` - Storage management
- `src/invoice_cli/cli.py:871-972` - Existing `organize` command pattern

## Architecture Documentation

### Folder Pattern System

The existing `organize` command (cli.py:871-972) uses a pattern-based folder structure:
- Patterns: `year/company/month`, `company/year`, etc.
- Uses `_sanitize_name()` for safe filenames
- Uses `_parse_date()` for date extraction

This pattern system should be reused for Drive upload folder structure.

### Dependencies

From `pyproject.toml`:
- `google-api-python-client>=2.0.0` - Already installed, includes Drive API
- `google-auth-oauthlib>=1.0.0` - OAuth2 flow
- No additional dependencies needed for Drive support

## Implementation Approach

### Files to Create/Modify

1. **`src/invoice_cli/gmail.py`** - Add Drive scope to `SCOPES`
2. **`src/invoice_cli/gdrive.py`** (new) - Drive API operations
3. **`src/invoice_cli/config.py`** - Add `DriveConfig` model
4. **`src/invoice_cli/storage.py`** - Add upload tracking fields
5. **`src/invoice_cli/cli.py`** - Add `upload` and `set-drive-account` commands

### Proposed DriveConfig

```python
class DriveConfig(BaseModel):
    account: str | None = None      # Which account for Drive uploads
    root_folder: str = "Invoices"   # Root folder name on Drive
    pattern: str = "year/company/month"
```

### Proposed CLI Commands

```bash
# Set which account to use for Drive
invoice-cli set-drive-account personal

# Upload invoices to Drive
invoice-cli upload [OPTIONS]
  --pattern, -p     Folder pattern
  --root, -r        Root folder name
  --dry-run, -n     Show what would be uploaded
  --force, -f       Re-upload existing files
  --from-account    Only upload from specific Gmail account
```

### Proposed Upload Tracking Fields

```python
# Add to InvoiceRecord
gdrive_uploaded: bool = False
gdrive_uploaded_at: str | None = None
gdrive_file_ids: list[str] = Field(default_factory=list)
gdrive_folder_path: str | None = None
```

## Open Questions

1. **Format preference confirmed**: User confirmed "Organized folders + files" as desired format
2. **Multi-account confirmed**: All accounts should upload to a single Drive account
3. **Naming convention**: Need to confirm filename format (e.g., `{date}-{company}-{invoice_number}.pdf`)
4. **Duplicate handling**: Should existing files be skipped or overwritten?

## Related Research

- `thoughts/shared/research/2025-12-30-invoice-cli-tool-research.md` - Original invoice-cli design research
