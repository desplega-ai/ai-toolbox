---
description: List files on reMarkable tablet
argument-hint: [path] [--tree]
allowed-tools: Bash
---

# List reMarkable Files

List files and folders on the reMarkable tablet.

## Usage

```
/remarkable:ls              # List root folder
/remarkable:ls Books        # List specific folder
/remarkable:ls --tree       # Show full tree view
```

## Process

1. Run `rmapi ls` with optional path argument:
   ```bash
   rmapi ls [path]
   ```

2. Present results in a table:
   | Type | Name |
   |------|------|
   | 📁 | Folder name |
   | 📄 | File name |

   Where `[d]` = folder (📁) and `[f]` = file (📄)

3. If `--tree` flag is provided:
   - Recursively list all folders
   - Present as an ASCII tree structure:
   ```
   reMarkable/
   ├── 📄 file.pdf
   ├── 📁 Folder/
   │   ├── 📄 nested-file.pdf
   │   └── 📁 Subfolder/
   ```
