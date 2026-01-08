"""Invoice CLI - Fetch and organize invoice emails from Gmail using AI classification."""

import re
from datetime import datetime
from pathlib import Path

import typer
from rich.console import Console
from rich.table import Table

from invoice_cli.config import (
    AccountConfig,
    CompanyConfig,
    Config,
    OwnershipConfig,
    StorageConfig,
    get_config_path,
    get_tokens_dir,
    load_config,
    save_config,
)
from invoice_cli.classifier import detect_invoice, extract_details, extract_from_pdf, is_invoice
from invoice_cli.pdf import extract_text_from_pdf, is_pdf
from invoice_cli.gmail import (
    download_attachment,
    get_attachments,
    get_body_text,
    get_credentials_path,
    get_email_metadata,
    get_message,
    get_service,
    get_user_email,
    search_messages,
)
from invoice_cli.storage import InvoiceRecord, InvoiceStorage
from invoice_cli.gdrive import get_drive_service, create_folder_path, upload_file

app = typer.Typer(
    name="invoice-cli",
    help="Fetch and organize invoice emails from Gmail using AI classification",
)
console = Console()


@app.command()
def setup(
    storage: str = typer.Option(
        "~/invoices",
        "--storage",
        "-s",
        help="Path to store invoices and metadata",
    ),
) -> None:
    """Initialize configuration and storage directory."""
    storage_path = Path(storage).expanduser()

    # Create storage directories
    storage_path.mkdir(parents=True, exist_ok=True)
    (storage_path / "attachments").mkdir(exist_ok=True)
    (storage_path / "metadata" / "emails").mkdir(parents=True, exist_ok=True)

    # Create tokens directory
    get_tokens_dir().mkdir(parents=True, exist_ok=True)

    # Load existing config or create new
    try:
        config = load_config()
    except Exception:
        config = Config()

    # Update storage path
    config.storage = StorageConfig(base_path=storage_path)

    # Save config
    save_config(config)

    console.print(f"[green]Configuration saved to:[/green] {get_config_path()}")
    console.print(f"[green]Storage directory:[/green] {storage_path}")
    console.print()
    console.print("[dim]Next steps:[/dim]")
    console.print("  1. Set up Google Cloud credentials (see README)")
    console.print("  2. Run: invoice-cli add-account <name>")


def _prompt_with_default(prompt: str, default: str | None) -> str | None:
    """Prompt for input with optional default value."""
    if default:
        result = typer.prompt(prompt, default=default, show_default=True)
    else:
        result = typer.prompt(prompt, default="", show_default=False)
    return result if result else None


@app.command()
def set_company(
    owner_name: str | None = typer.Option(None, "--owner", "-o", help="Your name"),
    company_name: str | None = typer.Option(None, "--name", "-n", help="Company name"),
    vat_id: str | None = typer.Option(None, "--vat", "-v", help="VAT ID"),
    tax_id: str | None = typer.Option(None, "--tax", "-t", help="Tax ID (NIP, TIN, etc.)"),
    street: str | None = typer.Option(None, "--street", help="Street address"),
    city: str | None = typer.Option(None, "--city", help="City"),
    postal_code: str | None = typer.Option(None, "--postal", help="Postal code"),
    country: str | None = typer.Option(None, "--country", help="Country"),
) -> None:
    """Configure your company/personal info for business invoice tagging."""
    config = load_config()

    # Check if any options were provided
    any_provided = any([
        owner_name, company_name, vat_id, tax_id,
        street, city, postal_code, country
    ])

    if not any_provided:
        # Interactive mode
        console.print("[blue]Configure your company info[/blue]")
        console.print("[dim]Press Enter to keep current value, or type new value[/dim]\n")

        config.company.owner_name = _prompt_with_default(
            "Your name", config.company.owner_name
        )
        config.company.company_name = _prompt_with_default(
            "Company name", config.company.company_name
        )
        config.company.vat_id = _prompt_with_default(
            "VAT ID", config.company.vat_id
        )
        config.company.tax_id = _prompt_with_default(
            "Tax ID (optional)", config.company.tax_id
        )

        console.print("\n[dim]Address (for matching invoices):[/dim]")
        config.company.street = _prompt_with_default(
            "Street", config.company.street
        )
        config.company.city = _prompt_with_default(
            "City", config.company.city
        )
        config.company.postal_code = _prompt_with_default(
            "Postal code", config.company.postal_code
        )
        config.company.country = _prompt_with_default(
            "Country", config.company.country
        )
    else:
        # Update only provided fields
        if owner_name is not None:
            config.company.owner_name = owner_name
        if company_name is not None:
            config.company.company_name = company_name
        if vat_id is not None:
            config.company.vat_id = vat_id
        if tax_id is not None:
            config.company.tax_id = tax_id
        if street is not None:
            config.company.street = street
        if city is not None:
            config.company.city = city
        if postal_code is not None:
            config.company.postal_code = postal_code
        if country is not None:
            config.company.country = country

    save_config(config)

    console.print("\n[green]Company info saved![/green]")
    console.print()
    if config.company.owner_name:
        console.print(f"  Owner: {config.company.owner_name}")
    if config.company.company_name:
        console.print(f"  Company: {config.company.company_name}")
    if config.company.vat_id:
        console.print(f"  VAT ID: {config.company.vat_id}")
    if config.company.tax_id:
        console.print(f"  Tax ID: {config.company.tax_id}")
    if config.company.street or config.company.city:
        addr_parts = [
            p for p in [
                config.company.street,
                config.company.postal_code,
                config.company.city,
                config.company.country,
            ] if p
        ]
        console.print(f"  Address: {', '.join(addr_parts)}")


