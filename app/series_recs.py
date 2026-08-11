# -----------------------------------------
# series_recs.py — Series tag acquisition, scoring, recommendations
# -----------------------------------------
# Per RECOMMENDATIONS_PAGE_PLAN.local.md. Three equally-weighted tag sources
# (audible / keyword / user), content-based tag-overlap scoring, no ML.
#
# Key design fact, discovered while implementing: tier list items are cover
# filenames, and series covers are named after the series itself (one cover
# per series, not per book). So a tiered item almost always already IS a
# series-level rating — no book->series rollup is needed for series-tiled
# items. Standalone (non-series) book tiles simply don't match any known
# series cover and are skipped for recommendation purposes.
# -----------------------------------------

import base64
import json
import re
import time
import urllib.parse
import urllib.request
from typing import Dict, List, Optional, Tuple

from .state_sqlite import StateStore

# Tier letter -> score weight. Illustrative, per the design doc; not final.
TIER_WEIGHTS = {"S": 3, "A": 2, "B": 1, "C": 0, "D": -1, "E": -3, "F": -3}

_AUDIBLE_SEARCH_API = "https://api.audible.com/1.0/catalog/products"
_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "application/json",
    "Accept-Language": "en-US,en;q=0.9",
}

# Curated trope wordlist for keyword extraction (source #2). Matched as whole
# words, case-insensitive, against book descriptions. Deliberately small to
# start — extend once real description text has been examined.
TROPE_KEYWORDS = [
    "litrpg", "lit rpg", "gamelit", "cultivation", "dungeon core", "dungeon",
    "apocalypse", "apocalyptic", "post-apocalyptic", "isekai", "system",
    "leveling", "levelling", "progression fantasy", "harem", "reincarnation",
    "reincarnated", "summoned", "grimdark", "cozy fantasy", "wuxia",
    "mecha", "space opera", "time loop", "villainess", "necromancer",
    "vampire", "werewolf", "zombie", "survival", "military sci-fi",
    "dystopian", "cyberpunk", "steampunk", "portal fantasy",
]

