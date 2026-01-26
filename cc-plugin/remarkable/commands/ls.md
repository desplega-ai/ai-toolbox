---
description: List files on reMarkable tablet
argument-hint: [path]
allowed-tools: Bash
---

# List reMarkable Files

List files and folders on the reMarkable tablet.

## Usage

```
/remarkable:ls              # List root folder
/remarkable:ls Books        # List specific folder
```

## Process

1. Run `rmapi ls` with optional path argument:
   ```bash
   rmapi ls [path]
   ```

2. Present results in a table:
   | Type | Name |
   |------|------|
   | folder | Folder name |
   | file | File name |

   Where `[d]` = folder and `[f]` = file
