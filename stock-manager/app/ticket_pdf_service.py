"""
Mercadona PDF ticket parser.

The Spanish Mercadona electronic receipt (PDF) follows a consistent layout:

    Descripción                 P. Unit   Importe
    <qty:int> <name>            [<unit>]  <total>
    ...
    TOTAL (€)                             <grand_total>

When qty == 1 only the total is printed (unit_price is implicit and equal to
total). When qty >= 2 both unit and total appear. Prices use European decimal
comma. We extract structured items with qty / name / unit_price / total_price
plus header metadata (date, ticket id, total).
"""
import io
import logging
import re
from typing import Optional

import pdfplumber

logger = logging.getLogger(__name__)

_HEADER_RE = re.compile(r"Descripci[oó]n.*Importe", re.IGNORECASE)
_TOTAL_RE = re.compile(r"^\s*TOTAL\b", re.IGNORECASE)
_DATE_RE = re.compile(r"(\d{2}/\d{2}/\d{4})\s+(\d{2}:\d{2})")
_TICKET_RE = re.compile(r"FACTURA\s+SIMPLIFICADA:\s*([0-9\-]+)", re.IGNORECASE)
_GRAND_TOTAL_RE = re.compile(r"TOTAL\s*\(?\s*€?\s*\)?\s*([0-9]+,\d{2})", re.IGNORECASE)

# qty + name + optional unit_price + total_price (always at end of line).
# Examples that must match:
#   "1 CHAPATA CRISTAL 4UDS                    1,30"     -> qty=1, total=1,30
#   "2 LECHE DESN. PROT 1L           1,35     2,70"      -> qty=2, unit=1,35, total=2,70
_ITEM_RE = re.compile(
    r"^\s*(\d+)\s+(.+?)\s+(?:(\d+,\d{2})\s+)?(\d+,\d{2})\s*$"
)


def extract_text_from_pdf(pdf_bytes: bytes) -> str:
    """Extract raw text from a PDF using pdfplumber."""
    out_parts = []
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for page in pdf.pages:
            txt = page.extract_text() or ""
            if txt:
                out_parts.append(txt)
    return "\n".join(out_parts)


def _to_float(s: Optional[str]) -> Optional[float]:
    if s is None:
        return None
    return float(s.replace(",", "."))


def parse_mercadona_ticket(text: str) -> dict:
    """Parse Mercadona ticket text into {items, date, ticket_id, total, raw_text}."""
    lines = [ln.rstrip() for ln in text.splitlines()]
    # Find the product section: between "Descripción ... Importe" and "TOTAL ..."
    start_idx = None
    end_idx = len(lines)
    for i, ln in enumerate(lines):
        if start_idx is None and _HEADER_RE.search(ln):
            start_idx = i + 1
            continue
        if start_idx is not None and _TOTAL_RE.match(ln.strip()):
            end_idx = i
            break

    product_lines = lines[start_idx:end_idx] if start_idx is not None else []

    items = []
    for raw in product_lines:
        line = raw.strip()
        if not line:
            continue
        m = _ITEM_RE.match(line)
        if not m:
            continue
        qty = int(m.group(1))
        name = m.group(2).strip()
        unit_price = _to_float(m.group(3))
        total_price = _to_float(m.group(4))
        # Single-qty rows print only the total; derive unit_price from it.
        if unit_price is None and qty:
            unit_price = round(total_price / qty, 4)
        items.append({
            "line": line,
            "qty": qty,
            "name": name,
            "unit_price": unit_price,
            "total_price": total_price,
        })

    date_str = None
    m = _DATE_RE.search(text)
    if m:
        date_str = f"{m.group(1)} {m.group(2)}"

    ticket_id = None
    m = _TICKET_RE.search(text)
    if m:
        ticket_id = m.group(1)

    total = None
    # Prefer a "TOTAL (€) ..." line over the IVA "TOTAL" row.
    m = re.search(r"TOTAL\s*\(\s*€\s*\)\s*([0-9]+,\d{2})", text, re.IGNORECASE)
    if not m:
        m = _GRAND_TOTAL_RE.search(text)
    if m:
        total = _to_float(m.group(1))

    return {
        "items": items,
        "date": date_str,
        "ticket_id": ticket_id,
        "total": total,
        "raw_text": text,
    }


def parse_ticket_pdf(pdf_bytes: bytes) -> dict:
    """End-to-end: bytes -> structured Mercadona ticket dict."""
    text = extract_text_from_pdf(pdf_bytes)
    if not text.strip():
        logger.warning("PDF produced empty text — is it a scanned/image PDF?")
        return {"items": [], "date": None, "ticket_id": None, "total": None, "raw_text": ""}
    return parse_mercadona_ticket(text)
