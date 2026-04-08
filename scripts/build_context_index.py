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
import re
import sys
import time
import warnings
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple

try:
    from pypdf import PdfReader
except ImportError:  # pragma: no cover - handled gracefully for users
    PdfReader = None

warnings.filterwarnings("ignore", message=r".*Multiple definitions in dictionary.*")
logging.getLogger("pypdf").setLevel(logging.ERROR)


CURRENT_YEAR = 2026
MIN_CHUNK_WORDS = 80
DEFAULT_CHUNK_WORDS = 260
DEFAULT_CHUNK_OVERLAP = 48
MIN_ENGLISH_WORDS_PER_CHUNK = 28
MIN_ENGLISH_RATIO = 0.7

DEVANAGARI_RE = re.compile(r"[\u0900-\u097F]+")
NON_ASCII_RE = re.compile(r"[^\x09\x0A\x0D\x20-\x7E]+")


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
    text = text.replace("\x00", " ")
    text = text.replace("Rationalised 2023-24", " ")
    # Remove common exam-instruction boilerplate that hurts chapter mapping quality
    text = re.sub(
        r"\b(?:General Instructions|Time allowed|Maximum Marks)\b.*?(?=(Section\s+[A-E]|Q\.?\s*1|$))",
        " ",
        text,
        flags=re.I | re.S,
    )
    text = re.sub(
        r"\b(?:Read the following instructions carefully)\b.*?(?=(Section\s+[A-E]|Q\.?\s*1|$))",
        " ",
        text,
        flags=re.I | re.S,
    )
    text = re.sub(r"Candidates must write the Q\.P\. Code.*?(?=(Section\s+[A-E]|Q\.?\s*1|$))", " ", text, flags=re.I | re.S)
    text = DEVANAGARI_RE.sub(" ", text)
    text = NON_ASCII_RE.sub(" ", text)
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
    match = re.search(r"class_(10|12)/([^/]+)/", lower)
    candidate = (match.group(2) if match else lower).strip()
    token = re.sub(r"[^a-z]+", " ", candidate).strip()

    # Hard exclusions to prevent leaking non-target subjects into context
    if any(x in token for x in ["social science", "home science", "physical education", "physical activity", "economics", "history", "geography"]):
        return None

    if class_level == 10:
        if any(x in token for x in ["math", "mathematics"]):
            return "Math"
        if any(x in token for x in ["science", "scince", "physics", "chemistry", "biology"]):
            return "Science"
        return None

    if any(x in token for x in ["physics", "applied physics"]):
        return "Physics"
    if any(x in token for x in ["chemistry", "chem"]):
        return "Chemistry"
    if any(x in token for x in ["biology", "bio"]) and "biotech" not in token:
        return "Biology"
    if any(x in token for x in ["math", "mathematics", "applied mathematics"]):
        return "Math"
    return None


def parse_pdf_record(dataset_root: Path, file_path: Path, pyq_year_buckets: Set[Tuple[int, str, int]]) -> Optional[PdfRecord]:
    relative_path = file_path.relative_to(dataset_root).as_posix()
    if ".zip_extracted/" in relative_path.lower():
        return None
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
    if "solution" in filename:
        noise_penalty -= 2.5
    if "sample" in filename:
        noise_penalty -= 1.5
    if "marking" in filename:
        noise_penalty -= 1.0

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
            page_text = page.extract_text() or ""
            if page_text.strip():
                out.append(page_text)
        return clean_text("\n".join(out))
    except Exception:
        return ""


