---
date: 2026-01-22T12:30:00-08:00
researcher: Claude
git_commit: 5618bdf
branch: main
repository: ai-toolbox
topic: "Multi-PDF Transaction Extractor: Web app for extracting transactions from financial PDFs to Excel"
tags: [research, pdf-extraction, llm, web-app, financial-documents, excel]
status: complete
autonomy: verbose
last_updated: 2026-01-22
last_updated_by: Claude (with Taras review feedback)
---

# Research: Multi-PDF Transaction Extractor

**Date**: 2026-01-22
**Researcher**: Claude
**Git Commit**: 5618bdf
**Branch**: main

## Research Question

Design a web application that can scan through multiple PDFs at once (50+ documents) and present them as Excel transactions. The tool should allow users to choose different columns for extraction. Target users are non-technical, and the documents include mixed financial types (bank statements, credit card statements, invoices).

## Summary

Building a multi-PDF transaction extractor for non-technical users requires a **web app with LLM-powered extraction** to handle the variability in financial document formats. The recommended architecture combines a **Next.js frontend** with a **Python backend** using **Claude/GPT-4o with JSON Schema** for structured extraction. For PDF processing, use fully open-source libraries: **pymupdf4llm** as the primary extractor with **pdfplumber** for table-heavy documents, and **Tesseract** for scanned PDFs. **SheetJS** for Excel export.

**Product vision**: The "ilovepdf of financial document extraction" - simple, accessible, no account required for basic use. Free tier for occasional users, pay-as-you-go starting at ~$5/month for regular use.

The competitive landscape shows existing solutions (Docparser, Parseur, DocuClipper) range from $39-159/month, with key pain points being: steep pricing for small businesses, fragile template-based extraction that breaks with layout changes, and poor handling of varied document formats. The LLM-powered approach addresses these gaps by eliminating templates entirely and adapting to any layout, though it requires validation checks to prevent hallucination on financial data.

**Estimated costs**: LLM extraction ~$1-5 for 50 documents (with caching/batching), infrastructure on self-hosted Hetzner ~$10-20/month. This positions the tool competitively with a free tier and pay-as-you-go model starting at $5/month.

## Detailed Findings

### 1. PDF Extraction Libraries

#### Python Libraries (Backend)

| Library | Speed | Table Support | License | Best For |
|---------|-------|---------------|---------|----------|
| **pymupdf4llm** | 0.12s/doc | Excellent | AGPL-3.0 | LLM/RAG pipelines, production |
| **pdfplumber** | 0.10s/doc | Strong | MIT | Table-heavy documents |
| **pypdf** | 0.024s/doc | Limited | BSD | Serverless/Lambda |
| **Camelot** | Moderate | Excellent (bordered) | MIT | Clean table PDFs |
| **Tesseract** | Slow | N/A | Apache 2.0 | OCR for scanned PDFs |

All libraries are fully open source.

**Recommendation**: Use **pymupdf4llm** as the primary extractor - it outputs markdown with proper headings and table formatting, ideal for LLM processing. Fall back to **pdfplumber** for documents where table structure is critical. For scanned PDFs, use **Tesseract** OCR (open source, no cloud dependency).

#### Processing Strategy

```
Upload → Classify (scan vs native) → Route
                                      │
              ┌───────────────────────┴─────────────────────┐
              ▼                                             ▼
    ┌──────────────────┐                        ┌──────────────────┐
    │ Native PDF       │                        │   Scanned PDF    │
    │ (pymupdf4llm)    │                        │   (Tesseract)    │
    └──────────────────┘                        └──────────────────┘
```

Native PDFs have embedded text; scanned are images. Detection: count characters per page - if < 100 chars/page, route to Tesseract OCR.

### 2. LLM-Powered Extraction

#### Recommended Stack

**Claude/GPT-4o + JSON Schema**

- Claude handles PDFs natively (text + images up to 32MB/100 pages)
- Use unified JSON Schema for structured output (portable across LLM providers)
- Both OpenAI and Anthropic support JSON Schema structured outputs

#### Extraction Schema (JSON Schema)

