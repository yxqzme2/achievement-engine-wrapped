import csv
import json
import os
import glob

# Configuration
ICON_DIR = os.getenv("ICON_DIR", "/data/icons")
if not os.path.exists(ICON_DIR): ICON_DIR = "icons"

# Search paths for core data files
def _find_path(filename, search_dirs):
    for d in search_dirs:
        p = os.path.join(d, filename)
        if os.path.exists(p): return p
    return filename

LOOT_PATH = _find_path("loot.csv", ["/data/csv", "/app/csv", "csv"])
ACH_PATH = _find_path("achievements.points.json", ["/data/json", "/data", "/app/data", ""])

def run_sanity():
    print("SYSTEM SANITY CHECK: PRE-FLIGHT INTEGRITY")
    print("=" * 60)
    
    errors = 0
    warnings = 0

    # 1. Check Loot CSV
    print("\n[ SCANNING LOOT COMPENDIUM ]")
    loot_ids = set()
    if os.path.exists(LOOT_PATH):
        with open(LOOT_PATH, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for i, row in enumerate(reader):
                lid = row.get('item_id')
                name = row.get('item_name')
                icon = row.get('icon', '')
                
                # Check Duplicate IDs
                if lid in loot_ids:
                    print(f"❌ ERROR: Duplicate Loot ID found: {lid} ({name})")
                    errors += 1
                loot_ids.add(lid)
                
                # Check Broken Icons
                if icon:
                    # Strip leading slash if present
                    clean_icon = icon.lstrip('/')
                    if clean_icon.startswith('icons/'):
                        clean_icon = clean_icon.replace('icons/', '', 1)
                    
                    icon_path = os.path.join(ICON_DIR, clean_icon)
                    if not os.path.exists(icon_path):
                        print(f"⚠️ WARNING: Item '{name}' points to missing icon: {icon}")
                        warnings += 1
        print(f"Verified {len(loot_ids)} items.")
    else:
        print(f"❌ ERROR: loot.csv not found at {LOOT_PATH}")
        errors += 1

    # 2. Check Achievements JSON
    print("\n[ SCANNING ACHIEVEMENT DATABASE ]")
    ach_ids = set()
    if os.path.exists(ACH_PATH):
        with open(ACH_PATH, 'r', encoding='utf-8') as f:
            data = json.load(f)
            achs = data.get('achievements') if isinstance(data, dict) else data
            
            for a in achs:
                aid = a.get('id')
                title = a.get('title')
                icon = a.get('iconPath', '')
                
                if aid in ach_ids:
                    print(f"❌ ERROR: Duplicate Achievement ID: {aid} ({title})")
                    errors += 1
                ach_ids.add(aid)
                
                if icon:
                    clean_icon = icon.lstrip('/')
                    if clean_icon.startswith('icons/'):
                        clean_icon = clean_icon.replace('icons/', '', 1)
                    icon_path = os.path.join(ICON_DIR, clean_icon)
                    if not os.path.exists(icon_path):
                        print(f"⚠️ WARNING: Achievement '{title}' points to missing icon: {icon}")
                        warnings += 1
        print(f"Verified {len(ach_ids)} achievements.")
    else:
        print(f"❌ ERROR: achievements.points.json not found at {ACH_PATH}")
        errors += 1

    print("\n" + "=" * 60)
    if errors == 0 and warnings == 0:
        print("✅ SYSTEM NOMINAL: No integrity issues found.")
    else:
        print(f"SCAN COMPLETE: {errors} Errors, {warnings} Warnings.")

if __name__ == "__main__":
    run_sanity()
