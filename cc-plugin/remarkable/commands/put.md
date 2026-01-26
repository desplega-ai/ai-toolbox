---
description: Upload file to reMarkable (converts markdown to PDF)
argument-hint: <file> [folder] [--mkdir]
allowed-tools: Bash
---

# Upload to reMarkable

Upload a file to the reMarkable tablet. Markdown files are automatically converted to PDF using pandoc.

## Usage

```
/remarkable:put document.pdf                         # Upload to root
/remarkable:put document.pdf "Books/"                # Upload to folder
/remarkable:put notes.md "Work/Notes"                # Convert md to pdf and upload
/remarkable:put report.md "Work/NewFolder" --mkdir   # Create folder if needed
```

## Process

Run the upload script:

```bash
${CLAUDE_PLUGIN_ROOT}/scripts/remarkable-put.sh "<file>" "<folder>" [--mkdir]
```

The script:
1. Detects file type by extension
2. Converts `.md` files to PDF using pandoc with xelatex (for Unicode support)
3. Creates the remote folder if `--mkdir` is specified
4. Uploads the file to reMarkable

## Supported Formats

| Extension | Action |
|-----------|--------|
| `.pdf` | Direct upload |
| `.epub` | Direct upload |
| `.md` | Convert to PDF via pandoc (xelatex), then upload |

## Notes

- Uses xelatex for better Unicode support (emojis, special characters)
- Creates temp files that are cleaned up automatically
- Max file size: ~100MB via cloud API
- Folder paths use forward slashes: `"Work/desplega.ai/Thoughts"`
