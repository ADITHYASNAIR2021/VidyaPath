#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import Dict, List, Optional

ROOT = Path(__file__).resolve().parent.parent
SCRIPTS = ROOT / "scripts"
CONTEXT_DIR = ROOT / "lib" / "context"


def resolve_node() -> str:
    repo_node = ROOT / ".tools" / "node-current" / "node.exe"
    if repo_node.exists():
        return str(repo_node)
    node = shutil.which("node")
    if node:
        return node
    raise RuntimeError("Node.js runtime not found. Expected .tools/node-current/node.exe or node on PATH.")


def run_step(label: str, command: List[str], env: Optional[Dict[str, str]], report_steps: List[dict]) -> None:
    print(f"\n=== {label} ===")
    print(" ".join(command))
    started = time.time()
    result = subprocess.run(command, cwd=str(ROOT), env=env)
    duration = round(time.time() - started, 2)
    report_steps.append(
        {
            "label": label,
            "command": command,
            "exitCode": result.returncode,
            "durationSeconds": duration,
        }
    )
    if result.returncode != 0:
        raise RuntimeError(f"{label} failed with exit code {result.returncode}")


def build_report(steps: List[dict], args: argparse.Namespace) -> None:
    CONTEXT_DIR.mkdir(parents=True, exist_ok=True)
    report_path = CONTEXT_DIR / "rag_pipeline_report.json"
    payload = {
        "version": "1",
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "args": vars(args),
        "steps": steps,
    }
    report_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"\n[pipeline] Report written -> {report_path.relative_to(ROOT).as_posix()}")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="One-command VidyaPath RAG pipeline: download, chunk, extract visuals, build indexes, and verify."
    )
    parser.add_argument("--skip-downloads", action="store_true", help="Skip dataset download steps")
    parser.add_argument("--skip-question-papers", action="store_true", help="Skip question-paper download/build steps")
    parser.add_argument("--skip-textbooks", action="store_true", help="Skip textbook download/build steps")
    parser.add_argument("--class", dest="class_filter", type=int, choices=[10, 12], help="Optional class scope")
    parser.add_argument("--subject", dest="subject_filter", help="Optional subject scope for textbook chunking")
    parser.add_argument("--year", help="Optional year scope for question-paper download")
    parser.add_argument("--max-files", type=int, default=0, help="Max ranked question-paper PDFs to chunk (0 = all)")
    parser.add_argument("--max-pages", type=int, default=20, help="Max pages per question paper during text extraction")
    parser.add_argument(
        "--image-max-pages",
        type=int,
        default=0,
        help="Max pages per textbook PDF to inspect for visual extraction (0 = all pages)",
    )
    parser.add_argument("--workers", type=int, default=15, help="Parallel workers for textbook downloads")
    parser.add_argument(
        "--nvidia-api-key",
        default=None,
        help="Optional NVIDIA key for OCR. If omitted, the pipeline uses NVIDIA_API_KEY from the environment if present.",
    )
    parser.add_argument("--skip-clean", action="store_true", help="Skip the chunk cleanup pass")
    parser.add_argument("--skip-benchmark", action="store_true", help="Skip the retrieval benchmark test")
    args = parser.parse_args()

    node = resolve_node()
    python_exe = sys.executable
    env = os.environ.copy()
    if args.nvidia_api_key:
        env["NVIDIA_API_KEY"] = args.nvidia_api_key

    steps: List[dict] = []

    try:
        if not args.skip_downloads:
            if not args.skip_question_papers:
                qp_download = [python_exe, str(SCRIPTS / "download_dataset.py")]
                if args.year:
                    qp_download.extend(["--year", args.year])
                if args.class_filter:
                    qp_download.extend(["--class", str(args.class_filter)])
                run_step("Download question papers", qp_download, env, steps)

            if not args.skip_textbooks:
                textbook_download = [python_exe, str(SCRIPTS / "download_ncert_textbooks.py")]
                if args.class_filter:
                    textbook_download.extend(["--cls", str(args.class_filter)])
                if args.workers:
                    textbook_download.extend(["--workers", str(args.workers)])
                run_step("Download textbooks", textbook_download, env, steps)

        if not args.skip_question_papers:
            build_context = [
                python_exe,
                str(SCRIPTS / "build_context_index.py"),
                "--max-files",
                str(args.max_files),
                "--max-pages",
                str(args.max_pages),
                "--save-images",
                "--extract-images",
            ]
            run_step("Build paper context index", build_context, env, steps)

        if not args.skip_textbooks:
            build_textbooks = [
                python_exe,
                str(SCRIPTS / "build_textbook_index.py"),
                "--merge-main-index",
                "--save-images",
                "--extract-images",
                "--image-max-pages",
                str(args.image_max_pages),
            ]
            if args.class_filter:
                build_textbooks.extend(["--class", str(args.class_filter)])
            if args.subject_filter:
                build_textbooks.extend(["--subject", args.subject_filter])
            run_step("Build textbook semantic index", build_textbooks, env, steps)

        if not args.skip_clean:
            run_step("Clean context chunks", [node, str(SCRIPTS / "clean_context_chunks.mjs")], env, steps)

        run_step("Build vector index", [node, str(SCRIPTS / "build_vector_index.mjs")], env, steps)
        run_step("Build retrieval index", [node, str(SCRIPTS / "build_retrieval_index.mjs")], env, steps)
        run_step("Check dataset quality", [node, str(SCRIPTS / "check_dataset_quality.mjs")], env, steps)
        run_step("Verify context artifacts", [node, str(SCRIPTS / "verify_context_index.mjs")], env, steps)

        if not args.skip_benchmark:
            vitest = ROOT / "node_modules" / "vitest" / "vitest.mjs"
            run_step(
                "Run RAG benchmark",
                [node, str(vitest), "run", "lib/ai/__tests__/rag-benchmark.test.ts"],
                env,
                steps,
            )
    except Exception as exc:
        build_report(steps, args)
        print(f"\n[pipeline] FAIL: {exc}", file=sys.stderr)
        return 1

    build_report(steps, args)
    print("\n[pipeline] PASS: end-to-end RAG pipeline completed successfully.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