Using a unified JSON Schema allows flexibility across LLM providers and includes extraction metadata for validation:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "document_type": {
      "type": "string",
      "enum": ["bank_statement", "credit_card", "invoice", "receipt", "unknown"],
      "description": "Type of financial document detected"
    },
    "extraction_metadata": {
      "type": "object",
      "properties": {
        "overall_confidence": {
          "type": "number",
          "minimum": 0,
          "maximum": 1,
          "description": "Overall confidence score for the extraction (0-1)"
        },
        "reasoning": {
          "type": "string",
          "description": "Explanation of extraction decisions and any ambiguities encountered"
        },
        "verification_needed": {
          "type": "boolean",
          "description": "Flag indicating if human review is recommended"
        },
        "verification_reasons": {
          "type": "array",
          "items": { "type": "string" },
          "description": "Specific reasons why verification is recommended"
        }
      },
      "required": ["overall_confidence", "verification_needed"]
    },
    "account_info": {
      "type": "object",
      "properties": {
        "holder_name": { "type": ["string", "null"] },
        "account_number": { "type": ["string", "null"] },
        "statement_period": { "type": ["string", "null"] },
        "opening_balance": { "type": ["number", "null"] },
        "closing_balance": { "type": ["number", "null"] }
      }
    },
    "transactions": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "date": {
            "type": "string",
            "pattern": "^\\d{4}-\\d{2}-\\d{2}$",
            "description": "Transaction date in YYYY-MM-DD format"
          },
          "description": {
            "type": "string",
            "description": "Transaction description/payee"
          },
          "debit": {
            "type": ["number", "null"],
            "description": "Debit/withdrawal amount (positive number)"
          },
          "credit": {
            "type": ["number", "null"],
            "description": "Credit/deposit amount (positive number)"
          },
          "balance": {
            "type": ["number", "null"],
            "description": "Running balance after transaction"
          },
          "confidence": {
            "type": "number",
            "minimum": 0,
            "maximum": 1,
            "description": "Confidence score for this specific transaction"
          },
          "source_page": {
            "type": "integer",
            "description": "Page number where this transaction was found"
          }
        },
        "required": ["date", "description", "confidence"]
      }
    }
  },
  "required": ["document_type", "extraction_metadata", "transactions"]
}
```

**Key schema features:**
- `extraction_metadata.confidence`: Overall extraction confidence (0-1)
- `extraction_metadata.reasoning`: LLM explains its extraction decisions
- `extraction_metadata.verification_needed`: Boolean flag for human review
- `transaction.confidence`: Per-transaction confidence for granular review
- `transaction.source_page`: Citation for verification

#### Cost Analysis (50 Documents)

| Scenario | Cost |
|----------|------|
| Without optimization | $2.50-4.50 |
| With prompt caching (90% savings) | $0.50-1.00 |
| With Batch API (50% discount) | $1.25-2.25 |

**Optimization strategies**:
1. Cache system prompt + schema across documents
2. Use Batch API for non-urgent processing
3. Model routing: use GPT-4o Mini for simple docs, full models for complex
4. Process page-by-page for documents >20 pages

#### Validation & Accuracy

LLMs are **not** OCR engines - they may hallucinate numbers on low-quality scans. The schema includes built-in validation support:

1. **Confidence scoring**: `extraction_metadata.overall_confidence` and per-transaction `confidence` scores
2. **Verification flags**: `verification_needed` boolean with `verification_reasons` array
3. **Reasoning transparency**: `extraction_metadata.reasoning` explains ambiguities
4. **Citations**: `source_page` for each transaction enables verification
5. **Structural validation**: Post-extraction check that sum of debits/credits equals statement totals

**Validation workflow:**
- If `verification_needed === true` → queue for human review
- If `overall_confidence < 0.8` → flag document in UI
- If individual transaction `confidence < 0.7` → highlight that row in preview

### 3. Web App Architecture

#### Recommended Stack

| Component | Choice | Rationale |
|-----------|--------|-----------|
| **Frontend** | Next.js | React ecosystem, App Router, good DX |
| **File Upload** | Uppy | Full-featured, progress tracking |
| **Excel Export** | SheetJS (xlsx) | 3x faster than ExcelJS, handles large files |
| **Backend** | Python (FastAPI) | Rich PDF/LLM ecosystem |
| **Job Queue** | BullMQ + Redis | Exactly-once delivery, retries, priorities |
| **File Storage** | Cloudflare R2 | Zero egress fees, S3-compatible |
| **Deployment** | Docker on Hetzner | Full control, cost-effective |

**Future phase**: Google Docs/Sheets export integration.

#### Architecture Diagram

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Hetzner        │────▶│  Hetzner         │────▶│  Cloudflare R2  │
│  (Next.js)      │     │  (Python+Redis)  │     │  (File Storage) │
│                 │     │                  │     │                 │
│  - Uppy upload  │     │  - BullMQ queue  │     │  - Presigned    │
│  - Column UI    │     │  - pymupdf4llm   │     │    URLs         │
│  - SheetJS      │     │  - Claude API    │     │  - Auto-cleanup │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

All services deployed via Docker Compose on a single Hetzner VPS.

#### Column Selection UX

Based on Docparser, Flatfile, and similar tools, the recommended UX pattern:

1. **Auto-detect**: LLM identifies available columns from first document
2. **Present options**: Show checkboxes with detected columns + sample values
3. **Allow customization**:
   - Rename columns (e.g., "DESC" → "Description")
   - Add computed columns (e.g., "Absolute Amount" = abs(debit or credit))
   - Set default values for missing fields
4. **Preview table**: Show first 10 rows before export
5. **Save as template**: Remember column choices for similar documents

**Color coding** (from Flatfile patterns):
- Green: Confirmed mappings
- Orange: Needs review (low confidence)
- Red: Required fields missing

### 3.5 UX: The 30-Second Pipeline

**Goal**: Upload PDFs → Get Excel in under 30 seconds for configured schema.

The key to "instant" feeling tools is **minimizing decisions while maximizing feedback**. Based on research of ilovepdf, tinypng, remove.bg, and wetransfer.

#### Response Time Targets

| Phase | Target | User Perception |
|-------|--------|-----------------|
| Upload feedback | <100ms | Instant |
| First result visible | <3s | Fast |
| Full extraction (5 docs) | <15s | Acceptable |
| Download ready | <30s | Goal achieved |

#### The 30-Second Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  STEP 1: LANDING (0 seconds)                                            │
│  ════════════════════════════                                           │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                                                                 │    │
│  │                                                                 │    │
│  │           ┌─────────────────────────────────────┐               │    │
│  │           │                                     │               │    │
│  │           │     📄  Drop PDFs here              │               │    │
│  │           │                                     │               │    │
│  │           │     or click to browse              │               │    │
│  │           │                                     │               │    │
│  │           │  Bank statements • Credit cards     │               │    │
│  │           │  Invoices • Receipts                │               │    │
│  │           │                                     │               │    │
│  │           └─────────────────────────────────────┘               │    │
│  │                                                                 │    │
│  │                    No account needed                            │    │
│  │                                                                 │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                         │
│  • Full-page drop zone (expands on drag-over)                           │
│  • No account required for basic use                                    │
│  • Single-purpose: one tool, one action                                 │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  STEP 2: UPLOAD + PROCESSING (0-15 seconds)                             │
│  ══════════════════════════════════════════                             │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                                                                 │    │
│  │  Extracting transactions...                                     │    │
│  │                                                                 │    │
│  │  ┌──────────────────────────────────────────────────────────┐   │    │
│  │  │ ✓ statement-jan.pdf          12 transactions             │   │    │
│  │  │ ✓ statement-feb.pdf          15 transactions             │   │    │
│  │  │ ◐ statement-mar.pdf          ████████░░░░  67%           │   │    │
│  │  │ ○ invoice-001.pdf            waiting...                  │   │    │
│  │  └──────────────────────────────────────────────────────────┘   │    │
│  │                                                                 │    │
│  │  ┌──────────────────────────────────────────────────────────┐   │    │
│  │  │ LIVE PREVIEW (streaming as extracted)                    │   │    │
│  │  ├──────────┬────────────────────────┬─────────┬───────────┤   │    │
│  │  │ Date     │ Description            │ Amount  │ Conf.     │   │    │
│  │  ├──────────┼────────────────────────┼─────────┼───────────┤   │    │
│  │  │ 2026-01-│ AMAZON.COM             │ -45.99  │ ██████ 98%│   │    │
│  │  │ 2026-01-│ SALARY DEPOSIT         │ +3200   │ ██████ 99%│   │    │
│  │  │ 2026-01-│ NETFLIX                │ -15.99  │ ██████ 97%│   │    │
│  │  │ ░░░░░░░░│ ░░░░░░░░░░░░░░░░░░░░░░ │ ░░░░░░░ │ ░░░░░░░░░ │   │    │
│  │  │ ░░░░░░░░│ ░░░░░░░░░░░░░░░░░░░░░░ │ ░░░░░░░ │ ░░░░░░░░░ │   │    │
│  │  └──────────┴────────────────────────┴─────────┴───────────┘   │    │
│  │                       ↑ skeleton rows while processing         │    │
│  │                                                                 │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                         │
│  • Per-file progress bars                                               │
│  • Streaming results (show transactions as they're extracted)           │
│  • Skeleton rows indicate more coming                                   │
│  • Confidence scores visible immediately                                │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  STEP 3: REVIEW + CONFIGURE (15-25 seconds)                             │
│  ══════════════════════════════════════════                             │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                                                                 │    │
│  │  ✓ 47 transactions extracted from 4 files                      │    │
│  │                                                                 │    │
│  │  Columns to include:                                            │    │
│  │  ┌────────────────────────────────────────────────────────┐     │    │
│  │  │ [✓] Date        [✓] Description    [✓] Amount          │     │    │
│  │  │ [ ] Balance     [ ] Category       [✓] Source File     │     │    │
│  │  └────────────────────────────────────────────────────────┘     │    │
│  │                                                                 │    │
│  │  ▼ Advanced options (collapsed by default)                      │    │
│  │                                                                 │    │
│  │  ┌──────────────────────────────────────────────────────────┐   │    │
│  │  │ Date     │ Description          │ Amount   │ Source     │   │    │
│  │  ├──────────┼──────────────────────┼──────────┼────────────┤   │    │
│  │  │ 2026-01-15│ AMAZON.COM          │ -45.99   │ jan.pdf    │   │    │
│  │  │ 2026-01-15│ SALARY DEPOSIT      │ +3200.00 │ jan.pdf    │   │    │
│  │  │ 2026-01-16│ NETFLIX             │ -15.99   │ jan.pdf    │   │    │
│  │  │ 2026-01-18│ ⚠️ UNCLEAR MERCHANT │ -89.50   │ feb.pdf    │   │    │
│  │  │ ...showing 5 of 47                                       │   │    │
│  │  └──────────────────────────────────────────────────────────┘   │    │
│  │                          ↑ orange = low confidence, clickable  │    │
│  │                                                                 │    │
│  │           ┌─────────────────────────────────────┐               │    │
│  │           │      ⬇  Download Excel (.xlsx)      │               │    │
│  │           └─────────────────────────────────────┘               │    │
│  │                     BIG GREEN BUTTON                            │    │
│  │                                                                 │    │
│  │           [Copy to clipboard]  [Save to Drive]                  │    │
│  │                                                                 │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                         │
│  • Smart defaults: Date, Description, Amount pre-selected              │
│  • Advanced options hidden (progressive disclosure)                     │
│  • Low-confidence items highlighted in orange                           │
│  • Preview shows actual data, not just count                            │
│  • ONE big download button (primary action)                             │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  STEP 4: DONE (25-30 seconds)                                           │
│  ════════════════════════════                                           │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                                                                 │    │
│  │                    ✓ Download started!                          │    │
│  │                                                                 │    │
│  │                    transactions_2026-01-22.xlsx                 │    │
│  │                    47 transactions • 4 files                    │    │
│  │                                                                 │    │
│  │           ┌─────────────────────────────────────┐               │    │
│  │           │      ⬇  Download again              │               │    │
│  │           └─────────────────────────────────────┘               │    │
│  │                                                                 │    │
│  │           ┌─────────────────────────────────────┐               │    │
│  │           │      + Extract more PDFs            │               │    │
│  │           └─────────────────────────────────────┘               │    │
│  │                                                                 │    │
│  │  ─────────────────────────────────────────────────────────────  │    │
│  │                                                                 │    │
│  │  💡 Extract unlimited PDFs for $5/month                         │    │
│  │     [Sign up] - keep extraction history, templates, & more      │    │
│  │                                                                 │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                         │
│  • Auto-download on completion (optional)                               │
│  • Clear next action: "Extract more"                                    │
│  • Gentle upsell for power users (not blocking)                         │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

#### Key UX Principles Applied

| Principle | Implementation |
|-----------|----------------|
| **Zero friction upload** | Full-page drop zone, no account needed |
| **Smart defaults** | Date/Description/Amount pre-selected (90% use case) |
| **Progressive disclosure** | Advanced options collapsed |
| **Immediate feedback** | Streaming results, per-file progress |
| **Confidence transparency** | Show confidence %, highlight low items |
| **One primary action** | Big green download button |
| **No dead ends** | Always clear next step |

#### Mobile Flow (Simplified)

```
┌─────────────────────┐   ┌─────────────────────┐   ┌─────────────────────┐
│                     │   │                     │   │                     │
│  ┌───────────────┐  │   │  Extracting...      │   │  ✓ Done!            │
│  │               │  │   │                     │   │                     │
│  │  📄 Tap to    │  │   │  ████████░░ 80%     │   │  47 transactions    │
│  │   upload      │  │   │                     │   │                     │
│  │               │  │   │  ┌───────────────┐  │   │  ┌───────────────┐  │
│  └───────────────┘  │   │  │ Date  │ Amt   │  │   │  │  ⬇ Download   │  │
│                     │   │  │ 01-15 │-45.99 │  │   │  │    Excel      │  │
│  No account needed  │   │  │ 01-15 │+3200  │  │   │  └───────────────┘  │
│                     │   │  │ ░░░░░ │░░░░░░ │  │   │                     │
│                     │   │  └───────────────┘  │   │  [+ More PDFs]      │
│                     │   │                     │   │                     │
└─────────────────────┘   └─────────────────────┘   └─────────────────────┘
     Landing                  Processing               Complete
