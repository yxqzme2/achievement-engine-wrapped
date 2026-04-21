# -----------------------------------------
# Release Radar — Audible Series Tracker
# -----------------------------------------
# Polls the public Audible catalog API for new audiobook releases
# in tracked series, fires Discord notifications, and generates
# a subscribable .ics calendar feed.
# -----------------------------------------

import json
import re
import time
import datetime
import urllib.request
import urllib.parse
from typing import List, Dict, Optional, Tuple

from .state_sqlite import StateStore

# ── Audible public catalog endpoint ───────────────────────────────────────────
_AUDIBLE_API = "https://api.audible.com/1.0/catalog/products"
_RESPONSE_GROUPS = "product_desc,product_attrs,media,series,relationships"
_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "application/json",
    "Accept-Language": "en-US,en;q=0.9",
}

# How many results to fetch per series search (more = better chance of catching
# the newest book in large series with lots of search noise)
_SEARCH_NUM_RESULTS = 15


# ── Audible API helpers ────────────────────────────────────────────────────────

def search_audible(keywords: str, num_results: int = _SEARCH_NUM_RESULTS) -> List[Dict]:
    """
    Search the Audible public catalog. Returns the products list or [].
    Never raises — logs and returns empty on any error.
    """
    params = {
        "keywords": keywords,
        "num_results": str(num_results),
        "response_groups": _RESPONSE_GROUPS,
        "sort_by": "-PublicationDate",
    }
    url = _AUDIBLE_API + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers=_HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=12) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return data.get("products") or []
    except Exception as e:
        print(f"[radar] Audible search error for '{keywords}': {e}")
        return []


def _extract_series_info(product: Dict) -> Optional[Dict]:
    """Return the first series entry from a product, or None."""
    series_list = product.get("series") or []
    if series_list:
        return series_list[0]
    # fall back to relationships
    for rel in (product.get("relationships") or []):
        if rel.get("relationship_type") == "series":
            return {
                "asin": rel.get("asin", ""),
                "title": rel.get("title", ""),
                "sequence": rel.get("sequence", ""),
            }
    return None


def find_newest_in_series(products: List[Dict], series_asin: str) -> Optional[Dict]:
    """
    From a list of Audible products, return the one that:
      - belongs to the given series_asin
      - PREFERS upcoming/pre-order books (for Release Radar tracking)
      - Falls back to most recent released book if no pre-orders exist
    Returns None if no matching product found.
    """
    candidates = []
    for p in products:
        series_info = _extract_series_info(p)
        if series_info and series_info.get("asin") == series_asin:
            candidates.append(p)

    if not candidates:
        return None

    today = datetime.date.today().isoformat()

    # Separate pre-orders from released books
    preorders = [p for p in candidates if (p.get("release_date") or "") > today]
    released = [p for p in candidates if (p.get("release_date") or "") <= today]

    if preorders:
        # Prefer upcoming books — return the soonest pre-order (next release)
        return min(preorders, key=lambda p: p.get("release_date") or p.get("publication_datetime", ""))
    elif released:
        # Fallback: if no pre-orders, return the most recent released book
        return max(released, key=lambda p: p.get("release_date") or p.get("publication_datetime", ""))
    else:
        # No release date found, return first candidate
        return candidates[0]


def _product_to_release(product: Dict, series_asin: str, series_name: str) -> Dict:
    """Flatten an Audible product dict into our release schema."""
    series_info = _extract_series_info(product) or {}
    authors = [a.get("name", "") for a in (product.get("authors") or [])]
    narrators = [n.get("name", "") for n in (product.get("narrators") or [])]
    imgs = product.get("product_images") or {}
    cover = imgs.get("500") or next(iter(imgs.values()), "")

    release_date = product.get("release_date") or (
        product.get("publication_datetime", "")[:10]
    )
    today = datetime.date.today().isoformat()
    is_preorder = release_date > today

    return {
        "asin": product.get("asin", ""),
        "series_asin": series_asin,
        "series_name": series_name,
        "title": product.get("title", ""),
        "sequence": series_info.get("sequence", ""),
        "author": ", ".join(authors),
        "narrator": ", ".join(narrators),
        "release_date": release_date,
        "cover_url": cover,
        "is_preorder": is_preorder,
    }


