"""
VidyaPath — NCERT Textbook Downloader
======================================
Bulk-downloads NCERT PDF textbooks for Class 10 & Class 12 chapters
by parsing `lib/data.ts` (which already binds each chapterId to its
official NCERT PDF URL).

Output layout:
    dataset/ncert_textbooks/
        Class_10/
            Chemistry/
                c10-chem-1.pdf
                ...
            Physics/
                c10-phy-1.pdf
                ...
        Class_12/
            Physics/
                c12-phy-1.pdf
                ...

Usage:
    pip install requests
    python scripts/download_ncert_textbooks.py
    python scripts/download_ncert_textbooks.py --class 10
    python scripts/download_ncert_textbooks.py --subject Physics
    python scripts/download_ncert_textbooks.py --force   # re-download
"""

import argparse
import os
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
import requests

ROOT = Path(__file__).resolve().parent.parent 
OUT_DIR = ROOT / "dataset" / "ncert_textbooks"
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"

CATALOG = {
    10: {
        "English_Medium": {
            "Mathematics": ["jemh1"],
            "Science": ["jesc1"],
            "Social_Science_History": ["jess1"],
            "Social_Science_Geography": ["jess2"],
            "Social_Science_Political_Science": ["jess3"],
            "Social_Science_Economics": ["jess4"],
            "Information_and_Comm_Tech": ["jict1"],
            "Health_and_Physical_Ed": ["jhpe1"]
        },
        "Languages": {
            "English_First_Flight": ["jeef1"],
            "English_Footprints": ["jeew1"],
            "English_Words_Expressions": ["jefp1"],
            "Hindi_Kshitij": ["jhkj1"],
            "Hindi_Sparsh": ["jhsp1"],
            "Hindi_Sanchayan": ["jhsy1"],
            "Hindi_Kritika": ["jhkr1"],
            "Sanskrit": ["jesk1", "jesk2", "jesk3"],
            "Urdu": ["jhud1", "jhgu1", "jhnw1", "jhdr1"]
        },
        "Hindi_Medium": {
            "Mathematics_Ganit": ["jmh1"],
            "Science_Vigyan": ["jsc1"],
            "Social_Science_Itihas": ["jhis1"],
            "Social_Science_Bhugol": ["jgeo1"],
            "Social_Science_Rajneeti": ["jciv1"],
            "Social_Science_Arthashastra": ["jeco1"]
        }
    },
    12: {
        "English_Medium": {
            # Science Stream
            "Mathematics": ["lemh1", "lemh2"],
            "Physics": ["leph1", "leph2"],
            "Chemistry": ["lech1", "lech2"],
            "Biology": ["lebo1"],
            "Computer_Science": ["lecs1"],
            "Informatics_Practices": ["leip1"],
            "Biotechnology": ["lebt1"],
            # Commerce Stream
            "Accountancy": ["leac1", "leac2"],
            "Business_Studies": ["lebs1", "lebs2"],
            "Economics_Macro": ["leec1"],
            "Economics_Micro": ["leec2"],
            # Humanities / Arts Stream
            "History": ["lehs1", "lehs2", "lehs3"],
            "Geography": ["legy1", "legy2", "legy3"],
            "Political_Science": ["leps1", "leps2"],
            "Sociology": ["lesy1", "lesy2"],
            "Psychology": ["lepy1"],
            "Home_Science": ["leho1", "leho2"],
            "Fine_Arts": ["lefa1"],
            "Physical_Education": ["lepe1"]
        },
        "Languages": {
            "English_Flamingo": ["lefl1"],
            "English_Vistas": ["levt1"],
            "English_Kaleidoscope": ["lekl1"],
            "Hindi_Antra": ["lhat1"],
            "Hindi_Aroh": ["lhar1"],
            "Hindi_Vitan": ["lhvt1"],
            "Hindi_Antral": ["lhan1"],
            "Sanskrit": ["lesk1", "lesk2"],
            "Urdu": ["lhgu1", "lhnw1", "lhkb1", "lhdu1"]
        },
        "Hindi_Medium": {
            "Mathematics_Ganit": ["lhmh1", "lhmh2"],
            "Physics_Bhautiki": ["lhph1", "lhph2"],
            "Chemistry_Rasayan": ["lhch1", "lhch2"],
            "Biology_Jeev_Vigyan": ["lhbo1"],
            "Accountancy_Lekhashastra": ["lhac1", "lhac2"],
            "Business_Studies_Vyavsay": ["lhbs1", "lhbs2"],
            "History_Itihas": ["lhhs1", "lhhs2", "lhhs3"],
            "Geography_Bhugol": ["lhgy1", "lhgy2", "lhgy3"]
        }
    }
}

# NCERT chapter PDFs range from 01 to 20. 'ps' = prelims, 'ans' = answers.
CHAPTER_SUFFIXES = ["ps"] + [f"{i:02d}" for i in range(1, 22)] + ["ans"]

def download_file(url, out_path, session):
    if out_path.exists():
        return f"[SKIP] {out_path.name}"
    
    try:
        resp = session.get(url, headers={"User-Agent": USER_AGENT}, timeout=15)
        # Check if content is actually a PDF and not a 404 HTML redirect
        if resp.status_code == 200 and 'application/pdf' in resp.headers.get('Content-Type', ''):
            out_path.parent.mkdir(parents=True, exist_ok=True)
            out_path.write_bytes(resp.content)
            return f"[OK] Downloaded: {out_path.parent.name}/{out_path.name}"
        else:
            return f"[MISS] {url.split('/')[-1]} (Does not exist)"
    except Exception as e:
        return f"[FAIL] {url.split('/')[-1]} - {e}"

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cls", type=int, choices=[10, 12], help="Class level (10 or 12)")
    ap.add_argument("--workers", type=int, default=15, help="Max parallel downloads")
    args = ap.parse_args()

    session = requests.Session()
    tasks = []
    
    print("=====================================================")
    print("VidyaPath: Initiating Complete NCERT Catalog Download")
    print("=====================================================\n")
    
    for cls, mediums in CATALOG.items():
        if args.cls and args.cls != cls:
            continue
            
        for medium, subjects in mediums.items():
            for subject, book_codes in subjects.items():
                subject_dir = OUT_DIR / f"Class_{cls}" / medium / subject
                
                for code in book_codes:
                    for suffix in CHAPTER_SUFFIXES:
                        filename = f"{code}{suffix}.pdf"
                        url = f"https://ncert.nic.in/textbook/pdf/{filename}"
                        out_path = subject_dir / filename
                        tasks.append((url, out_path))

    print(f"Generated {len(tasks)} potential URLs to probe & download.")
    print(f"Downloading with {args.workers} concurrent workers. Please wait...\n")
    
    success_count = 0
    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        futures = {ex.submit(download_file, url, path, session): url for url, path in tasks}
        
        for fut in as_completed(futures):
            result = fut.result()
            # We hide [MISS] to avoid spamming the console for chapters that don't exist
            if not result.startswith("[MISS]"):
                print(result)
                if result.startswith("[OK]"):
                    success_count += 1

    print("\n=====================================================")
    print(f"Download complete! Successfully acquired {success_count} new PDF files.")
    print(f"Data saved to: {OUT_DIR.absolute()}")
    print("=====================================================")

if __name__ == "__main__":
    main()