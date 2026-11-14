import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from pdf_text_fallback import extract_page_text


class PdfFallbackTests(unittest.TestCase):
    def test_normal_page_does_not_use_alternative_extractor(self):
        page = MagicMock(); page.extract_text.return_value = "normal source text"
        with patch("fitz.open") as alternative:
            self.assertEqual(extract_page_text(page, Path("fixture.pdf"), 0), "normal source text")
            alternative.assert_not_called()

    def test_decompression_error_uses_independent_extractor(self):
        page = MagicMock(); page.extract_text.side_effect = ValueError("Limit reached while decompressing")
        document = MagicMock(); document.__enter__.return_value = document
        document.load_page.return_value.get_text.return_value = "Recovered academic page"
        with patch("fitz.open", return_value=document):
            self.assertEqual(extract_page_text(page, Path("fixture.pdf"), 2), "Recovered academic page")

    def test_both_failures_return_no_invented_text(self):
        page = MagicMock(); page.extract_text.side_effect = ValueError("decompression limit")
        with patch("fitz.open", side_effect=ValueError("unreadable")):
            self.assertEqual(extract_page_text(page, Path("fixture.pdf"), 0), "")
