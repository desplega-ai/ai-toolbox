---
date: 2026-01-26T07:05:00-08:00
researcher: Claude
git_commit: 6a5402d
branch: main
repository: ai-toolbox
topic: "Simple CLI for Pushing Files to reMarkable Tablet"
tags: [research, cli, remarkable, file-transfer, usb-web-interface]
status: complete
autonomy: autopilot
last_updated: 2026-01-26
last_updated_by: Claude
---

# Research: Simple CLI for Pushing Files to reMarkable Tablet

**Date**: 2026-01-26
**Researcher**: Claude
**Git Commit**: 6a5402d
**Branch**: main

## Research Question

How to build a super simple local CLI that pushes local files to a reMarkable tablet?

## Summary

For the **simplest possible implementation**, use the **USB Web Interface** - it requires zero authentication and is literally a curl one-liner. The reMarkable tablet exposes a web server at `http://10.11.99.1` when connected via USB with the web interface enabled. No cloud account, no tokens, no setup beyond enabling one setting on the device.

For a more feature-rich solution with folder support and cloud sync, wrap the existing `rmapi` CLI tool (specifically the ddvk fork, as the original was archived in July 2024).

## Detailed Findings

### 1. The Simplest Approach: USB Web Interface

The reMarkable tablet has an optional web interface at `http://10.11.99.1:80` that allows file uploads with zero authentication.

**One-liner to upload a PDF:**
```bash
curl 'http://10.11.99.1/upload' \
  -H 'Origin: http://10.11.99.1' \
  -F "file=@document.pdf;filename=document.pdf;type=application/pdf"
```

**Complete minimal CLI (Bash):**
```bash
#!/usr/bin/env bash
# rm-push - Push files to reMarkable via USB

REMARKABLE_IP="${REMARKABLE_IP:-10.11.99.1}"

for file in "$@"; do
    filename=$(basename "$file")
    case "${file##*.}" in
        pdf)  mimetype="application/pdf" ;;
        epub) mimetype="application/epub+zip" ;;
        *)    echo "Skipping unsupported: $file"; continue ;;
    esac

    echo "Uploading: $filename"
    curl -s "http://$REMARKABLE_IP/upload" \
        -H "Origin: http://$REMARKABLE_IP" \
        -F "file=@$file;filename=$filename;type=$mimetype" \
        && echo " done" || echo " failed"
done
```

**Requirements:**
- USB cable connected
- Settings → Storage → "USB web interface" enabled on tablet
- Files upload to root folder (reorganize on device if needed)

**API Endpoints:**
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/documents/` | GET | List all documents in root |
| `/documents/{uuid}` | GET | List documents in folder |
| `/upload` | POST | Upload PDF/EPUB (multipart form) |
| `/download/{uuid}/pdf` | GET | Download as PDF with annotations |
| `/search/{keyword}` | POST | Search documents |

**Limitations:**
- 100MB file size limit
- Files go to root folder (last listed folder)
- No folder creation via API
- Only PDF and EPUB supported

### 2. Existing CLI Tools

#### rmapi (Recommended for Cloud Sync)

The most feature-complete CLI for reMarkable. **Important:** The original `juruen/rmapi` was archived July 2024. Use the actively maintained fork: [ddvk/rmapi](https://github.com/ddvk/rmapi).

**Installation:**
```bash
# macOS
brew install ddvk/tap/rmapi

# From source (requires Go)
go install github.com/ddvk/rmapi@latest

# Binary download
curl -L https://github.com/ddvk/rmapi/releases/latest/download/rmapi-macos-arm64 -o rmapi
chmod +x rmapi
```

**Usage:**
```bash
# First run - prompts for one-time code from my.remarkable.com/connect/desktop
rmapi

# Non-interactive upload
rmapi put document.pdf
rmapi put document.pdf "Folder/Subfolder/"

# Interactive shell
rmapi
> ls
> cd Documents
> put ~/paper.pdf
> mput ~/papers/        # recursive upload
```

**Pros:** Full cloud API support, folder management, works remotely
**Cons:** Requires cloud account, new sync15 protocol still experimental

#### remarkable-cli (Python)

```bash
pip install remarkable-cli
remarkable-cli -a pull  # Download files
remarkable-cli -a push  # Upload files
```

Focuses on file conversion and backup rather than simple upload.

#### RCU (reMarkable Connection Utility)

Commercial ($12) but comprehensive cross-platform tool with both GUI and CLI. Handles files >100MB, works via USB/SSH.

### 3. JavaScript/TypeScript Options

#### remarkable-cloud-js (for Cloud API)

```typescript
import RmCJS from 'remarkable-cloud-js';

