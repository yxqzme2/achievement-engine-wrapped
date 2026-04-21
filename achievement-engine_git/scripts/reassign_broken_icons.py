import csv
import json
import os
import glob
import random

# Configuration
ICON_DIR = os.getenv("ICON_DIR", "/data/icons")
if not os.path.exists(ICON_DIR): ICON_DIR = "icons"

# Helper to find data files
def _find_path(filename, search_dirs):
    for d in search_dirs:
        p = os.path.join(d, filename)
        if os.path.exists(p): return p
    return filename

LOOT_PATH = _find_path("loot.csv", ["/data/csv", "/app/csv", "csv"])
ACH_PATH = _find_path("achievements.points.json", ["/data/json", "/data", "/app/data", ""])

# Category to Icon Prefix mapping
MAPPINGS = {
    "Weapon":  "weapon_",
    "Head":    "head_",
    "Chest":   "chest_",
    "Neck":    "acc_neck_",
    "Ring":    "acc_ring_",
    "Trinket": "acc_trinket_",
    "Generic": "inv_misc_"
}

def get_valid_icons(prefix):
    pattern = os.path.join(ICON_DIR, f"{prefix}*.png")
    matches = glob.glob(pattern)
    return [os.path.basename(m) for m in matches]

def run_reassignment():
    print("ICON REASSIGNMENT PROTOCOL")
    print("=" * 60)
    
    # Pre-cache available icons
    icon_cache = {k: get_valid_icons(v) for k, v in MAPPINGS.items()}
    fallback_pool = get_valid_icons("") # All icons

    # 1. Fix Loot CSV
    print("\n[ PROCESSING LOOT COMPENDIUM ]")
    if os.path.exists(LOOT_PATH):
        rows = []
        fixed_count = 0
        with open(LOOT_PATH, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            fieldnames = reader.fieldnames
            for row in reader:
                icon = row.get('icon', '').lstrip('/')
                if icon.startswith('icons/'): icon = icon.replace('icons/', '', 1)
                
                path = os.path.join(ICON_DIR, icon)
                if not os.path.exists(path) or not icon:
                    slot = row.get('slot', 'Generic')
                    pool = icon_cache.get(slot, icon_cache['Generic'])
                    if not pool: pool = fallback_pool
                    
                    if pool:
                        new_icon = random.choice(pool)
                        row['icon'] = f"/icons/{new_icon}"
                        fixed_count += 1
                rows.append(row)
        
        if fixed_count > 0:
            with open(LOOT_PATH, 'w', newline='', encoding='utf-8') as f:
                writer = csv.DictWriter(f, fieldnames=fieldnames, quoting=csv.QUOTE_ALL)
                writer.writeheader()
                writer.writerows(rows)
            print(f"✅ Fixed {fixed_count} broken icons in loot.csv.")
        else:
            print("✨ All loot icons are valid.")
    else:
        print("❌ Skip: loot.csv not found.")

    # 2. Fix Achievements JSON
    print("\n[ PROCESSING ACHIEVEMENT DATABASE ]")
    if os.path.exists(ACH_PATH):
        fixed_count = 0
        with open(ACH_PATH, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        is_dict = isinstance(data, dict)
        achs = data.get('achievements') if is_dict else data
        
        for a in achs:
            icon = a.get('iconPath', '').lstrip('/')
            if icon.startswith('icons/'): icon = icon.replace('icons/', '', 1)
            
            path = os.path.join(ICON_DIR, icon)
            if not os.path.exists(path) or not icon:
                # Quest/Achievement icons usually have their own patterns
                pool = icon_cache['Generic']
                if not pool: pool = fallback_pool
                
                if pool:
                    new_icon = random.choice(pool)
                    a['iconPath'] = f"/icons/{new_icon}"
                    fixed_count += 1
        
        if fixed_count > 0:
            if is_dict: data['achievements'] = achs
            else: data = achs
            
            with open(ACH_PATH, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2)
            print(f"✅ Fixed {fixed_count} broken icons in achievements.points.json.")
        else:
            print("✨ All achievement icons are valid.")
    else:
        print("❌ Skip: achievements.points.json not found.")

if __name__ == "__main__":
    run_reassignment()
