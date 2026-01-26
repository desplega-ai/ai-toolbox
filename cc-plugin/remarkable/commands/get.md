---
description: Download file from reMarkable with annotations
argument-hint: <path> [destination] [--open]
allowed-tools: Bash
---

# Download from reMarkable

Download a file from the reMarkable tablet and extract viewable PDF if available.

## Usage

```
/remarkable:get "Books/MyBook.pdf"              # Download to current dir
/remarkable:get "Books/MyBook.pdf" /tmp         # Download to /tmp
/remarkable:get "Books/MyBook.pdf" /tmp --open  # Download, extract, and open
```

## Process

Run the download script:

```bash
${CLAUDE_PLUGIN_ROOT}/scripts/remarkable-get.sh "<path>" "<destination>" [--open]
```

The script:
1. Downloads the `.rmdoc` file via rmapi
2. Checks if it contains an embedded PDF
3. Extracts the PDF if found, or copies the notebook
4. Opens the file if `--open` flag is set

## File Types

| Type | What happens |
|------|--------------|
| **Uploaded PDF** | PDF extracted and viewable |
| **Native notebook** | Only .rmdoc downloaded (no local viewer) |

## Notes

- All files download as `.rmdoc` (zip archive)
- PDFs that were uploaded to reMarkable have the original PDF inside
- Native notebooks (handwritten) only contain stroke data - export from tablet instead