@app.command()
def add_seller(
    company: str = typer.Argument(..., help="Company/seller name (partial match supported)"),
    personal: bool = typer.Option(False, "--personal", "-p", help="Mark as personal expense"),
    work: bool = typer.Option(False, "--work", "-w", help="Mark as work expense"),
) -> None:
    """Add a seller company to personal or work category for auto-assignment."""
    if not personal and not work:
        console.print("[red]Error:[/red] Must specify --personal or --work")
        raise typer.Exit(1)
    if personal and work:
        console.print("[red]Error:[/red] Cannot be both personal and work")
        raise typer.Exit(1)

    config = load_config()

    category = "personal" if personal else "work"
    target_list = config.ownership.personal_companies if personal else config.ownership.work_companies

    # Check if already exists
    if company.lower() in [c.lower() for c in target_list]:
        console.print(f"[yellow]'{company}' already in {category} list[/yellow]")
        return

    # Remove from other list if present
    other_list = config.ownership.work_companies if personal else config.ownership.personal_companies
    other_list[:] = [c for c in other_list if c.lower() != company.lower()]

    target_list.append(company)
    save_config(config)

    console.print(f"[green]Added '{company}' to {category} sellers[/green]")


@app.command()
def remove_seller(
    company: str = typer.Argument(..., help="Company/seller name to remove"),
) -> None:
    """Remove a seller company from ownership categories."""
    config = load_config()

    found = False
    for lst, name in [(config.ownership.personal_companies, "personal"), (config.ownership.work_companies, "work")]:
        for c in lst[:]:
            if c.lower() == company.lower():
                lst.remove(c)
                found = True
                console.print(f"[green]Removed '{c}' from {name} sellers[/green]")

    if not found:
        console.print(f"[yellow]'{company}' not found in any list[/yellow]")
        return

    save_config(config)


@app.command()
def set_drive_account(
    account_name: str = typer.Argument(..., help="Name of the account to use for Drive uploads"),
) -> None:
    """Set which Gmail account to use for Google Drive uploads.

    All invoices from all accounts will be uploaded to this account's Drive.
    """
    config = load_config()

    # Verify account exists
    account_names = [a.name for a in config.accounts]
    if account_name not in account_names:
        console.print(f"[red]Account '{account_name}' not found.[/red]")
        console.print(f"Available accounts: {', '.join(account_names) or 'none'}")
        raise typer.Exit(1)

    config.drive.account = account_name
    save_config(config)

    console.print(f"[green]Drive account set to:[/green] {account_name}")
    console.print("[dim]All uploads will go to this account's Google Drive.[/dim]")

    # Check if re-authentication might be needed
    drive_account = next((a for a in config.accounts if a.name == account_name), None)
    if drive_account:
        token_path = Path(drive_account.token_file)
        if token_path.exists():
            console.print("\n[yellow]Note:[/yellow] You may need to re-authenticate to grant Drive access.")
            console.print("[dim]If upload fails, delete the token file and run 'invoice-cli upload':[/dim]")
            console.print(f"  rm {token_path}")


@app.command()
def list_sellers() -> None:
    """List configured seller companies for ownership assignment."""
    config = load_config()

    if not config.ownership.personal_companies and not config.ownership.work_companies:
        console.print("[yellow]No sellers configured yet.[/yellow]")
        console.print("Run: invoice-cli add-seller <company> --personal/--work")
        return

    if config.ownership.personal_companies:
        console.print("[bold]Personal:[/bold]")
        for c in sorted(config.ownership.personal_companies):
            console.print(f"  • {c}")

    if config.ownership.work_companies:
        console.print("[bold]Work:[/bold]")
        for c in sorted(config.ownership.work_companies):
            console.print(f"  • {c}")


@app.command()
def set_ownership(
    message_id: str = typer.Argument(..., help="Message ID (or partial match)"),
    ownership: str = typer.Argument(..., help="Ownership: 'personal', 'work', or 'none'"),
) -> None:
    """Manually set ownership for an invoice."""
    if ownership.lower() not in ("personal", "work", "none"):
        console.print("[red]Error:[/red] Ownership must be 'personal', 'work', or 'none'")
        raise typer.Exit(1)

    config = load_config()
    storage = InvoiceStorage(config.storage.base_path)

    # Try exact match first
    record = storage.load_record(message_id)

    # If not found, try partial match
    if not record:
        all_records = storage.load_index()
        matches = [r for r in all_records if r.message_id.startswith(message_id)]
        if len(matches) == 1:
            record = matches[0]
        elif len(matches) > 1:
            console.print(f"[yellow]Multiple matches found for '{message_id}':[/yellow]")
            for m in matches[:5]:
                console.print(f"  {m.message_id} - {m.subject[:50]}")
            return
        else:
            console.print(f"[red]No invoice found with ID '{message_id}'[/red]")
            return

    # Set ownership
    record.ownership = None if ownership.lower() == "none" else ownership.lower()
    storage.save_record(record)

    console.print(f"[green]Set ownership to '{ownership}' for:[/green] {record.subject[:50]}")


