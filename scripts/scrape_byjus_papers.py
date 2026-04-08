import os
import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin, unquote
import time
import re

HEADERS = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}

BYJUS_URLS = [
    ("Class_12", "https://byjus.com/cbse-study-material/10-years-question-paper-cbse-class-12/"),
    ("Class_10", "https://byjus.com/cbse-study-material/10-years-question-paper-cbse-class-10/")
]

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "dataset", "cbse_papers"))

def download_file(url, save_path):
    if os.path.exists(save_path):
        print(f"  [~] Skipping, exists: {save_path}")
        return True

    print(f"  [>] Downloading: {url}")
    try:
        response = requests.get(url, headers=HEADERS, stream=True, timeout=30)
        if response.status_code == 200:
            os.makedirs(os.path.dirname(save_path), exist_ok=True)
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

def extract_year(filename):
    match = re.search(r'(20\d{2})', filename)
    if match:
        return match.group(1)
    return "Unknown_Year"

def extract_subject(filename, class_level):
    fname = filename.lower()
    subject_map = {
        'physics': 'Physics', 'chemistry': 'Chemistry', 'bio': 'Biology', 
        'math': 'Mathematics', 'science': 'Science', 'social': 'Social_Science',
        'eng': 'English', 'hindi': 'Hindi', 'account': 'Accountancy',
        'eco': 'Economics', 'business': 'Business_Studies', 'comp': 'Computer_Science'
    }
    for key, val in subject_map.items():
        if key in fname:
            return val
    return "Other"

def scrape_byjus_subject_page(page_url, class_level):
    try:
        response = requests.get(page_url, headers=HEADERS, timeout=15)
        if response.status_code != 200: return
    except: return

    soup = BeautifulSoup(response.content, 'html.parser')
    for link in soup.find_all('a'):
        href = link.get('href')
        if not href or not href.lower().endswith('.pdf'):
            continue
            
        pdf_url = urljoin(page_url, href)
        filename = unquote(href.split('/')[-1])
        
        year = extract_year(filename)
        subject = extract_subject(filename, class_level)
        
        # Tag it with Byjus to indicate it might have solutions
        save_path = os.path.join(BASE_DIR, year, class_level, subject, f"Byjus_{filename}")
        download_file(pdf_url, save_path)
        time.sleep(1)

def scrape_byjus_master():
    print("\n" + "="*50)
    print("--- Scraping Byjus 10-Year Master Lists (Papers + Solutions) ---")
    print("="*50)
    
    for class_level, master_url in BYJUS_URLS:
        print(f"\nProcessing Master Page: {master_url}")
        try:
            response = requests.get(master_url, headers=HEADERS, timeout=15)
            if response.status_code != 200: continue
        except: continue

        soup = BeautifulSoup(response.content, 'html.parser')
        
        # 1. Any direct PDF links on the master page itself
        for link in soup.find_all('a'):
            href = link.get('href')
            if href and href.lower().endswith('.pdf'):
                pdf_url = urljoin(master_url, href)
                filename = unquote(href.split('/')[-1])
                year = extract_year(filename)
                subject = extract_subject(filename, class_level)
                save_path = os.path.join(BASE_DIR, year, class_level, subject, f"Byjus_{filename}")
                download_file(pdf_url, save_path)
                time.sleep(0.5)

        # 2. Find subject sub-pages (links containing 'last-10-years-cbse-board-papers' or 'previous-year')
        for link in soup.find_all('a'):
            href = link.get('href')
            if href and ('last-10-years' in href or 'previous-year-question-paper' in href):
                sub_url = urljoin(master_url, href)
                print(f" -> Found Subject Sub-page: {sub_url}")
                scrape_byjus_subject_page(sub_url, class_level)

if __name__ == "__main__":
    scrape_byjus_master()
    print("\n\n*** BYJUS SCRAPING COMPLETE ***")
