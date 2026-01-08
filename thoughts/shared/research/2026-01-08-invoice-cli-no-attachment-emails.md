---
date: 2026-01-08T12:00:00-05:00
researcher: Claude
git_commit: ca539f72b0540b92c34b3fc32d86f789d4440f65
branch: main
repository: ai-toolbox
topic: "Accessing invoice emails without attachments"
tags: [research, codebase, invoice-cli, gmail, attachments]
status: complete
last_updated: 2026-01-08
last_updated_by: Claude
---

# Research: Accessing Invoice Emails Without Attachments

**Date**: 2026-01-08
**Researcher**: Claude
**Git Commit**: ca539f72b0540b92c34b3fc32d86f789d4440f65
**Branch**: main
**Repository**: ai-toolbox

## Research Question

If I have invoice type emails but without attachments, is there a way to get them in an easy way so I can manually download them?

## Summary

**Yes, you can access invoice emails without attachments.** Here's how:

### Quick Answer

```bash
# Step 1: Fetch emails including those without attachments
invoice-cli fetch --include-no-attachments

# Step 2: List all invoices (includes those without attachments)
invoice-cli list

# Step 3: View details of a specific invoice to get the Gmail message ID
invoice-cli get <message_id>

# Step 4: Open in Gmail using URL pattern
# https://mail.google.com/mail/u/0/#inbox/{message_id}
```

### What EXISTS Today

1. **`--include-no-attachments` flag on fetch** - Fetches all matching emails, not just those with attachments
2. **AI classification still works** - Emails without attachments are still classified as invoices
3. **Records are stored** - Invoice records have an `attachments` field (empty list for no-attachment emails)
4. **Message ID stored** - Can be used to construct Gmail URLs for direct access

### Current Limitations

1. **No filter for "invoices without attachments"** in the `list` command - you see all invoices mixed together
2. **No direct Gmail links in output** - you need to manually construct the URL
3. **No "manual invoice" concept** - no way to mark invoices as needing manual handling

## Detailed Findings

### Fetching Emails Without Attachments

**Location**: `invoice-cli/src/invoice_cli/cli.py:443-476`

```bash
# Default behavior - only emails WITH attachments
invoice-cli fetch

# To include emails without attachments
invoice-cli fetch --include-no-attachments
```

The flag controls whether `has:attachment` is added to the Gmail search query.

### What Gets Stored

**Location**: `invoice-cli/src/invoice_cli/storage.py:10-67`

Each processed email record includes:
- `message_id` - Gmail message ID (can be used to construct Gmail URL)
- `subject`, `sender`, `date` - Email metadata
- `is_invoice` - Boolean from AI classification
- `attachments` - List of downloaded attachment paths (empty for no-attachment emails)

### List Command Limitations

**Location**: `invoice-cli/src/invoice_cli/cli.py:580-714`

Current filters:
- `--all` - Show all emails including non-invoices
- `--biz` - Show only business invoices
- `--personal` - Show only personal invoices
- `--work` - Show only work invoices

**Missing**: No `--no-attachments` or `--manual` filter.

### Workaround: Using Gmail Directly

Since the `message_id` is stored, you can construct Gmail URLs manually:

```
https://mail.google.com/mail/u/0/#inbox/{message_id}
```

However, this requires looking up message IDs from the stored records.

## Code References

- `cli.py:443-446` - `--include-no-attachments` flag definition
- `cli.py:469-476` - Query building with attachment filter
- `cli.py:580-714` - List command with filtering options
- `storage.py:10-67` - InvoiceRecord model with `attachments` field

## Architecture Documentation

The current flow for emails without attachments:
1. `fetch --include-no-attachments` → Gmail search (no `has:attachment`)
2. Each email → AI classification
3. If invoice → Extract details from email body
4. Save record with `attachments: []` (empty list)
5. `list` shows them but doesn't distinguish from attachment-having invoices

## Potential Enhancements

1. **`--no-attachments` filter on `list` command** - Show only invoices that need manual download
2. **Gmail links in output** - Add direct Gmail links to `list` and `get` commands
3. **"Manual invoice" status** - Track invoices that need portal downloads separately
