import csv
import json
import os
import re
import random
import glob
import sys

# --- CONFIGURATION ---
# Paths inside the container
ICON_DIR = "/data/icons"
ACHIEVEMENTS_PATH = "/data/json/achievements.points.json"
QUESTS_PATH = "/app/csv/quest.csv"
LOOT_PATH = "/app/csv/loot.csv"

def slugify(text):
    if not text: return "unknown"
    return re.sub(r'[^a-z0-9]+', '_', text.lower()).strip('_')

def pick_random_icon(prefix):
    """
    Looks into the icon directory and finds all files matching the prefix.
    Returns just the filename.
    """
    pattern = os.path.join(ICON_DIR, f"{prefix}*.png")
    matches = glob.glob(pattern)
    if not matches:
        return "inv_misc_questionmark.png"

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

QUEST_REWARDS = [
    "The System notes your progress.",
    "One step closer to literary immortality.",
    "Another spine on the shelf of your achievements.",
    "The System is mildly impressed.",
    "You survived this one. The next might kill you.",
    "A tale added to your legend.",
    "Your reward: more books to read."
]

def generate_creative_name(title):
    title_low = title.lower()
    prefix = "Standard"
    for key, options in THEMES.items():
        if key in title_low:
            prefix = random.choice(options)
            break

    if "sword" in title_low or "blade" in title_low: cat = "Weapon"
    elif "ring" in title_low: cat = "Ring"
    elif "amulet" in title_low or "necklace" in title_low: cat = "Neck"
    elif "trinket" in title_low or "charm" in title_low: cat = "Trinket"
    elif "helm" in title_low or "cowl" in title_low: cat = "Head"
    else: cat = random.choice(list(ITEM_TYPES.keys()))

    sub_type_prefix = random.choice(ITEM_TYPES[cat])
    suffix = sub_type_prefix.split('_')[1].capitalize()
    return f"{prefix} {suffix}", cat, sub_type_prefix

def generate_loot_row(book, index):
    series_name = book['Series Name']
    series_slug = slugify(series_name)
    book_title = book['Book Title']

    item_name, category, prefix = generate_creative_name(book_title)
    icon_file = pick_random_icon(prefix)

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

def generate_book_quest(book, series_slug):
    """Generate a quest for completing a specific book."""
    title = book['Book Title']
    series = book['Series Name']
    sequence = book.get('Sequence', '')
    icon_file = pick_random_icon("icons_quest_books_")

    seq_display = f"#{sequence}" if sequence else "Book"

    return {
        "quest_id": f"q_book_{series_slug}_{slugify(title)}",
        "title": f"{series} - {title}",
        "description": f"Finish the book: {title}",
        "quest_type": "book",
        "series_tag": series,
        "sequence": sequence or "0",
        "reward_xp": 1000,
        "reward_points": 5,
        "icon": f"/icons/{icon_file}"
    }

def generate_series_achievement(series_name):
    """Generate a series completion achievement (not a quest)."""
    series_slug = slugify(series_name)
    icon_file = pick_random_icon("icons_quest_scroll_")

    return {
        "title": series_name,
        "achievement": f"{series_name} Completionist",
        "flavorText": f"The entire {series_name} series has been cataloged. You are a monster of focus.",
        "trigger": f"Complete the {series_name} series.",
        "id": f"q_series_{series_slug}",
        "category": "series_complete",
        "tags": "series,campaign",
        "points": 25,
        "xp_reward": 10000,
        "iconPath": f"/icons/{icon_file}",
        "rarity": "Epic"
    }

def generate_series_quest(series_name):
    """Generate a quest for completing an entire series."""
    series_slug = slugify(series_name)
    icon_file = pick_random_icon("icons_quest_scroll_")

    return {
        "quest_id": f"q_series_complete_{series_slug}",
        "title": f"Complete {series_name}",
        "description": f"Finish all books in the {series_name} series.",
        "quest_type": "series",
        "series_tag": series_name,
        "reward_xp": 25000,
        "reward_points": 100,
        "icon": f"/icons/{icon_file}"
    }

def merge_achievements(new_achievements):
    """Append new achievements to achievements.points.json with backup."""
    print("Creating backup...")
    os.system(f"cp {ACHIEVEMENTS_PATH} {ACHIEVEMENTS_PATH}.bak")

    print(f"Merging {len(new_achievements)} series completion achievements...")
    with open(ACHIEVEMENTS_PATH, 'r+', encoding='utf-8') as f:
        data = json.load(f)
        if isinstance(data, dict) and "achievements" in data:
            data["achievements"].extend(new_achievements)
        else:
            data.extend(new_achievements)
        f.seek(0)
        json.dump(data, f, indent=2)
        f.truncate()

