"""
VidyaPath — Dataset Downloader
================================
Downloads the full CBSE papers dataset (4,666 PDFs, ~2.4 GB)
from Hugging Face and places it in the local dataset/ folder.

Usage:
    pip install huggingface_hub
    python scripts/download_dataset.py

Options:
    --year 2025          Download only a specific year
    --class 10           Download only Class 10 papers
    --subject Physics    Download only Physics papers
    --dry-run            List files without downloading

The dataset lives at:
    https://huggingface.co/datasets/adithya-s-nair/cbse-papers-2009-2025
"""

import argparse
import os
from pathlib import Path

HF_REPO_ID = "adithya-s-nair/cbse-papers-2009-2025"
LOCAL_DIR = Path(__file__).parent.parent / "dataset" / "cbse_papers"


def download_full(dry_run: bool = False):
    """Download the entire dataset."""
    try:
        from huggingface_hub import snapshot_download
    except ImportError:
        print("❌  huggingface_hub not installed. Run: pip install huggingface_hub")
        return

    print(f"📦  Downloading full CBSE papers dataset (~2.4 GB)")
    print(f"    From : https://huggingface.co/datasets/{HF_REPO_ID}")
    print(f"    Into : {LOCAL_DIR}\n")

    if dry_run:
        print("🔍  Dry run — listing files only (not downloading)")
        from huggingface_hub import list_repo_tree
        for item in list_repo_tree(HF_REPO_ID, repo_type="dataset"):
            print(f"  {item.path}")
        return

    LOCAL_DIR.mkdir(parents=True, exist_ok=True)

    snapshot_download(
        repo_id=HF_REPO_ID,
        repo_type="dataset",
        local_dir=str(LOCAL_DIR),
        ignore_patterns=["*.gitattributes", "README.md"],
    )
    print(f"\n✅  Download complete → {LOCAL_DIR}")


def download_filtered(year: str | None, class_level: str | None, subject: str | None, dry_run: bool):
    """Download a subset of the dataset using glob patterns."""
    try:
        from huggingface_hub import hf_hub_download, list_repo_tree
    except ImportError:
        print("❌  huggingface_hub not installed. Run: pip install huggingface_hub")
        return

    # Build a path prefix filter
    prefix_parts = []
    if year:
        prefix_parts.append(year)
    if class_level:
        prefix_parts.append(f"Class_{class_level}")
    if subject:
        prefix_parts.append(subject)

    prefix = "/".join(prefix_parts) if prefix_parts else ""

    print(f"📦  Filtered download")
    print(f"    Year   : {year or 'all'}")
    print(f"    Class  : {class_level or 'all'}")
    print(f"    Subject: {subject or 'all'}")
    print(f"    Filter : {prefix or '(none — full dataset)'}\n")

    files = [
        item.path
        for item in list_repo_tree(HF_REPO_ID, repo_type="dataset", recursive=True)
        if item.path.endswith(".pdf") and (not prefix or item.path.startswith(prefix))
    ]

    print(f"  Found {len(files)} PDF files\n")

    if dry_run:
        for f in files[:20]:
            print(f"  📄 {f}")
        if len(files) > 20:
            print(f"  ... and {len(files) - 20} more")
        return

    LOCAL_DIR.mkdir(parents=True, exist_ok=True)

    for i, filepath in enumerate(files, 1):
        dest = LOCAL_DIR / filepath
        dest.parent.mkdir(parents=True, exist_ok=True)
        if dest.exists():
            print(f"  ✓ [{i}/{len(files)}] Already exists: {filepath}")
            continue
        print(f"  ↓ [{i}/{len(files)}] {filepath}")
        hf_hub_download(
            repo_id=HF_REPO_ID,
            repo_type="dataset",
            filename=filepath,
            local_dir=str(LOCAL_DIR),
        )

    print(f"\n✅  Done — {len(files)} files in {LOCAL_DIR}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Download CBSE papers dataset from Hugging Face")
    parser.add_argument("--year",    help="Filter by year (e.g. 2025)")
    parser.add_argument("--class",   dest="class_level", help="Filter by class (10 or 12)")
    parser.add_argument("--subject", help="Filter by subject (Physics, Chemistry, Biology, Math, Science)")
    parser.add_argument("--dry-run", action="store_true", help="List files without downloading")
    args = parser.parse_args()

    has_filter = args.year or args.class_level or args.subject

    if has_filter:
        download_filtered(args.year, args.class_level, args.subject, args.dry_run)
    else:
        download_full(args.dry_run)
