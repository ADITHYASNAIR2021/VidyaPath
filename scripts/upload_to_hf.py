#!/usr/bin/env python3
"""
Generic Hugging Face dataset uploader for VidyaPath corpora.

Examples:
  python scripts/upload_to_hf.py \
    --repo-id AdithyaSNair/cbse-papers-2009-2025 \
    --folder dataset/cbse_papers

  python scripts/upload_to_hf.py \
    --repo-id AdithyaSNair/ncert-textbooks-10-12 \
    --folder dataset/ncert_textbooks
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

from huggingface_hub import HfApi, login


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Upload a local dataset folder to Hugging Face.")
    parser.add_argument("--repo-id", required=True, help="HF dataset repo id, e.g. user/repo")
    parser.add_argument("--folder", required=True, help="Local dataset folder path")
    parser.add_argument("--repo-type", default="dataset", choices=["dataset"])
    parser.add_argument(
        "--token",
        default=os.getenv("HF_TOKEN", "").strip(),
        help="HF token (or set HF_TOKEN env var). If omitted, interactive login is used.",
    )
    parser.add_argument(
        "--include-hidden",
        action="store_true",
        help="Upload hidden files too (default skips .git/.cache style files).",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    folder = Path(args.folder).resolve()
    if not folder.exists() or not folder.is_dir():
        print(f"ERROR: folder does not exist: {folder}", file=sys.stderr)
        return 1

    print("=" * 64)
    print("VidyaPath -> Hugging Face Dataset Uploader")
    print("=" * 64)
    print(f"Repo   : https://huggingface.co/datasets/{args.repo_id}")
    print(f"Folder : {folder}")
    print()

    if args.token:
        login(token=args.token)
    else:
        login()

    ignore_patterns = None
    if not args.include_hidden:
        ignore_patterns = [
            ".git/**",
            ".github/**",
            ".cache/**",
            "__pycache__/**",
            "*.tmp",
            "*.log",
        ]

    api = HfApi()
    api.upload_large_folder(
        folder_path=str(folder),
        repo_id=args.repo_id,
        repo_type=args.repo_type,
        ignore_patterns=ignore_patterns,
    )

    print()
    print("Upload complete.")
    print(f"Open: https://huggingface.co/datasets/{args.repo_id}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