# Plain-English glossary for the tag checklist hover popup. Full coverage for
# our own trope wordlist (we wrote it, we can define it precisely); partial
# coverage for the most common broad Audible categories. Anything not listed
# here falls back to a generic note in get_tag_definition() rather than
# pretending every one of Audible's ~100+ browse categories has a curated
# definition — most of those are self-explanatory anyway.
TAG_DEFINITIONS = {
    "litrpg": "Fantasy that uses explicit game mechanics — stats, levels, XP, skill trees — as part of the story itself.",
    "lit rpg": "Fantasy that uses explicit game mechanics — stats, levels, XP, skill trees — as part of the story itself.",
    "gamelit": "Similar to LitRPG — built around game-like systems, though not always as numbers-heavy.",
    "cultivation": "Characters grow stronger through structured spiritual/martial training stages — rooted in Chinese wuxia/xianxia fiction.",
    "dungeon core": "The protagonist is (or controls) a dungeon itself — building traps and monsters rather than adventuring through one.",
    "dungeon": "A significant part of the story involves exploring a dungeon — a hostile, level-based structure full of monsters and loot.",
    "apocalypse": "The story is set during or around a catastrophic, world-ending event.",
    "apocalyptic": "The story takes place during or around a catastrophic, world-ending event.",
    "post-apocalyptic": "The story takes place in the aftermath of a civilization-ending catastrophe.",
    "isekai": "The protagonist is transported from their original world into a new one — often fantasy or game-like.",
    "system": "The world runs on explicit game-like rules — stats, notifications, quests — that characters can see and interact with.",
    "leveling": "Characters gain power through a level-based progression system, similar to a video game.",
    "levelling": "Characters gain power through a level-based progression system, similar to a video game.",
    "progression fantasy": "A fantasy story built around the character's steady, trackable growth in power over time.",
    "harem": "The protagonist has multiple romantic partners/love interests throughout the story.",
    "reincarnation": "The protagonist has died and been reborn — often into a new world, body, or time period.",
    "reincarnated": "The protagonist has died and been reborn — often into a new world, body, or time period.",
    "summoned": "The protagonist is pulled from their world into another, typically to serve some purpose.",
    "grimdark": "A dark, morally bleak subgenre of fantasy — few clean heroes, brutal consequences.",
    "cozy fantasy": "Low-stakes, comforting fantasy focused on everyday life and gentle stakes rather than epic conflict.",
    "wuxia": "Chinese martial-arts fiction focused on heroic warriors, honor, and combat skill.",
    "mecha": "Science fiction centered on giant piloted robots or mechanized combat suits.",
    "space opera": "Grand-scale science fiction — space travel, empires, war — with a dramatic, adventurous tone.",
    "time loop": "A character relives the same period of time repeatedly, usually gaining knowledge or power each cycle.",
    "villainess": "The protagonist is reincarnated as the 'villainess' of a story and tries to change her fate — a popular Korean/Japanese web-fiction genre.",
    "necromancer": "The protagonist practices magic involving death, undead, or raising the dead.",
    "vampire": "The story centers on vampires — bloodsucking, often immortal, supernatural beings.",
    "werewolf": "The story centers on werewolves or shapeshifters.",
    "zombie": "The story involves zombies — reanimated, usually mindless, undead threats.",
    "survival": "The story centers on characters struggling to stay alive against a hostile environment or threat.",
    "military sci-fi": "Science fiction centered on soldiers, warfare, and military structure or tactics.",
    "dystopian": "Set in an oppressive, controlled, or bleak society — usually critiquing real-world social or political systems.",
    "cyberpunk": "A high-tech, low-life science fiction subgenre — corporations, hackers, and decaying societies.",
    "steampunk": "Blends Victorian-era aesthetics with advanced steam-powered technology.",
    "portal fantasy": "A character travels from the real world into a fantasy world through some kind of portal or gateway.",
    # Common broad Audible browse categories worth a plain-English clarifier.
    "science fiction & fantasy": "Audible's umbrella category combining science fiction and fantasy genres.",
    "literature & fiction": "Audible's broad general-fiction category.",
    "genre fiction": "Audible's broad category for commercial, plot-driven fiction (as opposed to literary fiction).",
    "action & adventure": "Fast-paced stories built around physical danger, exploration, and daring feats.",
    "paranormal & urban": "Fantasy set in a modern, real-world setting involving supernatural elements — also called Urban Fantasy.",
    "epic": "Large-scale fantasy with sweeping plots, big casts, and high stakes — think Tolkien-style fantasy.",
    "superhero": "Stories centered on characters with extraordinary powers acting as heroes (or villains).",
    "humorous": "A story with a notably comedic tone.",
    "contemporary": "Set in a modern, real-world setting — as opposed to historical or futuristic.",
    "thriller & suspense": "Tense, plot-driven stories built around danger, mystery, or uncertainty.",
    "mystery, thriller & suspense": "Tense, plot-driven stories built around danger, mystery, or uncertainty.",
    "dragons & mythical creatures": "Fantasy prominently featuring dragons or other mythical beasts.",
    "coming of age": "A story centered on a young protagonist's growth into adulthood.",
    "time travel": "The story involves characters moving between different points in time.",
    # Owner-authored definitions for the remaining Audible browse categories.
    "adventure": "Stories centered on quests, exploration, danger, travel, survival, or overcoming major obstacles.",
    "alternate history": "Fiction that changes a real historical event and explores how history might have developed differently.",
    "americas": "Books focused on the people, history, cultures, or events of North, Central, South America, or the Caribbean.",
    "ancient": "Books set in or concerning ancient civilizations, cultures, people, or historical periods.",
    "ancient, classical & medieval literature": "Literature originating from or focused on the ancient, classical, and medieval periods.",
    "anthologies & short stories": "Collections of multiple shorter works rather than one continuous full-length story.",
    "anthropology": "Books examining human cultures, societies, behaviors, origins, and development.",
    "apocalyptic & post-apocalyptic": "Stories about civilization ending, collapsing, or surviving afterward. Includes System Apocalypse LitRPG, zombies, disasters, and societal collapse.",
    "art": "Books about visual art, artists, artistic movements, techniques, or art history.",
    "arts & entertainment": "Books about entertainment industries and creative fields such as film, television, theater, music, and art.",
    "asian american & pacific islander": "Works focused on Asian American or Pacific Islander characters, cultures, histories, or experiences.",
    "books & libraries": "Books about literature, reading, publishing, authorship, bookstores, archives, or libraries.",
    "children's audiobooks": "Audiobooks primarily written for children rather than teen or adult audiences.",
    "classics": "Older works considered historically or culturally significant literature.",
    "comedy & humor": "Books where jokes, absurd situations, banter, satire, or comedic storytelling are major elements. Particularly useful for humorous LitRPG.",
    "dark fantasy": "Fantasy with grim, disturbing, violent, tragic, or horror-influenced elements and a darker overall tone.",
    "difficult situations": "Stories dealing with serious personal challenges such as abuse, grief, poverty, illness, family problems, or trauma.",
    "education & learning": "Books about teaching, schools, studying, educational systems, or acquiring knowledge and skills.",
    "erotica": "Fiction where explicit sexual content is a primary part of the story and its appeal.",
    "fairy tales": "Traditional fairy tales or stories using fairy-tale structures, characters, folklore, or retellings.",
    "family life": "Stories where relationships between parents, children, siblings, spouses, or extended family are a major focus.",
    "fantasy": "Fiction containing magic, supernatural powers, invented settings, mythical beings, or other impossible elements. A major parent category for LitRPG and progression fantasy.",
    "fantasy & magic": "Fantasy, often aimed at younger audiences, where magic, magical creatures, powers, or magical adventures are central.",
    "first contact": "Science fiction about humanity's first encounter or communication with extraterrestrial life.",
    "gaslamp": "Fantasy combining magic or supernatural elements with a Victorian or 19th-century-inspired setting and technology.",
    "genetic engineering": "Science fiction involving deliberate alteration of DNA, organisms, humans, or biological traits.",
    "growing up & facts of life": "Youth-oriented stories about adolescence, maturity, relationships, identity, puberty, and everyday life challenges.",
    "historical": "Books strongly connected to a real historical period, person, culture, or event.",
    "historical fiction": "Fictional stories set within a recognizable historical period, often incorporating real events or people.",
    "history": "Nonfiction examining past people, civilizations, events, conflicts, and societies.",
    "homelessness, runaways & poverty": "Stories dealing with homelessness, running away, financial hardship, or severe poverty.",
    "horror": "Stories primarily intended to frighten, disturb, unsettle, or create dread through monsters, supernatural threats, violence, or psychological terror.",
    "lgbtq+": "Books featuring LGBTQ+ characters, relationships, identities, experiences, or themes as a meaningful element.",
    "literary fiction": "Character- and theme-focused fiction that generally emphasizes prose, ideas, relationships, or internal conflict over genre conventions.",
    "magical realism": "Mostly realistic fiction where magical or impossible events exist naturally within otherwise ordinary life.",
    "military": "Books where soldiers, armed forces, military operations, training, or military culture play a major role.",
    "movie, tv & video game tie-ins": "Books directly connected to an existing movie, television, or video-game franchise.",
    "mystery": "Stories centered on solving an unexplained event, crime, disappearance, secret, or puzzle.",
    "other religions, practices & sacred texts": "Books about religious traditions, practices, beliefs, or sacred writings outside Audible's larger religion categories.",
    "paranormal": "Fiction involving ghosts, psychics, vampires, werewolves, supernatural abilities, or unexplained phenomena, often in otherwise recognizable settings.",
    "poetry": "Collections or performances of poems and other verse-based writing.",
    "political": "Fiction or nonfiction where governments, elections, political power, ideology, or political conflict are central.",
    "politics & social sciences": "Nonfiction covering government, politics, sociology, economics, public policy, social issues, and related fields.",
    "religion & spirituality": "Books dealing with religious beliefs, faith, spiritual practices, theology, or personal spirituality.",
    "romance": "Fiction where a romantic relationship and its development form a major part of the story.",
    "romantic comedy": "Romance built around humor, amusing situations, witty interactions, and generally lighter relationship drama.",
    "romantic suspense": "Stories combining a central romance with danger, mystery, crime, or thriller elements.",
    "sagas": "Long, expansive stories following characters, families, kingdoms, or societies across major events or long periods of time.",
    "satire": "Fiction or nonfiction using humor, exaggeration, irony, or absurdity to criticize people, institutions, society, or ideas.",
    "science fiction": "Fiction based on speculative science or technology, including space travel, AI, aliens, futuristic societies, cybernetics, and similar concepts.",
    "social & life skills": "Books aimed at developing interpersonal abilities, independence, communication, emotional skills, or everyday practical behavior.",
    "space exploration": "Science fiction or nonfiction centered on exploring space, planets, star systems, or other astronomical environments.",
    "spies & politics": "Stories involving espionage, intelligence agencies, covert operations, government intrigue, or international politics.",
    "spirituality": "Books focused on spiritual beliefs, practices, personal meaning, consciousness, or experiences that may not belong to a formal religion.",
    "sports": "Fiction or nonfiction where athletes, teams, competitions, training, or sports culture are central.",
    "state & local": "History or nonfiction focused on a particular U.S. state, city, community, or local region.",
    "supernatural": "Stories featuring forces or beings outside natural explanation, such as spirits, demons, gods, curses, or supernatural powers.",
    "sword & sorcery": "Action-heavy fantasy focused on warriors, magic, monsters, quests, combat, and personal-scale adventures. Highly relevant to LitRPG and progression fantasy.",
    "teen & young adult": "Books written primarily for teenage and young-adult audiences, typically featuring younger protagonists and coming-of-age themes.",
    "themes & styles": "A broad classification based on a work's literary themes, techniques, structure, or stylistic characteristics rather than subject matter.",
    "thrillers & suspense": "Fast-moving stories built around danger, tension, uncertainty, pursuit, conspiracies, crime, or high-stakes threats.",
    "united states": "Books specifically focused on U.S. history, culture, people, politics, geography, or events.",
    "urban": "Stories centered on city life, urban communities, street culture, or contemporary metropolitan settings. This does not automatically mean urban fantasy.",
    "war & military": "Fiction or nonfiction centered on warfare, military operations, soldiers, battles, strategy, or armed conflict.",
    "wars & conflicts": "Books examining specific wars, battles, revolutions, civil conflicts, or other organized armed struggles.",
    "women's fiction": "Fiction primarily centered on women's relationships, families, personal challenges, identity, and major life changes.",
    "world literature": "Literature originating from countries and cultures around the globe, often used for works outside mainstream U.S. or British literature categories.",
    "world war ii": "Fiction or nonfiction specifically involving World War II, its battles, people, politics, societies, or consequences.",
}