```

#### Speed Optimizations

1. **Start processing during upload** - Don't wait for upload to complete
2. **Stream results** - Show transactions as they're extracted
3. **Parallel processing** - Process multiple PDFs simultaneously
4. **Skeleton screens** - Users perceive 30% faster than spinners
5. **Background preparation** - Pre-generate Excel while user reviews

#### Configuration Persistence (for returning users)

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  Welcome back! Use your last configuration?                     │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  📋 "Bank Statement Template"                           │    │
│  │     Columns: Date, Description, Amount, Balance         │    │
│  │     Last used: 2 days ago                               │    │
│  │                                                         │    │
│  │     [Use this]              [Start fresh]               │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

Returning users with saved templates skip directly to upload → download.

#### Authentication with Clerk

Using **Clerk** for authentication - provides pre-built components, social login, and good Next.js integration.

**Auth Strategy: Progressive Authentication**

Users can use the tool without signing up (free tier), but signing in unlocks:
- More documents per month
- Saved templates
- Extraction history
- Pay-as-you-go billing

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  AUTH TRIGGER POINTS (non-blocking)                                     │
│  ══════════════════════════════════                                     │
│                                                                         │
│  1. After 5th free document:                                            │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                                                                 │    │
│  │  You've used 5/5 free extractions this month                    │    │
│  │                                                                 │    │
│  │  ┌─────────────────────────────────────────────────────────┐    │    │
│  │  │  Sign up for unlimited extractions                      │    │    │
│  │  │  Starting at $5/month                                   │    │    │
│  │  │                                                         │    │    │
│  │  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐      │    │    │
│  │  │  │ G  Google   │  │    GitHub   │  │    Email    │      │    │    │
│  │  │  └─────────────┘  └─────────────┘  └─────────────┘      │    │    │
│  │  └─────────────────────────────────────────────────────────┘    │    │
│  │                                                                 │    │
│  │  [Maybe later] ← still visible, not pushy                       │    │
│  │                                                                 │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                         │
│  2. When saving a template:                                             │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                                                                 │    │
│  │  Save this configuration as a template?                         │    │
│  │                                                                 │    │
│  │  Template name: [Bank Statement - Chase___________]             │    │
│  │                                                                 │    │
│  │  Sign in to save templates and access them anywhere             │    │
│  │                                                                 │    │
│  │  ┌─────────────┐  ┌─────────────┐                               │    │
│  │  │ G  Google   │  │    Email    │                               │    │
│  │  └─────────────┘  └─────────────┘                               │    │
│  │                                                                 │    │
│  │  [Skip - don't save]                                            │    │
│  │                                                                 │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  CLERK SIGN-IN MODAL (Clerk's pre-built component)                      │
│  ═════════════════════════════════════════════════                      │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                                                                 │    │
│  │                     ┌───────────────┐                           │    │
│  │                     │     LOGO      │                           │    │
│  │                     └───────────────┘                           │    │
│  │                                                                 │    │
│  │                  Sign in to PDFtoExcel                          │    │
│  │                                                                 │    │
│  │        ┌─────────────────────────────────────────┐              │    │
│  │        │  G   Continue with Google               │              │    │
│  │        └─────────────────────────────────────────┘              │    │
│  │        ┌─────────────────────────────────────────┐              │    │
│  │        │  🐙  Continue with GitHub               │              │    │
│  │        └─────────────────────────────────────────┘              │    │
│  │                                                                 │    │
│  │        ─────────────── or ───────────────                       │    │
│  │                                                                 │    │
│  │        Email address                                            │    │
│  │        ┌─────────────────────────────────────────┐              │    │
│  │        │ you@example.com                         │              │    │
│  │        └─────────────────────────────────────────┘              │    │
│  │                                                                 │    │
│  │        ┌─────────────────────────────────────────┐              │    │
│  │        │           Continue                      │              │    │
│  │        └─────────────────────────────────────────┘              │    │
│  │                                                                 │    │
│  │        Don't have an account? Sign up                           │    │
│  │                                                                 │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                         │
│  Clerk provides:                                                        │
│  • Pre-built <SignIn /> and <SignUp /> components                       │
│  • Social login (Google, GitHub, etc.)                                  │
│  • Magic link / OTP email verification                                  │
│  • Session management                                                   │
│  • Webhooks for billing integration                                     │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  SIGNED-IN USER HEADER                                                  │
│  ═════════════════════                                                  │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                                                                 │    │
│  │  PDFtoExcel                              [47 docs] [●] taras ▼  │    │
│  │                                                                 │    │
│  │                                          └─usage─┘  └─avatar─┘  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                         │
│  User dropdown (Clerk's <UserButton />):                                │
│  ┌─────────────────────────┐                                            │
│  │  taras@example.com      │                                            │
│  │  ─────────────────────  │                                            │
│  │  📋 My Templates        │                                            │
│  │  📊 Usage & Billing     │                                            │
│  │  ⚙️  Settings           │                                            │
│  │  ─────────────────────  │                                            │
│  │  🚪 Sign out            │                                            │
│  └─────────────────────────┘                                            │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**Clerk Integration in Next.js:**

```typescript
// middleware.ts - protect billing routes only
import { clerkMiddleware } from '@clerk/nextjs/server'

