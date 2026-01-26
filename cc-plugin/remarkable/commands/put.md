---
description: Upload file to reMarkable (converts markdown to PDF)
argument-hint: <file> [folder]
allowed-tools: Bash
---

# Upload to reMarkable

Upload a file to the reMarkable tablet. Markdown files are automatically converted to PDF using pandoc.

## Usage

```
/remarkable:put document.pdf                    # Upload to root
/remarkable:put document.pdf "Books/"           # Upload to folder
/remarkable:put notes.md "Documents/"           # Convert md to pdf and upload
```

## Process

1. Parse arguments:
   - `file`: Required - local file path
   - `folder`: Optional - destination folder on tablet (default: root)

2. Check file extension:
   - If `.md`: Convert to PDF first using pandoc
   - If `.pdf` or `.epub`: Upload directly

3. For markdown conversion:
   ```bash
   # Convert to temp PDF
   pandoc "<file>" -o "/tmp/<basename>.pdf"

   # Upload the PDF
   rmapi put "/tmp/<basename>.pdf" "<folder>"
   ```

4. For direct upload:
   ```bash
   rmapi put "<file>" "<folder>"
   ```

5. Report result:
   ```
   Uploaded: <filename> to <folder>
   ```

## Supported Formats

| Extension | Action |
|-----------|--------|
| `.pdf` | Direct upload |
| `.epub` | Direct upload |
| `.md` | Convert to PDF via pandoc, then upload |

## Notes

- Markdown conversion uses pandoc's default PDF engine
- For better PDF styling, consider using a custom pandoc template
- Max file size: ~100MB via cloud API