@app.command()
def add_account(
    name: str = typer.Argument(..., help="Name for this Gmail account"),
    force: bool = typer.Option(False, "--force", "-f", help="Re-authenticate existing account"),
) -> None:
    """Add a Gmail account via OAuth2 authentication."""
    # Check for credentials.json
    credentials_path = get_credentials_path()
    if not credentials_path.exists():
        console.print("[red]Error:[/red] credentials.json not found")
        console.print()
        console.print("To set up Google Cloud credentials:")
        console.print("  1. Go to https://console.cloud.google.com/")
        console.print("  2. Create a new project or select an existing one")
        console.print("  3. Enable the Gmail API")
        console.print("  4. Go to Credentials > Create Credentials > OAuth client ID")
        console.print("  5. Choose 'Desktop app' as the application type")
        console.print("  6. Download the JSON file")
        console.print(f"  7. Save it as: {credentials_path}")
        raise typer.Exit(1)

    # Load config
    config = load_config()

    # Check if account already exists
    existing_account = None
    for acc in config.accounts:
        if acc.name == name:
            existing_account = acc
            break

    if existing_account:
        if not force:
            console.print(f"[yellow]Account '{name}' already exists[/yellow]")
            console.print("[dim]Use --force to re-authenticate[/dim]")
            raise typer.Exit(1)

        # Remove existing token file
        old_token = Path(existing_account.token_file)
        if old_token.exists():
            old_token.unlink()
            console.print(f"[dim]Removed old token: {old_token}[/dim]")

        # Remove from config
        config.accounts = [a for a in config.accounts if a.name != name]

    # Set up token file path
    tokens_dir = get_tokens_dir()
    tokens_dir.mkdir(parents=True, exist_ok=True)
    token_file = tokens_dir / f"{name}_token.json"

    # Run OAuth flow
    console.print(f"[blue]Authenticating account '{name}'...[/blue]")
    console.print("A browser window will open for Google authentication.")

    try:
        service = get_service(token_file)
        email = get_user_email(service)
    except Exception as e:
        console.print(f"[red]Authentication failed:[/red] {e}")
        raise typer.Exit(1)

    # Add account to config
    config.accounts.append(
        AccountConfig(
            name=name,
            email=email,
            token_file=str(token_file),
        )
    )
    save_config(config)

    console.print(f"[green]Account '{name}' added successfully![/green]")
    console.print(f"  Email: {email}")
    console.print(f"  Token: {token_file}")


@app.command()
def fetch(
    account: str | None = typer.Option(
        None,
        "--account",
        "-a",
        help="Specific account to fetch from (default: all)",
    ),
    after: str | None = typer.Option(
        None,
        "--after",
        help="Only fetch emails after this date (YYYY-MM-DD)",
    ),
    label: str | None = typer.Option(
        None,
        "--label",
        "-l",
        help="Gmail label to search in",
    ),
    skip_classified: bool = typer.Option(
        True,
        "--skip-classified/--no-skip-classified",
        help="Skip already processed emails",
    ),
    max_emails: int = typer.Option(
        50,
        "--max",
        "-m",
        help="Maximum number of emails to fetch per account",
    ),
    include_no_attachments: bool = typer.Option(
        False,
        "--include-no-attachments",
        help="Include emails without attachments",
    ),
) -> None:
    """Fetch emails with attachments and classify invoices."""
    config = load_config()

    if not config.accounts:
        console.print("[yellow]No accounts configured.[/yellow]")
        console.print("Run: invoice-cli add-account <name>")
        raise typer.Exit(1)

    # Filter accounts if specified
    accounts = config.accounts
    if account:
        accounts = [a for a in accounts if a.name == account]
        if not accounts:
            console.print(f"[red]Account '{account}' not found[/red]")
            raise typer.Exit(1)

    # Initialize storage
    storage = InvoiceStorage(config.storage.base_path)

    # Build search query
    query_parts = []
    if not include_no_attachments:
        query_parts.append("has:attachment")
    if after:
        query_parts.append(f"after:{after}")
    if label:
        query_parts.append(f"label:{label}")
    query = " ".join(query_parts)

    total_processed = 0
    total_invoices = 0

    for acc in accounts:
        console.print(f"\n[blue]Processing account: {acc.name} ({acc.email})[/blue]")

        try:
            service = get_service(Path(acc.token_file))
        except Exception as e:
            console.print(f"[red]Failed to connect:[/red] {e}")
            continue

        # Search for messages
        console.print(f"[dim]Searching: {query}[/dim]")
        message_ids = search_messages(service, query, max_results=max_emails)
        console.print(f"[dim]Found {len(message_ids)} messages[/dim]")

        for msg_id in message_ids:
            # Skip if already processed
            if skip_classified and storage.has_message(msg_id):
                continue

            # Get full message
            message = get_message(service, msg_id)
            metadata = get_email_metadata(message)
            body = get_body_text(message)

            console.print(f"\n[dim]Processing:[/dim] {metadata.subject[:60]}...")

            # Classify with AI
            try:
                detection = detect_invoice(
                    subject=metadata.subject,
                    body=body,
                    sender=metadata.sender,
                )
            except Exception as e:
                console.print(f"[red]Classification failed:[/red] {e}")
                continue

            is_inv = is_invoice(detection)

            # Extract details if it's an invoice
            details = None
            if is_inv:
                try:
                    details = extract_details(
                        subject=metadata.subject,
                        body=body,
                        sender=metadata.sender,
                    )
                except Exception as e:
                    console.print(f"[yellow]Detail extraction failed:[/yellow] {e}")

            # Download attachments if it's an invoice
            attachment_files: list[str] = []
            if is_inv:
                attachments = get_attachments(message)
                for att in attachments:
                    try:
                        data = download_attachment(service, msg_id, att.attachment_id)
                        path = storage.save_attachment(msg_id, att.filename, data)
                        attachment_files.append(str(path))
                        console.print(f"  [green]Saved:[/green] {att.filename}")
                    except Exception as e:
                        console.print(f"  [red]Failed to save {att.filename}:[/red] {e}")

            # Create and save record
            record = InvoiceRecord(
                message_id=msg_id,
                subject=metadata.subject,
                sender=metadata.sender,
                date=metadata.date,
                snippet=metadata.snippet,
                account_name=acc.name,
                account_email=acc.email,
                is_invoice=is_inv,
                classification_status=detection.status.value,
                classification_confidence=detection.confidence,
                classification_reasoning=detection.reasoning,
                company_name=details.company_name if details else None,
                invoice_number=details.invoice_number if details else None,
                amount=details.amount if details else None,
                currency=details.currency if details else None,
                invoice_date=details.invoice_date if details else None,
                due_date=details.due_date if details else None,
                description=details.description if details else None,
                attachments=attachment_files,
            )
            storage.save_record(record)

            total_processed += 1
            if is_inv:
                total_invoices += 1
                status = "[green]INVOICE[/green]"
            else:
                status = "[dim]not invoice[/dim]"
            console.print(f"  {status} ({detection.confidence:.0%})")

    console.print(f"\n[green]Done![/green] Processed {total_processed} emails, found {total_invoices} invoices.")


