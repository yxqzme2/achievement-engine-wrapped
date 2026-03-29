import urllib.request
import json
import csv
import re
import os
import time

# Target ABS-Stats Service
BASE_URL = "http://172.18.0.2:3000"

def slugify(text: str) -> str:
    """Standard slug creator for comparison."""
    if not text: return ""
    text = str(text).lower()
    text = re.sub(r'[^a-z0-9]+', '_', text)
    return text.strip('_')

def format_duration(seconds: float) -> str:
    """Converts seconds to HH:MM:SS."""
    try:
        s = int(seconds)
        hours = s // 3600
        minutes = (s % 3600) // 60
        seconds = s % 60
        return f"{hours:02}:{minutes:02}:{seconds:02}"
    except:
        return "00:00:00"

def fetch_json(endpoint):
    url = f"{BASE_URL}{endpoint}"
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as response:
        return json.loads(response.read())

def get_existing_series_achievements():
    """
    Collects series names that already have completion achievements.
    Only looks for series completion achievements, not individual books.
    Format: "Complete the [Series Name] series" or "Complete all books in [Series Name]"
    """
    existing_series = set()

    # Check multiple potential paths for the JSON file
    paths = [
        os.getenv("ACHIEVEMENTS_PATH", ""),
        "/data/json/achievements.points.json",
        "/data/achievements.points.json",
        "/data/data/achievements.points.json",
        "./data/achievements.points.json",
        "data/achievements.points.json",
        "achievements.points.json"
    ]

    json_path = None
    for p in paths:
        if p and os.path.exists(p):
            json_path = p
            break

    if json_path:
        print(f"[audit] Found achievements at: {json_path}")
        try:
            with open(json_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                achs = data.get("achievements") if isinstance(data, dict) else data
                for a in achs:
                    trigger = a.get("trigger", "").lower()
                    title = a.get("title", "").lower()

                    # Look for series completion triggers
                    # Pattern 1: "Complete the [Series] series."
                    if "complete the " in trigger and " series" in trigger:
                        name = trigger.replace("complete the ", "").replace(" series.", "").replace(" series", "").strip()
                        if name:
                            existing_series.add(slugify(name))

                    # Pattern 2: "Complete all books in [Series]"
                    if "complete all books in " in trigger:
                        name = trigger.replace("complete all books in ", "").strip().rstrip('.')
                        if name:
                            existing_series.add(slugify(name))

                    # Also check title field as fallback
                    if "completionist" in title or "series complete" in a.get("category", ""):
                        title_val = a.get("title", "").strip()
                        if title_val:
                            existing_series.add(slugify(title_val))

        except Exception as e:
            print(f"[audit] Error reading JSON: {e}")
    else:
        print("[audit] Warning: Could not find achievements.points.json. All series will be marked 'New'.")

    return existing_series

def run_audit():
    try:
        print("--- Starting Comprehensive Library Audit ---")
        existing_series = get_existing_series_achievements()

        print("Fetching full series index...")
        series_data = fetch_json("/api/series")
        series_list = series_data.get("series", [])
        
        # Cache for book details to avoid redundant API calls
        book_details_cache = {}
        
        results = []
        total_series = len(series_list)
        
        print(f"Processing {total_series} series...")
        
        for i, s in enumerate(series_list):
            s_name = s.get('seriesName', 'Unknown')
            s_slug = slugify(s_name)

            # Determine if the series completion achievement already exists
            is_new_series = s_slug not in existing_series
            series_status = "NEW" if is_new_series else "Existing"
            
            books = s.get('books', [])
            if i % 10 == 0:
                print(f"  [{i}/{total_series}] Processing: {s_name}...")

            series_authors = set()
            series_narrators = set()
            
            series_books_data = []
            
            for b in books:
                bid = b.get('libraryItemId')
                if not bid: continue

                # Fetch detailed book info if not in cache
                if bid not in book_details_cache:
                    try:
                        details = fetch_json(f"/api/item/{bid}")
                        book_details_cache[bid] = details
                    except:
                        book_details_cache[bid] = {}

                details = book_details_cache[bid]

                b_title = b.get('title', 'Unknown Title')
                b_seq = b.get('sequence', '')
                b_dur_raw = details.get('duration', 0)
                b_dur_fmt = format_duration(b_dur_raw)

                # Collect authors and narrators
                authors = details.get('authors', [])
                narrators = details.get('narrators', [])

                for a in authors: series_authors.add(a)
                for n in narrators: series_narrators.add(n)

                # Status is based on whether the series completion achievement exists
                # (All books in a NEW series will be marked NEW for quest generation)
                series_books_data.append({
                    'Series Name': s_name,
                    'Author(s)': ", ".join(authors),
                    'Narrator(s)': ", ".join(narrators),
                    'Book Title': b_title,
                    'Sequence': b_seq,
                    'Duration': b_dur_fmt,
                    'Duration Seconds': b_dur_raw,
                    'Book ID': bid,
                    'Status': series_status
                })
            
            results.extend(series_books_data)

        # Output to CSV
        output_file = "new_library_discovery.csv"
        fieldnames = [
            'Series Name', 'Author(s)', 'Narrator(s)', 
            'Book Title', 'Sequence', 'Duration', 
            'Duration Seconds', 'Book ID', 'Status'
        ]
        
        with open(output_file, mode='w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            # Sort results: New first, then by Series Name, then by Sequence
            results.sort(key=lambda x: (x['Status'] != 'NEW', x['Series Name'], str(x['Sequence']).zfill(5)))
            writer.writerows(results)

        print("\n--- Audit Complete ---")
        print(f"Total books processed: {len(results)}")
        print(f"Results saved to: {output_file}")
        print("-----------------------")
            
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    run_audit()
