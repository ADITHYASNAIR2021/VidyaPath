# ============================================================
#  VidyaPath — Developer Makefile
#  Usage: make <target>
# ============================================================

.PHONY: help dev dataset scrape scrape-byjus scrape-modern commit push sync clean

# ── Default: show help ───────────────────────────────────────
help:
	@echo ""
	@echo "  VidyaPath — Make Commands"
	@echo "  ========================="
	@echo ""
	@echo "  make dev          Start Next.js dev server"
	@echo "  make dataset      Upload dataset to HuggingFace"
	@echo "  make scrape       Run the official CBSE scraper"
	@echo "  make scrape-byjus Run the Byjus scraper"
	@echo "  make scrape-all   Run both scrapers in parallel"
	@echo "  make scrape-fast  Run the fast parallel modern scraper (2022-2025)"
	@echo "  make commit       git add + commit with timestamp message"
	@echo "  make push         commit + push to GitHub"
	@echo "  make sync         push code + upload dataset to HF"
	@echo "  make clean        Remove __pycache__ and .zip_extracted folders"
	@echo ""

# ── Dev server ───────────────────────────────────────────────
dev:
	npm run dev

# ── Dataset upload to HuggingFace ────────────────────────────
dataset:
	@echo "Uploading CBSE dataset to HuggingFace..."
	python scripts/upload_to_hf.py

# ── Scrapers ─────────────────────────────────────────────────
scrape:
	@echo "Starting official CBSE scraper..."
	python scripts/scrape_cbse_papers.py

scrape-byjus:
	@echo "Starting Byjus scraper..."
	python scripts/scrape_byjus_papers.py

scrape-fast:
	@echo "Starting parallel modern era scraper (2022-2025)..."
	python scripts/parallel_modern_cbse.py

scrape-all:
	@echo "Starting all scrapers in parallel..."
	python scripts/scrape_cbse_papers.py & python scripts/scrape_byjus_papers.py

# ── Git ──────────────────────────────────────────────────────
commit:
	git add .
	git commit -m "chore: update — $$(date +'%Y-%m-%d %H:%M')"

push: commit
	git push

# ── Full sync: code + dataset ─────────────────────────────────
sync: push dataset
	@echo ""
	@echo "All synced! Code on GitHub, dataset on HuggingFace."
	@echo ""

# ── Cleanup ──────────────────────────────────────────────────
clean:
	@echo "Cleaning up extracted ZIPs and pycache..."
	find dataset/ -name "*_extracted" -type d -exec rm -rf {} + 2>/dev/null || true
	find . -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null || true
	@echo "Done."
