import csv
import json
import os
import re
import random
import glob

# --- CONFIGURATION ---
# Paths inside the container
ICON_DIR = "/data/icons" # As mapped in docker-compose
ACHIEVEMENTS_PATH = "/data/data/achievements.points.json"
LOOT_PATH = "/app/csv/loot.csv" # Path inside the container

def slugify(text):
    if not text: return "unknown"
    return re.sub(r'[^a-z0-9]+', '_', text.lower()).strip('_')

def pick_random_icon(prefix):
    """
    Looks into the icon directory and finds all files matching the prefix.
    Returns just the filename.
    """
    # Search pattern: prefix*.png
    pattern = os.path.join(ICON_DIR, f"{prefix}*.png")
    matches = glob.glob(pattern)
    if not matches:
        return "inv_misc_questionmark.png" # System fallback
    
    chosen_path = random.choice(matches)
    return os.path.basename(chosen_path)

# --- THEMATIC ENGINE DATA ---
ITEM_TYPES = {
    "Weapon":  ["weapon_sword_", "weapon_axe_", "weapon_bow_", "weapon_mace_", "weapon_shortblade_", "weapon_rifle_"],
    "Head":    ["head_cloth_", "head_mail_", "head_plate_"],
    "Chest":   ["chest_cloth_", "chest_mail_", "chest_plate_"],
    "Neck":    ["acc_neck_", "acc_necklace_"],
    "Ring":    ["acc_ring_", "acc_ringwod_"],
    "Trinket": ["acc_trinket_"],
}

THEMES = {
    "dungeon": ["Ooze-Stained", "Subterranean", "Labyrinthine"],
    "heir": ["Inherited", "Noble", "Usurped"],
    "maul": ["Crushing", "Bloodied", "Primal"],
    "loot": ["Hoarded", "Gleaming", "Mimic-Bait"],
    "home": ["Domestic", "Fortified", "Siege-Proof"],
    "hunt": ["Tracker's", "Predatory", "Stalking"],
    "kill": ["Lethal", "Executioner's", "Merciless"],
    "quest": ["Errand-Boy's", "Venture", "Bound"],
    "flex": ["Pumping", "Vain", "Muscular"],
    "throne": ["Regal", "Sovereign", "Cursed"],
    "soldier": ["Conscript's", "Battle-Worn", "Disciplined"],
    "shadow": ["Veiled", "Obscure", "Whispering"],
    "ascension": ["Rising", "Celestial", "Peak"],
    "parent": ["Protective", "Tired", "Nurturing"]
}

SYSTEM_SNARK = [
    "The System found this in a trash bin. Enjoy.",
    "A reward for your 'hard work.' Try not to lose it.",
    "This item has a 0.04% chance of actually being useful.",
    "Forged in the fires of your own obsession.",
    "The System acknowledges your survival. For now.",
    "Property of a dead adventurer. Waste not, want not.",
    "A pity prize for finishing another book.",
    "Slightly better than nothing. Only slightly."
]

def generate_creative_name(title):
    title_low = title.lower()
    prefix = "Standard"
    for key, options in THEMES.items():
        if key in title_low:
            prefix = random.choice(options)
            break
    
    # Decide item category based on title keywords or random
    if "sword" in title_low or "blade" in title_low: cat = "Weapon"
    elif "ring" in title_low: cat = "Ring"
    elif "amulet" in title_low or "necklace" in title_low: cat = "Neck"
    elif "trinket" in title_low or "charm" in title_low: cat = "Trinket"
    elif "helm" in title_low or "cowl" in title_low: cat = "Head"
    else: cat = random.choice(list(ITEM_TYPES.keys()))
    
    sub_type_prefix = random.choice(ITEM_TYPES[cat])
    
    # Create name based on suffix of prefix (e.g. weapon_sword_ -> Sword)
    suffix = sub_type_prefix.split('_')[1].capitalize()
    return f"{prefix} {suffix}", cat, sub_type_prefix

def generate_loot_row(book, index):
    series_name = book['Series Name']
    series_slug = slugify(series_name)
    book_title = book['Book Title']
    
    item_name, category, prefix = generate_creative_name(book_title)
    icon_file = pick_random_icon(prefix)
    
    # Rarity logic
    rarity_roll = random.random()
    if rarity_roll > 0.95: rarity = "Epic"
    elif rarity_roll > 0.80: rarity = "Rare"
    elif rarity_roll > 0.50: rarity = "Uncommon"
    else: rarity = "Common"

    multiplier = {"Common": 1, "Uncommon": 2, "Rare": 4, "Epic": 8}[rarity]
    str_val = (5 + index) * multiplier
    hp_val = (10 + (index * 2)) * multiplier
    
    return {
        "item_id": f"loot_{series_slug}_{index+1:03d}",
        "item_name": item_name,
        "slot": category,
        "str": str_val,
        "mag": 0,
        "def": index * multiplier,
        "hp": hp_val,
        "special_ability": "None",
        "rarity": rarity,
        "flavor_text": random.choice(SYSTEM_SNARK),
        "series_tag": series_name,
        "icon": f"/icons/{icon_file}"
    }

