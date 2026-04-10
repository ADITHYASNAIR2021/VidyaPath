import os
import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin, unquote
import time
import zipfile
import io
import re

HEADERS = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}

# Base URLs for different eras
LEGACY_BASE = "https://www.cbse.gov.in/curric~1/"
MODERN_URL = "https://cbse.gov.in/cbsenew/question-paper.html"

# Folders
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "dataset", "cbse_papers"))

SUBJECT_MAP = {
    'phy': 'Physics',
    'chem': 'Chemistry',
    'bio': 'Biology',
    'math': 'Mathematics',
    'account': 'Accountancy',
    'business': 'Business_Studies',
    'economics': 'Economics',
    'eco': 'Economics',
    'science': 'Science',
    'social': 'Social_Science',
    'eng': 'English',
    'hindi': 'Hindi'
}

def extract_zip(zip_content, extract_to):
    try:
        with zipfile.ZipFile(io.BytesIO(zip_content)) as z:
            z.extractall(extract_to)
        print(f"      [OK] Extracted to {extract_to}")
        return True
    except Exception as e:
        print(f"      [Error] Failed to extract zip to {extract_to}: {e}")
        return False

def download_file(url, save_path):
    # Check existence
    if os.path.exists(save_path) or os.path.exists(f"{save_path}_extracted"):
        print(f"  [~] Skipping, already downloaded: {save_path}")
        return True

    print(f"  [>] Downloading: {url}")
    try:
        response = requests.get(url, headers=HEADERS, stream=True, timeout=30)
        if response.status_code == 200:
            os.makedirs(os.path.dirname(save_path), exist_ok=True)
            
            if url.lower().endswith('.zip'):
                print(f"      Extracting ZIP...")
                content = b""
                for chunk in response.iter_content(8192):
                    content += chunk
                extract_zip(content, f"{save_path}_extracted")
            else:
                with open(save_path, 'wb') as f:
                    for chunk in response.iter_content(8192):
                        f.write(chunk)
                print(f"      [OK] Saved PDF to {save_path}")
            return True
        else:
            print(f"      [!] Failed (Status {response.status_code})")
            return False
    except Exception as e:
        print(f"      [!] Error downloading {url}: {e}")
        return False

def scrape_modern_era():
    print("\n\n" + "="*50)
    print("--- Scraping Modern Era (from main portal) ---")
    print("="*50)
    response = requests.get(MODERN_URL, headers=HEADERS)
    if response.status_code != 200:
        print(f"Failed to access modern portal. HTTP {response.status_code}")
        return

    soup = BeautifulSoup(response.content, 'html.parser')
    links = soup.find_all('a')
    print(f"Found {len(links)} links on modern portal.")
    
    for link in links:
        href = link.get('href')
        if not href:
            continue
            
        full_url = urljoin(MODERN_URL, href)
        match = re.search(r'question-paper/(\d{4}[^/]*)/(XII|X)/([^/]+)\.(zip|pdf)$', href, re.IGNORECASE)
        if match:
            year_str = match.group(1).upper()
            class_str = match.group(2).upper()
            subject_raw = match.group(3).lower()
            ext = match.group(4).lower()
            
            class_level = 'Class_12' if class_str == 'XII' else 'Class_10'
            
            subject = subject_raw.capitalize() # Default to raw string
            for key, subj_name in SUBJECT_MAP.items():
                if key in subject_raw:
                    subject = subj_name
                    break
            
            save_dir = os.path.join(BASE_DIR, year_str, class_level, subject)
            file_name = f"{subject_raw}.{ext}"
            save_path = os.path.join(save_dir, file_name)
            
            download_file(full_url, save_path)
            time.sleep(0.5)

def scrape_legacy_year(year):
    print("\n" + "-"*40)
    print(f"--- Scraping Legacy Year {year} ---")
    print("-"*40)
    year_url = f"{LEGACY_BASE}qp{year}/qp{year}.htm"
    
    try:
        response = requests.get(year_url, headers=HEADERS, timeout=10)
    except:
        return
        
    if response.status_code != 200:
        # Also try index.html fallback for some years
        year_url = f"{LEGACY_BASE}{year}/{year}.htm"
        try:
            response = requests.get(year_url, headers=HEADERS, timeout=10)
        except: return
        if response.status_code != 200: return

    soup = BeautifulSoup(response.content, 'html.parser')
    for link in soup.find_all('a'):
        href = link.get('href')
        text = link.text.upper()
        if not href:
            continue
            
        full_url = urljoin(year_url, href)
        
        # Scrape X and XII
        if re.search(r'\bCLASS X\b', text) and 'XII' not in text:
            scrape_legacy_class_page(full_url, year, 'Class_10')
        elif 'XII' in text or 'SCIENCE' in text or 'COMMERCE' in text:
            scrape_legacy_class_page(full_url, year, 'Class_12')

def scrape_legacy_class_page(page_url, year, class_level):
    try:
        response = requests.get(page_url, headers=HEADERS, timeout=10)
        if response.status_code != 200: return
    except: return

    soup = BeautifulSoup(response.content, 'html.parser')
    for link in soup.find_all('a'):
        href = link.get('href')
        link_text = link.text.strip().upper()
        if not href or not href.lower().endswith('.pdf'):
            continue
            
        pdf_url = urljoin(page_url, href)
        pdf_filename = unquote(href.split('/')[-1])
        
        subject = "Unknown"
        fname_lower = pdf_filename.lower()
        for key, subj_name in SUBJECT_MAP.items():
            if key in fname_lower:
                subject = subj_name
                break
                
        region = "General"
        if "DELHI" in link_text or "del" in fname_lower: region = "Delhi"
        if "OUT" in link_text or "out" in fname_lower: region = "Outside_Delhi"
        if "FOREIGN" in link_text or "foreign" in fname_lower: region = "Foreign"

        save_path = os.path.join(BASE_DIR, str(year), class_level, subject, f"{region}_{pdf_filename}")
        download_file(pdf_url, save_path)
        time.sleep(0.5)

if __name__ == "__main__":
    # 1. Scrape Modern Era (from the master page, gets ~2022-2025)
    scrape_modern_era()
    
    # 2. Scrape Legacy Era (aggressively checking 2009-2021 URLs)
    for target_year in range(2009, 2022):
        scrape_legacy_year(target_year)
        
    print("\n\n*** ALL SCRAPING COMPLETE ***")
