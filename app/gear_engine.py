# -----------------------------------------
# gear_engine.py  —  LitRPG Gear System
# -----------------------------------------
# Handles: CSV loading, XP/level math, base stats, item level,
# rarity, loot drops, auto-equip, and grandfather init.
# -----------------------------------------

import csv
import math
import random
import hashlib
import re
import time
from typing import Dict, List, Optional, Set, Tuple

# -----------------------------------------
# Section 1: Constants
# -----------------------------------------

# The Day the System AI took control (Launch Day)
# January 01, 2026 00:00 AM UTC
import os

SYSTEM_INTEGRATION_TIMESTAMP = int(os.getenv("XP_START_TIMESTAMP", "1767225600"))

RARITY_MULTIPLIERS: Dict[str, float] = {
    "Common": 1.0,
    "Uncommon": 1.15,
    "Rare": 1.35,
    "Epic": 1.6,
    "Legendary": 2.0,
}
RARITY_ORDER = ["Common", "Uncommon", "Rare", "Epic", "Legendary"]
MILESTONE_SLOT_ROTATION = ["Weapon", "Head", "Chest", "Neck", "Ring", "Trinket"]

# Per-level stat gains
LEVEL_STR_GAIN = 2
LEVEL_MAG_GAIN = 2
LEVEL_DEF_GAIN = 3
LEVEL_HP_GAIN  = 10

# Items that cannot be randomly rolled (must be explicitly awarded)
_SYSTEM_ITEMS = {"loot_000", "loot_000a", "loot_000b"}


def _norm(s: str) -> str:
    """Normalize a string for fuzzy name matching."""
    return re.sub(r"[^a-z0-9]+", " ", (s or "").lower()).strip()


# -----------------------------------------
# Section 2: CSV Loaders
# -----------------------------------------