def generate_book_achievement(book):
    title = book['Book Title']
    series = book['Series Name']
    icon_file = pick_random_icon("icons_quest_books_")
    
    return {
        "title": title,
        "achievement": f"{series}: {title}",
        "flavorText": random.choice(SYSTEM_SNARK),
        "trigger": f"Finish the book: {title}",
        "id": f"q_book_{slugify(title)}",
        "category": "quest",
        "tags": f"book,quest,{slugify(series)}",
        "points": 5,
        "xp_reward": 15000,
        "iconPath": f"/icons/{icon_file}",
        "rarity": "Common"
    }

def generate_series_achievement(series_name):
    series_slug = slugify(series_name)
    icon_file = pick_random_icon("icons_quest_scroll_")
    return {
        "title": series_name,
        "achievement": f"{series_name} Completionist",
        "flavorText": f"The entire {series_name} series has been cataloged. You are a monster of focus.",
        "trigger": f"Complete all books in {series_name}",
        "id": f"q_series_{series_slug}",
        "category": "series_complete",
        "tags": "series,campaign",
        "points": 25,
        "xp_reward": 100000,
        "iconPath": f"/icons/{icon_file}",
        "rarity": "Epic"
    }

def merge_content(new_achievements, new_loot):
    # 1. Backups
    print("Creating backups...")
    os.system(f"cp {ACHIEVEMENTS_PATH} {ACHIEVEMENTS_PATH}.bak")
    os.system(f"cp {LOOT_PATH} {LOOT_PATH}.bak")

    # 2. Merge Achievements
    print(f"Merging {len(new_achievements)} achievements...")
    with open(ACHIEVEMENTS_PATH, 'r+', encoding='utf-8') as f:
        data = json.load(f)
        if isinstance(data, dict) and "achievements" in data:
            data["achievements"].extend(new_achievements)
        else:
            data.extend(new_achievements)
        f.seek(0)
        json.dump(data, f, indent=2)
        f.truncate()

    # 3. Merge Loot
    print(f"Merging {len(new_loot)} loot items...")
    with open(LOOT_PATH, 'a', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=["item_id","item_name","slot","str","mag","def","hp","special_ability","rarity","flavor_text","series_tag","icon"])
        writer.writerows(new_loot)

def run():
    discovery_path = "new_library_discovery.csv"
    if not os.path.exists(discovery_path):
        print("Discovery file not found.")
        return

    with open(discovery_path, mode='r', encoding='utf-8') as f:
        data = list(csv.DictReader(f))
        
    new_items = [row for row in data if row['Status'] == 'NEW']
    
    if not new_items:
        print("No new books found in discovery file.")
        return

    series_map = {}
    for b in new_items:
        s_name = b['Series Name']
        if s_name not in series_map: series_map[s_name] = []
        series_map[s_name].append(b)

    achievements = []
    loot_rows = []

    for s_name, books in series_map.items():
        print(f"Processing: {s_name}...")
        for idx, b in enumerate(books):
            achievements.append(generate_book_achievement(b))
            loot_rows.append(generate_loot_row(b, idx))
        achievements.append(generate_series_achievement(s_name))

    # ASK FOR MERGE
    print(f"\nCreated {len(achievements)} achievements and {len(loot_rows)} loot items.")
    confirm = input("Would you like to AUTOMATICALLY merge these into the System files? (y/n): ")
    
    if confirm.lower() == 'y':
        merge_content(achievements, loot_rows)
        print("\nSUCCESS: System updated and backups created.")
    else:
        # Just write snippets for manual review
        with open("draft_achievements.json", "w", encoding="utf-8") as f:
            json.dump(achievements, f, indent=2)
        with open("draft_loot.csv", "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=["item_id","item_name","slot","str","mag","def","hp","special_ability","rarity","flavor_text","series_tag","icon"])
            writer.writeheader()
            writer.writerows(loot_rows)
        print("\nDrafts saved to draft_achievements.json and draft_loot.csv for manual review.")

if __name__ == "__main__":
    run()
