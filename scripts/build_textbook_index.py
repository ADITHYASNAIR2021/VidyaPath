#!/usr/bin/env python3
"""
VidyaPath NCERT Textbook Semantic Chunk Builder
===============================================

Builds structural / semantic chunks from:
  dataset/ncert_textbooks/Class_{10,12}/<medium>/<subject>/*.pdf

Outputs:
  lib/context/textbook_chunks.jsonl
  lib/context/textbook_chapter_index.json

Optional:
  --merge-main-index
    Also merges textbook chunks into:
      lib/context/chunks.jsonl
      lib/context/chapter_index.json

Why semantic chunking:
  Fixed-size word splitting can separate question and answer context.
  This builder keeps headings, Q/A blocks, and paragraph boundaries together.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import logging
import re
import sys
import warnings
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple

try:
    from pypdf import PdfReader
except ImportError:  # pragma: no cover
    PdfReader = None  # type: ignore

warnings.filterwarnings("ignore", message=r".*Multiple definitions in dictionary.*")
logging.getLogger("pypdf").setLevel(logging.ERROR)

ROOT = Path(__file__).resolve().parent.parent
SRC_DIR = ROOT / "dataset" / "ncert_textbooks"
OUT_DIR = ROOT / "lib" / "context"
OUT_CHUNKS = OUT_DIR / "textbook_chunks.jsonl"
OUT_INDEX = OUT_DIR / "textbook_chapter_index.json"
MAIN_CHUNKS = OUT_DIR / "chunks.jsonl"
MAIN_INDEX = OUT_DIR / "chapter_index.json"
DATA_TS = ROOT / "lib" / "data.ts"

DEFAULT_TARGET_WORDS = 240
DEFAULT_MAX_WORDS = 360
DEFAULT_MIN_WORDS = 70

NON_PRINTABLE_RE = re.compile(r"[\x00-\x08\x0B\x0C\x0E-\x1F]+")
MULTI_SPACE_RE = re.compile(r"[ \t]+")
MULTI_BLANK_RE = re.compile(r"\n{3,}")
DEVANAGARI_RE = re.compile(r"[\u0900-\u097F]")
LATIN_WORD_RE = re.compile(r"[A-Za-z]{2,}")

LINE_HEADING_RE = re.compile(
    r"^(?:chapter|unit|exercise|section|summary|example|activity|note|appendix)\b",
    re.IGNORECASE,
)
QUESTION_START_RE = re.compile(
    r"^(?:q(?:uestion)?\.?\s*\d+|ques\.?\s*\d+|\d{1,2}[.)]|[ivxlcdm]{1,6}[.)])\s+",
    re.IGNORECASE,
)
ANSWER_START_RE = re.compile(r"^(?:ans(?:wer)?\.?|solution\.?)\s*", re.IGNORECASE)
SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?])\s+(?=[A-Z0-9(])")

CHAPTER_META_RE = re.compile(
    r"id:\s*'(?P<id>[^']+)'.*?"
    r"classLevel:\s*(?P<class>\d+).*?"
    r"subject:\s*'(?P<subject>[^']+)'.*?"
    r"chapterNumber:\s*(?P<number>\d+).*?"
    r"title:\s*'(?P<title>[^']+)'",
    re.DOTALL,
)


@dataclass
class ChapterMeta:
    chapter_id: str
    class_level: int
    subject: str
    chapter_number: int
    title: str


@dataclass
class TextbookChunk:
    id: str
    sourceType: str
    chapterId: str
    classLevel: int
    subject: str
    chapterNumber: int
    chapterTitle: str
    medium: str
    language: str
    sourcePath: str
    chunkIndex: int
    wordCount: int
    text: str


def slugify(value: str) -> str:
    normalized = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return normalized or "unknown"


def utc_now_iso() -> str:
    return datetime.now(tz=timezone.utc).isoformat().replace("+00:00", "Z")


def normalize_subject(raw: str) -> str:
    token = raw.lower().replace("_", " ").replace("-", " ").strip()
    if any(k in token for k in ["physics", "bhautiki"]):
        return "Physics"
    if any(k in token for k in ["chem", "rasayan"]):
        return "Chemistry"
    if any(k in token for k in ["biology", "bio", "jeev vigyan"]):
        return "Biology"
    if any(k in token for k in ["math", "mathematics", "ganit"]):
        return "Math"
    if any(k in token for k in ["accountancy", "accounts", "lekhashastra"]):
        return "Accountancy"
    if any(k in token for k in ["business studies", "business", "vyavsay"]):
        return "Business Studies"
    if any(k in token for k in ["economics", "arthashastra", "macro", "micro"]):
        return "Economics"
    if "science" in token and "social science" not in token:
        return "Science"
    if "english" in token:
        return "English Core"
    return " ".join(part.capitalize() for part in token.split())


def parse_code_and_chapter_number(stem: str) -> Tuple[str, int]:
    lower = stem.lower().strip()
    match = re.match(r"^(?P<prefix>[a-z]+)(?P<suffix>\d{2,3}|ps|ans)$", lower)
    if not match:
        return lower, 0

    prefix = match.group("prefix")
    suffix = match.group("suffix")
    if suffix in {"ps", "ans"}:
        return prefix, 0

    n = int(suffix)
    # NCERT style: 101 -> ch 1, 114 -> ch 14, 201 -> ch 1, 05 -> ch 5
    if n >= 100:
        chapter_number = ((n - 1) % 100) + 1
    else:
        chapter_number = n
    return prefix, chapter_number


def detect_language(text: str) -> str:
    devanagari_count = len(DEVANAGARI_RE.findall(text))
    latin_count = len(LATIN_WORD_RE.findall(text))
    alpha_total = max(1, devanagari_count + latin_count)
    devanagari_ratio = devanagari_count / alpha_total
    latin_ratio = latin_count / alpha_total
    if latin_ratio >= 0.62:
        return "en"
    if devanagari_ratio >= 0.55:
        return "hi"
    return "mixed"


def load_chapter_meta(data_ts_path: Path) -> Tuple[Dict[str, ChapterMeta], Dict[Tuple[int, str, int], ChapterMeta]]:
    if not data_ts_path.exists():
        return {}, {}

    content = data_ts_path.read_text(encoding="utf-8", errors="ignore")
    by_id: Dict[str, ChapterMeta] = {}
    by_key: Dict[Tuple[int, str, int], ChapterMeta] = {}

    for match in CHAPTER_META_RE.finditer(content):
        chapter = ChapterMeta(
            chapter_id=match.group("id"),
            class_level=int(match.group("class")),
            subject=match.group("subject").strip(),
            chapter_number=int(match.group("number")),
            title=match.group("title").replace("\\'", "'").strip(),
        )
        by_id[chapter.chapter_id] = chapter
        by_key[(chapter.class_level, chapter.subject, chapter.chapter_number)] = chapter

    return by_id, by_key


def extract_pdf_text(pdf_path: Path) -> str:
    if PdfReader is None:
        raise RuntimeError("pypdf not installed. Run: pip install pypdf")

    reader = PdfReader(str(pdf_path))
    lines: List[str] = []
    for page in reader.pages:
        try:
            page_text = page.extract_text() or ""
        except Exception:
            page_text = ""
        if not page_text.strip():
            continue
        lines.extend(page_text.splitlines())

    cleaned_lines: List[str] = []
    for raw in lines:
        line = NON_PRINTABLE_RE.sub(" ", raw).strip()
        line = MULTI_SPACE_RE.sub(" ", line)
        if not line:
            cleaned_lines.append("")
            continue
        lower = line.lower()
        if "rationalised 2023-24" in lower:
            continue
        if "reprint 2024-25" in lower:
            continue
        if re.fullmatch(r"\d{1,3}", line):
            continue
        if lower in {"ncert", "national council of educational research and training"}:
            continue
        cleaned_lines.append(line)

    joined = "\n".join(cleaned_lines)
    joined = MULTI_BLANK_RE.sub("\n\n", joined)
    return joined.strip()


def is_heading_line(line: str) -> bool:
    if not line:
        return False
    if LINE_HEADING_RE.match(line):
        return True
    if len(line) <= 80 and line == line.upper() and re.search(r"[A-Z]", line):
        return True
    if re.match(r"^(chapter|unit)\s+\d+", line, re.IGNORECASE):
        return True
    return False


def split_paragraphs(text: str) -> List[str]:
    blocks = [block.strip() for block in re.split(r"\n\s*\n", text) if block.strip()]
    normalized: List[str] = []
    for block in blocks:
        parts = [MULTI_SPACE_RE.sub(" ", ln.strip()) for ln in block.splitlines() if ln.strip()]
        if not parts:
            continue
        if len(parts) == 1:
            normalized.append(parts[0])
            continue
        # Keep heading line isolated so it can anchor semantic chunks.
        if is_heading_line(parts[0]):
            normalized.append(parts[0])
            rest = " ".join(parts[1:]).strip()
            if rest:
                normalized.append(rest)
            continue
        normalized.append(" ".join(parts))
    return normalized


def merge_question_answer_blocks(paragraphs: List[str]) -> List[str]:
    if not paragraphs:
        return []

    out: List[str] = []
    qa_buffer: List[str] = []

    def flush_qa() -> None:
        nonlocal qa_buffer
        if qa_buffer:
            out.append(" ".join(qa_buffer).strip())
            qa_buffer = []

    for para in paragraphs:
        head = para[:120]
        starts_question = bool(QUESTION_START_RE.match(head))
        starts_answer = bool(ANSWER_START_RE.match(head))
        heading = is_heading_line(head)

        if heading and not starts_question and not starts_answer:
            flush_qa()
            out.append(para)
            continue

        if starts_question:
            flush_qa()
            qa_buffer = [para]
            continue

        if qa_buffer:
            qa_buffer.append(para)
            # Close Q/A block when next strong boundary appears later.
            if len(" ".join(qa_buffer).split()) >= DEFAULT_TARGET_WORDS:
                flush_qa()
            continue

        if starts_answer:
            # Answer without explicit preceding question still forms semantic unit.
            qa_buffer = [para]
            continue

        out.append(para)

    flush_qa()
    return [item for item in out if item.strip()]


def split_oversized_unit(unit: str, max_words: int) -> List[str]:
    words = unit.split()
    if len(words) <= max_words:
        return [unit]

    sentences = [seg.strip() for seg in SENTENCE_SPLIT_RE.split(unit) if seg.strip()]
    if len(sentences) <= 1:
        chunks: List[str] = []
        cursor = 0
        while cursor < len(words):
            chunk_words = words[cursor : cursor + max_words]
            if not chunk_words:
                break
            chunks.append(" ".join(chunk_words))
            cursor += max_words
        return chunks

    out: List[str] = []
    buffer: List[str] = []
    for sentence in sentences:
        candidate = " ".join(buffer + [sentence]).strip()
        if len(candidate.split()) > max_words and buffer:
            out.append(" ".join(buffer).strip())
            buffer = [sentence]
        else:
            buffer.append(sentence)
    if buffer:
        out.append(" ".join(buffer).strip())
    return [item for item in out if item]


def semantic_chunk(text: str, target_words: int, max_words: int, min_words: int) -> List[str]:
    paragraphs = split_paragraphs(text)
    if not paragraphs:
        return []

    units = merge_question_answer_blocks(paragraphs)
    expanded_units: List[str] = []
    for unit in units:
        expanded_units.extend(split_oversized_unit(unit, max_words=max_words))

    chunks: List[str] = []
    buffer: List[str] = []
    buffer_words = 0

    def flush_buffer(force: bool = False) -> None:
        nonlocal buffer, buffer_words
        if not buffer:
            return
        text_chunk = " ".join(buffer).strip()
        wc = len(text_chunk.split())
        if wc < min_words and chunks and not force:
            # Merge short tail with previous chunk.
            chunks[-1] = f"{chunks[-1]} {text_chunk}".strip()
        else:
            chunks.append(text_chunk)
        buffer = []
        buffer_words = 0

    for unit in expanded_units:
        unit_words = len(unit.split())
        heading_unit = is_heading_line(unit[:120])
        would_exceed = (buffer_words + unit_words) > max_words
        reached_target = buffer_words >= target_words

        if buffer and (would_exceed or (heading_unit and reached_target)):
            flush_buffer()

        buffer.append(unit)
        buffer_words += unit_words

        if buffer_words >= target_words and not heading_unit:
            flush_buffer()

    flush_buffer(force=True)
    return [item for item in chunks if len(item.split()) >= min_words]


def iter_pdfs(
    root: Path,
    class_filter: Optional[int],
    subject_filter: Optional[str],
    medium_filter: Optional[str],
) -> Iterable[Tuple[Path, int, str, str, str]]:
    """
    Yield:
      (pdf_path, class_level, medium, subject_raw, subject_normalized)
    """
    if not root.exists():
        return

    for pdf in sorted(root.rglob("*.pdf")):
        try:
            rel = pdf.relative_to(root)
        except ValueError:
            continue
        parts = rel.parts
        if len(parts) < 3:
            continue

        class_token = parts[0]
        if not class_token.startswith("Class_"):
            continue
        try:
            class_level = int(class_token.split("_", 1)[1])
        except Exception:
            continue

        medium = parts[1] if len(parts) >= 4 else "Unknown"
        subject_raw = parts[2] if len(parts) >= 4 else parts[1]
        subject_normalized = normalize_subject(subject_raw)

        if class_filter and class_filter != class_level:
            continue
        if medium_filter and medium_filter.lower() != medium.lower():
            continue
        if subject_filter and subject_filter.lower() not in {
            subject_raw.lower(),
            subject_normalized.lower(),
        }:
            continue

        yield pdf, class_level, medium, subject_raw, subject_normalized


def resolve_chapter_identity(
    class_level: int,
    subject_normalized: str,
    chapter_number: int,
    chapter_code: str,
    chapter_meta_by_key: Dict[Tuple[int, str, int], ChapterMeta],
) -> Tuple[str, int, str]:
    if chapter_number > 0:
        key = (class_level, subject_normalized, chapter_number)
        chapter = chapter_meta_by_key.get(key)
        if chapter:
            return chapter.chapter_id, chapter.chapter_number, chapter.title

        if class_level == 10 and subject_normalized == "Science":
            for science_subject in ("Chemistry", "Biology", "Physics"):
                chapter = chapter_meta_by_key.get((10, science_subject, chapter_number))
                if chapter:
                    return chapter.chapter_id, chapter.chapter_number, chapter.title

    chapter_num = chapter_number if chapter_number > 0 else 0
    suffix = f"{chapter_code}-{chapter_num:02d}" if chapter_num > 0 else chapter_code
    synthetic = f"tb-c{class_level}-{slugify(subject_normalized)}-{slugify(suffix)}"
    chapter_title = (
        f"{subject_normalized} Chapter {chapter_num}"
        if chapter_num > 0
        else f"{subject_normalized} Textbook {chapter_code.upper()}"
    )
    return synthetic, chapter_num, chapter_title


def parse_existing_index_map(index_path: Path) -> Dict[str, List[str]]:
    if not index_path.exists():
        return {}
    try:
        payload = json.loads(index_path.read_text(encoding="utf-8"))
    except Exception:
        return {}

    chapters = payload.get("chapters")
    if not isinstance(chapters, dict):
        return {}

    normalized: Dict[str, List[str]] = {}
    for chapter_id, value in chapters.items():
        if not isinstance(chapter_id, str):
            continue
        if isinstance(value, list):
            normalized[chapter_id] = [str(item) for item in value if isinstance(item, str)]
            continue
        if isinstance(value, dict):
            sources = value.get("sources")
            if isinstance(sources, list):
                normalized[chapter_id] = [str(item) for item in sources if isinstance(item, str)]
    return normalized


def merge_into_main_index(
    textbook_chunks: List[TextbookChunk],
    chapter_sources: Dict[str, List[str]],
) -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    existing_lines: List[str] = []
    seen_ids = set()
    if MAIN_CHUNKS.exists():
        for line in MAIN_CHUNKS.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except Exception:
                continue
            chunk_id = obj.get("id")
            if isinstance(chunk_id, str):
                seen_ids.add(chunk_id)
            existing_lines.append(line)

    additions = 0
    for chunk in textbook_chunks:
        if chunk.id in seen_ids:
            continue
        existing_lines.append(json.dumps(asdict(chunk), ensure_ascii=False))
        seen_ids.add(chunk.id)
        additions += 1

    MAIN_CHUNKS.write_text("\n".join(existing_lines) + ("\n" if existing_lines else ""), encoding="utf-8")

    main_payload: Dict[str, object]
    if MAIN_INDEX.exists():
        try:
            main_payload = json.loads(MAIN_INDEX.read_text(encoding="utf-8"))
            if not isinstance(main_payload, dict):
                main_payload = {}
        except Exception:
            main_payload = {}
    else:
        main_payload = {}

    chapters = parse_existing_index_map(MAIN_INDEX)
    for chapter_id, sources in chapter_sources.items():
        current = chapters.setdefault(chapter_id, [])
        for source in sources:
            if source not in current:
                current.append(source)

    source_map = main_payload.get("sourcesBySubjectClass")
    if not isinstance(source_map, dict):
        source_map = {}
    for chunk in textbook_chunks:
        key = f"{chunk.classLevel}|{chunk.subject}"
        current = source_map.get(key)
        if not isinstance(current, list):
            current = []
        if chunk.sourcePath not in current:
            current.append(chunk.sourcePath)
        source_map[key] = current[:200]

    stats = main_payload.get("stats")
    if not isinstance(stats, dict):
        stats = {}
    stats["textbookChunksMerged"] = additions
    stats["textbookChaptersMerged"] = len(chapter_sources)

    main_payload["version"] = str(main_payload.get("version") or "2")
    main_payload["generatedAt"] = utc_now_iso()
    main_payload["chapters"] = chapters
    main_payload["sourcesBySubjectClass"] = source_map
    main_payload["stats"] = stats

    MAIN_INDEX.write_text(json.dumps(main_payload, indent=2, ensure_ascii=False), encoding="utf-8")


def build_semantic_index(
    class_filter: Optional[int],
    subject_filter: Optional[str],
    medium_filter: Optional[str],
    language_filter: str,
    target_words: int,
    max_words: int,
    min_words: int,
    merge_main_index: bool,
) -> int:
    if PdfReader is None:
        print("ERROR: pypdf is not installed. Run: pip install pypdf", file=sys.stderr)
        return 1
    if not SRC_DIR.exists():
        print(f"ERROR: {SRC_DIR} not found", file=sys.stderr)
        return 1

    _, chapter_meta_by_key = load_chapter_meta(DATA_TS)
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    chunks: List[TextbookChunk] = []
    chapter_to_sources: Dict[str, List[str]] = {}
    chapter_to_chunk_ids: Dict[str, List[str]] = {}
    skipped: List[str] = []

    total_pdf = 0
    language_counts: Dict[str, int] = {"en": 0, "hi": 0, "mixed": 0}

    for pdf_path, class_level, medium, subject_raw, subject_normalized in iter_pdfs(
        SRC_DIR, class_filter, subject_filter, medium_filter
    ):
        total_pdf += 1
        rel = pdf_path.relative_to(ROOT).as_posix()
        chapter_code, chapter_number = parse_code_and_chapter_number(pdf_path.stem)

        # Skip preface/answers synthetic PDFs to reduce noise.
        if chapter_number == 0 and chapter_code.endswith(("ps", "ans")):
            skipped.append(rel)
            continue

        try:
            raw_text = extract_pdf_text(pdf_path)
        except Exception as exc:
            print(f"[ERR ] {rel} - {exc}", file=sys.stderr)
            skipped.append(rel)
            continue

        if len(raw_text.split()) < min_words:
            skipped.append(rel)
            continue

        detected_lang = detect_language(raw_text)
        language_counts[detected_lang] = language_counts.get(detected_lang, 0) + 1
        if language_filter != "all" and detected_lang != language_filter:
            skipped.append(rel)
            continue

        chapter_id, resolved_number, chapter_title = resolve_chapter_identity(
            class_level=class_level,
            subject_normalized=subject_normalized,
            chapter_number=chapter_number,
            chapter_code=chapter_code,
            chapter_meta_by_key=chapter_meta_by_key,
        )

        semantic_chunks = semantic_chunk(
            text=raw_text,
            target_words=target_words,
            max_words=max_words,
            min_words=min_words,
        )
        if not semantic_chunks:
            skipped.append(rel)
            continue

        created = 0
        for idx, piece in enumerate(semantic_chunks):
            piece = piece.strip()
            if not piece:
                continue
            word_count = len(piece.split())
            if word_count < min_words:
                continue

            digest = hashlib.sha1(f"{rel}|{idx}|{piece[:240]}".encode("utf-8")).hexdigest()[:10]
            chunk_id = f"{chapter_id}::tb{idx:03d}::{digest}"
            chunk = TextbookChunk(
                id=chunk_id,
                sourceType="textbook",
                chapterId=chapter_id,
                classLevel=class_level,
                subject=subject_normalized,
                chapterNumber=resolved_number,
                chapterTitle=chapter_title,
                medium=medium,
                language=detected_lang,
                sourcePath=rel,
                chunkIndex=idx,
                wordCount=word_count,
                text=piece,
            )
            chunks.append(chunk)
            chapter_to_chunk_ids.setdefault(chapter_id, []).append(chunk_id)
            sources = chapter_to_sources.setdefault(chapter_id, [])
            if rel not in sources:
                sources.append(rel)
            created += 1

        print(f"[OK  ] {rel} -> {created} semantic chunks")

    with OUT_CHUNKS.open("w", encoding="utf-8") as handle:
        for chunk in chunks:
            handle.write(json.dumps(asdict(chunk), ensure_ascii=False) + "\n")

    subject_source_buckets: Dict[str, List[str]] = {}
    for chunk in chunks:
        key = f"{chunk.classLevel}|{chunk.subject}"
        current = subject_source_buckets.setdefault(key, [])
        if chunk.sourcePath not in current:
            current.append(chunk.sourcePath)

    index_payload = {
        "version": "1",
        "generatedAt": utc_now_iso(),
        "datasetRoot": SRC_DIR.as_posix(),
        "chunkStrategy": "semantic-structural",
        "targetWords": target_words,
        "maxWords": max_words,
        "minWords": min_words,
        "totalPdfsScanned": total_pdf,
        "totalChunks": len(chunks),
        "languageCounts": language_counts,
        "chapters": chapter_to_sources,
        "chunksByChapter": chapter_to_chunk_ids,
        "sourcesBySubjectClass": subject_source_buckets,
        "skipped": skipped,
    }
    OUT_INDEX.write_text(json.dumps(index_payload, indent=2, ensure_ascii=False), encoding="utf-8")

    if merge_main_index:
        merge_into_main_index(chunks, chapter_to_sources)

    print(
        "\nDone.\n"
        f"  PDFs scanned     : {total_pdf}\n"
        f"  Chunks generated : {len(chunks)}\n"
        f"  Skipped PDFs     : {len(skipped)}\n"
        f"  textbook_chunks  : {OUT_CHUNKS.relative_to(ROOT)}\n"
        f"  textbook_index   : {OUT_INDEX.relative_to(ROOT)}"
    )
    if merge_main_index:
        print(f"  merged_main      : {MAIN_CHUNKS.relative_to(ROOT)}, {MAIN_INDEX.relative_to(ROOT)}")

    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Build semantic/structural NCERT textbook chunks")
    parser.add_argument("--class", dest="class_filter", type=int, choices=[10, 12])
    parser.add_argument("--subject", dest="subject_filter")
    parser.add_argument("--medium", dest="medium_filter")
    parser.add_argument("--language", choices=["all", "en", "hi", "mixed"], default="all")
    parser.add_argument("--target-words", type=int, default=DEFAULT_TARGET_WORDS)
    parser.add_argument("--max-words", type=int, default=DEFAULT_MAX_WORDS)
    parser.add_argument("--min-words", type=int, default=DEFAULT_MIN_WORDS)
    parser.add_argument(
        "--merge-main-index",
        action="store_true",
        help="Also merge textbook chunks into lib/context/chunks.jsonl + chapter_index.json",
    )
    args = parser.parse_args()

    if args.min_words <= 0:
        print("ERROR: --min-words must be > 0", file=sys.stderr)
        return 1
    if args.target_words < args.min_words:
        print("ERROR: --target-words must be >= --min-words", file=sys.stderr)
        return 1
    if args.max_words < args.target_words:
        print("ERROR: --max-words must be >= --target-words", file=sys.stderr)
        return 1

    return build_semantic_index(
        class_filter=args.class_filter,
        subject_filter=args.subject_filter,
        medium_filter=args.medium_filter,
        language_filter=args.language,
        target_words=args.target_words,
        max_words=args.max_words,
        min_words=args.min_words,
        merge_main_index=args.merge_main_index,
    )


if __name__ == "__main__":
    raise SystemExit(main())