def chunk_words(text: str, size: int = DEFAULT_CHUNK_WORDS, overlap: int = DEFAULT_CHUNK_OVERLAP) -> List[str]:
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
    data_ts: Path,
    pyq_ts: Path,
) -> Tuple[int, int, int, int, int]:
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

        chunks = chunk_words(raw_text, size=chunk_words_size, overlap=chunk_overlap)
        if not chunks:
            progress("Extracting chunks", idx, len(selected), extract_started)
            continue

        chapter_pool = chapter_candidates_for_subject(chapters, record.class_level, record.subject)
        for chunk_text in chunks:
            chunk_text = clean_text(chunk_text)
            if not chunk_text:
                continue
            if is_instruction_chunk(chunk_text):
                dropped_instruction_chunks += 1
                continue
            if not is_english_chunk(chunk_text):
                dropped_non_english_chunks += 1
                continue
            chapter_id = map_chunk_to_chapter(chunk_text, chapter_pool)
            if not chapter_id:
                dropped_unmapped_chunks += 1
                continue

            entry = {
                "id": f"ctx-{chunk_counter:07d}",
                "classLevel": record.class_level,
                "subject": record.subject,
                "chapterId": chapter_id,
                "year": record.year,
                "paperType": record.paper_type,
                "sourcePath": record.relative_path,
                "text": chunk_text,
            }
            chunk_entries.append(entry)
            chunk_counter += 1

            if chapter_id:
                current = chapters_map.setdefault(chapter_id, [])
                if record.relative_path not in current and len(current) < 12:
                    current.append(record.relative_path)
        progress("Extracting chunks", idx, len(selected), extract_started)
    progress("Extracting chunks", len(selected), len(selected), extract_started, force_line=True)

    output_dir.mkdir(parents=True, exist_ok=True)
    chunks_path = output_dir / "chunks.jsonl"
    chapter_index_path = output_dir / "chapter_index.json"

    with chunks_path.open("w", encoding="utf-8") as f:
        for entry in chunk_entries:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")

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
            "droppedUnmappedChunks": dropped_unmapped_chunks,
            "droppedNonEnglishChunks": dropped_non_english_chunks,
            "droppedInstructionChunks": dropped_instruction_chunks,
            "selectedYearMin": min((r.year for r in selected), default=None),
            "selectedYearMax": max((r.year for r in selected), default=None),
            "selectedPre2019Papers": sum(1 for r in selected if r.year < 2019),
        },
    }
    chapter_index_path.write_text(
        json.dumps(chapter_index_payload, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )

    return len(selected), len(chunk_entries), dropped_unmapped_chunks, dropped_non_english_chunks, dropped_instruction_chunks


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
    parser.add_argument("--max-pages", type=int, default=3, help="Max pages to extract per PDF")
    parser.add_argument("--chunk-words", type=int, default=DEFAULT_CHUNK_WORDS, help="Words per chunk")
    parser.add_argument("--chunk-overlap", type=int, default=DEFAULT_CHUNK_OVERLAP, help="Chunk overlap words")
    parser.add_argument("--data-ts", default="lib/data.ts", help="Path to data.ts")
    parser.add_argument("--pyq-ts", default="lib/pyq.ts", help="Path to pyq.ts")

    parser.add_argument("--single-file", help="Single dataset-relative PDF path for on-demand extraction")
    parser.add_argument("--json-stdout", action="store_true", help="Print single-file JSON payload to stdout")

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

    selected_count, chunk_count, dropped_unmapped_chunks, dropped_non_english_chunks, dropped_instruction_chunks = build_index(
        dataset_root=dataset_root,
        output_dir=output_dir,
        max_files=args.max_files,
        max_pages=max(1, args.max_pages),
        chunk_words_size=max(120, args.chunk_words),
        chunk_overlap=max(20, args.chunk_overlap),
        data_ts=data_ts,
        pyq_ts=pyq_ts,
    )
    print(
        "Built context index: "
        f"selected_pdfs={selected_count}, chunks={chunk_count}, dropped_unmapped={dropped_unmapped_chunks}, "
        f"dropped_non_english={dropped_non_english_chunks}, dropped_instruction={dropped_instruction_chunks}, output={output_dir}"
    )


if __name__ == "__main__":
    main()
