"""PDF text extraction for invoice processing."""

from pathlib import Path

import pdfplumber


def extract_text_from_pdf(pdf_path: Path) -> str:
    """Extract all text from a PDF file.

    Args:
        pdf_path: Path to the PDF file

    Returns:
        Extracted text content, pages separated by newlines

    Raises:
        FileNotFoundError: If PDF file doesn't exist
        Exception: If PDF cannot be read/parsed
    """
    if not pdf_path.exists():
        raise FileNotFoundError(f"PDF file not found: {pdf_path}")

    text_parts = []

    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text()
            if page_text:
                text_parts.append(page_text)

    return "\n\n".join(text_parts)


def is_pdf(path: Path) -> bool:
    """Check if a file is a PDF based on extension.

    Args:
        path: File path to check

    Returns:
        True if file has .pdf extension (case-insensitive)
    """
    return path.suffix.lower() == ".pdf"
