import os
import re
import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin
import zipfile
import io
from concurrent.futures import ThreadPoolExecutor, as_completed

MODERN_URL = "https://cbse.gov.in/cbsenew/question-paper.html"
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "dataset", "cbse_papers"))

def fetch_modern_links():
    print("Fetching Modern Era link inventory...")
    try:
        response = requests.get(MODERN_URL, timeout=15)
        response.raise_for_status()
    except Exception as e:
        print(f"Failed to fetch {MODERN_URL}: {e}")
        return []

    soup = BeautifulSoup(response.content, 'html.parser')
    links = []

    for a in soup.find_all('a', href=True):
        href = a['href']
        full_url = urljoin(MODERN_URL, href)
        
        # Match modern paths without leading slash
        match = re.search(r'question-paper/(\d{4}[^/]*)/(XII|X)/([^/]+)\.(zip|pdf)$', href, re.IGNORECASE)
        if match:
            year_str = match.group(1).upper()
            class_str = match.group(2).upper()
            subject = match.group(3).replace('_', ' ').replace('-', ' ')
            ext = match.group(4).lower()

            class_dir = "Class_12" if class_str == "XII" else "Class_10"
            save_dir = os.path.join(BASE_DIR, year_str, class_dir, subject)
            links.append((full_url, save_dir, ext))

    return links

def download_and_extract(item):
    full_url, save_dir, ext = item
    os.makedirs(save_dir, exist_ok=True)
    filename = urljoin(full_url, ".").split("/")[-1] or full_url.split("/")[-1]
    
    # If the folder already has pdf files (assuming extracted), skip
    existing = [f for f in os.listdir(save_dir) if f.lower().endswith('.pdf')]
    if len(existing) > 0:
        return f"[SKIPPED] {save_dir} already populated."

    zip_path = os.path.join(save_dir, filename)

    try:
        if ext == 'zip':
            resp = requests.get(full_url, stream=True, timeout=30)
            if resp.status_code == 200:
                with zipfile.ZipFile(io.BytesIO(resp.content)) as z:
                    for f in z.namelist():
                        if f.lower().endswith('.pdf'):
                            z.extract(f, save_dir)
                return f"[EXTRACTED] ZIP {filename} into {save_dir}"
        elif ext == 'pdf':
            resp = requests.get(full_url, stream=True, timeout=30)
            if resp.status_code == 200:
                with open(zip_path, 'wb') as f:
                    f.write(resp.content)
                return f"[DOWNLOADED] PDF {filename} to {save_dir}"
    except Exception as e:
        return f"[ERROR] Failed {full_url}: {e}"

def main():
    links = fetch_modern_links()
    print(f"Found {len(links)} remote archive packages to sync.")

    print(f"Booting up Thread Pool with 10 concurrent workers...")
    successes = 0
    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = {executor.submit(download_and_extract, item): item for item in links}
        for future in as_completed(futures):
            res = future.result()
            if res and not res.startswith("[SKIPPED]") and not res.startswith("[ERROR]"):
                successes += 1
                if successes % 10 == 0:
                    print(f"Successfully processed {successes} packages so far...")
            elif res and res.startswith("[ERROR]"):
                print(res)
    
    print(f"Parallel Sync Complete. Successfully downloaded & extracted {successes} new target sets.")

if __name__ == "__main__":
    main()
