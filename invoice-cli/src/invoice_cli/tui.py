"""Interactive TUI for managing invoice ownership."""

import subprocess
from pathlib import Path

from textual.app import App, ComposeResult
from textual.binding import Binding
from textual.widgets import DataTable, Footer, Header, Input, Static, ListView, ListItem, Label
from textual.containers import Vertical, VerticalScroll
from textual.screen import Screen

from invoice_cli.config import load_config, save_config
from invoice_cli.storage import InvoiceRecord, InvoiceStorage


class DetailScreen(Screen):
    """Screen showing invoice details."""

    BINDINGS = [
        Binding("escape", "go_back", "Back", show=True),
        Binding("p", "mark_personal", "Personal", show=True),
        Binding("w", "mark_work", "Work", show=True),
        Binding("u", "mark_unset", "Unset", show=True),
    ]

    def __init__(self, record: InvoiceRecord, storage: InvoiceStorage, all_records: list[InvoiceRecord]) -> None:
        super().__init__()
        self.record = record
        self.storage = storage
        self.all_records = all_records

    def compose(self) -> ComposeResult:
        yield Header()
        yield VerticalScroll(
            Static(self._build_detail_text(), id="detail-content"),
            Static("\n[bold cyan]Attachments[/bold cyan] (Enter to open)", id="attachments-header"),
            ListView(*self._build_attachment_items(), id="attachments-list"),
            id="detail-scroll",
        )
        yield Footer()

    def _build_attachment_items(self) -> list[ListItem]:
        """Build list items for attachments."""
        items = []
        for att in self.record.attachments:
            path = Path(att)
            if path.exists():
                size = path.stat().st_size
                size_str = f"{size / 1024:.1f} KB" if size < 1024 * 1024 else f"{size / 1024 / 1024:.1f} MB"
                label = f"  [green]{path.name}[/green] ({size_str})"
            else:
                label = f"  [red]{path.name}[/red] (missing)"
            item = ListItem(Label(label), id=f"att-{len(items)}")
            item.attachment_path = att  # Store path on the item
            items.append(item)

        if not items:
            item = ListItem(Label("  [dim]No attachments[/dim]"))
            items.append(item)

        return items

    def on_list_view_selected(self, event: ListView.Selected) -> None:
        """Handle attachment selection - open the file."""
        item = event.item
        if hasattr(item, 'attachment_path'):
            path = Path(item.attachment_path)
            if path.exists():
                try:
                    subprocess.run(["open", str(path)], check=True)
                    self.notify(f"Opened {path.name}", severity="information")
                except Exception as e:
                    self.notify(f"Failed to open: {e}", severity="error")
            else:
                self.notify("File not found", severity="error")

    def _build_detail_text(self) -> str:
        """Build the detail text for the invoice."""
        r = self.record
        lines = []

        # Header
        lines.append(f"[bold cyan]Invoice Details[/bold cyan]\n")

        # Basic info
        lines.append(f"[bold]Message ID:[/bold] {r.message_id}")
        lines.append(f"[bold]Subject:[/bold] {r.subject}")
        lines.append(f"[bold]Sender:[/bold] {r.sender}")
        lines.append(f"[bold]Email Date:[/bold] {r.date}")
        lines.append(f"[bold]Account:[/bold] {r.account_name} ({r.account_email})")

        # Ownership
        own_display = r.ownership or "not set"
        if r.ownership == "personal":
            own_display = "[green]Personal[/green]"
        elif r.ownership == "work":
            own_display = "[yellow]Work[/yellow]"
        lines.append(f"[bold]Ownership:[/bold] {own_display}")

        # Classification
        lines.append(f"\n[bold cyan]Classification[/bold cyan]")
        lines.append(f"  Status: {r.classification_status}")
        lines.append(f"  Confidence: {r.classification_confidence:.0%}")
        lines.append(f"  Reasoning: {r.classification_reasoning}")

        # Invoice details
        if r.is_invoice:
            lines.append(f"\n[bold cyan]Invoice Details[/bold cyan]")
            if r.company_name:
                lines.append(f"  Company: {r.company_name}")
            if r.invoice_number:
                lines.append(f"  Invoice #: {r.invoice_number}")
            if r.invoice_date:
                lines.append(f"  Invoice Date: {r.invoice_date}")
            if r.due_date:
                lines.append(f"  Due Date: {r.due_date}")
            if r.amount is not None:
                currency = r.currency or ""
                lines.append(f"  Amount: {r.amount:,.2f} {currency}")
            if r.subtotal is not None:
                lines.append(f"  Subtotal: {r.subtotal:,.2f}")
            if r.tax_amount is not None:
                lines.append(f"  Tax: {r.tax_amount:,.2f}")
            if r.description:
                lines.append(f"  Description: {r.description}")

            # Seller info
            if r.seller_vat_id or r.seller_address:
                lines.append(f"\n[bold cyan]Seller[/bold cyan]")
                if r.seller_vat_id:
                    lines.append(f"  VAT ID: {r.seller_vat_id}")
                if r.seller_address:
                    addr = r.seller_address
                    addr_parts = [addr.get(k) for k in ["street", "postal_code", "city", "country"] if addr.get(k)]
                    if addr_parts:
                        lines.append(f"  Address: {', '.join(addr_parts)}")

            # Buyer info
            if r.buyer_name or r.buyer_vat_id or r.buyer_address:
                lines.append(f"\n[bold cyan]Buyer[/bold cyan]")
                if r.buyer_name:
                    lines.append(f"  Name: {r.buyer_name}")
                if r.buyer_vat_id:
                    lines.append(f"  VAT ID: {r.buyer_vat_id}")
                if r.buyer_address:
                    addr = r.buyer_address
                    addr_parts = [addr.get(k) for k in ["street", "postal_code", "city", "country"] if addr.get(k)]
                    if addr_parts:
                        lines.append(f"  Address: {', '.join(addr_parts)}")

            # Business flag
            if r.is_business:
                lines.append(f"\n[cyan]✓ Business Invoice[/cyan]")

            # Line items
            if r.line_items:
                lines.append(f"\n[bold cyan]Line Items[/bold cyan]")
                for item in r.line_items:
                    desc = item.get("description", "Unknown")[:50]
                    qty = item.get("quantity", 1)
                    total = item.get("total")
                    if total is not None:
                        lines.append(f"  • {desc} (x{qty}) - {total:,.2f}")
                    else:
                        lines.append(f"  • {desc} (x{qty})")

            # Bank details
            if r.bank_details:
                lines.append(f"\n[bold cyan]Bank Details[/bold cyan]")
                bank = r.bank_details
                if bank.get("bank_name"):
                    lines.append(f"  Bank: {bank['bank_name']}")
                if bank.get("iban"):
                    lines.append(f"  IBAN: {bank['iban']}")
                if bank.get("swift"):
                    lines.append(f"  SWIFT: {bank['swift']}")

        # Processing info
        lines.append(f"\n[dim]Processed: {r.processed_at}[/dim]")
        if r.pdf_processed:
            lines.append(f"[dim]PDF Processed: {r.pdf_processed_at}[/dim]")

        return "\n".join(lines)

    def _update_ownership(self, ownership: str | None) -> None:
        """Update ownership for this record and all matching company records."""
        company_name = self.record.company_name
        updated_count = 0

        # Update all records with the same company name
        if company_name:
            for r in self.all_records:
                if r.company_name and r.company_name.lower() == company_name.lower():
                    if r.ownership != ownership:
                        r.ownership = ownership
                        self.storage.save_record(r)
                        updated_count += 1
        else:
            # No company name, just update this one
            if self.record.ownership != ownership:
                self.record.ownership = ownership
                self.storage.save_record(self.record)
                updated_count = 1

        self.query_one("#detail-content", Static).update(self._build_detail_text())
        self.app.main_screen.ownership_changed = True
        self.app.main_screen.changes_made += updated_count

        if updated_count > 1:
            self.notify(f"Updated {updated_count} invoices from '{company_name}'", severity="information")
        elif updated_count == 1:
            self.notify("Updated 1 invoice", severity="information")

    def action_go_back(self) -> None:
        """Go back to the main list."""
        self.app.pop_screen()

    def action_mark_personal(self) -> None:
        """Mark as personal."""
        self._update_ownership("personal")

    def action_mark_work(self) -> None:
        """Mark as work."""
        self._update_ownership("work")

    def action_mark_unset(self) -> None:
        """Unset ownership."""
        self._update_ownership(None)