@app.command(name="list")
def list_invoices(
    all_emails: bool = typer.Option(
        False,
        "--all",
        "-a",
        help="Show all emails including non-invoices",
    ),
    biz_only: bool = typer.Option(
        False,
        "--biz",
        "-b",
        help="Show only business invoices",
    ),
    personal_only: bool = typer.Option(
        False,
        "--personal",
        "-p",
        help="Show only personal invoices",
    ),
    work_only: bool = typer.Option(
        False,
        "--work",
        "-w",
        help="Show only work invoices",
    ),
    limit: int = typer.Option(
        20,
        "--limit",
        "-n",
        help="Maximum number of invoices to display",
    ),
    sort: str = typer.Option(
        "desc",
        "--sort",
        "-s",
        help="Sort order by date (asc or desc)",
    ),
    no_attachments: bool = typer.Option(
        False,
        "--no-attachments",
        "-m",
        help="Show only invoices without attachments (need manual download)",
    ),
) -> None:
    """List fetched invoices."""
    config = load_config()
    storage = InvoiceStorage(config.storage.base_path)

    records = storage.load_index()
    if not records:
        console.print("[yellow]No emails processed yet.[/yellow]")
        console.print("Run: invoice-cli fetch")
        return

    # Filter to invoices only (unless --all)
    if not all_emails:
        records = [r for r in records if r.is_invoice]

    # Filter to business invoices only
    if biz_only:
        records = [r for r in records if r.is_business]

    # Filter by ownership
    if personal_only:
        records = [r for r in records if r.ownership == "personal"]
    if work_only:
        records = [r for r in records if r.ownership == "work"]

    # Filter to invoices without attachments (need manual download)
    if no_attachments:
        records = [r for r in records if not r.attachments]

    if not records:
        console.print("[yellow]No invoices found.[/yellow]")
        return

    # Sort by date
    def get_sort_date(r: InvoiceRecord) -> datetime:
        date_obj = _parse_date(r.invoice_date or r.date)
        return date_obj or datetime.min

    records.sort(key=get_sort_date, reverse=(sort.lower() == "desc"))

    # Limit results
    records = records[:limit]

    # Create table
    table = Table(title=f"Invoices ({len(records)} shown)")
    table.add_column("ID", style="dim", no_wrap=True)
    table.add_column("Date", style="cyan", no_wrap=True)
    table.add_column("Company", style="green")
    table.add_column("Amount", style="yellow", justify="right")
    table.add_column("Biz", style="cyan", justify="center")
    table.add_column("Own", style="magenta", justify="center")
    table.add_column("Subject", style="white", max_width=40)
    table.add_column("Account", style="dim")
    table.add_column("Gmail", style="blue")

    # Track totals by currency
    totals: dict[str, float] = {}

    for record in records:
        # Parse and format date consistently
        date_obj = _parse_date(record.invoice_date or record.date)
        date_str = date_obj.strftime("%Y-%m-%d") if date_obj else ""

        # Format amount and track totals
        if record.amount is not None:
            currency = record.currency or "?"
            amount_str = f"{record.amount:,.2f} {currency}".strip()
            totals[currency] = totals.get(currency, 0) + record.amount
        else:
            amount_str = "-"

        # Company or sender
        company = record.company_name or record.sender.split("<")[0].strip()

        # Business indicator
        biz_str = "✓" if record.is_business else ""

        # Ownership indicator
        own_str = ""
        if record.ownership == "personal":
            own_str = "P"
        elif record.ownership == "work":
            own_str = "W"

        # Gmail link (only show for records without attachments to highlight manual action needed)
        gmail_str = ""
        if not record.attachments:
            gmail_url = f"https://mail.google.com/mail/u/0/#inbox/{record.message_id}"
            gmail_str = f"[link={gmail_url}]Open[/link]"

        table.add_row(
            record.message_id[:12],
            date_str,
            company[:30],
            amount_str,
            biz_str,
            own_str,
            record.subject[:40],
            record.account_name,
            gmail_str,
        )

    console.print(table)

    # Print totals
    if totals:
        console.print()
        for currency, total in sorted(totals.items()):
            console.print(f"[bold yellow]Total ({currency}):[/bold yellow] {total:,.2f}")


