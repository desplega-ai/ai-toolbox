"""Storage management for invoice records and attachments."""

import json
from datetime import datetime
from pathlib import Path

from pydantic import BaseModel, Field


class InvoiceRecord(BaseModel):
    """Complete record of a processed email."""

    # Email metadata
    message_id: str
    subject: str
    sender: str
    date: str
    snippet: str
    account_name: str
    account_email: str

    # Classification results
    is_invoice: bool
    classification_status: str  # IS_INVOICE, NOT_INVOICE, MAYBE_INVOICE
    classification_confidence: float
    classification_reasoning: str

    # Invoice details (if classified as invoice)
    company_name: str | None = None
    invoice_number: str | None = None
    amount: float | None = None
    currency: str | None = None
    invoice_date: str | None = None
    due_date: str | None = None
    description: str | None = None

    # Enhanced extraction fields (from PDF processing)
    seller_vat_id: str | None = None
    buyer_name: str | None = None
    buyer_vat_id: str | None = None
    seller_address: dict | None = None
    buyer_address: dict | None = None
    bank_details: dict | None = None
    line_items: list[dict] | None = None
    tax_amount: float | None = None
    subtotal: float | None = None

    # Processing flags
    is_business: bool = False
    pdf_processed: bool = False
    pdf_processed_at: str | None = None

    # Ownership: "personal" or "work"
    ownership: str | None = None

    # Attachments
    attachments: list[str] = Field(default_factory=list)

    # Processing metadata
    processed_at: str = Field(default_factory=lambda: datetime.now().isoformat())

    # Google Drive upload tracking
    gdrive_uploaded: bool = False
    gdrive_uploaded_at: str | None = None
    gdrive_file_ids: list[str] = Field(default_factory=list)
    gdrive_folder_path: str | None = None


class InvoiceStorage:
    """Manages storage of invoice records and attachments."""

    def __init__(self, base_path: Path) -> None:
        """Initialize storage at the given path.

        Args:
            base_path: Base directory for storage
        """
        self.base_path = base_path
        self.attachments_dir = base_path / "attachments"
        self.metadata_dir = base_path / "metadata"
        self.emails_dir = self.metadata_dir / "emails"
        self.index_path = self.metadata_dir / "index.json"

        # Ensure directories exist
        self.attachments_dir.mkdir(parents=True, exist_ok=True)
        self.emails_dir.mkdir(parents=True, exist_ok=True)

    def has_message(self, message_id: str) -> bool:
        """Check if a message has already been processed.

        Args:
            message_id: Gmail message ID

        Returns:
            True if already processed
        """
        return (self.emails_dir / f"{message_id}.json").exists()

    def save_record(self, record: InvoiceRecord) -> None:
        """Save an invoice record.

        Args:
            record: InvoiceRecord to save
        """
        record_path = self.emails_dir / f"{record.message_id}.json"
        with open(record_path, "w") as f:
            json.dump(record.model_dump(), f, indent=2)

        # Update index
        self._update_index()

    def save_attachment(
        self,
        message_id: str,
        filename: str,
        data: bytes,
    ) -> Path:
        """Save an attachment file.

        Args:
            message_id: Gmail message ID
            filename: Original filename
            data: Raw file data

        Returns:
            Path to saved file
        """
        # Create message-specific directory
        msg_dir = self.attachments_dir / message_id
        msg_dir.mkdir(exist_ok=True)

        # Save attachment
        file_path = msg_dir / filename
        with open(file_path, "wb") as f:
            f.write(data)

        return file_path

    def _update_index(self) -> None:
        """Update the master index file."""
        records = []

        for record_file in self.emails_dir.glob("*.json"):
            with open(record_file) as f:
                records.append(json.load(f))

        # Sort by processed_at descending
        records.sort(key=lambda r: r.get("processed_at", ""), reverse=True)

        with open(self.index_path, "w") as f:
            json.dump(records, f, indent=2)

    def load_index(self) -> list[InvoiceRecord]:
        """Load all records from the index.

        Returns:
            List of InvoiceRecord objects
        """
        if not self.index_path.exists():
            return []

        with open(self.index_path) as f:
            data = json.load(f)

        return [InvoiceRecord.model_validate(r) for r in data]

    def load_record(self, message_id: str) -> InvoiceRecord | None:
        """Load a specific record.

        Args:
            message_id: Gmail message ID

        Returns:
            InvoiceRecord if found, None otherwise
        """
        record_path = self.emails_dir / f"{message_id}.json"
        if not record_path.exists():
            return None

        with open(record_path) as f:
            return InvoiceRecord.model_validate(json.load(f))

    def get_attachments_for_message(self, message_id: str) -> list[Path]:
        """Get list of attachment files for a message.

        Args:
            message_id: Gmail message ID

        Returns:
            List of paths to attachment files
        """
        msg_dir = self.attachments_dir / message_id
        if not msg_dir.exists():
            return []
        return list(msg_dir.iterdir())
