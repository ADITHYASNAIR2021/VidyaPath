"""Repair existing source metadata without re-extracting PDFs or recomputing text-only vectors.
Default is a dry run. --apply backs up and updates the local generated artifacts only.
"""
import argparse
import json
import shutil
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from textbook_identity import match_textbook_chapter
import fitz

ROOT = Path(__file__).resolve().parent.parent
DIRECTORY = ROOT / "lib" / "context"


def source_key(value):
    return value.replace("\\", "/").removeprefix("dataset/ncert_textbooks/")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    chapters = json.loads((DIRECTORY / "retrieval_manifest.json").read_text(encoding="utf-8"))["chapters"]
    rows = [json.loads(line) for line in (DIRECTORY / "textbook_chunks.jsonl").read_text(encoding="utf-8").splitlines() if line.strip()]
    groups = defaultdict(list)
    for row in rows:
        groups[source_key(row["sourcePath"])].append(row)
    resolutions = {}
    changes = []
    for source, group in groups.items():
        ordered = sorted(group, key=lambda row: row.get("chunkIndex", 0))
        text = " ".join(row["text"] for row in ordered[:5])
        pdf = (ROOT / "dataset/ncert_textbooks" / source).resolve()
        dataset = (ROOT / "dataset/ncert_textbooks").resolve()
        if dataset in pdf.parents and pdf.exists():
            try:
                with fitz.open(pdf) as document:
                    text = "\n".join(document.load_page(page).get_text() for page in range(min(8, len(document))))
            except Exception:
                pass
        first = ordered[0]
        matched, method, confidence = match_textbook_chapter(text, first["classLevel"], first["subject"], chapters)
        if matched:
            resolutions[source] = {"chapterId": matched["id"], "chapterTitle": matched["title"], "chapterNumber": matched["chapterNumber"], "mappingMethod": method, "mappingConfidence": confidence}
            if any(row.get("chapterId") != matched["id"] for row in group):
                changes.append({"source": source, "previous": first.get("chapterId"), "corrected": matched["id"], "method": method})
        else:
            # Keep evidence available for broad search without claiming an unverified chapter.
            resolutions[source] = {"chapterId": None, "chapterTitle": "Unresolved textbook chapter", "chapterNumber": None, "mappingMethod": method, "mappingConfidence": 0}
            if first.get("chapterId"):
                changes.append({"source": source, "previous": first.get("chapterId"), "corrected": None, "method": method})
    print(json.dumps({"mode": "apply" if args.apply else "dry-run", "sourceFiles": len(groups), "changedSources": len(changes), "unresolvedSources": sum(value["chapterId"] is None for value in resolutions.values()), "examples": changes[:15]}, indent=2))
    plan = ROOT / ".cache" / "textbook-mapping-plan.json"
    plan.parent.mkdir(exist_ok=True)
    plan.write_text(json.dumps({"changes": changes, "resolutions": resolutions}, indent=2, ensure_ascii=False), encoding="utf-8")
    if not args.apply:
        return
    backup = ROOT / ".cache" / ("textbook-mapping-backup-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S"))
    backup.mkdir(parents=True, exist_ok=False)
    files = ["textbook_chunks.jsonl", "chunks.jsonl", "textbook_chapter_index.json", "chapter_index.json", "textbook_image_manifest.json"]
    for file in files:
        if (DIRECTORY / file).exists():
            shutil.copy2(DIRECTORY / file, backup / file)
    for file in ["textbook_chunks.jsonl", "chunks.jsonl"]:
        location = DIRECTORY / file
        current = [json.loads(line) for line in location.read_text(encoding="utf-8").splitlines() if line.strip()]
        for row in current:
            if row.get("sourceType") == "textbook" and source_key(row["sourcePath"]) in resolutions:
                row.update(resolutions[source_key(row["sourcePath"])])
        temporary = location.with_suffix(location.suffix + ".tmp")
        temporary.write_text("\n".join(json.dumps(row, ensure_ascii=False, separators=(",", ":")) for row in current) + "\n", encoding="utf-8")
        temporary.replace(location)
        index_file = DIRECTORY / ("textbook_chapter_index.json" if file == "textbook_chunks.jsonl" else "chapter_index.json")
        index = json.loads(index_file.read_text(encoding="utf-8"))
        mapping = defaultdict(set)
        chunk_mapping = defaultdict(list)
        for row in current:
            if row.get("chapterId"):
                mapping[row["chapterId"]].add(row["sourcePath"])
                chunk_mapping[row["chapterId"]].append(row["id"])
        index["chapters"] = {key: sorted(value) for key, value in mapping.items()}
        if "chunksByChapter" in index:
            index["chunksByChapter"] = dict(chunk_mapping)
        if "stats" in index:
            books = [row for row in current if row.get("sourceType") == "textbook"]
            index["stats"]["textbookChunksMerged"] = len(books)
            index["stats"]["textbookChaptersMerged"] = len({row["chapterId"] for row in books if row.get("chapterId")})
        index["generatedAt"] = datetime.now(timezone.utc).isoformat()
        index_file.write_text(json.dumps(index, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    manifest_file = DIRECTORY / "textbook_image_manifest.json"
    if manifest_file.exists():
        manifest = json.loads(manifest_file.read_text(encoding="utf-8"))
        for image in manifest.get("images", []):
            resolution = resolutions.get(source_key(image.get("sourcePath", "")))
            if resolution:
                image.update(resolution)
        manifest_file.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Metadata repaired. IDs and source text preserved; existing text embeddings remain compatible. Backup: {backup}")
    print("Next: npm run rag:repair:apply && npm run eval:rag:report")


if __name__ == "__main__":
    main()