@app.command()
def get(
    message_id: str = typer.Argument(..., help="Message ID (or partial match)"),
) -> None:
    """Show detailed information about an invoice."""
    config = load_config()
    storage = InvoiceStorage(config.storage.base_path)

    # Try exact match first
    record = storage.load_record(message_id)

    # If not found, try partial match
    if not record:
        all_records = storage.load_index()
        matches = [r for r in all_records if r.message_id.startswith(message_id)]
        if len(matches) == 1:
            record = matches[0]
        elif len(matches) > 1:
            console.print(f"[yellow]Multiple matches found for '{message_id}':[/yellow]")
            for m in matches[:5]:
                console.print(f"  {m.message_id} - {m.subject[:50]}")
            return
        else:
            console.print(f"[red]No invoice found with ID '{message_id}'[/red]")
            return

    # Display record details
    console.print(f"\n[bold blue]Invoice Details[/bold blue]\n")

    # Basic info
    console.print(f"[cyan]Message ID:[/cyan] {record.message_id}")
    gmail_url = f"https://mail.google.com/mail/u/0/#inbox/{record.message_id}"
    console.print(f"[cyan]Gmail Link:[/cyan] [link={gmail_url}]{gmail_url}[/link]")
    console.print(f"[cyan]Subject:[/cyan] {record.subject}")
    console.print(f"[cyan]Sender:[/cyan] {record.sender}")

    # Parse and display date
    date_obj = _parse_date(record.date)
    date_str = date_obj.strftime("%Y-%m-%d %H:%M") if date_obj else record.date
    console.print(f"[cyan]Email Date:[/cyan] {date_str}")
    console.print(f"[cyan]Account:[/cyan] {record.account_name} ({record.account_email})")

    # Classification
    console.print(f"\n[bold]Classification[/bold]")
    console.print(f"  Status: {record.classification_status}")
    console.print(f"  Confidence: {record.classification_confidence:.0%}")
    console.print(f"  Reasoning: {record.classification_reasoning}")

    # Invoice details
    if record.is_invoice:
        console.print(f"\n[bold]Invoice Details[/bold]")
        if record.company_name:
            console.print(f"  Company: {record.company_name}")
        if record.invoice_number:
            console.print(f"  Invoice #: {record.invoice_number}")
        if record.invoice_date:
            console.print(f"  Invoice Date: {record.invoice_date}")
        if record.due_date:
            console.print(f"  Due Date: {record.due_date}")
        if record.amount is not None:
            currency = record.currency or ""
            console.print(f"  Amount: {record.amount:,.2f} {currency}")
        if record.subtotal is not None:
            console.print(f"  Subtotal: {record.subtotal:,.2f}")
        if record.tax_amount is not None:
            console.print(f"  Tax: {record.tax_amount:,.2f}")
        if record.description:
            console.print(f"  Description: {record.description}")

        # Seller info
        if record.seller_vat_id or record.seller_address:
            console.print(f"\n[bold]Seller[/bold]")
            if record.seller_vat_id:
                console.print(f"  VAT ID: {record.seller_vat_id}")
            if record.seller_address:
                addr = record.seller_address
                addr_parts = [addr.get(k) for k in ["street", "postal_code", "city", "country"] if addr.get(k)]
                if addr_parts:
                    console.print(f"  Address: {', '.join(addr_parts)}")

        # Buyer info
        if record.buyer_name or record.buyer_vat_id or record.buyer_address:
            console.print(f"\n[bold]Buyer[/bold]")
            if record.buyer_name:
                console.print(f"  Name: {record.buyer_name}")
            if record.buyer_vat_id:
                console.print(f"  VAT ID: {record.buyer_vat_id}")
            if record.buyer_address:
                addr = record.buyer_address
                addr_parts = [addr.get(k) for k in ["street", "postal_code", "city", "country"] if addr.get(k)]
                if addr_parts:
                    console.print(f"  Address: {', '.join(addr_parts)}")

        # Business flag
        if record.is_business:
            console.print(f"\n[cyan]✓ Business Invoice[/cyan]")

        # Line items
        if record.line_items:
            console.print(f"\n[bold]Line Items[/bold]")
            for item in record.line_items:
                desc = item.get("description", "Unknown")[:50]
                qty = item.get("quantity", 1)
                unit = item.get("unit_price")
                total = item.get("total")
                if total is not None:
                    console.print(f"  • {desc} (x{qty}) - {total:,.2f}")
                else:
                    console.print(f"  • {desc} (x{qty})")

        # Bank details
        if record.bank_details:
            console.print(f"\n[bold]Bank Details[/bold]")
            bank = record.bank_details
            if bank.get("bank_name"):
                console.print(f"  Bank: {bank['bank_name']}")
            if bank.get("iban"):
                console.print(f"  IBAN: {bank['iban']}")
            if bank.get("swift"):
                console.print(f"  SWIFT: {bank['swift']}")

    # Attachments
    if record.attachments:
        console.print(f"\n[bold]Attachments[/bold]")
        for att in record.attachments:
            att_path = Path(att)
            if att_path.exists():
                size = att_path.stat().st_size
                size_str = f"{size / 1024:.1f} KB" if size < 1024 * 1024 else f"{size / 1024 / 1024:.1f} MB"
                console.print(f"  • {att_path.name} ({size_str})")
                console.print(f"    [dim]{att}[/dim]")
            else:
                console.print(f"  • {att_path.name} [red](missing)[/red]")
    else:
        console.print(f"\n[yellow]No attachments - manual download may be needed[/yellow]")
        console.print(f"[dim]Use Gmail link above to access the email[/dim]")

    # Processing info
    console.print(f"\n[dim]Processed: {record.processed_at}[/dim]")
    if record.pdf_processed:
        console.print(f"[dim]PDF Processed: {record.pdf_processed_at}[/dim]")


