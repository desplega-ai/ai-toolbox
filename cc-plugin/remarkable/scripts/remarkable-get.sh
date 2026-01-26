#!/bin/bash
# remarkable-get.sh - Download and extract files from reMarkable tablet
# Usage: remarkable-get.sh <remote-path> [destination] [--open]

set -e

RMAPI="${RMAPI:-rmapi}"
REMOTE_PATH="$1"
DEST="${2:-.}"
OPEN_FLAG=""

# Parse flags
for arg in "$@"; do
    if [[ "$arg" == "--open" ]]; then
        OPEN_FLAG="true"
    fi
done

# Validate input
if [[ -z "$REMOTE_PATH" ]]; then
    echo "Usage: remarkable-get.sh <remote-path> [destination] [--open]"
    echo "Example: remarkable-get.sh 'Books/MyBook.pdf' /tmp --open"
    exit 1
fi

# Extract filename from path
FILENAME=$(basename "$REMOTE_PATH")

# Create temp directory for work
WORK_DIR=$(mktemp -d)
trap "rm -rf $WORK_DIR" EXIT

echo "Downloading: $REMOTE_PATH"

# Download the file
cd "$WORK_DIR"
$RMAPI get "$REMOTE_PATH"

# Find the downloaded file (should be .rmdoc or .zip)
RMDOC=$(ls *.rmdoc 2>/dev/null || ls *.zip 2>/dev/null || echo "")

if [[ -z "$RMDOC" ]]; then
    echo "Error: Download failed - no .rmdoc file found"
    exit 1
fi

echo "Downloaded: $RMDOC"

# Check if it contains a PDF
PDF_INSIDE=$(unzip -l "$RMDOC" 2>/dev/null | grep -E "\.pdf$" | awk '{print $4}' || echo "")

if [[ -n "$PDF_INSIDE" ]]; then
    echo "Found embedded PDF, extracting..."

    # Extract the PDF
    unzip -j -o "$RMDOC" "*.pdf" -d "$WORK_DIR" 2>/dev/null

    # Find the extracted PDF (has UUID name)
    EXTRACTED_PDF=$(ls "$WORK_DIR"/*.pdf 2>/dev/null | head -1)

    if [[ -n "$EXTRACTED_PDF" ]]; then
        # Create clean filename (remove .pdf if already in name, then add it)
        CLEAN_NAME="${FILENAME%.pdf}.pdf"
        FINAL_PATH="$DEST/$CLEAN_NAME"

        mv "$EXTRACTED_PDF" "$FINAL_PATH"
        echo "Extracted: $FINAL_PATH"
        echo "TYPE=pdf"

        if [[ "$OPEN_FLAG" == "true" ]]; then
            echo "Opening PDF..."
            open "$FINAL_PATH"
        fi
    fi
else
    # No PDF inside - it's a native notebook
    CLEAN_NAME="${FILENAME%.rmdoc}.rmdoc"
    FINAL_PATH="$DEST/$CLEAN_NAME"

    cp "$RMDOC" "$FINAL_PATH"
    echo "Downloaded notebook: $FINAL_PATH"
    echo "TYPE=notebook"
    echo "Note: Native notebooks cannot be viewed locally. Export from tablet or use reMarkable desktop app."
fi