# ── Series search for the "Add Series" UI ─────────────────────────────────────

def search_series_candidates(query: str) -> List[Dict]:
    """
    Search Audible for a query and return unique series found in results.
    Used by the UI to let the user pick which series to track.
    """
    products = search_audible(query, num_results=20)
    seen_asins = set()
    candidates = []
    for p in products:
        series_info = _extract_series_info(p)
        if not series_info:
            continue
        sasin = series_info.get("asin", "")
        if not sasin or sasin in seen_asins:
            continue
        seen_asins.add(sasin)
        authors = [a.get("name", "") for a in (p.get("authors") or [])]
        imgs = p.get("product_images") or {}
        cover = imgs.get("500") or next(iter(imgs.values()), "")
        candidates.append({
            "series_asin": sasin,
            "series_name": series_info.get("title", ""),
            "author": ", ".join(authors),
            "cover_url": cover,
        })
    return candidates


# ── Core poll logic ────────────────────────────────────────────────────────────

def check_one_series(series: Dict) -> Optional[Dict]:
    """
    Check a single tracked series for new releases.
    Returns the newest product dict if it's newer than what we've seen, else None.
    """
    products = search_audible(series["series_name"])
    if not products:
        return None

    newest = find_newest_in_series(products, series["series_asin"])
    if not newest:
        return None

    newest_date = newest.get("release_date") or ""
    last_date = series.get("last_release_date") or ""

    if newest_date > last_date:
        return newest

    return None


def check_all_series(state: StateStore, discord_proxy_url: str = "") -> int:
    """
    Poll all tracked series for new releases.
    Saves new releases to the DB, fires Discord notifications.
    Returns count of new releases found.
    """
    all_series = state.get_tracked_series()
    if not all_series:
        return 0

    new_count = 0
    for series in all_series:
        try:
            newest = check_one_series(series)
            state.touch_series_checked(series["series_asin"])

            if newest is None:
                print(f"[radar] No update for: {series['series_name']}")
                continue

            release = _product_to_release(newest, series["series_asin"], series["series_name"])
            is_new = state.upsert_release(**release)

            state.update_series_last_seen(
                series["series_asin"],
                release["asin"],
                release["title"],
                release["sequence"],
                release["release_date"],
            )

            if is_new:
                new_count += 1
                label = "PRE-ORDER" if release["is_preorder"] else "RELEASED"
                print(f"[radar] New [{label}]: {release['series_name']} #{release['sequence']} — {release['title']}")
                if discord_proxy_url:
                    _notify_discord(release, discord_proxy_url)

        except Exception as e:
            print(f"[radar] Error checking '{series['series_name']}': {e}")

    # Send Discord notifications for any previously stored but unnotified releases
    if discord_proxy_url:
        for r in state.get_unnotified_releases():
            try:
                _notify_discord(r, discord_proxy_url)
                state.mark_release_notified(r["asin"])
            except Exception as e:
                print(f"[radar] Discord notify error: {e}")

    return new_count


# ── Discord notification ───────────────────────────────────────────────────────

def _notify_discord(release: Dict, proxy_url: str) -> None:
    today = datetime.date.today().isoformat()
    is_preorder = release.get("is_preorder") or (
        (release.get("release_date") or "") > today
    )
    label = "📅 Pre-order Available" if is_preorder else "🎧 New Audiobook Released"
    color = 0xf0a500 if is_preorder else 0x1eff00

    seq = release.get("sequence", "")
    series_display = f"{release['series_name']} #{seq}" if seq else release["series_name"]

    fields = [
        {"name": "Series", "value": series_display, "inline": True},
        {"name": "Author", "value": release.get("author", "—"), "inline": True},
        {"name": "Narrator", "value": release.get("narrator", "—"), "inline": True},
        {"name": "Release Date", "value": release.get("release_date", "—"), "inline": True},
    ]

    embed = {
        "title": f"{label}: {release['title']}",
        "color": color,
        "fields": fields,
        "footer": {"text": "Release Radar"},
    }
    if release.get("cover_url"):
        embed["thumbnail"] = {"url": release["cover_url"]}

    payload = json.dumps({"username": "Release Radar", "embeds": [embed]}).encode()
    req = urllib.request.Request(
        proxy_url,
        data=payload,
        headers={"Content-Type": "application/json"},
    )
    try:
        urllib.request.urlopen(req, timeout=10)
    except Exception as e:
        print(f"[radar] Discord send failed: {e}")