def _sanitize_name(name: str) -> str:
    """Sanitize a name for use in file paths."""
    # Replace problematic characters
    sanitized = re.sub(r'[<>:"/\\|?*]', "_", name)
    # Remove leading/trailing whitespace and dots
    sanitized = sanitized.strip(". ")
    # Collapse multiple underscores
    sanitized = re.sub(r"_+", "_", sanitized)
    return sanitized or "unknown"


def _parse_date(date_str: str) -> datetime | None:
    """Try to parse a date string."""
    if not date_str:
        return None

    # Try common formats
    formats = [
        "%Y-%m-%d",
        "%Y/%m/%d",
        "%d %b %Y",
        "%d %B %Y",
        "%b %d, %Y",
        "%B %d, %Y",
    ]

    for fmt in formats:
        try:
            return datetime.strptime(date_str[:20], fmt)
        except ValueError:
            continue

    # Try extracting from email date format (e.g., "Mon, 25 Dec 2024 10:30:00")
    match = re.search(r"(\d{1,2})\s+(\w+)\s+(\d{4})", date_str)
    if match:
        day, month_str, year = match.groups()
        months = {
            "Jan": 1, "Feb": 2, "Mar": 3, "Apr": 4, "May": 5, "Jun": 6,
            "Jul": 7, "Aug": 8, "Sep": 9, "Oct": 10, "Nov": 11, "Dec": 12,
        }
        month = months.get(month_str[:3])
        if month:
            try:
                return datetime(int(year), month, int(day))
            except ValueError:
                pass

    return None


@app.command()
def organize(
    pattern: str = typer.Option(
        "year/company/month",
        "--pattern",
        "-p",
        help="Folder organization pattern (year, month, company)",
    ),
    dry_run: bool = typer.Option(
        False,
        "--dry-run",
        "-n",
        help="Show what would be done without making changes",
    ),
) -> None:
    """Organize invoice files into folder structure using symlinks."""
    config = load_config()
    storage = InvoiceStorage(config.storage.base_path)

    records = storage.load_index()
    invoices = [r for r in records if r.is_invoice]

    if not invoices:
        console.print("[yellow]No invoices to organize.[/yellow]")
        return

    organized_dir = config.storage.base_path / "organized"

    if dry_run:
        console.print("[dim]Dry run - no changes will be made[/dim]\n")
    else:
        organized_dir.mkdir(exist_ok=True)

    created_count = 0
    skipped_count = 0

    for record in invoices:
        if not record.attachments:
            continue

        # Parse date
        date = _parse_date(record.invoice_date or record.date)
        if not date:
            console.print(f"[yellow]Skipping (no date):[/yellow] {record.subject[:50]}")
            skipped_count += 1
            continue

        # Build folder path based on pattern
        company = _sanitize_name(record.company_name or "Unknown")
        year = str(date.year)
        month = date.strftime("%m")  # Zero-padded month

        folder_parts = []
        for part in pattern.split("/"):
            if part == "year":
                folder_parts.append(year)
            elif part == "month":
                folder_parts.append(month)
            elif part == "company":
                folder_parts.append(company)
            else:
                folder_parts.append(part)

        target_folder = organized_dir.joinpath(*folder_parts)

        # Create symlinks for each attachment
        for att_path in record.attachments:
            att = Path(att_path)
            if not att.exists():
                continue

            # Build descriptive filename
            date_prefix = date.strftime("%Y-%m-%d")
            desc = _sanitize_name(record.description or company)[:50]
            new_name = f"{date_prefix}-{desc}{att.suffix}"

            link_path = target_folder / new_name

            if dry_run:
                console.print(f"  {link_path}")
            else:
                target_folder.mkdir(parents=True, exist_ok=True)

                # Remove existing symlink if present
                if link_path.exists() or link_path.is_symlink():
                    link_path.unlink()

                # Create symlink (relative path)
                try:
                    rel_path = Path("../" * len(folder_parts)) / att.relative_to(
                        config.storage.base_path
                    )
                    link_path.symlink_to(rel_path)
                    console.print(f"  [green]Created:[/green] {link_path.name}")
                    created_count += 1
                except Exception as e:
                    console.print(f"  [red]Failed:[/red] {link_path.name} - {e}")

    if dry_run:
        console.print(f"\n[dim]Would organize {len(invoices)} invoices[/dim]")
    else:
        console.print(f"\n[green]Done![/green] Created {created_count} symlinks")