// First time: get code from my.remarkable.com/connect/desktop
const rm = new RmCJS();
const deviceToken = await rm.register_device('abcd1234', RmCJS.device_desc.desktop.macos);
// Save deviceToken!

// Subsequent runs
const rm = new RmCJS(process.env.REMARKABLE_DEVICE_TOKEN);
await rm.refresh_token();
await rm.write_pdf('/Documents/My Paper', './paper.pdf');
```

**npm:** `remarkable-cloud-js` (v0.16.0, last updated 4 years ago)

### 4. Cloud API Details (If Needed)

**Authentication Flow:**
1. User gets one-time code from `https://my.remarkable.com/connect/desktop`
2. Exchange for device token: `POST https://my.remarkable.com/token/json/2/device/new`
3. Exchange for user token: `POST https://my.remarkable.com/token/json/2/user/new` (expires ~24h)
4. Use user token for API calls

**Warning:** reMarkable introduced a new "sync15" protocol being rolled out incrementally. This broke many third-party tools. The ddvk/rmapi fork has experimental support.

### 5. File Format Considerations

**Supported formats:**
- PDF (native, recommended)
- EPUB (converted to PDF internally for annotations)

**Internal storage:** `/home/root/.local/share/remarkable/xochitl/`
- UUID-based naming: `{uuid}.pdf`, `{uuid}.metadata`, `{uuid}.content`
- Metadata is JSON with `visibleName`, `type`, `parent` (folder UUID)

**Size limits:** 100MB via web interface/cloud. Larger files require SSH.

## Recommendations

### For Your Use Case (Super Simple Local CLI)

**Option 1: Pure Bash (Simplest)**
```bash
#!/usr/bin/env bash
# Save as: rm-push
curl -s "http://10.11.99.1/upload" \
  -H "Origin: http://10.11.99.1" \
  -F "file=@$1;filename=$(basename "$1");type=application/pdf"
```

Usage: `rm-push document.pdf`

**Option 2: TypeScript/Bun (If You Want Types)**
```typescript
#!/usr/bin/env bun
// rm-push.ts
const file = Bun.file(process.argv[2]);
const formData = new FormData();
formData.append('file', file, file.name);

const res = await fetch('http://10.11.99.1/upload', {
  method: 'POST',
  headers: { 'Origin': 'http://10.11.99.1' },
  body: formData,
});

console.log(res.ok ? `Uploaded: ${file.name}` : 'Upload failed');
```

**Option 3: Wrap rmapi (If You Need Folders/Cloud)**
```bash
#!/usr/bin/env bash
# rm-push with folder support via rmapi
rmapi put "$1" "${2:-/}"
```

## Comparison Matrix

| Approach | Complexity | Auth | Offline | Folders | Large Files |
|----------|------------|------|---------|---------|-------------|
| USB curl | Trivial | None | Yes | No | No (100MB) |
| Bash wrapper | Low | None | Yes | No | No |
| Bun/TypeScript | Low | None | Yes | No | No |
| rmapi wrapper | Medium | Cloud | No | Yes | Yes |
| Cloud API direct | High | Cloud | No | Yes | Yes |
| SSH/SFTP | Medium | SSH key | Yes | Yes | Yes |

## Code References

| Resource | URL | Description |
|----------|-----|-------------|
| ddvk/rmapi | https://github.com/ddvk/rmapi | Active Go CLI fork |
| USB Web Interface | https://remarkable.guide/tech/usb-web-interface.html | Official docs |
| remarkable-cloud-js | https://github.com/hugodecasta/remarkable-cloud-js | Node.js library |
| Cloud API docs | https://akeil.de/posts/remarkable-cloud-api/ | Reverse-engineered API |
| awesome-reMarkable | https://github.com/reHackable/awesome-reMarkable | Curated tool list |

## Open Questions

- Do you want folder support? (If yes, wrap rmapi instead of USB interface)
- Do you want cloud sync? (If yes, use cloud API approach)
- What's your target platform? (Bash works everywhere, Bun requires installation)
- Do you have files >100MB? (If yes, need SSH or rmapi)

## Related Research

- `thoughts/taras/research/2026-01-22-journal-cli-research.md` - CLI patterns for brain tool
