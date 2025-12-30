---
date: 2025-12-30T12:00:00-08:00
researcher: Claude
git_commit: 17a7d06865c06c0cd788888ce0296ad43c604792
branch: main
repository: ai-toolbox
topic: "Invoice CLI Tool - Gmail Integration with AI Classification"
tags: [research, cli, python, gmail-api, baml, invoice-processing, uv, typer]
status: complete
last_updated: 2025-12-30
last_updated_by: Claude
---

# Research: Invoice CLI Tool - Gmail Integration with AI Classification

**Date**: 2025-12-30T12:00:00-08:00
**Researcher**: Claude
**Git Commit**: 17a7d06865c06c0cd788888ce0296ad43c604792
**Branch**: main
**Repository**: ai-toolbox

## Research Question

How to create a Python CLI tool that:
1. Connects to multiple Gmail inboxes via OAuth2
2. Fetches emails with attachments (filtered by date/label)
3. Uses AI (BAML) to classify which emails are invoices
4. Stores metadata as JSON and downloads attachments
5. Supports flexible folder organization patterns

## Summary

This research covers three key technology areas for building the invoice CLI tool:
- **Gmail API**: OAuth2 authentication, multi-account support, email search/filtering, attachment downloads
- **BAML**: Structured AI classification and data extraction using schema-driven prompts
- **Python CLI**: Modern project setup with `uv`, `Typer` for CLI framework, TOML for configuration

## Detailed Findings

### 1. Gmail API with Python

#### Required Packages
```bash
pip install google-api-python-client google-auth-oauthlib google-auth-httplib2
```

#### OAuth2 Authentication Flow
```python
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

SCOPES = ['https://www.googleapis.com/auth/gmail.readonly']

def gmail_authenticate(token_file='token.json', credentials_file='credentials.json'):
    creds = None
    if os.path.exists(token_file):
        creds = Credentials.from_authorized_user_file(token_file, SCOPES)

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(credentials_file, SCOPES)
            creds = flow.run_local_server(port=0)

        with open(token_file, 'w') as token:
            token.write(creds.to_json())

    return build('gmail', 'v1', credentials=creds)
```

#### Multi-Account Support
- Store separate token files per account (e.g., `personal_token.json`, `work_token.json`)
- Share single `credentials.json` (OAuth client ID) across accounts
- Each account authenticates independently via browser OAuth flow

#### Search Query Operators
| Operator | Example | Description |
|----------|---------|-------------|
| `has:attachment` | `has:attachment` | Emails with attachments |
| `filename:` | `filename:pdf` | Specific attachment type |
| `label:` | `label:important` | Filter by label |
| `after:` | `after:2024/12/01` | Date filtering |
| `before:` | `before:2025/01/01` | Date filtering |
| `newer_than:` | `newer_than:30d` | Relative date |

#### Attachment Download
```python
import base64

def download_attachments(service, message_id, save_dir):
    message = service.users().messages().get(userId='me', id=message_id).execute()
    parts = [message['payload']]

    while parts:
        part = parts.pop()
        if part.get('parts'):
            parts.extend(part['parts'])

        filename = part.get('filename')
        if filename:
            if 'data' in part['body']:
                data = part['body']['data']
            elif 'attachmentId' in part['body']:
                attachment = service.users().messages().attachments().get(
                    userId='me', messageId=message_id, id=part['body']['attachmentId']
                ).execute()
                data = attachment['data']
            else:
                continue

            file_data = base64.urlsafe_b64decode(data)
            with open(os.path.join(save_dir, filename), 'wb') as f:
                f.write(file_data)
```

### 2. BAML (Boundary AI Markup Language)

#### What is BAML?
- Domain-specific language for structured LLM interactions
- Transforms prompts into typed function signatures with Pydantic models
- Handles JSON parsing, validation, and error recovery automatically
- Compiles to Python/TypeScript/Go/Ruby clients

#### Project Setup with uv
```bash
uv add baml-py
uv run baml-cli init
```

Creates:
```
baml_src/
├── generators.baml    # Code generation config
├── clients.baml       # LLM provider config
└── *.baml             # Your schemas and functions
```

#### Invoice Classification Schema
```baml
// baml_src/invoice.baml

enum InvoiceStatus {
  IS_INVOICE
  NOT_INVOICE
  MAYBE_INVOICE
}

class InvoiceDetection {
  status InvoiceStatus
  confidence float @description("0.0 to 1.0")
  reasoning string
}

class InvoiceDetails {
  company_name string
  invoice_number string?
  amount float?
  currency string?
  invoice_date string? @description("YYYY-MM-DD format")
  due_date string?
  description string?
}

function DetectInvoice(
  subject: string,
  sender: string,
  snippet: string,
  attachment_names: string[]
) -> InvoiceDetection {
  client "anthropic/claude-sonnet-4-20250514"
  prompt #"
    Determine if this email is an invoice.

    Invoice indicators:
    - Invoice/receipt in subject or body
    - PDF/document attachments with invoice-like names
    - Billing/payment terms mentioned
    - Amount due or total mentioned

    {{ ctx.output_format }}

    Subject: {{ subject }}
    From: {{ sender }}
    Preview: {{ snippet }}
    Attachments: {{ attachment_names }}
  "#
}

function ExtractInvoiceDetails(
  subject: string,
  sender: string,
  body_text: string
) -> InvoiceDetails {
  client "anthropic/claude-sonnet-4-20250514"
  prompt #"
    Extract invoice details from this email.

    {{ ctx.output_format }}

    Subject: {{ subject }}
    From: {{ sender }}
    Body: {{ body_text }}
  "#
}
```

