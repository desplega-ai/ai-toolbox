---
description: Download file from reMarkable with annotations
argument-hint: <path> [--raw]
allowed-tools: Bash
---

# Download from reMarkable

Download a file from the reMarkable tablet. By default, downloads with annotations (handwritten notes) included.

## Usage

```
/remarkable:get "Books/My Notes.pdf"        # With annotations
/remarkable:get "Books/My Notes.pdf" --raw  # Without annotations
```

## Process

1. Parse arguments:
   - `path`: Required - path to file on tablet
   - `--raw`: Optional - download without annotations

2. Download:
   ```bash
   # With annotations (default)
   rmapi geta "<path>"

   # Raw (without annotations)
   rmapi get "<path>"
   ```

3. Report result:
   ```
   Downloaded: <filename>
   Location: ./<filename>
   ```

## Notes

- Files download to the current working directory
- Use `geta` (default) to include your handwritten annotations
- Use `--raw` for the original file without annotations