def load_loot_csv(path: str) -> Dict[str, dict]:
    """Parse loot.csv → {item_id: item_dict}"""
    gear: Dict[str, dict] = {}
    try:
        with open(path, newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                item_id = (row.get("item_id") or "").strip()
                if not item_id:
                    continue
                gear[item_id] = {
                    "item_id":         item_id,
                    "item_name":       (row.get("item_name") or "").strip(),
                    "slot":            _clean_text(row.get("slot")),
                    "str":             _int(row.get("str")),
                    "mag":             _int(row.get("mag")),
                    "def":             _int(row.get("def")),
                    "hp":              _int(row.get("hp")),
                    "special_ability": _clean_text(row.get("special_ability")),
                    "rarity":          (row.get("rarity") or "Common").strip() or "Common",
                    "flavor_text":     (row.get("flavor_text") or "").strip(),
                    "series_tag":      (row.get("series_tag") or "").strip(),
                    "icon":            (row.get("icon") or "").strip(),
                }
    except FileNotFoundError:
        print(f"[gear] loot.csv not found at {path}")
    except Exception as e:
        print(f"[gear] Error loading loot.csv: {e}")
    return gear


def load_quests_csv(path: str) -> Tuple[Dict[str, dict], Dict[str, dict], Dict[str, dict]]:
    """
    Parse quest.csv.
    Returns (by_id, by_series_name_norm, by_book_title_norm).
    """
    by_id:     Dict[str, dict] = {}
    by_series: Dict[str, dict] = {}
    by_book:   Dict[str, dict] = {}
    try:
        with open(path, newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                qid = (row.get("quest_id") or "").strip()
                if not qid:
                    continue
                q = {
                    "quest_id":          qid,
                    "target_type":       (row.get("target_type") or "").strip(),
                    "target_name":       (row.get("target_name") or "").strip(),
                    "quest_name":        (row.get("quest_name") or "").strip(),
                    "description":       (row.get("description") or "").strip(),
                    "xp_reward":         _int(row.get("xp_reward")),
                    "guaranteed_loot_id": (row.get("guaranteed_loot_id") or "").strip(),
                    "lore_source":       (row.get("lore_source") or "").strip(),
                    "dmg":               _int(row.get("dmg")),
                }
                by_id[qid] = q
                norm_name = _norm(q["target_name"])
                if q["target_type"] == "series":
                    by_series[norm_name] = q
                elif q["target_type"] == "book":
                    by_book[norm_name] = q
        print(f"[gear] Loaded {len(by_id)} quests from {path} ({len(by_series)} series, {len(by_book)} books)")
    except FileNotFoundError:
        print(f"[gear] quest.csv not found at {path}")
    except Exception as e:
        print(f"[gear] Error loading quest.csv: {e}")
    return by_id, by_series, by_book


def load_xp_curve(path: str) -> List[int]:
    """
    Parse 'xp curve.csv' → list of XP required per level (index 0 = Level 1).
    100 entries expected.
    """
    xp_per_level: List[int] = []
    try:
        with open(path, newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                lvl_raw = (row.get("Level") or "").strip()
                xp_raw  = (row.get("XP Required Per Level") or "").replace(",", "").strip()
                if lvl_raw.isdigit() and xp_raw.isdigit():
                    xp_per_level.append(int(xp_raw))
    except FileNotFoundError:
        print(f"[gear] xp curve.csv not found at {path}")
    except Exception as e:
        print(f"[gear] Error loading xp curve.csv: {e}")

    if not xp_per_level:
        # Fallback linear curve
        xp_per_level = [500 + i * 1000 for i in range(100)]
    return xp_per_level


def _int(v) -> int:
    try:
        return int(v or 0)
    except (ValueError, TypeError):
        return 0


def _clean_text(v) -> str:
    s = str(v or "").strip()
    return "" if s.lower() == "none" else s


# -----------------------------------------
# Section 3: XP & Level Calculations
# -----------------------------------------

def xp_from_hours(total_hours: float, user_sessions: List[dict] = None) -> int:
    """
    PRIMARY XP SOURCE: 500 XP per hour of listening.
    ONLY 2026+ data is used. Pre-2026 is ignored.
    At 8 hrs/day for a year this yields ~1,460,000 XP (~79% of level 100).
    """
    if not user_sessions:
        return 0

    new_sec = 0
    for s in user_sessions:
        ts = int(s.get("startedAt", 0)) / 1000
        dur = int(s.get("timeListening", s.get("duration", 0)))
        if ts >= SYSTEM_INTEGRATION_TIMESTAMP:
            new_sec += dur

    new_hours = new_sec / 3600.0
    return int(new_hours * 500)


def _book_quest_xp(duration_seconds: float) -> int:
    """XP reward for completing a single book, tiered by audiobook duration."""
    hours = duration_seconds / 3600.0 if duration_seconds else 0
    if hours >= 20:
        return 2000
    elif hours >= 12:
        return 1500
    elif hours >= 6:
        return 1000
    else:
        return 500


def _series_quest_xp(book_count: int) -> int:
    """XP reward for completing an entire series, tiered by number of books."""
    if book_count >= 16:
        return 10000
    elif book_count >= 11:
        return 7500
    elif book_count >= 7:
        return 5000
    elif book_count >= 4:
        return 3000
    else:
        return 1500


def _book_quest_rarity(duration_seconds: float) -> str:
    """Rarity for a book quest based on audiobook duration."""
    hours = duration_seconds / 3600.0 if duration_seconds else 0
    if hours >= 20:
        return "Epic"
    elif hours >= 12:
        return "Rare"
    elif hours >= 6:
        return "Uncommon"
    else:
        return "Common"


def _series_quest_rarity(book_count: int) -> str:
    """Rarity for a series quest based on number of books."""
    if book_count >= 16:
        return "Legendary"
    elif book_count >= 7:
        return "Epic"
    elif book_count >= 4:
        return "Rare"
    else:
        return "Uncommon"


def xp_from_quests(
    finished_ids: Set[str],
    finished_dates: Dict[str, int],
    series_index: List[dict],
    quests_by_series: Dict[str, dict],
) -> int:
    """
    SECONDARY XP SOURCE: Quest completions (~21% of total XP).
    Book quest XP is tiered by audiobook duration.
    Series quest XP is tiered by number of books in the series.
    Hand-crafted CSV entries override auto-calculated values.
    STRICT 2026 FILTER: Completions with missing or 0 timestamps are IGNORED.
    """
    total = 0

    # Build a lookup: book_id -> {duration, series_name} from series_index
    book_info: Dict[str, dict] = {}
    for s in series_index:
        for b in (s.get("books") or []):
            bid = b.get("libraryItemId")
            if bid:
                book_info[bid] = {
                    "duration": float(b.get("duration") or 0),
                    "title": b.get("title") or "",
                    "series": s.get("seriesName") or "",
                }

    # 1. BOOK COMPLETION XP (tiered by duration)
    for bid, ts in finished_dates.items():
        if ts and ts >= SYSTEM_INTEGRATION_TIMESTAMP:
            info = book_info.get(bid, {})
            dur = info.get("duration", 0)
            total += _book_quest_xp(dur)

    # 2. SERIES COMPLETION XP (tiered by book count)
    seen_series: Set[str] = set()
    for s in series_index:
        series_name = s.get("seriesName", "")
        books = s.get("books") or []
        book_ids = [b.get("libraryItemId") for b in books if b.get("libraryItemId")]

        if not book_ids or not all(bid in finished_ids for bid in book_ids):
            continue

        norm_s = _norm(series_name)
        if norm_s not in seen_series:
            ts_values = [finished_dates.get(bid, 0) for bid in book_ids]
            valid_ts = [t for t in ts_values if t and t > 0]

            if valid_ts:
                completion_ts = max(valid_ts)
                if completion_ts >= SYSTEM_INTEGRATION_TIMESTAMP:
                    # Use CSV override XP if available, otherwise auto-calculate
                    quest = quests_by_series.get(norm_s)
                    if quest and quest.get("xp_reward"):
                        total += int(quest["xp_reward"])
                    else:
                        total += _series_quest_xp(len(book_ids))
                    seen_series.add(norm_s)

    return total


def xp_from_achievements(
    user_awards: List[dict],
    achievements_def: Dict[str, dict],
) -> int:
    """
    Achievements grant ZERO XP. They are cosmetic badges with points
    for leaderboard display only. All real XP comes from listening
    time (500 XP/hr) and quest completions (book/series).
    """
    return 0


def get_verified_book_ids(
    finished_ids: Set[str],
    user_sessions: List[dict],
    threshold: float = 0.80,
    require_duration_for_credit: bool = True,
    require_integration_session_for_credit: bool = True,
) -> Set[str]:
    """
    Strict, fail-closed verifier for 2026 completion credit.

    Rules (per book):
    - finishedAt must already be 2026+ (enforced by caller before passing finished_ids)
    - at least one 2026 listening session must exist for that book
    - book duration must be known (>0)
    - listened_seconds_in_2026 / book_duration >= threshold

    If proof is missing, the book is excluded from progression credit.
    """
    if not finished_ids:
        return set()

    if not user_sessions:
        print(f"[verify] {len(finished_ids)} book(s) excluded (no session history available).")
        return set()

    def _epoch_seconds(v) -> int:
        try:
            n = float(v or 0)
        except (TypeError, ValueError):
            return 0
        if n <= 0:
            return 0
        # ABS usually returns milliseconds; guard for either unit.
        if n >= 10_000_000_000:
            return int(n / 1000)
        return int(n)

    # Build per-book stats from session history.
    # We sum listening time ONLY from 2026+ sessions, but allow duration from any session.
    book_stats: Dict[str, dict] = {}
    for s in user_sessions:
        book_id = str(s.get("libraryItemId") or "")
        if not book_id or book_id not in finished_ids:
            continue

        stats = book_stats.setdefault(book_id, {
            "listened_2026": 0.0,
            "book_duration": 0.0,
            "sessions_2026": 0,
        })

        duration = float(s.get("duration") or 0)
        if duration > stats["book_duration"]:
            stats["book_duration"] = duration

        started_at_sec = _epoch_seconds(s.get("startedAt") or s.get("startTime") or s.get("started_at"))
        if started_at_sec < SYSTEM_INTEGRATION_TIMESTAMP:
            continue

        stats["sessions_2026"] += 1
        stats["listened_2026"] += float(s.get("timeListening") or 0)

    verified: Set[str] = set()
    excluded: List[str] = []

    for book_id in finished_ids:
        stats = book_stats.get(book_id)
        if not stats or stats["sessions_2026"] <= 0:
            if require_integration_session_for_credit:
                excluded.append(f"{book_id}(no_2026_sessions)")
                continue
            verified.add(book_id)
            continue

        if stats["book_duration"] <= 0:
            if require_duration_for_credit:
                excluded.append(f"{book_id}(unknown_duration)")
                continue
            verified.add(book_id)
            continue

        ratio = stats["listened_2026"] / stats["book_duration"]
        if ratio >= threshold:
            verified.add(book_id)
        else:
            excluded.append(f"{book_id}({ratio:.0%})")

    if excluded:
        print(f"[verify] {len(excluded)} book(s) excluded (strict <{threshold:.0%} in 2026): {', '.join(excluded)}")

    return verified

def level_from_xp(total_xp: int, xp_per_level: List[int]) -> Tuple[int, int, int]:
    """
    Returns (level, xp_into_current_level, xp_needed_for_next_level).
    Level is 1-based.
    """
    cumulative = 0
    for i, threshold in enumerate(xp_per_level):
        if total_xp < cumulative + threshold:
            return (i + 1, total_xp - cumulative, threshold)
        cumulative += threshold
    # At max level
    last = xp_per_level[-1] if xp_per_level else 1
    return (len(xp_per_level), last, last)


def squish_level(true_level: int) -> int:
    """
    Grandfather level squish formula.
    If true_level > 20: launch_level = 20 + floor(sqrt(true_level - 20))
    """
    if true_level <= 20:
        return true_level
    return 20 + int(math.floor(math.sqrt(true_level - 20)))


# -----------------------------------------
# Section 4: Base Stats
# -----------------------------------------

def seed_base_stats(user_id: str) -> dict:
    """
    Deterministic base stats seeded by user_id.
    STR/MAG/DEF: 8-12, HP: 40-60.
    """
    seed = int(hashlib.md5(user_id.encode()).hexdigest()[:8], 16)
    rng = random.Random(seed)
    return {
        "base_str": rng.randint(8, 12),
        "base_mag": rng.randint(8, 12),
        "base_def": rng.randint(8, 12),
        "base_hp":  rng.randint(40, 60),
    }


def level_stat_bonus(level: int) -> dict:
    """Flat stat bonuses from leveling."""
    lvl = max(0, level - 1)
    return {
        "str": lvl * LEVEL_STR_GAIN,
        "mag": lvl * LEVEL_MAG_GAIN,
        "def": lvl * LEVEL_DEF_GAIN,
        "hp":  lvl * LEVEL_HP_GAIN,
    }


# -----------------------------------------
# Section 5: Item Level & Rarity
# -----------------------------------------

def item_level(item: dict) -> int:
    """iLvl = floor((str*1.5 + mag*1.5 + def*1.2 + hp*0.8) * rarity_multiplier)"""
    s = max(0, int(item.get("str", 0) or 0))
    m = max(0, int(item.get("mag", 0) or 0))
    d = max(0, int(item.get("def", 0) or 0))
    h = max(0, int(item.get("hp", 0) or 0))
    mult = RARITY_MULTIPLIERS.get(item.get("rarity", "Common"), 1.0)
    raw = s * 1.5 + m * 1.5 + d * 1.2 + h * 0.8
    return int(math.floor(raw * mult))


def rarity_for_duration(hours: float) -> str:
    """Map book duration → drop rarity."""
    if hours < 5:  return "Common"
    if hours < 10: return "Uncommon"
    if hours < 20: return "Rare"
    if hours < 35: return "Epic"
    return "Legendary"


def rarity_for_book_count(n: int) -> str:
    """Map series book count → drop rarity."""
    if n <= 1:  return "Common"
    if n <= 3:  return "Uncommon"
    if n <= 6:  return "Rare"
    if n <= 10: return "Epic"
    return "Legendary"


# -----------------------------------------
# Section 6: Loot Rolling
# -----------------------------------------

def _eligible_items(gear_catalog: dict, rarity: str) -> List[str]:
    return [
        iid for iid, item in gear_catalog.items()
        if item.get("rarity") == rarity and iid not in _SYSTEM_ITEMS
    ]


def random_item_by_rarity(
    rarity: str,
    gear_catalog: Dict[str, dict],
    owned_ids: Set[str],
) -> Optional[str]:
    """
    Pick a random item of given rarity. Re-roll if already owned.
    Falls back to the next lower rarity pool if rarity pool is empty.
    """
    candidates = _eligible_items(gear_catalog, rarity)

    if not candidates:
        idx = RARITY_ORDER.index(rarity) if rarity in RARITY_ORDER else 4
        for r in reversed(RARITY_ORDER[:idx]):
            candidates = _eligible_items(gear_catalog, r)
            if candidates:
                break

    if not candidates:
        return None

    not_owned = [c for c in candidates if c not in owned_ids]
    return random.choice(not_owned) if not_owned else random.choice(candidates)



def random_item_by_slot(
    slot: str,
    gear_catalog: Dict[str, dict],
    owned_ids: Set[str],
    preferred_rarity: str = "Uncommon",
) -> Optional[str]:
    """Pick a random not-owned item for a specific slot."""
    slot_candidates = [
        iid
        for iid, item in gear_catalog.items()
        if item.get("slot") == slot and iid not in _SYSTEM_ITEMS
    ]
    if not slot_candidates:
        return None

    preferred_pool = [
        iid for iid in slot_candidates
        if gear_catalog.get(iid, {}).get("rarity") == preferred_rarity
    ]
    pool = preferred_pool if preferred_pool else slot_candidates
    not_owned = [iid for iid in pool if iid not in owned_ids]
    return random.choice(not_owned) if not_owned else None


def _rotation_start_index(owned_ids: Set[str]) -> int:
    non_system_owned = sum(1 for iid in owned_ids if iid not in _SYSTEM_ITEMS)
    return non_system_owned % len(MILESTONE_SLOT_ROTATION)


def random_item_round_robin(
    gear_catalog: Dict[str, dict],
    owned_ids: Set[str],
    preferred_rarity: str = "Uncommon",
) -> Tuple[Optional[str], Optional[str]]:
    """
    Select the next loot drop by global slot rotation for this user.
    Rotation uses all owned non-system items so every source advances the same cycle.
    """
    if not gear_catalog:
        return None, None

    start_idx = _rotation_start_index(owned_ids)
    for offset in range(len(MILESTONE_SLOT_ROTATION)):
        slot = MILESTONE_SLOT_ROTATION[(start_idx + offset) % len(MILESTONE_SLOT_ROTATION)]
        loot_id = random_item_by_slot(slot, gear_catalog, owned_ids, preferred_rarity=preferred_rarity)
        if loot_id:
            return loot_id, slot
    return None, None

# -----------------------------------------
# Section 7: Auto-Equip
# -----------------------------------------

_ACC_SLOTS = ["Neck", "Ring", "Trinket"]


def get_equipped(inventory: List[dict], gear_catalog: Dict[str, dict], manual_map: Dict[str, str] = None) -> dict:
    """
    Best item per slot by iLvl, OR manual override.
    Slots: Weapon, Head, Chest, Neck, Ring, Trinket.
    """
    manual_map = manual_map or {}
    by_slot: Dict[str, List[Tuple[int, dict]]] = {
        "Weapon": [], "Head": [], "Chest": [], "Neck": [], "Ring": [], "Trinket": []
    }

    # Owned items grouped by slot
    owned_ids = {inv["item_id"] for inv in inventory}

    for inv_item in inventory:
        item = gear_catalog.get(inv_item["item_id"])
        if not item:
            continue
        slot = item.get("slot", "")
        if slot in by_slot:
            by_slot[slot].append((item_level(item), item))

    result: dict = {}

    # Process all slots independently — best iLvl wins, manual map overrides
    for slot in ("Weapon", "Head", "Chest", "Neck", "Ring", "Trinket"):
        m_id = manual_map.get(slot)
        if m_id and m_id in owned_ids and gear_catalog.get(m_id, {}).get("slot") == slot:
            result[slot] = gear_catalog[m_id]
        else:
            items = sorted(by_slot[slot], key=lambda x: x[0], reverse=True)
            result[slot] = items[0][1] if items else None

    return result


def gear_stats(equipped: dict) -> dict:
    """Sum stats across all equipped items."""
    totals = {"str": 0, "mag": 0, "def": 0, "hp": 0}
    for item in equipped.values():
        if not item:
            continue
        for stat in totals:
            totals[stat] += int(item.get(stat, 0) or 0)
    return totals


def combat_power(total_str: int, total_mag: int, total_def: int, total_hp: int) -> int:
    """CP = (totalSTR*2) + (totalMAG*2) + (totalDEF*1.5) + (totalHP*0.5)"""
    return int(total_str * 2 + total_mag * 2 + total_def * 1.5 + total_hp * 0.5)


# -----------------------------------------
# Section 8: Gear Evaluator (runs each poll)
# -----------------------------------------

def evaluate_gear_for_user(
    snap,
    series_index: List[dict],
    quests_by_series: Dict[str, dict],
    gear_catalog: Dict[str, dict],
    store,
    current_level: Optional[int] = None,
) -> List[str]:
    """
    1. Check series completions -> award one round-robin slot drop.
    2. Check individual book completions -> award one round-robin slot drop.
    3. Award a bonus drop every 5 levels -> also round-robin slot drop.
    """
    user_id = snap.user_id
    inventory = store.get_inventory(user_id)
    owned_ids: Set[str] = {i["item_id"] for i in inventory}
    newly_awarded: List[str] = []

    # A) SERIES COMPLETIONS (Existing)
    for s in series_index:
        series_name = s.get("seriesName", "")
        series_id   = str(s.get("seriesId", s.get("id", ""))).strip()
        books = s.get("books") or []
        book_ids = [b.get("libraryItemId") for b in books if b.get("libraryItemId")]

        if not book_ids or not all(bid in snap.finished_ids for bid in book_ids):
            continue

        ts_values = [snap.finished_dates.get(bid, 0) for bid in book_ids]
        ts = max((t for t in ts_values if t > 0), default=int(time.time()))

        quest = quests_by_series.get(_norm(series_name))
        drop_key = f"gear:series:{series_id}" if series_id else f"gear:seriesname:{_norm(series_name)}"

        if not store.is_awarded(user_id, drop_key):
            preferred_rarity = rarity_for_book_count(len(book_ids))
            loot_id, slot = random_item_round_robin(
                gear_catalog, owned_ids, preferred_rarity=preferred_rarity
            )
            if loot_id:
                store.add_inventory_item(user_id, loot_id, f"series:{series_name}", ts)
                store.record_awards(user_id, [(
                    drop_key,
                    {"loot_id": loot_id, "series": series_name, "slot": slot, "_timestamp": ts},
                )])
                owned_ids.add(loot_id)
                newly_awarded.append(loot_id)

        # Record quest completion for series — auto-generate if no CSV entry
        if quest:
            quest_key = f"quest:series:{quest['quest_id']}"
            quest_name = quest["quest_name"]
            quest_xp = int(quest.get("xp_reward") or _series_quest_xp(len(book_ids)))
        else:
            # Auto-generated quest for series not in CSV
            auto_id = f"auto_{_norm(series_name)}"
            quest_key = f"quest:series:{auto_id}"
            quest_name = f"{series_name} Completionist"
            quest_xp = _series_quest_xp(len(book_ids))

        if not store.is_awarded(user_id, quest_key):
            print(f"[gear] Recording quest completion: {user_id} -> {quest_name} ({series_name})")
            store.record_awards(user_id, [(
                quest_key,
                {
                    "quest_name": quest_name,
                    "target_type": "series",
                    "target_name": series_name,
                    "xp_reward": quest_xp,
                    "rarity": _series_quest_rarity(len(book_ids)),
                    "book_count": len(book_ids),
                    "series": series_name,
                    "_timestamp": ts,
                },
            )])

    # B) INDIVIDUAL BOOK DROPS — loot + auto-quest for every book finished
    # Build book info lookup from series_index for duration-based rarity
    _book_lookup: Dict[str, dict] = {}
    for s in series_index:
        for b in (s.get("books") or []):
            bid = b.get("libraryItemId")
            if bid:
                _book_lookup[bid] = {
                    "duration": float(b.get("duration") or 0),
                    "title": b.get("title") or "",
                    "series": s.get("seriesName") or "",
                }

    if hasattr(snap, "finished_ids"):
        for bid in snap.finished_ids:
            info = _book_lookup.get(bid, {})
            dur = info.get("duration", 0)
            book_title = info.get("title", bid)

            # B1) Loot drop — rarity based on audiobook duration
            drop_key = f"gear:book:{bid}"
            if not store.is_awarded(user_id, drop_key):
                preferred_rarity = _book_quest_rarity(dur)
                loot_id, slot = random_item_round_robin(
                    gear_catalog, owned_ids, preferred_rarity=preferred_rarity
                )
                if loot_id:
                    ts = snap.finished_dates.get(bid, int(time.time()))
                    store.add_inventory_item(user_id, loot_id, f"book_completion:{bid}", ts)
                    store.record_awards(user_id, [(
                        drop_key,
                        {"loot_id": loot_id, "item_id": bid, "title": book_title, "slot": slot, "_timestamp": ts},
                    )])
                    owned_ids.add(loot_id)
                    newly_awarded.append(loot_id)

            # B2) Auto-quest completion for book
            quest_key = f"quest:book:{bid}"
            if not store.is_awarded(user_id, quest_key):
                ts = snap.finished_dates.get(bid, int(time.time()))
                xp = _book_quest_xp(dur)
                store.record_awards(user_id, [(
                    quest_key,
                    {
                        "quest_name": f"{book_title}",
                        "target_type": "book",
                        "target_name": book_title,
                        "xp_reward": xp,
                        "rarity": _book_quest_rarity(dur),
                        "series": info.get("series", ""),
                        "_timestamp": ts,
                    },
                )])


    # C) LEVEL MILESTONES (every 5 levels, round-robin slot order)
    level_now = int(current_level or 0)
    if level_now >= 5:
        for milestone in range(5, level_now + 1, 5):
            drop_key = f"gear:level:{milestone}"
            if store.is_awarded(user_id, drop_key):
                continue

            loot_id, slot = random_item_round_robin(
                gear_catalog, owned_ids, preferred_rarity="Uncommon"
            )
            if not loot_id:
                continue

            ts = int(time.time())
            store.add_inventory_item(
                user_id, loot_id, f"level_milestone:{milestone}:{(slot or 'unknown').lower()}", ts
            )
            store.record_awards(user_id, [(
                drop_key,
                {"loot_id": loot_id, "milestone_level": milestone, "slot": slot, "_timestamp": ts},
            )])
            owned_ids.add(loot_id)
            newly_awarded.append(loot_id)

    return newly_awarded


def calculate_unspent_points(level: int) -> int:
    """
    Calculate total points earned for reaching a level.
    Base: 5 points per level.
    Milestones: +20 bonus points every 10 levels (10, 20, 30...).
    """
    if level <= 1: return 0
    
    # 5 pts for every level gained (Level 2 = 5, Level 3 = 10...)
    total = (level - 1) * 5
    
    # Add milestone bonuses
    num_milestones = level // 10
    total += num_milestones * 20
    
    return total


# -----------------------------------------
# Section 9: Grandfather Init (one-time per user)
# -----------------------------------------

def grandfather_init(
    snap,
    series_index: List[dict],
    quests_by_series: Dict[str, dict],
    gear_catalog: Dict[str, dict],
    xp_per_level: List[int],
    listening_hours: float,
    store,
) -> dict:
    """
    One-time init for existing users:
    - Awards loot_000b (Echo of the Ancestor) legacy badge
    - Runs gear evaluator for all historical completions
    - Marks grandfather as done so it never runs again
    """
    user_id = snap.user_id

    if store.is_grandfather_done(user_id):
        return {"already_done": True}

    awarded_count = 0

    # Award the legacy badge
    inventory = store.get_inventory(user_id)
    owned_ids = {i["item_id"] for i in inventory}
    if "loot_000b" not in owned_ids:
        store.add_inventory_item(user_id, "loot_000b", "grandfather_legacy", int(time.time()))
        store.record_awards(user_id, [("gear:legacy:loot_000b", {
            "note": "Grandfather legacy badge",
            "_timestamp": int(time.time()),
        })])
        awarded_count += 1

    # Run full gear evaluator for historical completions
    new_gear = evaluate_gear_for_user(snap, series_index, quests_by_series, gear_catalog, store)
    awarded_count += len(new_gear)

    store.mark_grandfather_done(user_id)
    print(f"[gear] Grandfather init complete for {user_id}: {awarded_count} items awarded.")
    return {"done": True, "gear_awarded": awarded_count}


# -----------------------------------------
# Section 10: Class & Title Logic
# -----------------------------------------

def resolve_class_info(level: int, stats: dict, cp: int) -> Tuple[str, str, str]:
    """
    Procedural Title Generation: [Prefix] [Base] [Suffix]
    Now includes Elemental Affinity.
    """
    if level >= 100:
        return "System Administrator", "Ultimate Authority", "Void"

    # 1. Base Title (Every 5 Levels)
    base_titles = [
        "Novice", "Apprentice", "Wanderer", "Seeker", "Adventurer", 
        "Voyager", "Chronicler", "Scholar", "Sage", "Master", 
        "Grandmaster", "Paragon", "Exemplar", "Legend", "Myth", 
        "Immortal", "Transcendent", "Apex", "Celestial", "Divine"
    ]
    idx = min(len(base_titles) - 1, (level - 1) // 5)
    base = base_titles[idx]

    # 2. Prefix (Top 2 Stats)
    s, m, d, h = stats.get("str", 0), stats.get("mag", 0), stats.get("def", 0), stats.get("hp", 0)
    sorted_stats = sorted([("STR", s), ("MAG", m), ("DEF", d)], key=lambda x: x[1], reverse=True)
    top1, top2 = sorted_stats[0][0], sorted_stats[1][0]

    prefixes = {
        ("STR", "MAG"): "Battle-Mage",
        ("MAG", "STR"): "Spell-Blade",
        ("STR", "DEF"): "Juggernaut",
        ("DEF", "STR"): "Bulwark",
        ("MAG", "DEF"): "Inquisitor",
        ("DEF", "MAG"): "Ethereal",
    }
    prefix = prefixes.get((top1, top2), "Fierce" if top1 == "STR" else "Arcane" if top1 == "MAG" else "Stalwart")

    # 3. Suffix & Element (Last digit of total stats sum)
    suffix_pool = [
        "of the Void", "of the Eternal", "of the Ancient", "of the Arcane", 
        "of the Iron", "of the Mist", "of the Stars", "of the Deep", 
        "of the Dawn", "of the Fallen"
    ]
    elements = ["Void", "Fire", "Ice", "Storm", "Nature", "Mist", "Void", "Ice", "Storm", "Nature"]
    
    stat_sum = s + m + d + h
    suffix = suffix_pool[stat_sum % 10]
    element = elements[stat_sum % 10]

    title = f"{prefix} {base} {suffix}"
    
    # Flavor description
    if level >= 70:  desc = "The System Acknowledges You"
    elif level >= 40: desc = "Hardened by a Thousand Hours"
    elif level >= 20: desc = "The Grind Never Ends"
    else:             desc = "The System Awakens"

    return title, desc, element


# -----------------------------------------
# Section 11: Full Character Sheet Builder
# -----------------------------------------

def build_character_sheet(
    user_id: str,
    username: str,
    snap,
    series_index: List[dict],
    quests_by_series: Dict[str, dict],
    quests_by_book: Dict[str, dict],
    gear_catalog: Dict[str, dict],
    xp_per_level: List[int],
    listening_hours: float,
    currently_reading: Optional[dict],
    store,
    user_sessions: List[dict] = None,
    user_awards: List[dict] = None,
    achievements_def: Dict[str, dict] = None,
) -> dict:
    """
    Assemble the full character sheet for the API response.
    """
    # XP with Squish logic
    total_xp = (
        xp_from_hours(listening_hours, user_sessions)
        + xp_from_quests(snap.finished_ids, snap.finished_dates, series_index, quests_by_series)
        + xp_from_achievements(user_awards or [], achievements_def or {})
    )

    level, xp_in_level, xp_to_next = level_from_xp(total_xp, xp_per_level)

    # Base stats
    base = store.get_base_stats(user_id)
    if base is None:
        base = seed_base_stats(user_id)
        # We calculate initial unspent points based on level
        unspent = calculate_unspent_points(level)
        store.set_base_stats(
            user_id,
            base["base_str"], base["base_mag"],
            base["base_def"], base["base_hp"],
            unspent=unspent
        )
        base["unspent_points"] = unspent
        base["spent_str"] = 0
        base["spent_mag"] = 0
        base["spent_def"] = 0
        base["spent_hp"]  = 0
    else:
        # Re-calculate total points they SHOULD have at this level
        earned_total = calculate_unspent_points(level)
        # points currently held = earned - (points already spent)
        currently_spent = base.get("spent_str", 0) + base.get("spent_mag", 0) + base.get("spent_def", 0) + base.get("spent_hp", 0)
        correct_unspent = max(0, earned_total - currently_spent)
        if base.get("unspent_points", 0) != correct_unspent:
            store.update_unspent_points(user_id, correct_unspent)
            base["unspent_points"] = correct_unspent

    level_bonus = level_stat_bonus(level)
    
    # CHAR STATS = Base + Level Growth + Manual RPG Points
    char_str = base["base_str"] + level_bonus["str"] + base.get("spent_str", 0)
    char_mag = base["base_mag"] + level_bonus["mag"] + base.get("spent_mag", 0)
    char_def = base["base_def"] + level_bonus["def"] + base.get("spent_def", 0)
    char_hp  = min(9999, base["base_hp"] + level_bonus["hp"] + base.get("spent_hp", 0))

    # Inventory & equip (Filtered to 2026+)
    raw_inventory = store.get_inventory(user_id)
    inventory = [inv for inv in raw_inventory if inv.get("acquired_at", 0) >= SYSTEM_INTEGRATION_TIMESTAMP]
    
    manual_eq = store.get_manual_equipment(user_id)
    equipped  = get_equipped(inventory, gear_catalog, manual_eq)
    g_stats   = gear_stats(equipped)

    total_str = char_str + g_stats["str"]
    total_mag = char_mag + g_stats["mag"]
    total_def = char_def + g_stats["def"]
    total_hp  = min(9999, char_hp  + g_stats["hp"]) # HARD CAP AT 9,999

    cp = combat_power(total_str, total_mag, total_def, total_hp)
    
    # Class & Title & Element
    class_title, class_desc, element = resolve_class_info(level, {"str": total_str, "mag": total_mag, "def": total_def, "hp": total_hp}, cp)

    # Resolve active quest
    active_quest = None
    if currently_reading:
        book_title = currently_reading.get("title", "")
        norm_title = _norm(book_title)
        quest = quests_by_book.get(norm_title)
        
        # If not matched by book title, try matching series from the current book
        if not quest:
            # We don't have series info in currently_reading from abs-stats yet,
            # but maybe it's in the subtitle or we can find it in series_index
            for s in series_index:
                for b in s.get("books", []):
                    if b.get("libraryItemId") == currently_reading.get("libraryItemId"):
                        quest = quests_by_series.get(_norm(s.get("seriesName", "")))
                        break
                if quest: break

        active_quest = {
            "title":      book_title,
            "quest_name": quest["quest_name"] if quest else "Uncharted Knowledge",
            "progress":   round(currently_reading.get("progress", 0) * 100, 1),
            "xp_reward":  quest["xp_reward"] if quest else 0,
            "cover_url":  currently_reading.get("coverUrl"),
            "author":     currently_reading.get("authorText"),
        }

    # Clean equipped for JSON (item_level computed)
    def _item_out(item: Optional[dict]) -> Optional[dict]:
        if not item:
            return None
        out = dict(item)
        out["item_level"] = item_level(item)
        return out

    equipped_out = {slot: _item_out(item) for slot, item in equipped.items()}

    return {
        "user_id":        user_id,
        "username":       username,
        "level":          level,
        "class_title":    class_title,
        "class_desc":     class_desc,
        "element":        element,
        "current_xp":     xp_in_level,
        "xp_to_next":     xp_to_next,
        "total_xp":       total_xp,
        "listening_hours": round(listening_hours, 1),
        "books_finished": len(snap.finished_ids),
        "active_quest":   active_quest,
        "unspent_points": base.get("unspent_points", 0),
        "spent_stats": {
            "str": base.get("spent_str", 0),
            "mag": base.get("spent_mag", 0),
            "def": base.get("spent_def", 0),
            "hp":  base.get("spent_hp", 0),
        },
        "base_stats": {
            "str": base["base_str"],
            "mag": base["base_mag"],
            "def": base["base_def"],
            "hp":  base["base_hp"],
        },
        "char_stats": {
            "str": char_str,
            "mag": char_mag,
            "def": char_def,
            "hp":  char_hp,
        },
        "gear_stats": g_stats,
        "total_stats": {
            "str": total_str,
            "mag": total_mag,
            "def": total_def,
            "hp":  total_hp,
        },
        "combat_power":    cp,
        "equipped":        equipped_out,
        "inventory_count": len(inventory),
    }


# -----------------------------------------
# Section 11: Boss Stats (Wrapped Event)
# -----------------------------------------

def build_boss_stats(all_sheets: List[dict], boss_hp: int = 250000) -> dict:
    """
    Compute Wrapped event boss stats.
    Now uses a FIXED 250,000 HP Boss as per the 'Ironed Out' specs.
    """
    if not all_sheets:
        return {"boss_hp": int(boss_hp), "boss_atk": 2500, "player_count": 0, "total_cp": 0, "avg_cp": 0}

    cp_values  = [s.get("combat_power", 0) for s in all_sheets]
    def_values = [s.get("total_stats", {}).get("def", 0) for s in all_sheets]

    total_cp  = sum(cp_values)
    avg_cp    = total_cp / len(all_sheets) if all_sheets else 0
    total_def = sum(def_values)

    # Base Attack scales slightly with the group's average defense to keep it challenging
    boss_atk = max(2500, round(total_def * 3.0 / 100) * 100)

    return {
        "boss_hp":      int(boss_hp),
        "boss_atk":     boss_atk,
        "player_count": len(all_sheets),
        "total_cp":     round(total_cp),
        "avg_cp":       round(avg_cp),
    }


# -----------------------------------------
# Section 12: Combat Log Generator
# -----------------------------------------

def generate_combat_log(
    user_sheet: dict,
    boss: dict,
    total_hours: float,
    total_books: int,
    user_sessions: List[dict] = None,
    finished_dates: Dict[str, int] = None,
    peak_month_hours: float = 0,
) -> dict:
    """
    Generate battle numbers for the Wrapped combat sim using 250k HP Fixed Boss.
    Implements Percentage-Based Caps for each slide as per damage_calc.md.
    Only 2026 data is used for these specific battle formulas.
    """
    cp        = user_sheet.get("combat_power", 0)
    stats     = user_sheet.get("total_stats", {})
    total_str = stats.get("str", 0)
    total_mag = stats.get("mag", 0)
    total_def = stats.get("def", 0)
    total_hp  = stats.get("hp", 0)
    boss_hp   = int((boss or {}).get("boss_hp", 250000) or 250000)
    boss_base_atk = boss.get("boss_atk", 2500)
    level     = user_sheet.get("level", 1)

    # 1. HOURS DAMAGE (30% Cap: 75,000)
    # Target: Maxes at 600 hours
    hours_dmg = min(75000, int(total_hours * 125))

    # 2. BOOKS DAMAGE (25% Cap: 62,500)
    # Target: ~100 Books and ~1000+ STR to hit cap
    books_dmg = min(62500, (total_books * 400) + (total_str * 22))

    # 3. AUTHOR DAMAGE (15% Cap: 37,500)
    # Uses MAG and Top Author Hours
    # We'll approximate Top Author Hours as 15% of total hours for the log generator
    est_top_author_h = total_hours * 0.15 
    summon_dmg = min(37500, (total_mag * 25) + (est_top_author_h * 50))

    # 4. POISON DAMAGE (10% Cap: 25,000)
    # Uses MAG and Binge Count
    binge_count = sum(1 for s in (user_sessions or []) if int(s.get("timeListening", 0)) > 7200) # > 2 hours
    poison_dmg = min(25000, (total_mag * 15) + (binge_count * 1000))

    # 5. RETALIATION (Survival Check)
    retaliation_raw = boss_base_atk + int(peak_month_hours * 15)
    retaliation_dmg = max(100, retaliation_raw - (total_def * 3))
    
    # 6. EXECUTE (25% Cap: 62,500)
    # Uses CP
    execute_dmg = min(62500, cp * 15)
    
    total_player_dmg = hours_dmg + books_dmg + summon_dmg + poison_dmg + execute_dmg
    boss_defeated = total_player_dmg >= boss_hp
    user_survived = retaliation_dmg < total_hp

    return {
        "boss_hp": boss_hp,
        "user_hp": total_hp,
        "user_def": total_def,
        "hours_dmg": hours_dmg,
        "books_dmg": books_dmg,
        "summon_dmg": summon_dmg,
        "poison_dmg": poison_dmg,
        "retaliation_dmg": retaliation_dmg,
        "execute_dmg": execute_dmg,
        "boss_defeated": boss_defeated,
        "user_survived": user_survived,
        "log": [
            f"Asset Level {level} — CP {cp:,}.",
            f"Chronos Strike: {hours_dmg:,.0f} DMG.",
            f"Arsenal Expansion: {books_dmg:,.0f} DMG.",
            f"Administrator Strike: {retaliation_dmg:,} DMG.",
            f"FINAL EXECUTE: {execute_dmg:,} DMG.",
            "PURGE ABORTED" if (boss_defeated and user_survived) else "ASSET LIQUIDATED"
        ]
    }



