# Invoice CLI

Fetch and organize invoice emails from Gmail using AI classification.

## Features

- Connect multiple Gmail accounts via OAuth2
- AI-powered invoice detection using Claude
- Automatic metadata extraction (company, amount, dates)
- Download and organize attachments
- Flexible folder organization with symlinks

## Installation

```bash
cd invoice-cli
uv sync
```

## Setup

### 1. Google Cloud Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the **Gmail API**:
   - Navigate to "APIs & Services" > "Library"
   - Search for "Gmail API" and enable it
4. Create OAuth credentials:
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "OAuth client ID"
   - Choose "Desktop app" as the application type
   - Download the JSON file
5. Save the file as `~/.config/invoice-cli/credentials.json`

### 2. Anthropic API Key

Set your Anthropic API key as an environment variable:

```bash
export ANTHROPIC_API_KEY="your-api-key"
```

### 3. Initialize Invoice CLI

```bash
uv run invoice-cli setup --storage ~/invoices
```

### 4. Add Gmail Account

```bash
uv run invoice-cli add-account personal
```

A browser window will open for Google authentication. After authorizing, the account will be saved.

## Usage

### Fetch Invoices

Fetch and classify emails with attachments:

```bash
# Fetch from all accounts
uv run invoice-cli fetch

# Fetch from specific account
uv run invoice-cli fetch --account personal

# Fetch emails after a date
uv run invoice-cli fetch --after 2024-01-01

# Fetch from a specific label
uv run invoice-cli fetch --label receipts

# Limit number of emails
uv run invoice-cli fetch --max 20

# Re-process already classified emails
uv run invoice-cli fetch --no-skip-classified
```

### List Invoices

View fetched invoices in a table:

```bash
# List invoices
uv run invoice-cli list

# List all emails (including non-invoices)
uv run invoice-cli list --all

# Limit results
uv run invoice-cli list --limit 10
```

### Organize Files

Create a folder structure with symlinks:

```bash
# Preview organization
uv run invoice-cli organize --dry-run

# Organize with default pattern (year/company/month)
uv run invoice-cli organize

# Custom pattern
uv run invoice-cli organize --pattern company/year
uv run invoice-cli organize --pattern year/month
```

Available pattern components: `year`, `month`, `company`

## Storage Structure

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
                └── 2024-12-15-Monthly-subscription.pdf -> ../../../attachments/...
```

## Configuration

Configuration is stored at `~/.config/invoice-cli/config.toml`:

```toml
[storage]
base_path = "/Users/you/invoices"

[ai]
model = "claude-haiku-4-5"

[[accounts]]
name = "personal"
email = "you@gmail.com"
token_file = "/Users/you/.config/invoice-cli/tokens/personal_token.json"
```

## Development

```bash
# Install dependencies
uv sync

# Run CLI
uv run invoice-cli --help

# Regenerate BAML client after schema changes
uv run baml-cli generate
```
