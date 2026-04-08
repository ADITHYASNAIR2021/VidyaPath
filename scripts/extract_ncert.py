import os
import json
import argparse
try:
    from pypdf import PdfReader
except ImportError:
    print("Please install pypdf: pip install pypdf")
    exit(1)

# Usage: python extract_ncert.py --pdf path/to/chapter.pdf --id c10-chem-1 --title "Chapter Title"

def extract_text_from_pdf(pdf_path):
    reader = PdfReader(pdf_path)
    text = ""
    for page in reader.pages:
        page_text = page.extract_text()
        if page_text:
            text += page_text + "\n\n"
    
    # Basic cleanup
    # Remove weird artifacts or repetitive headers/footers if needed
    text = text.replace('Rationalised 2023-24', '')
    text = text.replace('\x00', '')
    return text.strip()

def main():
    parser = argparse.ArgumentParser(description="Extract NCERT PDF to JSON for AI Context")
    parser.add_argument('--pdf', required=True, help="Path to NCERT PDF file")
    parser.add_argument('--id', required=True, help="Chapter ID (e.g. c12-phy-1)")
    parser.add_argument('--title', required=True, help="Chapter Title")
    parser.add_argument('--out', default="../lib/ncert-content", help="Output directory")

    args = parser.parse_args()

    if not os.path.exists(args.pdf):
        print(f"Error: PDF not found at {args.pdf}")
        return

    print(f"Extracting: {args.pdf}...")
    raw_text = extract_text_from_pdf(args.pdf)

    # Prepare standard RAG JSON object
    data = {
        "chapterId": args.id,
        "title": args.title,
        "text": raw_text
    }

    # Ensure output dir exists (relative to snippet location)
    out_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), args.out))
    os.makedirs(out_dir, exist_ok=True)

    out_file = os.path.join(out_dir, f"{args.id}.json")
    with open(out_file, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print(f"Success! Extracted {len(raw_text)} characters into {out_file}")

if __name__ == "__main__":
    main()
