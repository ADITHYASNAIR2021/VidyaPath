from huggingface_hub import login, HfApi

# ── Config ──────────────────────────────────────────────────
REPO_ID     = "AdithyaSNair/cbse-papers-2009-2025"
FOLDER_PATH = "./dataset/cbse_papers"   # relative to project root
REPO_TYPE   = "dataset"
# ────────────────────────────────────────────────────────────

print("=" * 55)
print("  VidyaPath — CBSE Papers → Hugging Face Uploader")
print("=" * 55)
print(f"\n  Repo   : https://huggingface.co/datasets/{REPO_ID}")
print(f"  Source : {FOLDER_PATH}")
print(f"  ~2.4 GB+ · using upload_large_folder (incremental commits)\n")

# Step 1 — Login
login()

# Step 2 — Upload using upload_large_folder
# This commits in small batches — safe to re-run after failures.
# It will skip files already uploaded (idempotent).
print("\n⬆  Starting large folder upload...\n")

api = HfApi()
api.upload_large_folder(
    folder_path     = FOLDER_PATH,
    repo_id         = REPO_ID,
    repo_type       = REPO_TYPE,
    ignore_patterns = ["*.py", "*.gitignore", "__pycache__/"],
)

print("\n✅  Upload complete!")
print(f"   View at: https://huggingface.co/datasets/{REPO_ID}\n")
