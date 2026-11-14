"""Emit targeted, public-textbook recovery chunks. Does not modify corpus files."""
import hashlib
import json
import re
import sys
from pathlib import Path
import fitz
from build_textbook_index import semantic_chunk

ROOT = Path(__file__).resolve().parents[1]
DATASET = (ROOT / "dataset/ncert_textbooks").resolve()
plan = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
if not isinstance(plan, list) or len(plan) > 32:
    raise ValueError("Expected at most 32 explicit source/page selections")
templates = {}
for line in (ROOT / "lib/context/textbook_chunks.jsonl").read_text(encoding="utf-8").splitlines():
    row = json.loads(line)
    templates.setdefault(row["sourcePath"], row)
result, pages = [], []
for item in plan:
    source = item["sourcePath"]
    target = (ROOT / source).resolve()
    page_number = item["page"]
    if DATASET not in target.parents or target.suffix.lower() != ".pdf" or source not in templates:
        raise ValueError("Recovery requires an existing public textbook source inside the dataset")
    if not isinstance(page_number, int) or not 1 <= page_number <= 1000:
        raise ValueError("Page must be a one-based positive integer")
    with fitz.open(target) as document:
        text = document.load_page(page_number - 1).get_text()
    if len(text) > 200000:
        raise ValueError("Oversized alternative extraction requires review")
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", " ", text)
    pieces = semantic_chunk(text, target_words=160, max_words=240, min_words=40)
    if not pieces:
        raise ValueError(f"No usable recovered text: {source} page {page_number}")
    for index, piece in enumerate(pieces):
        row = dict(templates[source])
        digest = hashlib.sha256(f"{source}|{page_number}|{index}|{piece}".encode()).hexdigest()[:24]
        row.update(id=f"recovered-page::{digest}", text=piece, page=page_number, pageNumberBase=1,
                   chunkIndex=index, wordCount=len(piece.split()), extractionMethod="pymupdf-page-recovery")
        result.append(row)
    pages.append({"sourcePath": source, "page": page_number, "characters": len(text), "chunks": len(pieces)})
print(json.dumps({"pages": pages, "chunks": result}, ensure_ascii=False))