# ── ICS calendar generation ────────────────────────────────────────────────────

def generate_ics(releases: List[Dict]) -> str:
    """
    Generate an iCalendar (.ics) string from the releases list.
    Each release becomes a full-day VEVENT.
    """
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Release Radar//Achievement Engine//EN",
        "CALSCALE:GREGORIAN",
        "X-WR-CALNAME:Audiobook Releases",
        "X-WR-CALDESC:Tracked audiobook series release dates",
    ]

    now_stamp = datetime.datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")

    for r in releases:
        asin = r.get("asin", "unknown")
        title = r.get("title", "Untitled")
        seq = r.get("sequence", "")
        series = r.get("series_name", "")
        author = r.get("author", "")
        narrator = r.get("narrator", "")
        release_date = r.get("release_date", "")

        # Convert YYYY-MM-DD → YYYYMMDD for ICS
        date_str = release_date.replace("-", "")
        if not date_str or len(date_str) != 8:
            continue

        # Day after for DTEND (exclusive end for all-day events)
        try:
            d = datetime.date.fromisoformat(release_date)
            end_str = (d + datetime.timedelta(days=1)).strftime("%Y%m%d")
        except ValueError:
            end_str = date_str

        summary = f"{series} #{seq} — {title}" if seq else f"{series} — {title}"
        desc = f"Author: {author}\\nNarrator: {narrator}\\nhttps://www.audible.com/pd/{asin}"

        lines += [
            "BEGIN:VEVENT",
            f"UID:radar-{asin}@achievement-engine",
            f"DTSTAMP:{now_stamp}",
            f"DTSTART;VALUE=DATE:{date_str}",
            f"DTEND;VALUE=DATE:{end_str}",
            f"SUMMARY:{_ics_escape(summary)}",
            f"DESCRIPTION:{_ics_escape(desc)}",
            f"URL:https://www.audible.com/pd/{asin}",
            "END:VEVENT",
        ]

    lines.append("END:VCALENDAR")
    return "\r\n".join(lines) + "\r\n"


def _ics_escape(text: str) -> str:
    """Escape special characters for ICS text fields."""
    return text.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,")


# ── ABS series seeding ─────────────────────────────────────────────────────────

def _normalize_name(name: str) -> str:
    """Lowercase, strip punctuation, collapse whitespace for fuzzy matching."""
    n = name.lower()
    n = re.sub(r"[^a-z0-9 ]", " ", n)
    return re.sub(r"\s+", " ", n).strip()


def _names_match(abs_name: str, audible_name: str) -> bool:
    """
    Return True if abs_name and audible_name refer to the same series.
    Handles minor punctuation differences, sub-title noise, and word-order.
    """
    a = _normalize_name(abs_name)
    b = _normalize_name(audible_name)
    if a == b:
        return True
    # One contains the other — catches "The Cradle" vs "Cradle",
    # or "Dungeon Crawler Carl" vs "Dungeon Crawler Carl Series"
    if a in b or b in a:
        return True
    # Word-set overlap ≥ 80% of the shorter side
    wa, wb = set(a.split()), set(b.split())
    shorter = min(len(wa), len(wb))
    if shorter > 0 and len(wa & wb) / shorter >= 0.8:
        return True
    return False


def _fetch_abs_series(absstats_base_url: str) -> List[Dict]:
    """Return the series list from abs-stats /api/series, or []."""
    url = absstats_base_url.rstrip("/") + "/api/series"
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return data.get("series") or []
    except Exception as e:
        print(f"[radar] Could not reach abs-stats at {url}: {e}")
        return []