export default clerkMiddleware({
  publicRoutes: ['/', '/extract', '/api/extract'], // Main tool is public
  ignoredRoutes: ['/api/webhook'],
})

// app/layout.tsx
import { ClerkProvider } from '@clerk/nextjs'

export default function RootLayout({ children }) {
  return (
    <ClerkProvider>
      <html><body>{children}</body></html>
    </ClerkProvider>
  )
}

// Usage tracking with Clerk user ID
const { userId } = auth()
if (!userId) {
  // Anonymous user - check IP-based rate limit (5/month)
} else {
  // Authenticated - check user's plan and usage
}
```

**Key Clerk features to use:**
- `<SignIn />` / `<SignUp />` - Pre-built auth modals
- `<UserButton />` - Avatar dropdown with sign out
- `auth()` - Server-side auth check
- Webhooks - Sync with billing (Stripe) on user create/update

### 4. Competitive Landscape

#### Our Positioning: "The ilovepdf of Financial Documents"

**Pricing model:**
- **Free tier**: 5 documents/month, no account required
- **Pay-as-you-go**: Starting at $5/month for ~50 documents
- **No subscriptions forced**: Use only when you need it

This undercuts the $39/month minimum of competitors while being more accessible.

#### Commercial Solutions

| Tool | Price | Approach | Strengths | Weaknesses |
|------|-------|----------|-----------|------------|
| **Docparser** | $39-159/mo | Rule-based | Stable, integrations | Steep learning curve, fragile |
| **Parseur** | $39-299/mo | AI + templates | Fast setup, 60+ languages | Scale tier required for API |
| **DocuClipper** | $39-159/mo | Purpose-built | 99.6% accuracy, 20s processing | Limited customization |
| **Nanonets** | $0.30/page or $499+/mo | Deep learning | 110+ languages, enterprise | No intermediate pricing |
| **Rossum** | $18K+/year | Enterprise IDP | Full automation | Cost, complexity |

#### User Pain Points (from reviews)

1. **Pricing steep for small businesses** - Gap between free and $39+/month
2. **Layout changes break templates** - Fragile rule-based systems
3. **OCR fails on angled/blurry scans** - Quality-dependent accuracy
4. **Date format problems** - Regional variations cause parsing errors
5. **Security concerns** - Users worried about uploading sensitive data
6. **No simple one-off converter** - Most require account creation

#### Open Source Alternatives

| Project | Notes |
|---------|-------|
| **Unstract** | Full open-source IDP platform (~3K stars) |
| **BankStatement-Data-Extractor** | Streamlit + ChatGPT API |
| **invoice2data** | Template-based invoice extraction |

Most open-source tools are bank-specific or region-specific.

### 5. Gaps and Opportunities

Based on user complaints and market analysis, our differentiation:

1. **Simple pricing** - Free tier + pay-as-you-go starting at $5/month (vs $39/month minimum)
2. **No templates needed** - LLM adapts to any format automatically
3. **No account required** - Basic use without sign-up (like ilovepdf)
4. **Confidence transparency** - Show extraction confidence, flag uncertain items
5. **Duplicate detection** - When processing overlapping statements (future)
6. **Multi-currency handling** - Automatic detection and conversion (future)

## Implementation Plan

### High-Level Roadmap

```
Week 1-2: Core Pipeline (can demo end-to-end)
    ↓