def merge_quests(new_quests):
    """Append new quests to quest.csv with backup."""
    print("Creating quest backup...")
    os.system(f"cp {QUESTS_PATH} {QUESTS_PATH}.bak 2>/dev/null || true")

    print(f"Merging {len(new_quests)} quests...")
    fieldnames = ["quest_id", "title", "description", "quest_type", "series_tag", "sequence", "reward_xp", "reward_points", "icon"]

    with open(QUESTS_PATH, 'a', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writerows(new_quests)

def run():
    discovery_path = "new_library_discovery.csv"
    if not os.path.exists(discovery_path):
        print("Discovery file not found.")
        return

    with open(discovery_path, mode='r', encoding='utf-8') as f:
        data = list(csv.DictReader(f))

    new_items = [row for row in data if row['Status'] == 'NEW']

    if not new_items:
        print("No new series found in discovery file.")
        return

    # Group by series to identify unique new series
    series_map = {}
    for b in new_items:
        s_name = b['Series Name']
        if s_name not in series_map: series_map[s_name] = []
        series_map[s_name].append(b)

    new_achievements = []  # Series completion achievements only
    new_quests = []        # Book quests + series quests
    loot_rows = []

    print(f"Processing {len(series_map)} NEW series...")
    for s_idx, (s_name, books) in enumerate(series_map.items(), 1):
        print(f"  [{s_idx}/{len(series_map)}] {s_name} ({len(books)} books)")
        s_slug = slugify(s_name)

        # Create ONE series completion achievement
        new_achievements.append(generate_series_achievement(s_name))

        # Create series completion quest
        new_quests.append(generate_series_quest(s_name))

        # Create a quest for each book in the series
        for book_idx, book in enumerate(books):
            new_quests.append(generate_book_quest(book, s_slug))
            loot_rows.append(generate_loot_row(book, book_idx))

    # Summary
    print(f"\nCreated {len(new_achievements)} series achievements and {len(new_quests)} quests.")
    print(f"Also created {len(loot_rows)} loot items.")

    # Check for command-line flags first
    if "--draft" in sys.argv:
        # Save as drafts
        with open("draft_achievements.json", "w", encoding="utf-8") as f:
            json.dump(new_achievements, f, indent=2)
        with open("draft_quests.csv", "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=["quest_id", "title", "description", "quest_type", "series_tag", "sequence", "reward_xp", "reward_points", "icon"])
            writer.writeheader()
            writer.writerows(new_quests)
        with open("draft_loot.csv", "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=["item_id","item_name","slot","str","mag","def","hp","special_ability","rarity","flavor_text","series_tag","icon"])
            writer.writeheader()
            writer.writerows(loot_rows)
        print("\nDrafts saved to draft_achievements.json, draft_quests.csv, and draft_loot.csv for manual review.")
        return

    # Determine if stdin is interactive
    is_interactive = sys.stdin.isatty()

    if "--auto-merge" in sys.argv or not is_interactive:
        # Auto-merge if flag is set OR if running non-interactively (e.g., from web)
        confirm = "y"
        if "--auto-merge" in sys.argv:
            print("Auto-merge enabled (--auto-merge flag detected)")
        else:
            print("Running non-interactively: auto-merging by default")
    else:
        try:
            confirm = input("Would you like to AUTOMATICALLY merge these into the System files? (y/n): ")
        except EOFError:
            print("Running non-interactively: auto-merging by default")
            confirm = "y"

    if confirm.lower() == 'y':
        merge_achievements(new_achievements)
        merge_quests(new_quests)
        if loot_rows:
            print(f"Merging {len(loot_rows)} loot items...")
            os.system(f"cp {LOOT_PATH} {LOOT_PATH}.bak")
            with open(LOOT_PATH, 'a', newline='', encoding='utf-8') as f:
                writer = csv.DictWriter(f, fieldnames=["item_id","item_name","slot","str","mag","def","hp","special_ability","rarity","flavor_text","series_tag","icon"])
                writer.writerows(loot_rows)
        print("\nSUCCESS: System updated and backups created.")

if __name__ == "__main__":
    run()
