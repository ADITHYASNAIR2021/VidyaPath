from __future__ import annotations

import base64
import json
import re
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional

try:
    import fitz  # type: ignore

    FITZ_AVAILABLE = True
except ImportError:  # pragma: no cover
    fitz = None  # type: ignore[assignment]
    FITZ_AVAILABLE = False

NVIDIA_OCR_ENDPOINT = "https://ai.api.nvidia.com/v1/cv/nvidia/nemotron-ocr-v1"
MIN_IMAGE_DIMENSION = 80

VISUAL_TEXT_PATTERNS = {
    "diagram": re.compile(r"\b(diagram|figure|label the|labelled|ray diagram|circuit)\b", re.I),
    "table": re.compile(r"\b(table|tabular|column|row)\b", re.I),
    "graph": re.compile(r"\b(graph|plot|histogram|bar graph|line graph)\b", re.I),
    "map": re.compile(r"\b(map|atlas)\b", re.I),
    "flowchart": re.compile(r"\b(flow chart|flowchart)\b", re.I),
    "equation": re.compile(r"\b(equation|formula|balanced reaction|reaction)\b|=", re.I),
}


@dataclass
class VisualPageCandidate:
    page_num: int
    reasons: List[str]
    tags: List[str]
    width: Optional[int] = None
    height: Optional[int] = None


def unique(items: List[str]) -> List[str]:
    return list(dict.fromkeys(items))


def infer_visual_tags(text: str) -> List[str]:
    hits = [tag for tag, pattern in VISUAL_TEXT_PATTERNS.items() if pattern.search(text or "")]
    return unique(hits)


def detect_visual_pages(pdf_path: Path, max_pages: Optional[int] = None) -> List[VisualPageCandidate]:
    if not FITZ_AVAILABLE:
        return []
    candidates: List[VisualPageCandidate] = []
    try:
        doc = fitz.open(str(pdf_path))
        total_pages = len(doc)
        limit = min(total_pages, max_pages) if isinstance(max_pages, int) and max_pages > 0 else total_pages
        for page_num in range(limit):
            page = doc[page_num]
            reasons: List[str] = []

            images = page.get_images(full=True)
            if images:
                reasons.append("embedded-image")

            try:
                drawings = page.get_drawings()
            except Exception:
                drawings = []
            if drawings and len(drawings) >= 8:
                reasons.append("vector-drawing")

            page_text = page.get_text("text") or ""
            tags = infer_visual_tags(page_text)
            if tags:
                reasons.append("text-marker")

            if reasons:
                rect = page.rect
                candidates.append(
                    VisualPageCandidate(
                        page_num=page_num,
                        reasons=unique(reasons),
                        tags=tags,
                        width=int(rect.width),
                        height=int(rect.height),
                    )
                )
        doc.close()
    except Exception:
        return []
    return candidates


def render_page_png_bytes(pdf_path: Path, page_num: int, dpi: int = 160) -> Optional[tuple[bytes, int, int]]:
    if not FITZ_AVAILABLE:
        return None
    try:
        doc = fitz.open(str(pdf_path))
        page = doc[page_num]
        mat = fitz.Matrix(dpi / 72.0, dpi / 72.0)
        pix = page.get_pixmap(matrix=mat, colorspace=fitz.csRGB, alpha=False)
        if pix.width < MIN_IMAGE_DIMENSION or pix.height < MIN_IMAGE_DIMENSION:
            doc.close()
            return None
        data = pix.tobytes("png")
        width = pix.width
        height = pix.height
        doc.close()
        return data, width, height
    except Exception:
        return None


def render_page_as_base64(pdf_path: Path, page_num: int, dpi: int = 160) -> Optional[str]:
    rendered = render_page_png_bytes(pdf_path, page_num=page_num, dpi=dpi)
    if not rendered:
        return None
    data, _, _ = rendered
    return base64.b64encode(data).decode("utf-8")


def _sanitize_path_part(part: str) -> str:
    """Strip trailing spaces/dots — Windows forbids them in dir/file names."""
    return part.strip().rstrip(". ")


def build_image_output_path(
    output_root: Path,
    dataset_kind: str,
    dataset_relative_path: str,
    page_num: int,
) -> Path:
    rel = Path(dataset_relative_path.replace("\\", "/"))
    stem = _sanitize_path_part(rel.stem)
    # Sanitize every component of the parent path to strip trailing spaces/dots
    sanitized_parts = [_sanitize_path_part(p) for p in rel.parent.parts if p not in (".", "/", "\\")]
    parent = Path(*sanitized_parts) if sanitized_parts else Path(".")
    return output_root / dataset_kind / parent / stem / f"page-{page_num + 1:03d}.png"


def save_rendered_page_image(
    pdf_path: Path,
    dataset_kind: str,
    dataset_relative_path: str,
    page_num: int,
    output_root: Path,
    dpi: int = 160,
) -> Optional[dict]:
    try:
        rendered = render_page_png_bytes(pdf_path, page_num=page_num, dpi=dpi)
        if not rendered:
            return None
        data, width, height = rendered
        out_path = build_image_output_path(output_root, dataset_kind, dataset_relative_path, page_num)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_bytes(data)
        return {
            "imagePath": out_path.as_posix(),
            "page": page_num,
            "width": width,
            "height": height,
            "dpi": dpi,
        }
    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning(
            "save_rendered_page_image: skipped page %d of %s — %s: %s",
            page_num, dataset_relative_path, type(exc).__name__, exc,
        )
        return None


def ocr_page_via_nvidia(base64_image: str, api_key: str) -> str:
    payload = json.dumps(
        {
            "model": "nvidia/nemotron-ocr-v1",
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image_url",
                            "image_url": {"url": f"data:image/png;base64,{base64_image}"},
                        },
                        {
                            "type": "text",
                            "text": (
                                "Extract all visible text, equations, table values, and diagram labels from this page. "
                                "Keep the output concise but faithful. Return plain text only."
                            ),
                        },
                    ],
                }
            ],
            "max_tokens": 1400,
        }
    ).encode("utf-8")
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