Week 3: Auth + Usage Tracking
    ↓
Week 4: Polish + Deploy MVP
    ↓
Week 5+: Production hardening, Phase 2 features
```

### Step-by-Step Implementation Order

#### Step 1: Project Setup (Day 1)
```
□ Initialize Next.js 14+ with App Router
□ Set up Tailwind CSS
□ Configure TypeScript
□ Set up monorepo structure (if separating frontend/backend)
□ Create GitHub repo, CI basics
```
**Key points:**
- Use `create-next-app` with TypeScript template
- App Router for streaming support later
- Don't overcomplicate - single Next.js app is fine for MVP

#### Step 2: Landing Page + Upload UI (Days 2-3)
```
□ Build full-page drop zone component
□ Integrate Uppy for file handling
□ File list with thumbnails/names
□ Basic responsive layout
□ "No account needed" messaging
```
**Key points:**
- Uppy handles drag-drop, progress, file validation
- Max file size: 10MB per PDF initially
- Accept only `.pdf` files
- Mobile: ensure touch targets are 44px+

#### Step 3: PDF → LLM Extraction Pipeline (Days 4-7)
```
□ Set up Python FastAPI backend
□ Integrate pymupdf4llm for PDF text extraction
□ Define JSON Schema for extraction
□ Claude/GPT-4o API integration
□ Return structured transaction data
□ Basic error handling
```
**Key points:**
- Start with synchronous processing (no queue yet)
- JSON Schema with confidence scores from day 1
- Test with 3-4 different bank statement formats
- Handle both single-column and multi-column PDFs

#### Step 4: Results Preview + Column Selection (Days 8-10)
```
□ Display extracted transactions in table
□ Checkbox column selection UI
□ Highlight low-confidence rows (orange)
□ Show extraction metadata (confidence, doc type)
□ Smart defaults: Date, Description, Amount pre-checked
```
**Key points:**
- Use streaming to show results as they extract
- Skeleton rows while processing
- Column state managed in React (no persistence yet)

#### Step 5: Excel Export (Days 11-12)
```
□ Integrate SheetJS for Excel generation
□ Big green download button
□ Generate filename with date
□ Client-side generation (no server needed)
```
**Key points:**
- Client-side export = no server load
- Include metadata sheet (source files, extraction date)
- Format dates consistently (ISO or locale)

#### Step 6: Authentication with Clerk (Days 13-15)
```
□ Install @clerk/nextjs
□ Configure Clerk application
□ Add <SignIn /> modal trigger points
□ Add <UserButton /> to header
□ Protect billing routes only (main tool stays public)
```
**Key points:**
- Enable Google + GitHub social login
- Magic link as fallback
- Don't block the main flow - auth is optional for free tier

#### Step 7: Usage Tracking + Free Tier Limits (Days 16-17)
```
□ Track extractions per user (DB or Clerk metadata)
□ Anonymous users: IP-based rate limit (5/month)
□ Show usage counter in UI
□ Soft paywall after limit reached
```
**Key points:**
- Use Clerk's `publicMetadata` for simple usage tracking
- Or SQLite/Postgres for more flexibility
- Soft paywall = can still see results, just can't download new ones

#### Step 8: Two-Phase Extraction (Days 18-19)
```
□ Phase 1: Raw table extraction
□ Phase 2: LLM type inference (date/text/money/number)
□ Currency detection for money columns
□ Present "magical" schema proposal UI
```
**Key points:**
- This is what makes the tool feel smart
- Small/fast model for phase 2 (cheaper)
- Cache schema inference for similar documents

#### Step 9: Deploy MVP (Day 20)
```
□ Docker Compose setup
□ Deploy to Hetzner VPS
□ Configure domain + SSL (Caddy or nginx)
□ Set up Cloudflare R2 for file storage
□ Environment variables, secrets management
□ Basic monitoring (uptime, errors)
```
**Key points:**
- Single VPS is fine for MVP (~$15/month)
- Use presigned URLs for R2 uploads
- Auto-cleanup temp files after 24h

#### Step 10: Polish + Launch (Days 21-25)
```
□ Error states and edge cases
□ Loading states polish
□ Mobile responsiveness check
□ Basic analytics (Plausible or similar)
□ Landing page copy refinement
□ Soft launch to test users
```
**Key points:**
- Test with real bank statements from different banks
- Get 5-10 beta users for feedback
- Fix critical bugs before wider launch

### MVP Deliverable Checklist

At the end of MVP, users can:
- [ ] Drop 1-20 PDFs on the page
- [ ] See transactions extracted with confidence scores
- [ ] Select which columns to include
- [ ] Download Excel file
- [ ] Sign up to save templates and get more extractions
- [ ] Use on mobile (basic support)

### Risk Mitigation

| Risk | Mitigation |
|------|------------|
| LLM hallucination on numbers | Validation + confidence scores + sum checks |
| Varied PDF formats | Test with 10+ real statements before launch |
| Slow extraction (>30s) | Streaming results, skeleton UI |
| Cost overrun on LLM | Rate limits, caching, batch API |
| Scanned PDFs fail | Clear messaging, Tesseract fallback |

### Post-MVP Priorities

1. **Background processing** - BullMQ for large batches
2. **Template persistence** - Save/load column configs
3. **Billing integration** - Stripe for pay-as-you-go
4. **Scanned PDF support** - Tesseract OCR

---

## Implementation Recommendations

### MVP Scope (Phase 1)

1. **Web app**: Next.js frontend
2. **Upload**: Uppy with drag-drop, up to 20 PDFs
3. **Extraction**: Claude/GPT-4o with JSON Schema (including confidence/verification fields)
4. **Column selection**: Checkbox UI for including/excluding fields
5. **Export**: Client-side SheetJS to Excel
6. **Validation**: Sum check + confidence-based flagging

**No categorization in MVP** - defer to later phase.
**No accounting software integrations in MVP** - focus on Excel export first.

### Production Features (Phase 2)

1. **Background processing**: BullMQ workers for large batches
2. **Scanned PDF support**: Tesseract OCR integration (OSS)
3. **Template saving**: Remember column preferences per document type
4. **Batch progress**: Real-time progress indicators
5. **Error handling**: Flag low-confidence extractions for review (using schema's `verification_needed`)

### Advanced Features (Phase 3)

1. **Google Docs/Sheets integration**: Direct export to Google Sheets
2. **Multi-account detection**: Handle statements with multiple accounts
3. **Reconciliation**: Cross-check overlapping statements
4. **Direct integrations**: QuickBooks, Xero export

### Local Desktop App (Phase 4)

Consider a lightweight local app for users who prefer native experience:
- Native file picker (drag from Finder/Explorer)
- Direct integration with local Excel/Sheets files
- Electron or Tauri-based
- API calls still go to cloud, but file handling is local

## Technology Stack Summary

```yaml
Frontend:
  framework: Next.js (App Router)
  auth: Clerk (social login, magic link)
  upload: Uppy
  excel: SheetJS (xlsx)