_GENERIC_TAG_FALLBACK = "No custom description yet for this tag — it comes from Audible's own category data."


def get_tag_definition(tag: str) -> str:
    return TAG_DEFINITIONS.get(normalize_tag(tag), _GENERIC_TAG_FALLBACK)


def normalize_tag(text: str) -> str:
    t = re.sub(r"\s+", " ", (text or "").strip().lower())
    return t


def normalize_series_key(series_name: str) -> str:
    """Same normalization spirit as progression.py's _norm — collapse to a
    stable lookup key so minor formatting differences don't fragment data."""
    n = re.sub(r"[^a-z0-9]+", " ", (series_name or "").lower()).strip()
    return n


def sanitize_cover_filename(title: str) -> str:
    """Mirrors app/main.py's _sanitize_cover_filename exactly — series covers
    are named this way, and tier-list item IDs decode to these filenames."""
    safe = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "", title or "")
    safe = re.sub(r"\s+", "_", safe.strip())
    return safe[:200] or "unknown"


def decode_tier_item_id(item_id: str) -> Optional[str]:
    """Reverse tier.js's img.id encoding: btoa(unescape(encodeURIComponent(name)))
    with URL-safe substitutions. Returns the original filename, or None if it
    doesn't decode cleanly (defensive — malformed/legacy IDs shouldn't crash
    the whole rollup)."""
    if not item_id:
        return None
    s = item_id.replace("-", "+").replace("_", "/")
    s += "=" * (-len(s) % 4)
    try:
        return base64.b64decode(s).decode("utf-8")
    except Exception:
        return None