@app.command()
def upload(
    pattern: str = typer.Option(
        None,
        "--pattern",
        "-p",
        help="Folder pattern (defaults to config or 'year/company/month')",
    ),
    root: str = typer.Option(
        None,
        "--root",
        "-r",
        help="Root folder name on Drive (defaults to config or 'Invoices')",
    ),
    root_id: str = typer.Option(
        None,
        "--root-id",
        help="Direct folder ID to upload to (overrides --root)",
    ),
    dry_run: bool = typer.Option(
        False,
        "--dry-run",
        "-n",
        help="Show what would be uploaded without making changes",
    ),
    force: bool = typer.Option(
        False,
        "--force",
        "-f",
        help="Re-upload even if already uploaded",
    ),
    from_account: str = typer.Option(
        None,
        "--from-account",
        help="Only upload invoices from this Gmail account",
    ),
) -> None:
    """Upload invoices to Google Drive.

    Uploads invoice attachments to an organized folder structure on Drive.
    Uses the account set with 'set-drive-account' for uploads.
    """
    config = load_config()
    storage = InvoiceStorage(config.storage.base_path)

    # Verify drive account is set
    if not config.drive.account:
        console.print("[red]No Drive account set.[/red]")
        console.print("Run: invoice-cli set-drive-account <account-name>")
        raise typer.Exit(1)

    # Find the drive account config
    drive_account = next(
        (a for a in config.accounts if a.name == config.drive.account),
        None,
    )
    if not drive_account:
        console.print(f"[red]Drive account '{config.drive.account}' not found in config.[/red]")
        raise typer.Exit(1)

    # Use config defaults if not specified (None means use config, "" means flat)
    folder_pattern = pattern if pattern is not None else config.drive.pattern
    root_folder = root or config.drive.root_folder
    root_folder_id = root_id or config.drive.root_folder_id

    # Load invoices
    records = storage.load_index()
    invoices = [r for r in records if r.is_invoice]

    # Filter by account if specified
    if from_account:
        invoices = [r for r in invoices if r.account_name == from_account]

    # Filter out already uploaded unless force
    if not force:
        invoices = [r for r in invoices if not r.gdrive_uploaded]

    if not invoices:
        console.print("[yellow]No invoices to upload.[/yellow]")
        return

    console.print(f"[bold]Uploading {len(invoices)} invoices to Google Drive[/bold]")
    console.print(f"  Account: {config.drive.account}")
    if root_folder_id:
        console.print(f"  Root folder ID: {root_folder_id}")
    else:
        console.print(f"  Root folder: {root_folder}")
    console.print(f"  Pattern: {folder_pattern or '(flat)'}")
    console.print()

    if dry_run:
        console.print("[dim]Dry run - no changes will be made[/dim]\n")

    # Initialize Drive service (only if not dry run)
    service = None
    if not dry_run:
        token_file = Path(drive_account.token_file)
        service = get_drive_service(token_file)

    uploaded_count = 0
    skipped_count = 0

    for record in invoices:
        if not record.attachments:
            console.print(f"[yellow]Skipping (no attachments):[/yellow] {record.subject[:50]}")
            skipped_count += 1
            continue

        # Parse date
        date = _parse_date(record.invoice_date or record.date)
        if not date:
            console.print(f"[yellow]Skipping (no date):[/yellow] {record.subject[:50]}")
            skipped_count += 1
            continue

        # Build folder path based on pattern
        company = _sanitize_name(record.company_name or "Unknown")
        year = str(date.year)
        month = date.strftime("%m")

        folder_parts = []
        if folder_pattern:  # Empty pattern = flat structure (all in root)
            for part in folder_pattern.split("/"):
                part = part.strip()
                if not part:
                    continue
                if part == "year":
                    folder_parts.append(year)
                elif part == "month":
                    folder_parts.append(month)
                elif part == "company":
                    folder_parts.append(company)
                else:
                    folder_parts.append(part)

        folder_path = "/".join([root_folder] + folder_parts) if folder_parts else root_folder

        # Upload each attachment
        file_ids = []
        for att_path_str in record.attachments:
            att_path = Path(att_path_str)
            if not att_path.exists():
                console.print(f"  [yellow]Skipping (file missing):[/yellow] {att_path.name}")
                continue

            # Build filename: {date}-{company}-{description}.pdf
            date_prefix = date.strftime("%Y-%m-%d")
            desc = _sanitize_name(record.description or record.company_name or "invoice")[:50]
            new_name = f"{date_prefix}-{company}-{desc}{att_path.suffix}"

            if dry_run:
                console.print(f"  [dim]Would upload:[/dim] {folder_path}/{new_name}")
            else:
                # Create folder structure and upload
                target_folder_id = create_folder_path(
                    service, folder_parts, root_folder, root_folder_id
                )
                file_id = upload_file(service, att_path, target_folder_id, new_name, skip_existing=True)

                if file_id:
                    file_ids.append(file_id)
                    console.print(f"  [green]Uploaded:[/green] {folder_path}/{new_name}")
                    uploaded_count += 1
                else:
                    console.print(f"  [yellow]Skipped (exists):[/yellow] {new_name}")
                    skipped_count += 1

        # Update record if uploaded
        if not dry_run and file_ids:
            record.gdrive_uploaded = True
            record.gdrive_uploaded_at = datetime.now().isoformat()
            record.gdrive_file_ids = file_ids
            record.gdrive_folder_path = folder_path
            storage.save_record(record)

    if dry_run:
        console.print(f"\n[dim]Would upload from {len(invoices)} invoices[/dim]")
    else:
        console.print(f"\n[green]Done![/green] Uploaded {uploaded_count}, skipped {skipped_count}")


def _normalize_id(value: str | None) -> str | None:
    """Normalize an ID for comparison (remove spaces, uppercase)."""
    if not value:
        return None
    return value.replace(" ", "").replace("-", "").upper()