Backend:
  language: Python 3.12+
  framework: FastAPI
  pdf_extraction: pymupdf4llm, pdfplumber (OSS only)
  llm: Claude/GPT-4o with JSON Schema
  ocr: Tesseract (OSS, for scanned PDFs)
  queue: BullMQ + Redis

Deployment:
  hosting: Docker Compose on Hetzner VPS
  files: Cloudflare R2 (presigned URLs)
  database: SQLite or Postgres (for user preferences)
  auth: Clerk (hosted, handles sessions + webhooks)
```

## Cost Estimates

| Component | Monthly Cost (50 docs/day) |
|-----------|----------------------------|
| LLM extraction | $5-15 |
| Hetzner VPS (CX31 or similar) | $10-15 |
| Cloudflare R2 | $0-5 |
| **Total** | **$15-35/month** |

With Hetzner self-hosting, infrastructure costs are minimal. The main variable cost is LLM API usage.

## Sources

### PDF Libraries
- [PyMuPDF4LLM Documentation](https://pymupdf.readthedocs.io/en/latest/pymupdf4llm/)
- [pdfplumber GitHub](https://github.com/jsvine/pdfplumber)
- [Camelot Documentation](https://camelot-py.readthedocs.io/)
- [pypdf Comparisons](https://pypdf.readthedocs.io/en/latest/meta/comparisons.html)

### OCR
- [Tesseract OCR GitHub](https://github.com/tesseract-ocr/tesseract)
- [pytesseract Documentation](https://pypi.org/project/pytesseract/)

### LLM Extraction
- [Claude PDF Support Documentation](https://platform.claude.com/docs/en/build-with-claude/pdf-support)
- [Instructor Library](https://python.useinstructor.com/)
- [OpenAI Structured Outputs](https://platform.openai.com/docs/guides/structured-outputs)
- [LLM API Pricing Comparison 2025](https://intuitionlabs.ai/articles/llm-api-pricing-comparison-2025)

### Web App Architecture
- [Next.js Documentation](https://nextjs.org/docs)
- [Clerk Documentation](https://clerk.com/docs)
- [Clerk + Next.js Quickstart](https://clerk.com/docs/quickstarts/nextjs)
- [SheetJS Documentation](https://docs.sheetjs.com/)
- [BullMQ Documentation](https://docs.bullmq.io)
- [Cloudflare R2 Presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/)
- [Uppy File Uploader](https://uppy.io/)

### Competitive Landscape
- [Docparser Pricing](https://docparser.com/pricing/)
- [Parseur Bank Statements](https://parseur.com/extract-data/bank-statements)
- [DocuClipper](https://www.docuclipper.com/)
- [Nanonets Bank Statements](https://nanonets.com/document-ocr/bank-statements)
- [Unstract GitHub](https://github.com/Zipstack/unstract)

### UX Patterns & Instant Tools
- [Designing Usable Data Importer - Smashing Magazine](https://www.smashingmagazine.com/2020/12/designing-attractive-usable-data-importer-app/)
- [Bulk Import UX - Smart Interface Design Patterns](https://smart-interface-design-patterns.com/articles/bulk-ux/)
- [File Uploader UX Best Practices - Uploadcare](https://uploadcare.com/blog/file-uploader-ux-best-practices/)
- [Drag-and-Drop UX Guidelines - Smart Interface Design](https://smart-interface-design-patterns.com/articles/drag-and-drop-ux/)
- [Skeleton Screens vs Spinners - UI Deploy](https://ui-deploy.com/blog/skeleton-screens-vs-spinners-optimizing-perceived-performance)
- [Skeleton Screens 101 - Nielsen Norman Group](https://www.nngroup.com/articles/skeleton-screens/)
- [Progressive Disclosure - Nielsen Norman Group](https://www.nngroup.com/articles/progressive-disclosure/)
- [ilovepdf iOS Redesign Lessons](https://www.ilovepdf.com/blog/lessons-learned-ios-makeover)
- [tinypng](https://tinypng.com/) - Reference for instant batch processing UX
- [remove.bg](https://www.remove.bg/) - Reference for streaming results UX

## Decisions Made

| Question | Decision |
|----------|----------|
| Local/offline processing? | No - full remote for now |
| Document format distribution? | Mixed financial documents (bank statements, credit cards, invoices) |
| Transaction categorization in MVP? | No - defer to later phase |
| Accounting software integrations in MVP? | No - focus on Excel export first |
| Duplicate detection? | No - not for now |
| Multi-currency handling? | Two-phase extraction (see below) |
| Authentication provider? | Clerk (social login, magic link, pre-built components) |

### Two-Phase Extraction Architecture

To handle multi-currency and varied column types "magically":

**Phase 1: Raw Extraction**
- Extract raw table data from PDF
- No type inference yet, just text values

**Phase 2: Schema Inference + Type Coercion**
- Small LLM post-processes extracted tables
- Infers column types with enum: `text`, `date`, `money`, `number`
- For `money` columns, detects currency and proposes schema
- Presents user with "magical" proposed schema before final export

```
Phase 1 Output (raw):
┌────────────┬─────────────────┬──────────┐
│ 15/01/2026 │ AMAZON.COM      │ -45.99   │
│ 16/01/2026 │ Transfer EUR    │ -€120.00 │
└────────────┴─────────────────┴──────────┘

Phase 2 Inference:
┌─────────────────────────────────────────────────────────────────┐
│ Detected columns:                                               │
│                                                                 │
│  Column A: date (DD/MM/YYYY format)                             │
│  Column B: text (transaction description)                       │
│  Column C: money (mixed: USD default, EUR detected in 1 row)    │
│                                                                 │
│  Proposed schema:                                               │
│  ┌──────────┬─────────────────┬──────────┬──────────┐           │
│  │ Date     │ Description     │ Amount   │ Currency │           │
│  │ (date)   │ (text)          │ (number) │ (text)   │           │
│  └──────────┴─────────────────┴──────────┴──────────┘           │
│                                                                 │
│  [✓ Looks good]    [Adjust columns]                             │
└─────────────────────────────────────────────────────────────────┘
```

This two-phase approach makes the tool "magical" - it adapts to any document structure automatically.

## Open Questions

- What's the acceptable error rate for production use? (TBD)