def parse_tier_query(query: str) -> Dict[str, List[str]]:
    """Parses the stored 'S=id1,id2&A=id3...' string into {tier: [filenames]},
    already decoded from item-id to cover filename."""
    out: Dict[str, List[str]] = {}
    parsed = urllib.parse.parse_qs(query or "", keep_blank_values=False)
    for tier, values in parsed.items():
        tier = tier.upper()
        if tier not in TIER_WEIGHTS:
            continue
        filenames = []
        for v in values:
            for item_id in v.split(","):
                item_id = item_id.strip()
                if not item_id:
                    continue
                fn = decode_tier_item_id(item_id)
                if fn:
                    filenames.append(fn)
        if filenames:
            out[tier] = filenames
    return out


def build_series_cover_index(series_index: List[dict]) -> Dict[str, str]:
    """cover filename (no extension) -> series_key, for every known series."""
    idx: Dict[str, str] = {}
    for s in series_index or []:
        sname = (s.get("seriesName") or "").strip()
        if not sname:
            continue
        cover_stem = sanitize_cover_filename(sname)
        idx[cover_stem] = normalize_series_key(sname)
    return idx


def rollup_user_series_ratings(query: str, series_index: List[dict]) -> Dict[str, str]:
    """Returns {series_key: tier_letter} for a user's tier list. Since series
    covers are one-per-series, this is a direct lookup, not a book->series
    aggregation — a tiered item that matches a known series cover IS that
    series' rating. Items that don't match any known series cover (standalone
    books) are silently skipped; they have no series to recommend against."""
    cover_idx = build_series_cover_index(series_index)
    by_tier = parse_tier_query(query)
    result: Dict[str, str] = {}
    for tier, filenames in by_tier.items():
        for fn in filenames:
            stem = re.sub(r"\.(jpg|jpeg|png|webp)$", "", fn, flags=re.IGNORECASE)
            series_key = cover_idx.get(stem)
            if series_key:
                result[series_key] = tier
    return result


