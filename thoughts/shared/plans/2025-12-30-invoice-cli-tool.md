# Invoice CLI Tool Implementation Plan

## Overview

Create a Python CLI tool (`invoice-cli`) that connects to Gmail accounts via OAuth2, fetches emails with attachments, uses BAML with Claude to classify which emails are invoices, extracts metadata, and stores attachments with flexible folder organization.

## Current State Analysis

### Repository Structure
- **Location**: `/Users/taras/Documents/code/ai-toolbox/` - monorepo with independent projects
- **Existing Python CLI**: `hn-sql/` uses Click, `uv`, `hatchling` build system
- **Research doc**: `thoughts/shared/research/2025-12-30-invoice-cli-tool-research.md` (comprehensive)

### Key Patterns to Follow (from `hn-sql/pyproject.toml` and `hn-sql/src/hn_sql/cli.py`)
- Project structure: `src/<package_name>/` layout
- Package manager: `uv`
- Build system: `hatchling`
- Python version: `>=3.13`
- CLI entry point via `[project.scripts]` in pyproject.toml
- Rich console for output formatting

## Desired End State

A working `invoice-cli` command with:
1. `invoice-cli setup` - Initialize config and Google Cloud OAuth
2. `invoice-cli add-account <name>` - Add Gmail account via OAuth flow
3. `invoice-cli fetch [--account] [--after] [--label]` - Fetch and classify invoices
4. `invoice-cli organize [--pattern]` - Reorganize files into folder structure
5. `invoice-cli list` - Show fetched invoices

**Verification**: Run `uv run invoice-cli fetch` and see invoices downloaded with AI classification.

## What We're NOT Doing

- PDF text extraction (future enhancement)
- Link following to download invoices from emails
- Web UI or API server
- Duplicate detection across accounts (future enhancement)
- Rate limiting with exponential backoff (simple sequential for now)

## Implementation Approach

Use Typer for CLI (modern, type hints), BAML for AI classification, and store metadata as JSON with attachments in a configurable directory structure.

---

## Phase 1: Project Scaffolding

### Overview
Create the project structure with basic CLI skeleton and dependencies.

### Changes Required:

#### 1. Create directory structure
```
invoice-cli/
├── pyproject.toml
├── README.md
└── src/
    └── invoice_cli/
        ├── __init__.py
        └── cli.py
```

#### 2. Create pyproject.toml
**File**: `invoice-cli/pyproject.toml`

```toml
[project]
name = "invoice-cli"
version = "0.1.0"
description = "Fetch and organize invoice emails from Gmail using AI classification"
readme = "README.md"
license = "MIT"
requires-python = ">=3.13"
authors = [
    { name = "Desplega", email = "contact@desplega.ai" }
]
dependencies = [
    "typer>=0.15.0",
    "rich>=13.0.0",
    "pydantic>=2.0.0",
    "google-api-python-client>=2.0.0",
    "google-auth-oauthlib>=1.0.0",
    "google-auth-httplib2>=0.2.0",
    "baml-py>=0.76.0",
    "tomli-w>=1.0.0",
]

[project.scripts]
invoice-cli = "invoice_cli.cli:app"

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"
```

#### 3. Create CLI skeleton
**File**: `invoice-cli/src/invoice_cli/cli.py`

Basic Typer app with stub commands: setup, add_account, fetch, list, organize

#### 4. Create __init__.py
**File**: `invoice-cli/src/invoice_cli/__init__.py`

```python
__version__ = "0.1.0"
```

### Success Criteria:

#### Automated Verification:
- [x] `cd invoice-cli && uv sync` completes without errors
- [x] `uv run invoice-cli --help` shows available commands

---

## Phase 2: Configuration Management

### Overview
Implement TOML-based configuration with XDG-compliant paths.

### Changes Required:

#### 1. Create config module
**File**: `invoice-cli/src/invoice_cli/config.py`

- Config file at `~/.config/invoice-cli/config.toml`
- Pydantic models for: AccountConfig, StorageConfig, AIConfig, Config
- Functions: get_config_dir(), load_config(), save_config()

#### 2. Implement setup command
**File**: `invoice-cli/src/invoice_cli/cli.py`

- Prompt for storage path
- Create config file and storage directory

### Success Criteria:

#### Automated Verification:
- [x] `uv run invoice-cli setup --storage ~/test-invoices` creates config file
- [x] Config file is valid TOML at `~/.config/invoice-cli/config.toml`

---

## Phase 3: BAML Setup and Invoice Classification

### Overview
Set up BAML for AI-powered invoice detection and metadata extraction.

### Changes Required:

#### 1. Initialize BAML
```bash
cd invoice-cli && uv run baml-cli init
```

#### 2. Create invoice schema
**File**: `invoice-cli/baml_src/invoice.baml`

- InvoiceStatus enum: IS_INVOICE, NOT_INVOICE, MAYBE_INVOICE
- InvoiceDetection class: status, confidence, reasoning
- InvoiceDetails class: company_name, invoice_number, amount, currency, dates, description
- DetectInvoice function
- ExtractInvoiceDetails function

#### 3. Create clients config
**File**: `invoice-cli/baml_src/clients.baml`

Configure Anthropic client with claude-sonnet-4-20250514

#### 4. Create classifier wrapper
**File**: `invoice-cli/src/invoice_cli/classifier.py`

Python module wrapping BAML functions: detect_invoice(), extract_details(), is_invoice()

### Success Criteria:

#### Automated Verification:
- [x] `uv run baml-cli generate` creates `baml_client/` directory
- [x] `uv run python -c "from baml_client import b; print('OK')"` works

---

