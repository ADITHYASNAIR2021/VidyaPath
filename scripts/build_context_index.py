#!/usr/bin/env python3
"""
VidyaPath Context Index Builder
===============================

Builds chapter-aware retrieval artifacts from local CBSE paper PDFs:
  - lib/context/chunks.jsonl
  - lib/context/chapter_index.json

Also supports single-file extraction mode for on-demand fallback:
  python scripts/build_context_index.py --single-file "2024/Class_12/Physics/x.pdf" --json-stdout
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import re
import sys
import time
import warnings
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple

from pdf_visual_pipeline import (
    FITZ_AVAILABLE,
    detect_visual_pages as detect_visual_candidates,
    infer_visual_tags,
    ocr_page_via_nvidia as ocr_visual_page,
    render_page_as_base64 as render_visual_page_as_base64,
    save_rendered_page_image as save_visual_image,
)

try:
    from pypdf import PdfReader
except ImportError:  # pragma: no cover
    PdfReader = None

warnings.filterwarnings("ignore", message=r".*Multiple definitions in dictionary.*")
logging.getLogger("pypdf").setLevel(logging.ERROR)


CURRENT_YEAR = 2026
MIN_CHUNK_WORDS = 80
DEFAULT_CHUNK_WORDS = 260
DEFAULT_CHUNK_OVERLAP = 48
MIN_ENGLISH_WORDS_PER_CHUNK = 20
MIN_ENGLISH_RATIO = 0.52

CONTROL_RE = re.compile(r"[\x00-\x08\x0B\x0C\x0E-\x1F]+")

# Semantic chunking patterns for CBSE exam papers
SENTENCE_END_RE = re.compile(r'(?<=[.!?])\s+(?=[A-Z(\[])')
# Detects question starts: "Q1.", "Question 1", "1.", "1)", "(a)", "(i)"
QUESTION_START_RE = re.compile(
    r'(?:(?<=\n)|(?<=\s)|^)\s*'
    r'(?:Q\.?\s*\d+|Question\s+\d+|\d+\s*[\.\)]\s+(?=[A-Z(])|'
    r'\((?:a|b|c|d|e|i|ii|iii|iv|v)\)\s+(?=[A-Z]))',
    re.MULTILINE,
)
SECTION_HEADER_RE = re.compile(
    r'(?:SECTION|Section|PART|Part)\s+[A-F]\b.*?(?=\n)',
    re.MULTILINE,
)
# Min meaningful words in a sentence before it counts as a split point
MIN_SENTENCE_WORDS = 6

# Image OCR via NVIDIA nemotron-ocr-v1
NVIDIA_OCR_ENDPOINT = "https://ai.api.nvidia.com/v1/cv/nvidia/nemotron-ocr-v1"
# Minimum image dimension to bother OCR-ing (skip tiny icons/decorations)
MIN_IMAGE_DIMENSION = 80


@dataclass
class ChapterEntry:
    chapter_id: str
    class_level: int
    subject: str
    title: str
    topics: List[str]
    keyword_tokens: Set[str]


@dataclass
class PdfRecord:
    relative_path: str
    abs_path: Path
    class_level: int
    subject: str
    year: int
    paper_type: str
    score: float


def tokenize(text: str) -> Set[str]:
    parts = re.findall(r"[a-zA-Z]{3,}", text.lower())
    stop = {
        "the",
        "and",
        "for",
        "with",
        "from",
        "into",
        "this",
        "that",
        "have",
        "what",
        "which",
        "will",
        "are",
        "was",
        "were",
        "your",
        "their",
        "about",
        "board",
        "class",
        "chapter",
        "paper",
    }
    return {p for p in parts if p not in stop}


def clean_text(text: str) -> str:
    text = CONTROL_RE.sub(" ", text.replace("\x00", " "))
    text = text.replace("Rationalised 2023-24", " ")
    text = text.replace("Reprint 2024-25", " ")
    # Remove exam-instruction boilerplate — cap match at 1800 chars to avoid eating question content
    # when no Section/Q1 follows (e.g. boilerplate at end of extracted page text).
    text = re.sub(
        r"\b(?:General Instructions|Time allowed|Maximum Marks)\b.{0,1800}?(?=(Section\s+[A-E]|Q\.?\s*1)|(?=\Z))",
        " ",
        text,
        flags=re.I | re.S,
    )
    text = re.sub(
        r"\b(?:Read the following instructions carefully)\b.{0,1800}?(?=(Section\s+[A-E]|Q\.?\s*1)|(?=\Z))",
        " ",
        text,
        flags=re.I | re.S,
    )
    text = re.sub(
        r"Candidates must write the Q\.P\. Code.{0,600}?(?=(Section\s+[A-E]|Q\.?\s*1)|(?=\Z))",
        " ",
        text,
        flags=re.I | re.S,
    )
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def english_metrics(text: str) -> Tuple[int, int, float]:
    english_words = re.findall(r"\b[a-zA-Z]{2,}\b", text)
    all_words = re.findall(r"\b[\w]+\b", text)
    english_count = len(english_words)
    all_count = len(all_words)
    ratio = (english_count / all_count) if all_count else 0.0
    return english_count, all_count, ratio


def is_english_chunk(text: str) -> bool:
    english_count, all_count, ratio = english_metrics(text)
    if english_count < MIN_ENGLISH_WORDS_PER_CHUNK:
        return False
    if all_count == 0:
        return False
    return ratio >= MIN_ENGLISH_RATIO


def is_instruction_chunk(text: str) -> bool:
    lower = text.lower()
    instruction_hits = sum(
        marker in lower
        for marker in [
            "general instructions",
            "time allowed",
            "maximum marks",
            "q.p. code",
            "series :",
            "roll no.",
            "please check that this question paper",
            "this question paper contains",
        ]
    )
    question_hits = len(re.findall(r"\b(question|solve|find|calculate|evaluate|prove|show that|which of the following)\b", lower))
    return instruction_hits >= 2 and question_hits < 3


def format_eta(seconds: float) -> str:
    if seconds <= 0 or not seconds or seconds == float("inf"):
        return "00:00"
    mins, secs = divmod(int(seconds), 60)
    hours, mins = divmod(mins, 60)
    if hours > 0:
        return f"{hours:02d}:{mins:02d}:{secs:02d}"
    return f"{mins:02d}:{secs:02d}"


def progress(prefix: str, current: int, total: int, started_at: float, *, force_line: bool = False) -> None:
    if total <= 0:
        return
    now = time.time()
    elapsed = max(0.001, now - started_at)
    rate = current / elapsed
    eta = (total - current) / rate if rate > 0 else float("inf")
    percent = (current / total) * 100
    bar_width = 28
    filled = min(bar_width, int(bar_width * current / total))
    bar = "#" * filled + "-" * (bar_width - filled)
    line = f"{prefix} [{bar}] {current}/{total} ({percent:5.1f}%) ETA {format_eta(eta)}"
    if sys.stdout.isatty():
        end = "\n" if force_line or current >= total else ""
        print(f"\r{line}", end=end, flush=True)
    else:
        should_print = force_line or current >= total or current == 1 or current % max(1, total // 10) == 0
        if should_print:
            print(line, flush=True)


def parse_data_ts(path: Path) -> List[ChapterEntry]:
    content = path.read_text(encoding="utf-8", errors="ignore")
    pattern = re.compile(
        r"id:\s*'(?P<id>[^']+)'.*?"
        r"classLevel:\s*(?P<class>\d+).*?"
        r"subject:\s*'(?P<subject>[^']+)'.*?"
        r"title:\s*'(?P<title>[^']+)'.*?"
        r"topics:\s*\[(?P<topics>.*?)\]\s*,\s*"
        r"ncertPdfUrl:",
        re.S,
    )
    topic_pattern = re.compile(r"'((?:\\'|[^'])+)'")

    chapters: List[ChapterEntry] = []
    for match in pattern.finditer(content):
        chapter_id = match.group("id").strip()
        class_level = int(match.group("class").strip())
        subject = match.group("subject").strip()
        title = match.group("title").strip().replace("\\'", "'")
        topics_block = match.group("topics")
        topics = [m.group(1).replace("\\'", "'").strip() for m in topic_pattern.finditer(topics_block)]
        keywords = tokenize(" ".join([title] + topics))
        chapters.append(
            ChapterEntry(
                chapter_id=chapter_id,
                class_level=class_level,
                subject=subject,
                title=title,
                topics=topics,
                keyword_tokens=keywords,
            )
        )
    return chapters


def parse_pyq_years(path: Path) -> Dict[str, List[int]]:
    content = path.read_text(encoding="utf-8", errors="ignore")
    pattern = re.compile(
        r"chapterId:\s*'(?P<id>[^']+)'.*?"
        r"yearsAsked:\s*\[(?P<years>[^\]]*)\]",
        re.S,
    )
    result: Dict[str, List[int]] = {}
    for match in pattern.finditer(content):
        chapter_id = match.group("id")
        years_raw = match.group("years")
        years = [int(y.strip()) for y in years_raw.split(",") if y.strip().isdigit()]
        result[chapter_id] = years
    return result


def infer_subject(class_level: int, relative_path: str) -> Optional[str]:
    lower = relative_path.lower()
    parts = [p for p in lower.split("/") if p]
    file_token = re.sub(r"\.pdf$", "", parts[-1]) if parts else lower

    subject_candidates: List[str] = []
    for idx, part in enumerate(parts):
        if part == f"class_{class_level}":
            subject_candidates.extend(parts[idx + 1 : -1])
            break
    if not subject_candidates:
        subject_candidates = parts[:-1]

    filtered_candidates = [p for p in subject_candidates if "zip_extracted" not in p]
    token_blob = " ".join(filtered_candidates + [file_token])
    token = re.sub(r"[^a-z]+", " ", token_blob).strip()

    if any(x in token for x in ["accountancy", "accounts", "accounting", "financial accounting", "book keeping"]):
        return "Accountancy"
    if any(x in token for x in ["business studies", "business study", "entrepreneurship", "marketing"]):
        return "Business Studies"
    if any(x in token for x in ["economics", "macroeconomics", "microeconomics", "indian economic development"]):
        return "Economics"
    if "english" in token:
        return "English Core"
    if any(x in token for x in ["physics", "applied physics", "physical world"]):
        return "Science" if class_level == 10 else "Physics"
    if any(x in token for x in ["chemistry", "chem"]):
        return "Science" if class_level == 10 else "Chemistry"
    if any(x in token for x in ["biology", "bio"]) and "biotech" not in token:
        return "Science" if class_level == 10 else "Biology"
    if any(x in token for x in ["math", "mathematics", "applied mathematics", "maths"]):
        return "Math"
    if any(x in token for x in ["science", "scince"]) and "social science" not in token:
        return "Science"
    if "social science" in token:
        return "Social Science"
    if "political science" in token:
        return "Political Science"
    if "history" in token:
        return "History"
    if "geography" in token:
        return "Geography"
    if "computer science" in token:
        return "Computer Science"
    if "physical education" in token:
        return "Physical Education"

    if filtered_candidates:
        fallback = filtered_candidates[0].replace("_", " ").replace("-", " ").strip()
        if fallback:
            return " ".join(word.capitalize() for word in fallback.split())
    return None


def parse_pdf_record(dataset_root: Path, file_path: Path, pyq_year_buckets: Set[Tuple[int, str, int]]) -> Optional[PdfRecord]:
    relative_path = file_path.relative_to(dataset_root).as_posix()
    m = re.match(r"(?P<year_token>\d{4}(?:-COMPTT)?)/Class_(?P<class_level>10|12)/", relative_path)
    if not m:
        return None

    year_token = m.group("year_token")
    class_level = int(m.group("class_level"))
    year = int(year_token[:4])

    paper_type = "compartment" if "COMPTT" in year_token else "board"
    if "sample" in file_path.name.lower():
        paper_type = "sample"

    subject = infer_subject(class_level, relative_path)
    if not subject:
        return None

    recency_score = max(0, 12 - max(0, CURRENT_YEAR - year)) * 2.0
    paper_type_weight = {"board": 8.0, "sample": 5.0, "compartment": 3.0}.get(paper_type, 2.0)
    pyq_boost = 3.0 if (class_level, subject, year) in pyq_year_buckets else 0.0
    filename = file_path.name.lower()
    noise_penalty = 0.0
    lower_path = relative_path.lower()
    if ".zip_extracted/" in lower_path:
        noise_penalty -= 1.5
    if "solution" in filename:
        noise_penalty -= 2.5
    if "sample" in filename:
        noise_penalty -= 1.5
    if "marking" in filename:
        noise_penalty -= 1.0
    if "urdu" in filename or "hindi" in filename:
        noise_penalty -= 0.5

    score = recency_score + paper_type_weight + pyq_boost + noise_penalty
    return PdfRecord(
        relative_path=relative_path,
        abs_path=file_path,
        class_level=class_level,
        subject=subject,
        year=year,
        paper_type=paper_type,
        score=score,
    )


def extract_pdf_text(pdf_path: Path, max_pages: int) -> str:
    if PdfReader is None:
        return ""
    try:
        reader = PdfReader(str(pdf_path))
        out: List[str] = []
        for idx, page in enumerate(reader.pages):
            if idx >= max_pages:
                break
            try:
                page_text = page.extract_text() or ""
            except Exception as page_exc:
                print(f"[WARN] {pdf_path.name} page {idx}: {page_exc}", file=sys.stderr)
                page_text = ""
            if page_text.strip():
                out.append(page_text)
        return clean_text("\n".join(out))
    except Exception as exc:
        print(f"[ERR ] extract_pdf_text({pdf_path.name}): {exc}", file=sys.stderr)
        return ""


def chunk_words(text: str, size: int = DEFAULT_CHUNK_WORDS, overlap: int = DEFAULT_CHUNK_OVERLAP) -> List[str]:
    """Legacy fixed-word chunker — kept for reference. Use chunk_semantic instead."""
    words = text.split()
    if not words:
        return []
    chunks: List[str] = []
    cursor = 0
    while cursor < len(words):
        end = min(cursor + size, len(words))
        chunk = " ".join(words[cursor:end]).strip()
        if len(chunk.split()) >= MIN_CHUNK_WORDS:
            chunks.append(chunk)
        if end >= len(words):
            break
        cursor = max(0, end - overlap)
    return chunks


def _split_sentences(text: str) -> List[str]:
    """Split text into sentences using punctuation heuristics."""
    raw = SENTENCE_END_RE.split(text)
    out: List[str] = []
    for part in raw:
        part = part.strip()
        if part and len(part.split()) >= MIN_SENTENCE_WORDS:
            out.append(part)
        elif part and out:
            out[-1] = out[-1] + " " + part  # merge tiny tail into previous
    return out if out else [text.strip()] if text.strip() else []


def _build_overlap_tail_words(text: str, overlap_words: int) -> List[str]:
    """
    Prefer sentence-aware overlap tails so follow-on chunks do not begin from a
    mid-sentence word slice unless no better boundary exists.
    """
    if overlap_words <= 0 or not text.strip():
        return []

    sentences = _split_sentences(text)
    if not sentences:
        return []

    selected: List[str] = []
    word_count = 0
    for sentence in reversed(sentences):
        selected.insert(0, sentence.strip())
        word_count += len(sentence.split())
        if word_count >= overlap_words:
            break

    overlap_text = " ".join(part for part in selected if part).strip()
    return overlap_text.split() if overlap_text else []


def _split_question_blocks(text: str) -> List[str]:
    """Split at CBSE question number boundaries, keeping prefix with block."""
    positions = [m.start() for m in QUESTION_START_RE.finditer(text)]
    if len(positions) < 2:
        return [text.strip()] if text.strip() else []
    blocks: List[str] = []
    for idx, start in enumerate(positions):
        end = positions[idx + 1] if idx + 1 < len(positions) else len(text)
        block = text[start:end].strip()
        if block:
            blocks.append(block)
    # include any leading text before first question
    if positions[0] > 0:
        preamble = text[: positions[0]].strip()
        if preamble:
            blocks.insert(0, preamble)
    return blocks


def chunk_semantic(
    text: str,
    target_words: int = DEFAULT_CHUNK_WORDS,
    overlap_words: int = DEFAULT_CHUNK_OVERLAP,
    min_words: int = MIN_CHUNK_WORDS,
) -> List[str]:
    """
    Structure-aware semantic chunking for CBSE exam papers.

    Strategy (in order of priority):
    1. Split at Section headers (Section A / Part B).
    2. Within each section, split at question number boundaries.
    3. If a question block exceeds 1.5× target, split at sentence boundaries.
    4. Merge dangling short blocks with the preceding chunk.
    5. Carry `overlap_words` from the tail of the previous chunk into the next.
    """
    if not text.strip():
        return []

    # --- pass 1: split at section headers ---
    section_parts: List[str] = []
    last = 0
    for match in SECTION_HEADER_RE.finditer(text):
        pre = text[last : match.start()].strip()
        if pre:
            section_parts.append(pre)
        last = match.start()
    tail = text[last:].strip()
    if tail:
        section_parts.append(tail)
    if not section_parts:
        section_parts = [text.strip()]

    all_chunks: List[str] = []
    prev_tail_words: List[str] = []

    for section in section_parts:
        # --- pass 2: split at question boundaries ---
        q_blocks = _split_question_blocks(section)
        if not q_blocks:
            q_blocks = [section]

        current_words: List[str] = list(prev_tail_words)

        for block in q_blocks:
            block_words = block.split()

            # block fits in remaining space → accumulate
            if len(current_words) + len(block_words) <= target_words:
                current_words.extend(block_words)
                continue

            # flush current before starting this block
            if len(current_words) >= min_words:
                current_chunk = " ".join(current_words)
                all_chunks.append(current_chunk)
                prev_tail_words = _build_overlap_tail_words(current_chunk, overlap_words)

            # block itself is too long → split at sentence boundaries
            if len(block_words) > int(target_words * 1.4):
                sentences = _split_sentences(block)
                current_words = list(prev_tail_words)
                for sentence in sentences:
                    sw = sentence.split()
                    if len(current_words) + len(sw) <= target_words:
                        current_words.extend(sw)
                    else:
                        if len(current_words) >= min_words:
                            current_chunk = " ".join(current_words)
                            all_chunks.append(current_chunk)
                            prev_tail_words = _build_overlap_tail_words(current_chunk, overlap_words)
                        current_words = list(prev_tail_words) + sw
                # don't flush here — carry into next block
            else:
                current_words = list(prev_tail_words) + block_words

        # flush section remainder
        if len(current_words) >= min_words:
            current_chunk = " ".join(current_words)
            all_chunks.append(current_chunk)
            prev_tail_words = _build_overlap_tail_words(current_chunk, overlap_words)
        elif current_words and all_chunks:
            # merge tiny tail into last chunk
            all_chunks[-1] = all_chunks[-1] + " " + " ".join(current_words)

    return [c for c in all_chunks if c.strip()]


# ---------------------------------------------------------------------------
# Image extraction via PyMuPDF (optional)
# ---------------------------------------------------------------------------

def detect_pages_with_images(pdf_path: Path) -> Set[int]:
    """Return 0-based page indices that contain embedded raster images."""
    if not FITZ_AVAILABLE:
        return set()
    try:
        doc = fitz.open(str(pdf_path))
        pages: Set[int] = set()
        for page_num in range(len(doc)):
            if doc[page_num].get_images():
                pages.add(page_num)
        doc.close()
        return pages
    except Exception:
        return set()


def render_page_as_base64(pdf_path: Path, page_num: int, dpi: int = 150) -> Optional[str]:
    """Render one PDF page as a PNG and return its base64 string."""
    if not FITZ_AVAILABLE:
        return None
    try:
        doc = fitz.open(str(pdf_path))
        page = doc[page_num]
        mat = fitz.Matrix(dpi / 72.0, dpi / 72.0)
        pix = page.get_pixmap(matrix=mat, colorspace=fitz.csRGB, alpha=False)
        # skip if image is too small (likely icon/decoration)
        if pix.width < MIN_IMAGE_DIMENSION or pix.height < MIN_IMAGE_DIMENSION:
            doc.close()
            return None
        encoded = base64.b64encode(pix.tobytes("png")).decode("utf-8")
        doc.close()
        return encoded
    except Exception:
        return None


def ocr_page_via_nvidia(base64_image: str, api_key: str) -> str:
    """
    Call NVIDIA nemotron-ocr-v1 to extract text + math from an exam page image.
    Returns extracted text, or empty string on failure.
    """
    payload = json.dumps({
        "model": "nvidia/nemotron-ocr-v1",
        "messages": [{
            "role": "user",
            "content": [
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:image/png;base64,{base64_image}"},
                },
                {
                    "type": "text",
                    "text": (
                        "Extract ALL text and mathematical content from this CBSE exam paper page. "
                        "Preserve: question numbers, equations (use LaTeX notation), diagram labels, "
                        "table data, and any printed text. Output plain text only."
                    ),
                },
            ],
        }],
        "max_tokens": 1200,
    }).encode("utf-8")
    try:
        req = urllib.request.Request(
            NVIDIA_OCR_ENDPOINT,
            data=payload,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
        )
        with urllib.request.urlopen(req, timeout=45) as resp:
            result = json.loads(resp.read().decode("utf-8"))
            return result.get("choices", [{}])[0].get("message", {}).get("content", "").strip()
    except Exception:
        return ""


def chapter_candidates_for_subject(chapters: List[ChapterEntry], class_level: int, subject: str) -> List[ChapterEntry]:
    if class_level == 10 and subject == "Science":
        subjects = {"Physics", "Chemistry", "Biology"}
        return [c for c in chapters if c.class_level == 10 and c.subject in subjects]
    return [c for c in chapters if c.class_level == class_level and c.subject == subject]


def map_chunk_to_chapter(chunk_text: str, chapter_pool: List[ChapterEntry]) -> Optional[str]:
    if not chapter_pool:
        return None
    chunk_tokens = tokenize(chunk_text)
    if not chunk_tokens:
        return None

    best_id: Optional[str] = None
    best_score = 0
    for chapter in chapter_pool:
        overlap = len(chunk_tokens.intersection(chapter.keyword_tokens))
        if overlap > best_score:
            best_score = overlap
            best_id = chapter.chapter_id
    return best_id if best_score >= 3 else None


def select_diverse_records(records: List[PdfRecord], max_files: int) -> List[PdfRecord]:
    if not records:
        return []
    if max_files <= 0:
        max_files = len(records)

    by_key_year: Dict[Tuple[int, str], Dict[int, List[PdfRecord]]] = {}
    for record in records:
        key = (record.class_level, record.subject)
        year_map = by_key_year.setdefault(key, {})
        year_map.setdefault(record.year, []).append(record)

    for year_map in by_key_year.values():
        for year in year_map:
            year_map[year].sort(key=lambda r: r.score, reverse=True)

    keys = sorted(by_key_year.keys())
    all_years = sorted({record.year for record in records}, reverse=True)

    selected: List[PdfRecord] = []
    used_sources: Set[str] = set()

    # Pass 1: year-diverse selection (ensures pre-2019 is represented when available)
    for year in all_years:
        for key in keys:
            candidates = by_key_year.get(key, {}).get(year, [])
            for candidate in candidates:
                if candidate.relative_path in used_sources:
                    continue
                selected.append(candidate)
                used_sources.add(candidate.relative_path)
                break
            if len(selected) >= max_files:
                return selected

    # Pass 2: fill remaining by global score
    for record in sorted(records, key=lambda r: r.score, reverse=True):
        if record.relative_path in used_sources:
            continue
        selected.append(record)
        used_sources.add(record.relative_path)
        if len(selected) >= max_files:
            break

    return selected


def build_pyq_year_buckets(chapters: List[ChapterEntry], pyq_by_chapter: Dict[str, List[int]]) -> Set[Tuple[int, str, int]]:
    chapter_lookup = {c.chapter_id: c for c in chapters}
    buckets: Set[Tuple[int, str, int]] = set()
    for chapter_id, years in pyq_by_chapter.items():
        chapter = chapter_lookup.get(chapter_id)
        if not chapter:
            continue
        subject = "Science" if chapter.class_level == 10 and chapter.subject in {"Physics", "Chemistry", "Biology"} else chapter.subject
        for year in years:
            buckets.add((chapter.class_level, subject, int(year)))
    return buckets


def resolve_single_file(dataset_root: Path, single_file: str, max_pages: int) -> Dict[str, str]:
    file_path = (dataset_root / single_file).resolve()
    if not file_path.exists():
        return {"sourcePath": single_file, "text": ""}
    text = extract_pdf_text(file_path, max_pages=max_pages)
    return {"sourcePath": single_file, "text": text}


def build_index(
    dataset_root: Path,
    output_dir: Path,
    max_files: int,
    max_pages: int,
    chunk_words_size: int,
    chunk_overlap: int,
    keep_unmapped: bool,
    include_non_english: bool,
    data_ts: Path,
    pyq_ts: Path,
    extract_images: bool = False,
    save_images: bool = False,
    nvidia_api_key: Optional[str] = None,
) -> Tuple[int, int, int, int, int, int]:
    chapters = parse_data_ts(data_ts)
    pyq_by_chapter = parse_pyq_years(pyq_ts)
    pyq_year_buckets = build_pyq_year_buckets(chapters, pyq_by_chapter)

    all_pdfs = list(dataset_root.rglob("*.pdf"))
    scan_started = time.time()
    pdf_records: List[PdfRecord] = []
    for idx, file_path in enumerate(all_pdfs, start=1):
        record = parse_pdf_record(dataset_root, file_path, pyq_year_buckets)
        if record is not None:
            pdf_records.append(record)
        progress("Scanning PDFs", idx, len(all_pdfs), scan_started)
    progress("Scanning PDFs", len(all_pdfs), len(all_pdfs), scan_started, force_line=True)

    pdf_records.sort(key=lambda r: r.score, reverse=True)
    effective_max_files = len(pdf_records) if max_files <= 0 else min(max_files, len(pdf_records))
    selected = select_diverse_records(pdf_records, max_files=effective_max_files)

    chunk_entries: List[dict] = []
    chapters_map: Dict[str, List[str]] = {}
    sources_by_subject_class: Dict[str, List[str]] = {}
    seen_source_keys: Set[str] = set()
    dropped_unmapped_chunks = 0
    dropped_non_english_chunks = 0
    dropped_instruction_chunks = 0
    kept_unmapped_chunks = 0
    image_manifest_entries: List[dict] = []
    image_output_root = output_dir / "images"

    chunk_counter = 1
    extract_started = time.time()
    for idx, record in enumerate(selected, start=1):
        raw_text = extract_pdf_text(record.abs_path, max_pages=max_pages)
        if not raw_text:
            progress("Extracting chunks", idx, len(selected), extract_started)
            continue

        key = f"{record.class_level}|{record.subject}"
        subject_sources = sources_by_subject_class.setdefault(key, [])
        source_key = f"{key}|{record.relative_path}"
        if source_key not in seen_source_keys and len(subject_sources) < 40:
            subject_sources.append(record.relative_path)
            seen_source_keys.add(source_key)

        # Use semantic chunking (respects question boundaries and sentence structure)
        chunks = chunk_semantic(raw_text, target_words=chunk_words_size, overlap_words=chunk_overlap)
        if not chunks:
            progress("Extracting chunks", idx, len(selected), extract_started)
            continue

        visual_candidates = []
        if (extract_images or save_images) and FITZ_AVAILABLE:
            visual_candidates = detect_visual_candidates(record.abs_path, max_pages=max_pages)
        visual_candidate_map = {candidate.page_num: candidate for candidate in visual_candidates}
        has_images = len(visual_candidates) > 0
        visual_tags = sorted({tag for candidate in visual_candidates for tag in candidate.tags})
        saved_image_entries: Dict[int, dict] = {}
        if save_images and visual_candidates:
            for candidate in visual_candidates:
                try:
                    saved = save_visual_image(
                        pdf_path=record.abs_path,
                        dataset_kind="papers",
                        dataset_relative_path=record.relative_path,
                        page_num=candidate.page_num,
                        output_root=image_output_root,
                    )
                except Exception as _img_exc:
                    logging.warning(
                        "Skipped image save for %s page %d: %s",
                        record.relative_path, candidate.page_num, _img_exc,
                    )
                    saved = None
                if not saved:
                    continue
                manifest_entry = {
                    "id": f"paper-image-{record.class_level}-{record.year}-{candidate.page_num + 1}-{len(image_manifest_entries) + 1}",
                    "datasetKind": "paper",
                    "sourcePath": record.relative_path,
                    "classLevel": record.class_level,
                    "subject": record.subject,
                    "year": record.year,
                    "paperType": record.paper_type,
                    "page": candidate.page_num,
                    "imagePath": Path(saved["imagePath"]).relative_to(output_dir).as_posix(),
                    "width": saved["width"],
                    "height": saved["height"],
                    "dpi": saved["dpi"],
                    "reasons": candidate.reasons,
                    "tags": candidate.tags,
                }
                image_manifest_entries.append(manifest_entry)
                saved_image_entries[candidate.page_num] = manifest_entry

        chapter_pool = chapter_candidates_for_subject(chapters, record.class_level, record.subject)
        for chunk_text in chunks:
            chunk_text = clean_text(chunk_text)
            if not chunk_text:
                continue
            if is_instruction_chunk(chunk_text):
                dropped_instruction_chunks += 1
                continue
            if not include_non_english and not is_english_chunk(chunk_text):
                dropped_non_english_chunks += 1
                continue
            chapter_id = map_chunk_to_chapter(chunk_text, chapter_pool)
            if not chapter_id:
                dropped_unmapped_chunks += 1
                if not keep_unmapped:
                    continue
                kept_unmapped_chunks += 1

            entry: dict = {
                "id": f"ctx-{chunk_counter:07d}",
                "sourceType": "paper",
                "classLevel": record.class_level,
                "subject": record.subject,
                "chapterId": chapter_id,
                "year": record.year,
                "paperType": record.paper_type,
                "sourcePath": record.relative_path,
                "text": chunk_text,
            }
            if has_images:
                entry["hasImages"] = True
            if visual_tags:
                entry["visualTags"] = visual_tags
            chunk_entries.append(entry)
            chunk_counter += 1

            if chapter_id:
                current = chapters_map.setdefault(chapter_id, [])
                if record.relative_path not in current and len(current) < 12:
                    current.append(record.relative_path)

        # OCR image pages and add them as extra chunks (requires NVIDIA API key)
        if extract_images and visual_candidate_map and nvidia_api_key:
            for page_num in sorted(visual_candidate_map.keys()):
                if page_num >= max_pages:
                    continue
                candidate = visual_candidate_map[page_num]
                b64 = render_visual_page_as_base64(record.abs_path, page_num)
                if not b64:
                    continue
                ocr_text = ocr_visual_page(b64, nvidia_api_key)
                if not ocr_text or len(ocr_text.split()) < MIN_CHUNK_WORDS:
                    continue
                ocr_text = clean_text(ocr_text)
                chapter_id = map_chunk_to_chapter(ocr_text, chapter_pool)
                if not chapter_id and not keep_unmapped:
                    continue
                ocr_entry: dict = {
                    "id": f"ctx-{chunk_counter:07d}",
                    "sourceType": "image-ocr",
                    "classLevel": record.class_level,
                    "subject": record.subject,
                    "chapterId": chapter_id,
                    "year": record.year,
                    "paperType": record.paper_type,
                    "sourcePath": record.relative_path,
                    "page": page_num,
                    "text": ocr_text,
                    "hasImages": True,
                }
                ocr_tags = sorted(set(candidate.tags + infer_visual_tags(ocr_text)))
                if ocr_tags:
                    ocr_entry["visualTags"] = ocr_tags
                chunk_entries.append(ocr_entry)
                manifest_entry = saved_image_entries.get(page_num)
                if manifest_entry is not None:
                    manifest_entry["ocrChunkId"] = ocr_entry["id"]
                    manifest_entry["ocrWordCount"] = len(ocr_text.split())
                    if chapter_id:
                        manifest_entry["chapterId"] = chapter_id
                    if ocr_tags:
                        manifest_entry["tags"] = sorted(set(manifest_entry.get("tags", []) + ocr_tags))
                chunk_counter += 1

        progress("Extracting chunks", idx, len(selected), extract_started)
    progress("Extracting chunks", len(selected), len(selected), extract_started, force_line=True)

    output_dir.mkdir(parents=True, exist_ok=True)
    chunks_path = output_dir / "chunks.jsonl"
    chapter_index_path = output_dir / "chapter_index.json"

    def _clean_surrogates(obj):
        """Recursively strip lone Unicode surrogates (from broken PDF fonts)."""
        if isinstance(obj, str):
            return obj.encode("utf-8", errors="ignore").decode("utf-8", errors="ignore")
        if isinstance(obj, dict):
            return {k: _clean_surrogates(v) for k, v in obj.items()}
        if isinstance(obj, list):
            return [_clean_surrogates(v) for v in obj]
        return obj

    with chunks_path.open("w", encoding="utf-8") as f:
        for entry in chunk_entries:
            f.write(json.dumps(_clean_surrogates(entry), ensure_ascii=False) + "\n")

    chapter_index_payload = {
        "version": "1",
        "generatedAt": datetime.utcnow().isoformat() + "Z",
        "datasetRoot": dataset_root.as_posix(),
        "chapters": chapters_map,
        "sourcesBySubjectClass": sources_by_subject_class,
        "stats": {
            "pdfScanned": len(all_pdfs),
            "pdfMatched": len(pdf_records),
            "pdfSelected": len(selected),
            "chunks": len(chunk_entries),
            "keepUnmappedEnabled": keep_unmapped,
            "includeNonEnglishEnabled": include_non_english,
            "keptUnmappedChunks": kept_unmapped_chunks,
            "droppedUnmappedChunks": dropped_unmapped_chunks,
            "droppedNonEnglishChunks": dropped_non_english_chunks,
            "droppedInstructionChunks": dropped_instruction_chunks,
            "selectedYearMin": min((r.year for r in selected), default=None),
            "selectedYearMax": max((r.year for r in selected), default=None),
            "selectedPre2019Papers": sum(1 for r in selected if r.year < 2019),
        },
    }
    chapter_index_path.write_text(
        json.dumps(_clean_surrogates(chapter_index_payload), indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    if save_images or image_manifest_entries:
        image_manifest_path = output_dir / "paper_image_manifest.json"
        image_manifest_payload = {
            "version": "1",
            "generatedAt": datetime.utcnow().isoformat() + "Z",
            "datasetKind": "paper",
            "fitzAvailable": FITZ_AVAILABLE,
            "saveImagesEnabled": save_images,
            "ocrEnabled": bool(nvidia_api_key),
            "totalImages": len(image_manifest_entries),
            "images": image_manifest_entries,
        }
        image_manifest_path.write_text(
            json.dumps(image_manifest_payload, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )

    return (
        len(selected),
        len(chunk_entries),
        dropped_unmapped_chunks,
        kept_unmapped_chunks,
        dropped_non_english_chunks,
        dropped_instruction_chunks,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Build retrieval context artifacts from CBSE PDFs")
    parser.add_argument("--dataset-root", default="dataset/cbse_papers", help="Local dataset root")
    parser.add_argument("--output-dir", default="lib/context", help="Directory for context artifacts")
    parser.add_argument(
        "--max-files",
        type=int,
        default=0,
        help="Max ranked PDFs to index (0 = all matched PDFs)",
    )
    parser.add_argument("--max-pages", type=int, default=20, help="Max pages to extract per PDF")
    parser.add_argument("--chunk-words", type=int, default=DEFAULT_CHUNK_WORDS, help="Words per chunk")
    parser.add_argument("--chunk-overlap", type=int, default=DEFAULT_CHUNK_OVERLAP, help="Chunk overlap words")
    parser.add_argument(
        "--drop-unmapped",
        action="store_true",
        help="Drop chunks that could not be mapped to any chapter (default keeps them for broader subject retrieval)",
    )
    parser.add_argument(
        "--strict-english",
        action="store_true",
        help="Drop non-English chunks (default keeps all languages)",
    )
    parser.add_argument("--data-ts", default="lib/data.ts", help="Path to data.ts")
    parser.add_argument("--pyq-ts", default="lib/pyq.ts", help="Path to pyq.ts")

    parser.add_argument("--single-file", help="Single dataset-relative PDF path for on-demand extraction")
    parser.add_argument("--json-stdout", action="store_true", help="Print single-file JSON payload to stdout")
    parser.add_argument(
        "--extract-images",
        action="store_true",
        help="Detect image-bearing pages (requires pymupdf) and OCR them via NVIDIA API (requires NVIDIA_API_KEY)",
    )
    parser.add_argument(
        "--save-images",
        action="store_true",
        help="Render and save visually relevant pages into lib/context/images and emit a paper image manifest",
    )
    parser.add_argument(
        "--nvidia-api-key",
        default=None,
        help="NVIDIA API key for OCR (falls back to NVIDIA_API_KEY env var)",
    )

    args = parser.parse_args()

    dataset_root = Path(args.dataset_root).resolve()
    output_dir = Path(args.output_dir).resolve()
    data_ts = Path(args.data_ts).resolve()
    pyq_ts = Path(args.pyq_ts).resolve()

    if args.single_file:
        payload = resolve_single_file(dataset_root, args.single_file, max_pages=max(1, args.max_pages))
        if args.json_stdout:
            print(json.dumps(payload, ensure_ascii=False))
        else:
            print(payload["text"])
        return

    if PdfReader is None:
        raise SystemExit("pypdf is not installed. Run: pip install pypdf")
    if not dataset_root.exists():
        raise SystemExit(f"Dataset root not found: {dataset_root}")
    if not data_ts.exists():
        raise SystemExit(f"data.ts not found: {data_ts}")
    if not pyq_ts.exists():
        raise SystemExit(f"pyq.ts not found: {pyq_ts}")

    keep_unmapped = not args.drop_unmapped
    include_non_english = not args.strict_english
    nvidia_key = args.nvidia_api_key or os.environ.get("NVIDIA_API_KEY") or ""

    if (args.extract_images or args.save_images) and not FITZ_AVAILABLE:
        print("WARNING: visual extraction requires PyMuPDF. Install with: pip install pymupdf", file=sys.stderr)
    if args.extract_images and not nvidia_key:
        print("WARNING: --extract-images without NVIDIA_API_KEY — image detection only, no OCR.", file=sys.stderr)

    selected_count, chunk_count, dropped_unmapped_chunks, kept_unmapped_chunks, dropped_non_english_chunks, dropped_instruction_chunks = build_index(
        dataset_root=dataset_root,
        output_dir=output_dir,
        max_files=args.max_files,
        max_pages=max(1, args.max_pages),
        chunk_words_size=max(120, args.chunk_words),
        chunk_overlap=max(20, args.chunk_overlap),
        keep_unmapped=keep_unmapped,
        include_non_english=include_non_english,
        data_ts=data_ts,
        pyq_ts=pyq_ts,
        extract_images=args.extract_images,
        save_images=args.save_images,
        nvidia_api_key=nvidia_key if nvidia_key else None,
    )
    print(
        "Built context index: "
        f"selected_pdfs={selected_count}, chunks={chunk_count}, dropped_unmapped={dropped_unmapped_chunks}, "
        f"kept_unmapped={kept_unmapped_chunks}, dropped_non_english={dropped_non_english_chunks}, "
        f"dropped_instruction={dropped_instruction_chunks}, output={output_dir}"
    )


if __name__ == "__main__":
    main()