# -----------------------------------------
# Tag acquisition
# -----------------------------------------

def _tags_and_description_from_product(product: dict) -> Tuple[List[str], str]:
    ladders = product.get("category_ladders") or []
    tags = set()
    for entry in ladders:
        for rung in (entry.get("ladder") or []):
            name = (rung.get("name") or "").strip()
            if name:
                tags.add(normalize_tag(name))
    raw_desc = product.get("merchandising_summary") or product.get("publisher_summary") or ""
    description = re.sub(r"<[^>]+>", " ", raw_desc)  # strip HTML tags, Audible returns them inline
    return sorted(tags), description


def _book_one_sequence(product: dict) -> float:
    series = product.get("series") or []
    if not series:
        return 9999.0
    try:
        return float(series[0].get("sequence") or 9999)
    except (TypeError, ValueError):
        return 9999.0


def fetch_audible_product_data(series_name: str, target_asin: str) -> Tuple[List[str], str, str, List[str]]:
    """Verified against the real API: the singular /catalog/products/{asin}
    lookup does NOT return description text under any response_groups
    combination tried, but the /catalog/products *search* endpoint does
    (merchandising_summary) alongside category_ladders. So — same pattern
    Release Radar already uses — one search call, then two different picks
    from the same result set for two different purposes:

    - Tags (category_ladders + keyword extraction) come from target_asin
      (the tracked series' latest known release, Release Radar's own
      match). Empirically — owner-confirmed against real recommendations —
      this produces better genre/trope signal than book 1: book-1 blurbs
      are often deliberately vague to avoid spoiling new readers, while
      Audible's categorization and later blurbs tend to get more specific
      once a series is established. Falls back to the top result if
      target_asin isn't present in this (limited) result set.
    - Description shown to the user comes from book 1 (lowest series
      sequence in the results) instead — that's a separate, presentation-
      only concern (spoiler-free intro for someone deciding whether to
      start the series) and stayed correct even though the tag-sourcing
      assumption didn't.

    Also returns the Audible-listed author name(s) for target_asin — used to
    verify a Royal Road match is actually the same work before importing its
    tags, not a same-titled unrelated story.

    Never raises — logs and returns ([], '', '', []) on any error."""
    if not series_name:
        return [], "", "", []
    params = {
        "keywords": series_name,
        "num_results": "10",
        # merchandising_summary only actually populates when product_desc is
        # requested alongside these specific sibling groups — verified
        # empirically; product_desc alone silently returns no summary text.
        "response_groups": "product_desc,product_attrs,media,series,relationships,category_ladders",
    }
    url = _AUDIBLE_SEARCH_API + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers=_HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=12) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        print(f"[series_recs] Audible search failed for '{series_name}': {e}")
        return [], "", "", []
    products = data.get("products") or []
    if not products:
        return [], "", "", []

    tags_source = next((p for p in products if p.get("asin") == target_asin), products[0])
    book_one = min(products, key=_book_one_sequence)

    tags, _ = _tags_and_description_from_product(tags_source)
    _, description = _tags_and_description_from_product(book_one)
    authors = [a.get("name", "") for a in (tags_source.get("authors") or []) if a.get("name")]
    return tags, description, book_one.get("asin") or "", authors


