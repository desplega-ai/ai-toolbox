#!/bin/bash
# remarkable-put.sh - Upload files to reMarkable tablet (converts markdown to PDF)
# Usage: remarkable-put.sh <local-file> [remote-folder] [--mkdir]

set -e

RMAPI="${RMAPI:-rmapi}"
LOCAL_FILE="$1"
REMOTE_FOLDER="${2:-}"
MKDIR_FLAG=""

# Parse flags
for arg in "$@"; do
    if [[ "$arg" == "--mkdir" ]]; then
        MKDIR_FLAG="true"
    fi
done

# Validate input
if [[ -z "$LOCAL_FILE" ]]; then
    echo "Usage: remarkable-put.sh <local-file> [remote-folder] [--mkdir]"
    echo ""
    echo "Examples:"
    echo "  remarkable-put.sh document.pdf"
    echo "  remarkable-put.sh notes.md \"Work/Notes\""
    echo "  remarkable-put.sh report.md \"Work/NewFolder\" --mkdir"
    echo ""
    echo "Supported formats:"
    echo "  .pdf  - Direct upload"
    echo "  .epub - Direct upload"
    echo "  .md   - Converted to PDF via pandoc"
    exit 1
fi

if [[ ! -f "$LOCAL_FILE" ]]; then
    echo "Error: File not found: $LOCAL_FILE"
    exit 1
fi

# Get file extension and basename
FILENAME=$(basename "$LOCAL_FILE")
EXTENSION="${FILENAME##*.}"
BASENAME="${FILENAME%.*}"

# Create temp directory for work
WORK_DIR=$(mktemp -d)
trap "rm -rf $WORK_DIR" EXIT

# Determine upload file
UPLOAD_FILE="$LOCAL_FILE"

# Convert markdown to PDF if needed
if [[ "$EXTENSION" == "md" || "$EXTENSION" == "markdown" ]]; then
    echo "Converting markdown to PDF..."
    PDF_FILE="$WORK_DIR/$BASENAME.pdf"

    # Use xelatex for better Unicode support
    # Smaller margins and URL line breaking
    if pandoc "$LOCAL_FILE" \
        --pdf-engine=xelatex \
        -V geometry:margin=1.5cm \
        -V colorlinks=true \
        -V urlcolor=blue \
        -V 'header-includes:\usepackage[hyphens,spaces,obeyspaces]{url}' \
        -o "$PDF_FILE" 2>&1; then
        echo "Converted: $PDF_FILE"
        UPLOAD_FILE="$PDF_FILE"
    else
        # Fallback: try without xelatex
        echo "xelatex failed, trying default engine..."
        if pandoc "$LOCAL_FILE" -o "$PDF_FILE" 2>&1; then
            UPLOAD_FILE="$PDF_FILE"
        else
            echo "Error: Failed to convert markdown to PDF"
            echo "Hint: Install pandoc and a LaTeX distribution (e.g., brew install pandoc mactex-no-gui)"
            exit 1
        fi
    fi
fi

# Create remote folder if requested
if [[ -n "$REMOTE_FOLDER" && "$MKDIR_FLAG" == "true" ]]; then
    echo "Creating folder: $REMOTE_FOLDER"
    $RMAPI mkdir "$REMOTE_FOLDER" 2>/dev/null || true
fi

# Upload
echo "Uploading: $(basename "$UPLOAD_FILE")"
if [[ -n "$REMOTE_FOLDER" ]]; then
    $RMAPI put "$UPLOAD_FILE" "$REMOTE_FOLDER"
    echo "Uploaded to: $REMOTE_FOLDER/$(basename "${UPLOAD_FILE%.*}")"
else
    $RMAPI put "$UPLOAD_FILE"
    echo "Uploaded to: / (root)"
fi

echo "Done!"
