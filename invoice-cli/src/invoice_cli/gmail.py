"""Gmail API integration for invoice-cli."""

import base64
from dataclasses import dataclass
from pathlib import Path

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

from invoice_cli.config import get_config_dir

# Gmail API scopes - read-only access
SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"]


@dataclass
class EmailMetadata:
    """Metadata extracted from an email."""

    message_id: str
    subject: str
    sender: str
    date: str
    snippet: str


@dataclass
class Attachment:
    """Email attachment metadata."""

    attachment_id: str
    filename: str
    mime_type: str
    size: int


def get_credentials_path() -> Path:
    """Get the path to credentials.json."""
    return get_config_dir() / "credentials.json"


def authenticate(token_file: Path) -> Credentials:
    """Authenticate with Gmail API using OAuth2.

    Args:
        token_file: Path to store/load the token

    Returns:
        Valid credentials

    Raises:
        FileNotFoundError: If credentials.json is missing
    """
    creds = None

    # Load existing token if available
    if token_file.exists():
        creds = Credentials.from_authorized_user_file(str(token_file), SCOPES)

    # Refresh or run auth flow if needed
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            credentials_path = get_credentials_path()
            if not credentials_path.exists():
                raise FileNotFoundError(
                    f"credentials.json not found at {credentials_path}\n"
                    "Please download it from Google Cloud Console and save it there."
                )

            flow = InstalledAppFlow.from_client_secrets_file(
                str(credentials_path), SCOPES
            )
            creds = flow.run_local_server(port=0)

        # Save the token for next time
        token_file.parent.mkdir(parents=True, exist_ok=True)
        with open(token_file, "w") as f:
            f.write(creds.to_json())

    return creds


def get_service(token_file: Path):
    """Build Gmail API service.

    Args:
        token_file: Path to the token file

    Returns:
        Gmail API service instance
    """
    creds = authenticate(token_file)
    return build("gmail", "v1", credentials=creds)


def search_messages(service, query: str, max_results: int = 100) -> list[str]:
    """Search for messages matching a query.

    Args:
        service: Gmail API service
        query: Gmail search query
        max_results: Maximum number of results to return

    Returns:
        List of message IDs
    """
    message_ids = []
    page_token = None

    while len(message_ids) < max_results:
        result = (
            service.users()
            .messages()
            .list(
                userId="me",
                q=query,
                maxResults=min(100, max_results - len(message_ids)),
                pageToken=page_token,
            )
            .execute()
        )

        messages = result.get("messages", [])
        message_ids.extend(msg["id"] for msg in messages)

        page_token = result.get("nextPageToken")
        if not page_token:
            break

    return message_ids[:max_results]


def get_message(service, message_id: str) -> dict:
    """Get a full message by ID.

    Args:
        service: Gmail API service
        message_id: Message ID

    Returns:
        Full message resource
    """
    return (
        service.users()
        .messages()
        .get(userId="me", id=message_id, format="full")
        .execute()
    )


def get_email_metadata(message: dict) -> EmailMetadata:
    """Extract metadata from a message.

    Args:
        message: Gmail message resource

    Returns:
        EmailMetadata with subject, sender, date, snippet
    """
    headers = {h["name"].lower(): h["value"] for h in message["payload"]["headers"]}

    return EmailMetadata(
        message_id=message["id"],
        subject=headers.get("subject", "(no subject)"),
        sender=headers.get("from", "(unknown sender)"),
        date=headers.get("date", ""),
        snippet=message.get("snippet", ""),
    )


def get_attachments(message: dict) -> list[Attachment]:
    """Get list of attachments from a message.

    Args:
        message: Gmail message resource

    Returns:
        List of Attachment objects
    """
    attachments = []

    def process_parts(parts: list[dict]) -> None:
        for part in parts:
            # Recursively process nested parts
            if "parts" in part:
                process_parts(part["parts"])

            # Check for attachment
            filename = part.get("filename", "")
            if filename and part.get("body", {}).get("attachmentId"):
                attachments.append(
                    Attachment(
                        attachment_id=part["body"]["attachmentId"],
                        filename=filename,
                        mime_type=part.get("mimeType", "application/octet-stream"),
                        size=part.get("body", {}).get("size", 0),
                    )
                )

    payload = message.get("payload", {})
    if "parts" in payload:
        process_parts(payload["parts"])
    elif payload.get("filename") and payload.get("body", {}).get("attachmentId"):
        # Single-part message with attachment
        attachments.append(
            Attachment(
                attachment_id=payload["body"]["attachmentId"],
                filename=payload["filename"],
                mime_type=payload.get("mimeType", "application/octet-stream"),
                size=payload.get("body", {}).get("size", 0),
            )
        )

    return attachments


def download_attachment(service, message_id: str, attachment_id: str) -> bytes:
    """Download attachment data.

    Args:
        service: Gmail API service
        message_id: Message ID
        attachment_id: Attachment ID

    Returns:
        Raw attachment data
    """
    attachment = (
        service.users()
        .messages()
        .attachments()
        .get(userId="me", messageId=message_id, id=attachment_id)
        .execute()
    )

    data = attachment.get("data", "")
    return base64.urlsafe_b64decode(data)


def get_body_text(message: dict) -> str:
    """Extract plain text body from a message.

    Args:
        message: Gmail message resource

    Returns:
        Plain text body content
    """

    def find_text_part(parts: list[dict]) -> str | None:
        for part in parts:
            # Recursively search nested parts
            if "parts" in part:
                text = find_text_part(part["parts"])
                if text:
                    return text

            # Look for text/plain
            if part.get("mimeType") == "text/plain":
                data = part.get("body", {}).get("data", "")
                if data:
                    return base64.urlsafe_b64decode(data).decode("utf-8", errors="ignore")

        return None

    payload = message.get("payload", {})

    # Single-part message
    if payload.get("mimeType") == "text/plain":
        data = payload.get("body", {}).get("data", "")
        if data:
            return base64.urlsafe_b64decode(data).decode("utf-8", errors="ignore")

    # Multi-part message
    if "parts" in payload:
        text = find_text_part(payload["parts"])
        if text:
            return text

    # Fallback to snippet
    return message.get("snippet", "")


def get_user_email(service) -> str:
    """Get the email address of the authenticated user.

    Args:
        service: Gmail API service

    Returns:
        User's email address
    """
    profile = service.users().getProfile(userId="me").execute()
    return profile.get("emailAddress", "")