# -----------------------------------------
# Royal Road enrichment (source='royalroad')
# -----------------------------------------
# Owner-authorized one-time enrichment pass (run manually via the admin
# backfill button, same pattern as the Audible backfill and cover sync —
# never scheduled/automatic). Royal Road's genre tags (LitRPG, Cultivation,
# Dungeon Core, Portal Fantasy/Isekai, System Invasion, etc.) are far more
# specific than Audible's browse categories for this genre, but matching an
# Audible audiobook to the right Royal Road web-serial is real work: many
# audiobook titles differ from their original RR serial name, and RR search
# results are dominated by unofficial fan fiction of popular series.
#
# Strict match-or-skip policy (owner's explicit instruction): only accept a
# Royal Road match when (a) the result is marked "Original" — never "Fan
# Fiction" — and (b) its listed author matches a known Audible author for
# that series. No title-only fuzzy guessing. If nothing confidently matches,
# the series simply gets no Royal Road tags — same as today, not worse.

_ROYALROAD_SEARCH = "https://www.royalroad.com/fictions/search"
_ROYALROAD_BASE = "https://www.royalroad.com"
_RR_HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}


def _rr_get(url: str, params: Optional[dict] = None, timeout: int = 15) -> str:
    full = url + ("?" + urllib.parse.urlencode(params) if params else "")
    req = urllib.request.Request(full, headers=_RR_HEADERS)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8", errors="replace")


def search_royalroad(title: str) -> List[Dict]:
    """Search RR by title, return only 'Original' (non-fan-fiction) results:
    [{'url', 'title'}]. Never raises — logs and returns [] on any error."""
    if not title:
        return []
    try:
        html = _rr_get(_ROYALROAD_SEARCH, {"title": title})
    except Exception as e:
        print(f"[series_recs] Royal Road search failed for '{title}': {e}")
        return []

    candidates = []
    for block in re.split(r"(?=fiction-list-item)", html):
        title_m = re.search(
            r'<h2 class="fiction-title">\s*<a href="(/fiction/\d+/[^"]+)"[^>]*>([^<]+)</a>',
            block,
        )
        if not title_m:
            continue
        label_m = re.search(r'label-sm bg-blue-hoki[^>]*>\s*([^<]+?)\s*<', block)
        is_original = bool(label_m) and label_m.group(1).strip() == "Original"
        if not is_original:
            continue
        candidates.append({
            "url": _ROYALROAD_BASE + title_m.group(1),
            "title": title_m.group(2).strip(),
        })
    return candidates


def fetch_royalroad_fiction(url: str) -> Optional[Dict]:
    """Fetch one fiction's detail page -> {'author': str, 'tags': [str]}.
    Returns None on any error (network failure, unexpected markup)."""
    try:
        html = _rr_get(url)
    except Exception as e:
        print(f"[series_recs] Royal Road fetch failed for {url}: {e}")
        return None
    author_m = re.search(
        r'class="small font-white">by </span>\s*<span>\s*<a href="/profile/\d+"[^>]*>([^<]+)</a>',
        html,
    )
    author = author_m.group(1).strip() if author_m else ""
    raw_tags = re.findall(
        r'class="label label-default label-sm bg-blue-dark fiction-tag" href="[^"]*">([^<]+)</a>',
        html,
    )
    return {"author": author, "tags": sorted({normalize_tag(t) for t in raw_tags})}