def seed_from_abs(state: StateStore, absstats_base_url: str) -> Tuple[int, int]:
    """
    Fetch all series from ABS, search Audible for each, and add any new
    ones to tracked_series.

    Returns (added, unmatched) counts.
    """
    abs_series = _fetch_abs_series(absstats_base_url)
    if not abs_series:
        return 0, 0

    # Build a set of already-tracked ASINs to avoid redundant Audible calls,
    # and a set of manually-removed ASINs to permanently skip
    existing_asins = {s["series_asin"] for s in state.get_tracked_series()}
    ignored_asins  = state.get_ignored_asins()

    added = 0
    unmatched = 0

    for s in abs_series:
        name = s.get("seriesName", "").strip()
        if not name:
            continue

        try:
            candidates = search_series_candidates(name)
        except Exception as e:
            print(f"[radar] Audible search error for '{name}': {e}")
            unmatched += 1
            time.sleep(0.5)
            continue

        # Find the best-matching candidate
        match = None
        for c in candidates:
            if _names_match(name, c.get("series_name", "")):
                match = c
                break

        if not match:
            print(f"[radar] No Audible match for ABS series: '{name}'")
            unmatched += 1
            time.sleep(0.5)
            continue

        if match["series_asin"] in existing_asins:
            time.sleep(0.3)
            continue  # already tracked

        if match["series_asin"] in ignored_asins:
            time.sleep(0.3)
            continue  # manually removed — respect the user's choice

        state.add_tracked_series(
            match["series_name"],
            match["series_asin"],
            match.get("author", ""),
            match.get("cover_url", ""),
        )
        existing_asins.add(match["series_asin"])
        added += 1
        print(f"[radar] Auto-added: '{match['series_name']}' (from ABS: '{name}')")

        # Be polite to the Audible API
        time.sleep(0.5)

    return added, unmatched


# ── Library cross-check ───────────────────────────────────────────────────────

def check_library_status(releases: List[Dict], absstats_base_url: str) -> Dict[str, Optional[bool]]:
    """
    For each *released* book (release_date <= today), check whether it appears
    in the ABS library by matching series name + sequence number or title.

    Returns {asin: bool|None}:
      True  — found in ABS
      False — series is in ABS but this book is not (genuinely missing)
      None  — series not in ABS at all (can't determine)
    """
    if not absstats_base_url:
        return {}

    abs_series = _fetch_abs_series(absstats_base_url)
    if not abs_series:
        return {}

    today = datetime.date.today().isoformat()
    result: Dict[str, Optional[bool]] = {}

    for r in releases:
        if r.get("release_date", "") > today:
            continue  # pre-order, skip

        r_series = r.get("series_name", "")
        r_seq    = str(r.get("sequence") or "").strip()
        r_title  = _normalize_name(r.get("title") or "")

        # Find the matching ABS series
        abs_entry = None
        for s in abs_series:
            if _names_match(r_series, s.get("seriesName", "")):
                abs_entry = s
                break

        if abs_entry is None:
            result[r["asin"]] = None  # series not in ABS — can't say
            continue

        # Check books within that series by sequence or normalised title
        in_abs = False
        for b in (abs_entry.get("books") or []):
            b_seq   = str(b.get("sequence") or "").strip()
            b_title = _normalize_name(b.get("title") or "")

            if r_seq and b_seq and r_seq == b_seq:
                in_abs = True
                break
            if r_title and b_title and (r_title == b_title or
                                        r_title in b_title or
                                        b_title in r_title):
                in_abs = True
                break

        result[r["asin"]] = in_abs

    return result


# ── Background worker ──────────────────────────────────────────────────────────

def radar_worker(state: StateStore, discord_proxy_url: str = "",
                 absstats_base_url: str = "",
                 check_interval_hours: int = 12) -> None:
    """
    Daemon thread target.
    - On startup: seeds tracked series from ABS, then runs a full release check.
    - Every check_interval_hours (default 12 = twice daily): re-seeds from ABS
      to pick up any new series added to the library, then checks for releases.
    """
    print("[radar] Release Radar worker started.")
    interval_secs = check_interval_hours * 3600
    last_seed_date: Optional[str] = None

    while True:
        today = datetime.date.today().isoformat()

        # Seed from ABS once per calendar day (and always on first run)
        if absstats_base_url and last_seed_date != today:
            try:
                added, unmatched = seed_from_abs(state, absstats_base_url)
                print(f"[radar] ABS seed complete — added: {added}, unmatched: {unmatched}")
                last_seed_date = today
            except Exception as e:
                print(f"[radar] ABS seed error: {e}")

        try:
            found = check_all_series(state, discord_proxy_url)
            print(f"[radar] Poll complete. New releases found: {found}")
        except Exception as e:
            print(f"[radar] Worker error: {e}")

        time.sleep(interval_secs)
