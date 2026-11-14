import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from textbook_identity import match_textbook_chapter, textbook_heading_text
from unittest.mock import patch, MagicMock

CHAPTERS = [
    {"id": "c10-chem-5", "classLevel": 10, "subject": "Chemistry", "title": "Periodic Classification of Elements", "chapterNumber": 5},
    {"id": "c10-bio-1", "classLevel": 10, "subject": "Biology", "title": "Life Processes", "chapterNumber": 6},
    {"id": "c10-bio-2", "classLevel": 10, "subject": "Biology", "title": "Control and Coordination", "chapterNumber": 7},
    {"id": "c10-math-2", "classLevel": 10, "subject": "Math", "title": "Polynomials", "chapterNumber": 2},
    {"id": "c10-math-8", "classLevel": 10, "subject": "Math", "title": "Introduction to Trigonometry", "chapterNumber": 8},
    {"id": "c12-phy-9", "classLevel": 12, "subject": "Physics", "title": "Ray Optics and Optical Instruments", "chapterNumber": 9},
]


class TextbookIdentityTests(unittest.TestCase):
    def test_identity_reads_heading_layout_instead_of_cleaned_body(self):
        document = MagicMock()
        document.__enter__.return_value = document
        document.__len__.return_value = 1
        document.load_page.return_value.get_text.return_value = "THE LAST LESSON\nFranz and M. Hamel"
        with patch("fitz.open", return_value=document):
            text = textbook_heading_text("fixture.pdf", "Body text lost the decorative heading")
        self.assertTrue(text.startswith("THE LAST LESSON"))

    def test_unreadable_heading_preserves_extracted_body(self):
        with patch("fitz.open", side_effect=ValueError("invalid PDF")):
            self.assertEqual(textbook_heading_text("fixture.pdf", "existing source text"), "existing source text")

    def test_rationalized_science_number_is_not_treated_as_subject_number(self):
        chapter, _, _ = match_textbook_chapter("Life Processes\n5 CHAPTER\nNutrition and respiration", 10, "Science", CHAPTERS)
        self.assertEqual(chapter["id"], "c10-bio-1")

    def test_physics_part_two_keeps_real_chapter_identity(self):
        chapter, _, _ = match_textbook_chapter("Chapter Nine\nRAY OPTICS AND OPTICAL INSTRUMENTS\n9.1 INTRODUCTION", 12, "Physics", CHAPTERS)
        self.assertEqual(chapter["id"], "c12-phy-9")

    def test_body_reference_does_not_override_chapter_heading(self):
        chapter, _, _ = match_textbook_chapter("Control and Coordination\n6 CHAPTER\nIn the previous chapter we studied life processes.", 10, "Science", CHAPTERS)
        self.assertEqual(chapter["id"], "c10-bio-2")

    def test_introduction_is_not_a_match_for_trigonometry(self):
        chapter, _, _ = match_textbook_chapter("10\nMATHEMATICS\n2\n2.1 Introduction\nIn Class IX you studied polynomials in one variable.", 10, "Math", CHAPTERS)
        self.assertEqual(chapter["id"], "c10-math-2")

    def test_unresolved_source_stays_unresolved(self):
        chapter, _, _ = match_textbook_chapter("Unrelated supplementary workbook without an identifiable heading", 10, "Science", CHAPTERS)
        self.assertIsNone(chapter)


if __name__ == "__main__":
    unittest.main()