def _authors_match(audible_authors: List[str], rr_author: str) -> bool:
    """Conservative match, not a fuzzy title guess. Royal Road often shows a
    pen name in parens after the legal name (e.g. 'Maxime J. Durand (Void
    Herald)'), and Audible independently lists both the legal name and the
    pen name as separate author entries — so this checks the RR string (and
    its parenthetical) against every known Audible author name, plus a
    conservative last-name fallback."""
    if not rr_author or not audible_authors:
        return False
    rr_norm = normalize_tag(rr_author)
    paren_m = re.search(r"\(([^)]+)\)", rr_author)
    rr_candidates = {rr_norm}
    if paren_m:
        rr_candidates.add(normalize_tag(paren_m.group(1)))
    for a in audible_authors:
        a_norm = normalize_tag(a)
        if not a_norm:
            continue
        for cand in rr_candidates:
            if not cand:
                continue
            if a_norm in cand or cand in a_norm:
                return True
            a_last = a_norm.split()[-1] if a_norm.split() else ""
            if a_last and len(a_last) > 2 and a_last in cand:
                return True
    return False


def enrich_series_from_royalroad(
    series_name: str, audible_authors: List[str], max_candidates: int = 2
) -> Tuple[List[str], str]:
    """Returns (tags, matched_url) — ([], '') if nothing confidently
    matched. Checks up to max_candidates 'Original' search results and
    accepts the first whose author matches a known Audible author for this
    series. Deliberately does not fall back to a title-only guess."""
    candidates = search_royalroad(series_name)[:max_candidates]
    for c in candidates:
        detail = fetch_royalroad_fiction(c["url"])
        if not detail:
            continue
        if _authors_match(audible_authors, detail["author"]):
            return detail["tags"], c["url"]
    return [], ""


def extract_keyword_tags(description: str) -> List[str]:
    if not description:
        return []
    text = description.lower()
    found = []
    for kw in TROPE_KEYWORDS:
        pattern = r"\b" + re.escape(kw) + r"\b"
        if re.search(pattern, text):
            found.append(normalize_tag(kw))
    return found


def backfill_tags_from_audible(
    store: StateStore,
    tracked_series_rows: List[dict],
    sleep_between: float = 0.3,
    include_royalroad: bool = False,
    rr_sleep_between: float = 0.5,
) -> Dict:
    """One Audible product lookup per tracked series (using the ASIN Release
    Radar already matched — reuses that work instead of re-searching from
    scratch), feeding BOTH source='audible' (category_ladders) and
    source='keyword' (description text) tags from that single response.
    Series with no tracked_series row (no known ASIN) are skipped here —
    a real, known gap, not a bug; matches the match-rate limitation flagged
    in the design doc. Rate-limited with a small sleep between requests,
    same courtesy pattern as release_radar.py.

    include_royalroad: off by default. This is a deliberate, owner-triggered
    one-time enrichment pass, not something that runs on every routine
    Audible refresh — matches the owner's explicit instruction that Royal
    Road only gets hit when they choose to run it, never automatically.
    When on, reuses the author names already returned by the same Audible
    call (no extra Audible traffic) to strictly verify any Royal Road match
    before importing its tags."""
    added_audible = 0
    added_keyword = 0
    added_royalroad = 0
    rr_matched = 0
    rr_checked = 0
    series_checked = 0
    descriptions_stored = 0
    for row in tracked_series_rows:
        sname = row.get("series_name") or ""
        asin = row.get("last_asin") or row.get("series_asin") or ""
        if not sname or not asin:
            continue
        series_key = normalize_series_key(sname)
        categories, description, book_one_asin, authors = fetch_audible_product_data(sname, asin)
        series_checked += 1

        for tag in categories:
            if store.add_series_tag(series_key, tag, source="audible"):
                added_audible += 1
        for tag in extract_keyword_tags(description):
            if store.add_series_tag(series_key, tag, source="keyword"):
                added_keyword += 1
        if description:
            store.upsert_series_description(series_key, description, book_one_asin)
            descriptions_stored += 1

        if include_royalroad:
            rr_checked += 1
            rr_tags, rr_url = enrich_series_from_royalroad(sname, authors)
            if rr_url:
                rr_matched += 1
                for tag in rr_tags:
                    if store.add_series_tag(series_key, tag, source="royalroad"):
                        added_royalroad += 1
            time.sleep(rr_sleep_between)

        time.sleep(sleep_between)
    return {
        "series_checked": series_checked,
        "audible_tags_added": added_audible,
        "keyword_tags_added": added_keyword,
        "descriptions_stored": descriptions_stored,
        "royalroad_checked": rr_checked,
        "royalroad_matched": rr_matched,
        "royalroad_tags_added": added_royalroad,
    }