## Phase 4: Gmail API Integration

### Overview
Implement Gmail OAuth2 authentication and email fetching.

### Changes Required:

#### 1. Create Gmail client module
**File**: `invoice-cli/src/invoice_cli/gmail.py`

Functions:
- get_credentials_path() - Path to credentials.json
- authenticate(token_file) - OAuth2 flow with token caching
- get_service(token_file) - Build Gmail API service
- search_messages(service, query) - Search with pagination
- get_message(service, id) - Get full message
- get_email_metadata(message) - Extract subject, sender, date, snippet
- get_attachments(message) - List attachments with IDs
- download_attachment(service, msg_id, att_id) - Download attachment data
- get_body_text(message) - Extract plain text body

#### 2. Implement add-account command
**File**: `invoice-cli/src/invoice_cli/cli.py`

- Check for credentials.json, show setup instructions if missing
- Run OAuth flow via browser
- Save token file to `~/.config/invoice-cli/tokens/<name>_token.json`
- Get user email from profile
- Save account to config

### Success Criteria:

#### Automated Verification:
- [x] `uv run python -c "from invoice_cli.gmail import SCOPES; print(SCOPES)"` works

#### Manual Verification:
- [ ] `uv run invoice-cli add-account test` triggers OAuth flow
- [ ] Token saved to config directory

---

## Phase 5: Fetch Command Implementation

### Overview
Implement the main fetch command: search → classify → extract → download.

### Changes Required:

#### 1. Create storage module
**File**: `invoice-cli/src/invoice_cli/storage.py`

- InvoiceRecord Pydantic model (all metadata fields)
- InvoiceStorage class:
  - __init__(base_path) - Create directories
  - has_message(id) - Check if already processed
  - save_record(record) - Save JSON metadata
  - save_attachment(msg_id, filename, data) - Save file
  - _update_index() - Update master index.json
  - load_index() - Load all records

#### 2. Implement fetch command
**File**: `invoice-cli/src/invoice_cli/cli.py`

- Options: --account, --after, --label, --skip-classified
- Build Gmail search query
- For each account:
  - Search for emails with attachments
  - For each email:
    - Skip if already processed (when --skip-classified)
    - Classify with AI (detect_invoice)
    - If invoice: extract details, download attachments
    - Save record

### Success Criteria:

#### Manual Verification:
- [ ] `uv run invoice-cli fetch` fetches and classifies emails
- [ ] Attachments saved to `~/invoices/attachments/<msg_id>/`
- [ ] Metadata saved to `~/invoices/metadata/emails/<msg_id>.json`
- [ ] Index updated at `~/invoices/metadata/index.json`

---

## Phase 6: List and Organize Commands

### Overview
Add commands to view and organize invoices.

### Changes Required:

#### 1. Implement list command
**File**: `invoice-cli/src/invoice_cli/cli.py`

- Options: --all (show non-invoices too), --limit
- Rich table output: date, company, amount, subject, account

#### 2. Implement organize command
**File**: `invoice-cli/src/invoice_cli/cli.py`

- Options: --pattern (company/month, month/company, year/company/month), --dry-run
- Create symlinks in `~/invoices/organized/` based on pattern
- Descriptive filenames: `YYYY-MM-DD-Description.ext`

### Success Criteria:

#### Manual Verification:
- [ ] `uv run invoice-cli list` shows invoices in table
- [ ] `uv run invoice-cli organize --dry-run` shows planned structure
- [ ] `uv run invoice-cli organize` creates symlinks

---

## Phase 7: Documentation

### Overview
Add README with setup instructions.

### Changes Required:

#### 1. Create README.md
**File**: `invoice-cli/README.md`

Contents:
- Features overview
- Setup instructions:
  - uv sync
  - Google Cloud Console setup (create project, enable Gmail API, OAuth credentials)
  - Save credentials.json location
  - Set ANTHROPIC_API_KEY
- Usage examples for all commands
- Organization patterns explanation
- Storage structure diagram

### Success Criteria:

#### Manual Verification:
- [ ] README provides clear Google Cloud setup steps
- [ ] Full workflow documented: setup → add-account → fetch → list → organize

---

## Testing Strategy

### Manual Testing Steps:
1. Run `uv sync` and verify dependencies install
2. Run `invoice-cli setup` and configure storage path
3. Set up Google Cloud credentials and add account
4. Set ANTHROPIC_API_KEY
5. Run `invoice-cli fetch` on an account with invoices
6. Verify classification in `list` output
7. Run `organize` and verify symlink structure

### Edge Cases:
- No credentials.json → helpful error message
- No ANTHROPIC_API_KEY → BAML error
- Empty inbox → graceful completion
- Already processed emails → skip with --skip-classified

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `invoice-cli/pyproject.toml` | Create |
| `invoice-cli/README.md` | Create |
| `invoice-cli/src/invoice_cli/__init__.py` | Create |
| `invoice-cli/src/invoice_cli/cli.py` | Create |
| `invoice-cli/src/invoice_cli/config.py` | Create |
| `invoice-cli/src/invoice_cli/gmail.py` | Create |
| `invoice-cli/src/invoice_cli/classifier.py` | Create |
| `invoice-cli/src/invoice_cli/storage.py` | Create |
| `invoice-cli/baml_src/invoice.baml` | Create |
| `invoice-cli/baml_src/clients.baml` | Create |

## References

- Research: `thoughts/shared/research/2025-12-30-invoice-cli-tool-research.md`
- Similar project: `hn-sql/` for Python CLI patterns
- BAML docs: https://docs.boundaryml.com/
- Gmail API: https://developers.google.com/workspace/gmail/api/quickstart/python
