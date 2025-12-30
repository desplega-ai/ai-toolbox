"""Invoice classification using BAML and Claude."""

from invoice_cli.baml_client import b
from invoice_cli.baml_client.types import (
    EnhancedInvoiceDetails,
    InvoiceDetection,
    InvoiceDetails,
    InvoiceStatus,
)


def detect_invoice(
    subject: str,
    body: str,
    sender: str,
) -> InvoiceDetection:
    """Detect whether an email is an invoice.

    Args:
        subject: Email subject line
        body: Email body text
        sender: Sender email address

    Returns:
        InvoiceDetection with status, confidence, and reasoning
    """
    return b.DetectInvoice(
        email_subject=subject,
        email_body=body,
        sender=sender,
    )


def extract_details(
    subject: str,
    body: str,
    sender: str,
) -> InvoiceDetails:
    """Extract invoice details from an email.

    Args:
        subject: Email subject line
        body: Email body text
        sender: Sender email address

    Returns:
        InvoiceDetails with extracted metadata
    """
    return b.ExtractInvoiceDetails(
        email_subject=subject,
        email_body=body,
        sender=sender,
    )


def is_invoice(detection: InvoiceDetection, threshold: float = 0.5) -> bool:
    """Check if detection indicates an invoice.

    Args:
        detection: InvoiceDetection result
        threshold: Minimum confidence for MAYBE_INVOICE to count as invoice

    Returns:
        True if the email is likely an invoice
    """
    if detection.status == InvoiceStatus.IS_INVOICE:
        return True
    if detection.status == InvoiceStatus.MAYBE_INVOICE:
        return detection.confidence >= threshold
    return False


def extract_from_pdf(
    pdf_text: str,
    email_context: str | None = None,
) -> EnhancedInvoiceDetails:
    """Extract detailed invoice data from PDF text.

    Args:
        pdf_text: Extracted text from PDF
        email_context: Optional email subject/sender for additional context

    Returns:
        EnhancedInvoiceDetails with all extracted fields
    """
    return b.ExtractFromPDF(
        pdf_text=pdf_text,
        email_context=email_context,
    )


__all__ = [
    "detect_invoice",
    "extract_details",
    "extract_from_pdf",
    "is_invoice",
    "EnhancedInvoiceDetails",
    "InvoiceDetection",
    "InvoiceDetails",
    "InvoiceStatus",
]