# -----------------------------------------
# Scoring
# -----------------------------------------

def build_tag_affinity(rated_series: Dict[str, str], all_series_tags: Dict[str, List[Dict]]) -> Dict[str, int]:
    """{series_key: tier_letter} + {series_key: [tag rows]} -> {tag: weight}."""
    affinity: Dict[str, int] = {}
    for series_key, tier in rated_series.items():
        weight = TIER_WEIGHTS.get(tier, 0)
        if weight == 0:
            continue
        tags = {row["tag"] for row in all_series_tags.get(series_key, [])}
        for tag in tags:
            affinity[tag] = affinity.get(tag, 0) + weight
    return affinity


BOOST_WEIGHT = 6  # per-tag score bonus for a manually checked tag, illustrative


def score_recommendations(
    store: StateStore,
    tier_query: str,
    series_index: List[dict],
    boost_tags: Optional[List[str]] = None,
    fresh: bool = False,
) -> List[Dict]:
    """Full pipeline: rollup ratings -> build affinity -> score every
    untiered series with tag data -> rank descending. Series with no tag
    data are excluded (nothing to score against), not shown with a fake
    neutral score, per the design doc.

    boost_tags: tags the user manually checked in the filter sidebar. Each
    gets a flat BOOST_WEIGHT bonus on top of history-derived affinity, and
    is always surfaced in matching_tags/boosted_tags even if the user has
    zero tier-list history for it — that's the point of a manual boost.

    fresh: "start from scratch" mode — ignores tier-list-derived affinity
    entirely (ranks purely by checked boost_tags). Already-tiered series
    are still excluded even in this mode — the point is discovering
    something new, not re-surfacing what's already been judged. Requires
    at least one boost tag; with no affinity and no boosts there's nothing
    to score against, same as the normal empty-history case."""
    rated_series = rollup_user_series_ratings(tier_query, series_index)
    all_series_tags = store.get_all_series_tags()
    affinity = {} if fresh else build_tag_affinity(rated_series, all_series_tags)
    boost_set = {normalize_tag(t) for t in (boost_tags or []) if t}
    descriptions = store.get_all_series_descriptions()

    series_name_by_key: Dict[str, str] = {}
    for s in series_index or []:
        sname = (s.get("seriesName") or "").strip()
        if sname:
            series_name_by_key[normalize_series_key(sname)] = sname

    results = []
    for series_key, tag_rows in all_series_tags.items():
        if series_key in rated_series:
            continue  # already tiered — recommend the unread backlog, not what they've judged
        if series_key not in series_name_by_key:
            continue  # tag data for a series no longer in the live series index
        tags = {row["tag"] for row in tag_rows}
        if not tags or (not affinity and not boost_set):
            continue

        boosted_here = tags & boost_set
        score = sum(affinity.get(t, 0) for t in tags) + len(boosted_here) * BOOST_WEIGHT
        matching = sorted(
            {t for t in tags if affinity.get(t, 0) > 0 or t in boost_set},
            key=lambda t: -(affinity.get(t, 0) + (BOOST_WEIGHT if t in boost_set else 0)),
        )
        if score > 0 and matching:
            series_name = series_name_by_key[series_key]
            results.append({
                "series_key": series_key,
                "series_name": series_name,
                "cover_url": f"/awards/covers/{sanitize_cover_filename(series_name)}.jpg",
                "description": descriptions.get(series_key, ""),
                "score": score,
                "matching_tags": matching[:6],
                "boosted_tags": sorted(boosted_here),
            })

    results.sort(key=lambda r: -r["score"])
    return results


def all_distinct_tags(store: StateStore) -> List[Dict]:
    all_series_tags = store.get_all_series_tags()
    tags = set()
    for rows in all_series_tags.values():
        for row in rows:
            tags.add(row["tag"])
    return [{"tag": t, "description": get_tag_definition(t)} for t in sorted(tags)]