class MainScreen(Screen):
    """Main screen with invoice list."""

    BINDINGS = [
        Binding("p", "mark_personal", "Personal", show=True),
        Binding("w", "mark_work", "Work", show=True),
        Binding("u", "mark_unset", "Unset", show=True),
        Binding("escape", "focus_filter", "Filter", show=False),
    ]

    def __init__(self) -> None:
        super().__init__()
        self.config = load_config()
        self.storage = InvoiceStorage(self.config.storage.base_path)
        self.all_records: list[InvoiceRecord] = []
        self.filtered_records: list[InvoiceRecord] = []
        self.filter_text = ""
        self.changes_made = 0
        self.ownership_changed = False

    def compose(self) -> ComposeResult:
        yield Header()
        yield Input(placeholder="Type to filter by company, subject, or ID... (Ctrl+C twice to exit)", id="filter-input")
        yield DataTable(id="invoice-table")
        yield Static("", id="status-bar")
        yield Footer()

    def on_mount(self) -> None:
        """Load data when screen mounts."""
        self.load_records()
        self.setup_table()
        self.update_status()

    def on_screen_resume(self) -> None:
        """Called when returning to this screen."""
        if self.ownership_changed:
            # Reload records to get updated data
            self.load_records()
            self.apply_filter()
            self.ownership_changed = False

    def load_records(self) -> None:
        """Load invoice records."""
        records = self.storage.load_index()
        self.all_records = [r for r in records if r.is_invoice]
        self.filtered_records = self.all_records.copy()

    def setup_table(self) -> None:
        """Set up the data table."""
        table = self.query_one("#invoice-table", DataTable)
        table.cursor_type = "row"
        table.zebra_stripes = True

        table.add_column("Own", width=5)
        table.add_column("Date", width=12)
        table.add_column("Company", width=25)
        table.add_column("Amount", width=15)
        table.add_column("Subject", width=40)
        table.add_column("ID", width=14)

        self.refresh_table()

    def refresh_table(self, preserve_cursor: bool = False) -> None:
        """Refresh the table with current filtered records."""
        table = self.query_one("#invoice-table", DataTable)

        # Save cursor position
        saved_row = table.cursor_row if preserve_cursor else 0

        table.clear()

        for record in self.filtered_records:
            # Ownership indicator
            if record.ownership == "personal":
                own_str = "[green]P[/green]"
            elif record.ownership == "work":
                own_str = "[yellow]W[/yellow]"
            else:
                own_str = "-"

            # Date
            date_str = record.invoice_date or (record.date[:10] if record.date else "")

            # Company
            company = record.company_name or record.sender.split("<")[0].strip()
            company = company[:24]

            # Amount
            if record.amount is not None:
                currency = record.currency or ""
                amount_str = f"{record.amount:,.2f} {currency}"
            else:
                amount_str = "-"

            table.add_row(
                own_str,
                date_str[:12],
                company,
                amount_str,
                record.subject[:39],
                record.message_id[:12],
                key=record.message_id,
            )

        # Restore cursor position
        if preserve_cursor and saved_row is not None and len(self.filtered_records) > 0:
            new_row = min(saved_row, len(self.filtered_records) - 1)
            table.move_cursor(row=new_row)

    def apply_filter(self) -> None:
        """Apply current filter to records."""
        if not self.filter_text:
            self.filtered_records = self.all_records.copy()
        else:
            filter_lower = self.filter_text.lower()
            self.filtered_records = [
                r for r in self.all_records
                if filter_lower in (r.company_name or "").lower()
                or filter_lower in r.subject.lower()
                or filter_lower in r.message_id.lower()
                or filter_lower in r.sender.lower()
            ]
        self.refresh_table()
        self.update_status()

    def on_input_changed(self, event: Input.Changed) -> None:
        """Handle filter input changes."""
        self.filter_text = event.value
        self.apply_filter()

    def get_selected_record(self) -> InvoiceRecord | None:
        """Get the currently selected record."""
        table = self.query_one("#invoice-table", DataTable)
        if table.cursor_row is None or table.cursor_row >= len(self.filtered_records):
            return None
        return self.filtered_records[table.cursor_row]

    def update_record_ownership(self, ownership: str | None) -> None:
        """Update the ownership of the selected record and all matching company records."""
        record = self.get_selected_record()
        if not record:
            return

        company_name = record.company_name
        updated_count = 0

        # Update all records with the same company name
        if company_name:
            for r in self.all_records:
                if r.company_name and r.company_name.lower() == company_name.lower():
                    if r.ownership != ownership:
                        r.ownership = ownership
                        self.storage.save_record(r)
                        updated_count += 1
        else:
            # No company name, just update this one
            if record.ownership != ownership:
                record.ownership = ownership
                self.storage.save_record(record)
                updated_count = 1

        self.changes_made += updated_count

        # Show notification
        if updated_count > 1:
            self.notify(f"Updated {updated_count} invoices from '{company_name}'", severity="information")
        elif updated_count == 1:
            self.notify(f"Updated 1 invoice", severity="information")

        # Refresh the table, preserving cursor position
        self.refresh_table(preserve_cursor=True)
        self.update_status()

    def action_mark_personal(self) -> None:
        """Mark selected invoice as personal."""
        self.update_record_ownership("personal")

    def action_mark_work(self) -> None:
        """Mark selected invoice as work."""
        self.update_record_ownership("work")

    def action_mark_unset(self) -> None:
        """Unset ownership for selected invoice."""
        self.update_record_ownership(None)

    def on_data_table_row_selected(self, event: DataTable.RowSelected) -> None:
        """Handle Enter key on a row - show details."""
        record = self.get_selected_record()
        if record:
            self.app.push_screen(DetailScreen(record, self.storage, self.all_records))

    def action_focus_filter(self) -> None:
        """Focus the filter input."""
        self.query_one("#filter-input", Input).focus()

    def update_status(self) -> None:
        """Update the status bar."""
        status = self.query_one("#status-bar", Static)

        # Count by ownership
        personal_count = sum(1 for r in self.all_records if r.ownership == "personal")
        work_count = sum(1 for r in self.all_records if r.ownership == "work")
        unset_count = sum(1 for r in self.all_records if not r.ownership)

        status.update(
            f"Total: {len(self.all_records)} | "
            f"Showing: {len(self.filtered_records)} | "
            f"[green]Personal: {personal_count}[/green] | "
            f"[yellow]Work: {work_count}[/yellow] | "
            f"Unset: {unset_count} | "
            f"Changes: {self.changes_made}"
        )


class OwnershipTUI(App):
    """Interactive TUI for marking invoice ownership."""

    CSS = """
    #filter-input {
        dock: top;
        height: 3;
        padding: 0 1;
    }

    #status-bar {
        dock: bottom;
        height: 1;
        background: $surface;
        color: $text-muted;
        padding: 0 1;
    }

    DataTable {
        height: 1fr;
    }

    #detail-content {
        padding: 1 2;
    }

    #attachments-header {
        padding: 0 2;
    }

    #attachments-list {
        height: auto;
        max-height: 10;
        margin: 0 2 1 2;
    }

    #attachments-list > ListItem {
        padding: 0 1;
    }
    """

    def __init__(self) -> None:
        super().__init__()
        self.main_screen = MainScreen()

    def on_mount(self) -> None:
        """Set up the app."""
        self.push_screen(self.main_screen)


def run_tui() -> None:
    """Run the interactive TUI."""
    app = OwnershipTUI()
    app.run()