#### LLM Client Configuration
```baml
// baml_src/clients.baml

client<llm> ClaudeSonnet {
  provider anthropic
  options {
    model "claude-sonnet-4-20250514"
    api_key env.ANTHROPIC_API_KEY
  }
}
```

#### Python Usage
```python
from baml_client import b
from baml_client.types import InvoiceStatus

async def classify_email(subject, sender, snippet, attachments):
    result = await b.DetectInvoice(
        subject=subject,
        sender=sender,
        snippet=snippet,
        attachment_names=attachments
    )
    return result.status == InvoiceStatus.IS_INVOICE
```

### 3. Python CLI with uv and Typer

#### Project Initialization
```bash
uv init invoice-cli --package
cd invoice-cli
uv add typer baml-py google-api-python-client google-auth-oauthlib rich pydantic
```

#### Recommended Project Structure
```
invoice-cli/
├── pyproject.toml
├── uv.lock
├── baml_src/
│   └── invoice.baml
├── baml_client/          # Auto-generated
└── src/
    └── invoice_cli/
        ├── __init__.py
        ├── __main__.py
        ├── cli.py        # Typer app
        ├── config.py     # TOML handling
        ├── gmail.py      # Gmail client
        ├── classifier.py # BAML wrapper
        └── storage.py    # File/JSON storage
```

#### Typer CLI Example
```python
import typer
from pathlib import Path
from typing import Optional

app = typer.Typer(help="Invoice CLI - Fetch and organize invoice emails")

@app.command()
def setup():
    """Initialize configuration and storage directory."""
    # Prompt for storage path, create config.toml
    pass

@app.command()
def add_account(name: str):
    """Add a Gmail account (triggers OAuth flow)."""
    pass

@app.command()
def fetch(
    account: Optional[str] = typer.Option(None, "--account", "-a"),
    after: Optional[str] = typer.Option(None, "--after"),
    label: Optional[str] = typer.Option(None, "--label"),
):
    """Fetch invoice emails from Gmail."""
    pass

@app.command()
def organize(
    pattern: str = typer.Option("company/month", "--pattern", "-p"),
):
    """Reorganize files into folder structure."""
    pass

if __name__ == "__main__":
    app()
```

#### pyproject.toml Entry Point
```toml
[project]
name = "invoice-cli"
version = "0.1.0"
dependencies = [
    "typer>=0.9.0",
    "baml-py>=0.76.0",
    "google-api-python-client>=2.0.0",
    "google-auth-oauthlib>=1.0.0",
    "rich>=13.0.0",
    "pydantic>=2.0.0",
]

[project.scripts]
invoice-cli = "invoice_cli.cli:app"
```

#### TOML Configuration
```python
import tomllib
from pathlib import Path

def load_config(config_path: Path) -> dict:
    if not config_path.exists():
        return {}
    with open(config_path, 'rb') as f:
        return tomllib.load(f)
```

Example config file:
```toml
[storage]
base_path = "~/invoices"

[accounts.personal]
email = "user@gmail.com"
token_file = "personal_token.json"

[ai]
provider = "anthropic"
model = "claude-sonnet-4-20250514"

[organization]
default_pattern = "company/month"
```

## Code References

### Gmail API
- [Python Quickstart](https://developers.google.com/workspace/gmail/api/quickstart/python)
- [Search Operators](https://developers.google.com/gmail/api/guides/filtering)
- [Attachments API](https://developers.google.com/gmail/api/reference/rest/v1/users.messages.attachments/get)

### BAML
- [GitHub - BoundaryML/baml](https://github.com/BoundaryML/baml)
- [Official Documentation](https://docs.boundaryml.com/home)
- [Python Installation](https://docs.boundaryml.com/guide/installation-language/python)
- [Classification Examples](https://docs.boundaryml.com/examples/prompt-engineering/classification)

### Python CLI / uv
- [uv Documentation](https://docs.astral.sh/uv/)
- [Typer Documentation](https://typer.tiangolo.com/)
- [Python Packaging Guide](https://packaging.python.org/en/latest/guides/writing-pyproject-toml/)

## Architecture Documentation

### Data Flow
1. User runs `invoice-cli fetch` command
2. Gmail API fetches emails matching filters (has:attachment, date range, label)
3. For each email, BAML classifies if it's an invoice
4. Invoice emails: download attachments, extract metadata via BAML
5. Store JSON metadata in `metadata/emails/<message-id>.json`
6. Store attachments in `attachments/<message-id>/`
7. Update master index at `metadata/index.json`

### Organization Patterns
Files are organized via symlinks (saves disk space):
- `company/month`: `<company>/<yyyy-mm>/<yyyy-mm-dd>-<desc>.pdf`
- `month/company`: `<yyyy-mm>/<company>-<yyyy-mm-dd>.pdf`
- `year/company/month`: `<yyyy>/<company>/<mm>/<filename>`

### Multi-Account Architecture
- Single `credentials.json` (Google OAuth client)
- Separate `tokens/<account>_token.json` per account
- Config tracks accounts with their email and token file path
- Each account authenticates independently

## Open Questions

1. **PDF Parsing**: Should the tool extract text from PDF attachments for better AI classification? (Could use `pypdf` or similar)

2. **Duplicate Detection**: How to handle the same invoice appearing in multiple accounts or being re-fetched?

3. **Link Following**: Future expansion to download invoices from links in emails - which domains to support?

4. **Rate Limiting**: Gmail API has quotas - should implement exponential backoff for large mailboxes?

## Related Research

- None in this repository yet for invoice/email processing
- See `thoughts/shared/research/2025-12-15-hive-claude-sdk-integration.md` for Claude SDK patterns
