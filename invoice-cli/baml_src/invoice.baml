// Invoice classification schema

enum InvoiceStatus {
  IS_INVOICE
  NOT_INVOICE
  MAYBE_INVOICE
}

class InvoiceDetection {
  status InvoiceStatus
  confidence float @description("Confidence score from 0.0 to 1.0")
  reasoning string @description("Brief explanation for the classification")
}

class InvoiceDetails {
  company_name string? @description("Name of the company that issued the invoice")
  invoice_number string? @description("Invoice number or reference")
  amount float? @description("Total amount (numeric value only)")
  currency string? @description("Currency code (e.g., USD, EUR, GBP)")
  invoice_date string? @description("Invoice date in YYYY-MM-DD format if available")
  due_date string? @description("Due date in YYYY-MM-DD format if available")
  description string? @description("Brief description of what the invoice is for")
}

function DetectInvoice(email_subject: string, email_body: string, sender: string) -> InvoiceDetection {
  client InvoiceClassifier

  prompt #"
    Analyze this email to determine if it contains or is related to an invoice, bill, or payment request.

    Email details:
    - From: {{ sender }}
    - Subject: {{ email_subject }}
    - Body:
    {{ email_body }}

    Consider the following:
    - Is this an invoice, receipt, bill, or payment confirmation?
    - Is this a notification about a subscription charge or recurring payment?
    - Is this a purchase order or payment request?
    - Could this contain an invoice as an attachment?

    NOT an invoice if it's:
    - Marketing or promotional content
    - General account updates (unless payment-related)
    - Newsletters or announcements
    - Support tickets unrelated to billing

    {{ ctx.output_format }}
  "#
}

function ExtractInvoiceDetails(email_subject: string, email_body: string, sender: string) -> InvoiceDetails {
  client InvoiceClassifier

  prompt #"
    Extract invoice details from this email. If a field is not clearly present, leave it as null.

    Email details:
    - From: {{ sender }}
    - Subject: {{ email_subject }}
    - Body:
    {{ email_body }}

    Guidelines:
    - For company_name: Extract the company that issued the invoice (not your own company)
    - For amount: Extract the total/final amount as a number (no currency symbols)
    - For currency: Use standard 3-letter codes (USD, EUR, GBP, etc.)
    - For dates: Convert to YYYY-MM-DD format
    - For description: Brief summary of what the invoice is for

    {{ ctx.output_format }}
  "#
}

// Enhanced types for PDF extraction

class BankDetails {
  iban string? @description("IBAN bank account number")
  bic string? @description("BIC/SWIFT code")
  account_number string? @description("Bank account number if not IBAN")
  bank_name string? @description("Name of the bank")
}

class CompanyAddress {
  street string? @description("Street address")
  city string? @description("City")
  postal_code string? @description("Postal/ZIP code")
  country string? @description("Country name or code")
  full_address string? @description("Complete formatted address as written")
}

class LineItem {
  description string @description("Item/service description")
  quantity float? @description("Quantity")
  unit_price float? @description("Price per unit")
  amount float @description("Line total amount")
}

class EnhancedInvoiceDetails {
  // Basic fields
  company_name string? @description("Name of the company that issued the invoice (seller)")
  invoice_number string? @description("Invoice number or reference")
  amount float? @description("Total amount (numeric value only)")
  currency string? @description("Currency code (e.g., USD, EUR, GBP)")
  invoice_date string? @description("Invoice date in YYYY-MM-DD format")
  due_date string? @description("Due date in YYYY-MM-DD format")
  description string? @description("Brief description of what the invoice is for")

  // Enhanced fields
  seller_vat_id string? @description("Seller/issuer VAT number")
  buyer_name string? @description("Buyer/recipient company or person name")
  buyer_vat_id string? @description("Buyer/recipient VAT number if present")
  seller_address CompanyAddress? @description("Seller's company address")
  buyer_address CompanyAddress? @description("Buyer's company address if present")
  bank_details BankDetails? @description("Payment bank account details")
  line_items LineItem[]? @description("Individual line items if itemized invoice")
  tax_amount float? @description("Total tax/VAT amount")
  subtotal float? @description("Subtotal before tax")
}

function ExtractFromPDF(pdf_text: string, email_context: string?) -> EnhancedInvoiceDetails {
  client InvoiceClassifier

  prompt #"
    Extract detailed invoice information from this PDF document text.

    PDF Content:
    {{ pdf_text }}

    {% if email_context %}
    Email context (may provide additional info):
    {{ email_context }}
    {% endif %}

    Guidelines:
    - Extract all available fields, leave as null if not found
    - For VAT IDs: Look for patterns like "VAT:", "USt-IdNr:", "Tax ID:", "NIP:", "TVA:", etc.
    - For bank details: Look for IBAN, BIC/SWIFT, account numbers
    - For addresses: Extract complete company addresses for both seller and buyer
    - For line items: Extract each item with description and amounts
    - Convert dates to YYYY-MM-DD format
    - Extract numeric values without currency symbols
    - Currency should be 3-letter ISO code (EUR, USD, GBP, PLN, etc.)
    - seller = the company issuing the invoice
    - buyer = the recipient/customer on the invoice

    {{ ctx.output_format }}
  "#
}