def _check_business_match(config, details) -> bool:
    """Check if the invoice buyer matches the configured company."""
    # Check VAT ID
    if config.company.vat_id and details.buyer_vat_id:
        if _normalize_id(config.company.vat_id) == _normalize_id(details.buyer_vat_id):
            return True

    # Check Tax ID
    if config.company.tax_id and details.buyer_vat_id:
        if _normalize_id(config.company.tax_id) == _normalize_id(details.buyer_vat_id):
            return True

    # Check buyer name against owner name or company name
    if details.buyer_name:
        buyer_lower = details.buyer_name.lower()
        if config.company.owner_name and config.company.owner_name.lower() in buyer_lower:
            return True
        if config.company.company_name and config.company.company_name.lower() in buyer_lower:
            return True

    return False


def _determine_ownership(config: Config, company_name: str | None) -> str | None:
    """Determine ownership based on seller company name matching configured companies."""
    if not company_name:
        return None

    company_lower = company_name.lower()

    # Check personal companies
    for pc in config.ownership.personal_companies:
        if pc.lower() in company_lower or company_lower in pc.lower():
            return "personal"

    # Check work companies
    for wc in config.ownership.work_companies:
        if wc.lower() in company_lower or company_lower in wc.lower():
            return "work"

    return None


@app.command()
def process(
    reprocess: bool = typer.Option(
        False,
        "--reprocess",
        "-r",
        help="Re-process PDFs that were already processed",
    ),
    message_id: str | None = typer.Option(
        None,
        "--message",
        "-m",
        help="Process specific message ID only",
    ),
    limit: int = typer.Option(
        0,
        "--limit",
        "-l",
        help="Limit number of records to process (0 = no limit)",
    ),
) -> None:
    """Process PDF attachments to extract enhanced invoice details."""
    config = load_config()
    storage = InvoiceStorage(config.storage.base_path)

    # Load records to process
    records = storage.load_index()
    invoices = [r for r in records if r.is_invoice]

    if message_id:
        invoices = [r for r in invoices if r.message_id == message_id]

    if not reprocess:
        invoices = [r for r in invoices if not r.pdf_processed]

    if limit > 0:
        invoices = invoices[:limit]

    if not invoices:
        console.print("[yellow]No invoices to process.[/yellow]")
        if not reprocess:
            console.print("[dim]Use --reprocess to re-process already processed invoices[/dim]")
        return

    console.print(f"[blue]Processing {len(invoices)} invoice(s)...[/blue]\n")

    processed = 0
    errors = 0

    for record in invoices:
        console.print(f"[dim]Processing:[/dim] {record.subject[:60]}...")

        # Find PDF attachments
        attachments = storage.get_attachments_for_message(record.message_id)
        pdf_files = [a for a in attachments if is_pdf(a)]

        if not pdf_files:
            console.print("  [yellow]No PDF attachments found[/yellow]")
            continue

        # Process first PDF
        pdf_path = pdf_files[0]

        try:
            # Extract text
            pdf_text = extract_text_from_pdf(pdf_path)

            if not pdf_text.strip():
                console.print("  [yellow]PDF has no extractable text[/yellow]")
                continue

            # Get email context
            email_context = f"Subject: {record.subject}\nFrom: {record.sender}"

            # Call AI extraction
            details = extract_from_pdf(pdf_text, email_context)

            # Update record with enhanced data
            record.seller_vat_id = details.seller_vat_id
            record.buyer_name = details.buyer_name
            record.buyer_vat_id = details.buyer_vat_id

            if details.seller_address:
                record.seller_address = details.seller_address.model_dump()
            if details.buyer_address:
                record.buyer_address = details.buyer_address.model_dump()
            if details.bank_details:
                record.bank_details = details.bank_details.model_dump()
            if details.line_items:
                record.line_items = [item.model_dump() for item in details.line_items]

            record.tax_amount = details.tax_amount
            record.subtotal = details.subtotal

            # Update basic fields if they were empty
            if not record.company_name and details.company_name:
                record.company_name = details.company_name
            if not record.amount and details.amount:
                record.amount = details.amount
            if not record.currency and details.currency:
                record.currency = details.currency
            if not record.invoice_number and details.invoice_number:
                record.invoice_number = details.invoice_number
            if not record.invoice_date and details.invoice_date:
                record.invoice_date = details.invoice_date
            if not record.due_date and details.due_date:
                record.due_date = details.due_date
            if not record.description and details.description:
                record.description = details.description

            # Check for business invoice
            record.is_business = _check_business_match(config, details)

            # Auto-assign ownership based on seller company
            if not record.ownership:
                record.ownership = _determine_ownership(config, record.company_name)

            # Mark as processed
            record.pdf_processed = True
            record.pdf_processed_at = datetime.now().isoformat()

            # Save updated record
            storage.save_record(record)

            processed += 1
            status = "[green]OK[/green]"
            if record.is_business:
                status += " [cyan](business)[/cyan]"
            if record.ownership:
                status += f" [magenta]({record.ownership})[/magenta]"
            if record.seller_vat_id:
                status += f" [dim]VAT: {record.seller_vat_id}[/dim]"
            console.print(f"  {status}")

        except Exception as e:
            errors += 1
            console.print(f"  [red]Error:[/red] {e}")

    console.print(f"\n[green]Done![/green] Processed {processed}, errors: {errors}")


@app.command()
def tui() -> None:
    """Open interactive TUI for managing invoice ownership."""
    from invoice_cli.tui import run_tui
    run_tui()


if __name__ == "__main__":
    app()
