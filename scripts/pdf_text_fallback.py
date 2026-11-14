"""Alternative text extraction without weakening pypdf's decompression limits."""
import sys


def extract_page_text(page, pdf_path, page_index):
    try:
        return page.extract_text() or ""
    except Exception as original:
        try:
            import fitz
            with fitz.open(pdf_path) as document:
                text = document.load_page(page_index).get_text()
            if not text.strip() or len(text) > 200000:
                raise ValueError("empty or oversized alternative extraction")
            print(f"[RECOVER] {pdf_path.name} page {page_index + 1}: PyMuPDF text fallback", file=sys.stderr)
            return text
        except Exception:
            print(f"[WARN] {pdf_path.name} page {page_index + 1}: both extractors failed; {original}", file=sys.stderr)
            return ""
