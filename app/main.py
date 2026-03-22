# -----------------------------------------
# Section 1
# -----------------------------------------
import re
import time
import threading
import datetime
import os
import sqlite3
from contextlib import asynccontextmanager
from typing import List, Tuple, Dict, Optional

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse, Response, RedirectResponse
from fastapi.staticfiles import StaticFiles

# Your existing logic imports
from .config import load_settings
from .absstats_client import ABSStatsClient
from .achievements_loader import load_achievements, filter_phase1
from .evaluator_phase1 import evaluate_phase1
from .evaluator_behavior_time import evaluate_behavior_time
from .state_sqlite import StateStore
from .notifier_smtp import EmailNotifier
from .notifier_discord import DiscordNotifier
from .models import Achievement
from .evaluator_social import evaluate_social_overlap
from .evaluator_duration import evaluate_duration
from .evaluator_milestone_time import evaluate_milestone_time
from .evaluator_title_keyword import evaluate_title_keyword
from .evaluator_author import evaluate_author
from .evaluator_narrator import evaluate_narrator
from .evaluator_behavior_session import evaluate_behavior_session
from .evaluator_behavior_streak import evaluate_behavior_streak
from .evaluator_series_shape import evaluate_series_shape
from .gear_engine import (
    load_loot_csv, load_quests_csv, load_xp_curve,
    evaluate_gear_for_user, grandfather_init, build_character_sheet,
    build_boss_stats, generate_combat_log, get_verified_book_ids, find_nearly_complete_books,
    xp_from_hours, xp_from_quests, xp_from_achievements, level_from_xp,
    random_item_round_robin,
)
from .release_radar import (
    search_series_candidates, check_all_series as radar_check_all,
    generate_ics, radar_worker, seed_from_abs, check_library_status,
)

# -----------------------------------------
# Section 2: Global Configuration & Initialization
# -----------------------------------------

cfg = load_settings()
store = StateStore(cfg.state_db_path)
client = ABSStatsClient(cfg.absstats_base_url)
notifier = EmailNotifier(
    host=cfg.smtp_host,
    port=cfg.smtp_port,
    username=cfg.smtp_username,
    password=cfg.smtp_password,
    from_addr=cfg.smtp_from
)
discord_notifier = DiscordNotifier(
    proxy_url=cfg.discord_proxy_url
)

def _parse_allowed_users(raw: str) -> set:
    return {
        p.strip().lower()
        for p in str(raw or '').split(',')
        if p and p.strip()
    }

_ALLOWED_USERS = _parse_allowed_users(getattr(cfg, 'allowed_users', ''))

def _user_is_allowed(username: str) -> bool:
    # Empty allow-list means "no filter" (show all users).
    if not _ALLOWED_USERS:
        return True
    return str(username or '').strip().lower() in _ALLOWED_USERS

def _seed_user_xp_start_overrides_file():
    """Ensure the per-user XP start override file exists at the configured /data path."""
    target = (cfg.user_xp_start_overrides_path or "").strip()
    if not target:
        return
    if os.path.exists(target):
        return

    source_candidates = [
        "/app/data/user_xp_start.json",
        "./json/user_xp_start.json",
    ]
    source = next((p for p in source_candidates if os.path.exists(p)), None)
    if not source:
        return

    try:
        parent = os.path.dirname(target)
        if parent:
            os.makedirs(parent, exist_ok=True)
        with open(source, "r", encoding="utf-8") as src, open(target, "w", encoding="utf-8") as dst:
            dst.write(src.read())
        print(f"[xp-start] seeded overrides file: {target}")
    except Exception as e:
        print(f"[xp-start] failed to seed overrides file '{target}': {e}")



# -----------------------------------------
# Section 3: Background Worker (The Engine)
# -----------------------------------------



def _fetch_abs_series_index(fallback: Optional[List[Dict]] = None, timeout: int = 30) -> List[Dict]:
    """Fetch fresh series index from ABS Stats; fallback when unavailable."""
    import urllib.request
    import json as _json

    base = cfg.absstats_base_url.rstrip("/")
    req = urllib.request.Request(base + "/api/series", headers={"Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            payload = _json.loads(r.read())
        series = payload.get("series") or []
        return series if isinstance(series, list) else (fallback or [])
    except Exception:
        return fallback or []

def achievement_engine_worker():
    print("Background Achievement Engine Thread Started.")
    achievements = load_achievements(cfg.achievements_path)
    achievements_filtered = filter_phase1(achievements)
    series_index = []
    last_series_refresh = 0

    while True:
        now = int(time.time())
        if not series_index or (now - last_series_refresh) >= cfg.series_refresh_seconds:
            try:
                series_index = client.get_series_index()
                _SERIES_INDEX_CACHE["data"] = series_index
                _SERIES_INDEX_CACHE["updated_at"] = now
                last_series_refresh = now
            except Exception as e:
                print(f"Series refresh failed: {e}")

        try:
            # We call run_once here
            ledger = run_once(
                client=client,
                store=store,
                notifier=notifier,
                achievements_filtered=achievements_filtered,
                series_index=series_index,
                completed_endpoint=cfg.completed_endpoint,
                allow_playlist_fallback=cfg.allow_playlist_fallback,
            )
        except Exception as e:
            print(f"Engine Loop Error: {e}")
        time.sleep(cfg.poll_seconds)


# -----------------------------------------
# Section 4: FastAPI App + Lifespan
# -----------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    _seed_user_xp_start_overrides_file()

    # Optional one-shot legacy achievement backfill
    if cfg.run_achievement_backfill:
        try:
            run_achievement_backfill_once()
        except Exception as e:
            print(f"[backfill] startup run failed: {e}")

    # Start the background thread on startup
    t = threading.Thread(target=achievement_engine_worker, daemon=True)
    t.start()

    # Start the Release Radar background thread
    radar_t = threading.Thread(
        target=radar_worker,
        kwargs={
            "state": store,
            "discord_proxy_url": cfg.discord_proxy_url,
            "absstats_base_url": cfg.absstats_base_url,
            "check_interval_hours": cfg.radar_check_interval_hours,
        },
        daemon=True,
    )
    radar_t.start()

    yield
    # nothing on shutdown


app = FastAPI(lifespan=lifespan)

# Serve CSS, JS, and shared assets from /static/
# Use the volume-mounted /static only if it actually has files; otherwise use the
# baked-in /app/static. Docker creates the bind-mount dir as an empty directory
# BEFORE setup.sh runs, so os.path.isdir() alone would always pick the empty dir.
def _static_dir_has_content(path: str) -> bool:
    try:
        return bool(os.listdir(path))
    except Exception:
        return False

_STATIC_DIR = "/static" if _static_dir_has_content("/static") else "/app/static"
app.mount("/static", StaticFiles(directory=_STATIC_DIR), name="static_assets")

# -----------------------------------------
# Section 5: Web Routes + API (Dashboard data)
# -----------------------------------------

import json
from fastapi import HTTPException

LANDING_PATH  = "/app/static/landing.html"
WRAPPED_PATH  = "/app/static/Wrapped/wrapped.html"
DASHBOARD_PATH = "/app/static/dashboard.html"
LEADERBOARD_PATH = "/app/static/leaderboard.html"
TIMELINE_PATH = "/app/static/timeline.html"
ACHIEVEMENT_TESTER_PATH = "/app/static/tester.html"
ARCHIVES_PATH = "/app/static/stats.html"
TIER_PATH = "/app/static/tier.html"
PLAYLIST_PATH = "/app/static/playlist.html"
ROSTER_PATH = "/app/static/roster.html"
CHARACTER_SHEET_PATH = "/app/static/character_sheet.html"
DAY_1_PATH = "/app/static/day_1.html"

# Helper to find data files in either the volume root or a 'data' subfolder
def _get_data_path(filename):
    # PREFERRED: Look in /data subfolders first (The Master Mount model)
    ext = os.path.splitext(filename)[1].lower()
    subfolder = "json" if ext == ".json" else "csv" if ext == ".csv" else ""

    paths = [
        os.path.join("/data", subfolder, filename),
        os.path.join("/data", filename),
        os.path.join("/app", subfolder, filename),  # baked-in fallback
        os.path.join("/app/data", filename),
        filename
    ]
    for p in paths:
        if os.path.exists(p):
            return p
    return os.path.join("/data", subfolder, filename) # Default to structured /data

def _find_dir(dirname, default_container_path):
    """Helper to find a directory in common volume locations or workspace."""
    candidates = [
        os.path.join("/data", dirname),       # Master Mount: /data/icons, /data/covers
        default_container_path,              # e.g. /data/covers
        os.path.join("/app", dirname),        # baked-in fallback: /app/icons
        os.path.join("./data", dirname),      # ./data/covers
        os.path.join(".", dirname),           # ./covers
    ]
    for p in candidates:
        if os.path.isdir(p):
            return p
    return os.path.join("/data", dirname)

ACHIEVEMENTS_JSON_PATH = _get_data_path("achievements.points.json")
ICONS_DIR = _find_dir("icons", "/data/icons")
COVERS_DIR = _find_dir("covers", "/data/covers")

# Helper to prioritize /static (user volume) over /app/static (internal)
def _get_static_path(filename):
    # Search paths in priority order
    paths = [
        os.path.join("/data/static", filename), # Master Mount: /data/static/admin/ops.html
        os.path.join("/static", filename),       # Legacy mount
        os.path.join("/app/static", filename),   # Internal build
        os.path.join("data/static", filename),  # Local dev (data folder)
        os.path.join("pages", filename),         # Local dev (pages folder)
        os.path.join("static", filename),        # Local dev (static folder)
        filename
    ]
    for p in paths:
        if os.path.exists(p):
            return p
    return os.path.join("/app/static", filename) # Default

LANDING_PATH  = _get_static_path("landing.html")
WRAPPED_PATH  = _get_static_path("Wrapped/wrapped.html")
DASHBOARD_PATH = _get_static_path("dashboard.html")
LEADERBOARD_PATH = _get_static_path("leaderboard.html")
TIMELINE_PATH = _get_static_path("timeline.html")
ACHIEVEMENT_TESTER_PATH = _get_static_path("tester.html")
ARCHIVES_PATH = _get_static_path("stats.html")
TIER_PATH = _get_static_path("tier.html")
PLAYLIST_PATH = _get_static_path("playlist.html")
ROSTER_PATH = _get_static_path("roster.html")
CHARACTER_SHEET_PATH = _get_static_path("character_sheet.html")
DAY_1_PATH = _get_static_path("day_1.html")
RADAR_PATH = _get_static_path("radar.html")
REQUEST_PATH = _get_static_path("request.html")

# Integration Launch Date (January 01, 2026 00:00 AM UTC)
LAUNCH_TIMESTAMP = int(cfg.xp_start_timestamp)


def _resolve_wrapped_year(requested_year: Optional[int] = None) -> int:
    """Resolve Wrapped reporting year: WRAPPED_YEAR env wins, then request param, then current year."""
    forced = int(getattr(cfg, "wrapped_year", 0) or 0)
    if forced > 0:
        return forced
    if requested_year and int(requested_year) > 0:
        return int(requested_year)
    return datetime.datetime.now().year

def _wrapped_is_enabled() -> bool:
    return bool(getattr(cfg, "wrapped_enabled", True))

# Gear system CSV paths (Checking /data volume first, then internal /app/csv)
def _get_csv_path(filename):
    data_path = os.path.join("/data/csv", filename)
    if os.path.exists(data_path):
        return data_path
    return os.path.join("/app/csv", filename)

# Gear catalog loaded once at module level (reload on mtime change)
_GEAR_CACHE: Dict = {
    "gear":           {},   # item_id -> item dict
    "quests_by_id":   {},
    "quests_by_series": {},
    "quests_by_book": {},
    "xp_per_level":   [],
    "loot_mtime":     0,
    "quest_mtime":    0,
    "loot_path":      "",
}

# Global series index for API enrichment
_SERIES_INDEX_CACHE = {"data": [], "updated_at": 0}

def _load_gear_cached() -> Dict:
    """Reload gear/quest CSVs if they've changed on disk."""
    loot_p  = _get_csv_path("loot.csv")
    quest_p = _get_csv_path("quest.csv")
    xp_p    = _get_csv_path("xpcurve.csv")

    try:
        loot_mt  = int(os.stat(loot_p).st_mtime)
        quest_mt = int(os.stat(quest_p).st_mtime)
    except FileNotFoundError:
        return _GEAR_CACHE

    if (loot_mt != _GEAR_CACHE["loot_mtime"] or
            quest_mt != _GEAR_CACHE["quest_mtime"] or
            loot_p != _GEAR_CACHE["loot_path"] or
            not _GEAR_CACHE["gear"]):
        
        gear = load_loot_csv(loot_p)
        q_by_id, q_by_series, q_by_book = load_quests_csv(quest_p)
        xp = load_xp_curve(xp_p)
        
        _GEAR_CACHE.update({
            "gear": gear,
            "quests_by_id": q_by_id,
            "quests_by_series": q_by_series,
            "quests_by_book": q_by_book,
            "xp_per_level": xp,
            "loot_mtime": loot_mt,
            "quest_mtime": quest_mt,
            "loot_path": loot_p,
        })
        print(f"[gear] Loaded {len(gear)} items from {loot_p}")

    return _GEAR_CACHE

# Cache definitions so we don't re-read JSON on every request
_DEFS_CACHE = {"mtime": 0, "items": [], "by_id": {}}


def _load_defs_cached():
    try:
        st = os.stat(ACHIEVEMENTS_JSON_PATH)
        mtime = int(st.st_mtime)
    except FileNotFoundError:
        _DEFS_CACHE["mtime"] = 0
        _DEFS_CACHE["items"] = []
        _DEFS_CACHE["by_id"] = {}
        return _DEFS_CACHE

    if _DEFS_CACHE["items"] and _DEFS_CACHE["mtime"] == mtime:
        return _DEFS_CACHE

    with open(ACHIEVEMENTS_JSON_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)

    # Your file is typically {"achievements":[...]}
    items = data["achievements"] if isinstance(data, dict) and "achievements" in data else data
    if not isinstance(items, list):
        items = []

    by_id = {}
    for a in items:
        ach_id = a.get("id") or a.get("achievement_id") or a.get("key")
        if ach_id:
            by_id[str(ach_id)] = a

    _DEFS_CACHE["mtime"] = mtime
    _DEFS_CACHE["items"] = items
    _DEFS_CACHE["by_id"] = by_id
    return _DEFS_CACHE


def _get_user_map_best_effort() -> Dict[str, str]:
    """
    Pull uuid -> username map from ABSStats /api/usernames.
    Do it via direct HTTP so we don't depend on ABSStatsClient implementing get_usernames().
    """
    user_map: Dict[str, str] = {}
    try:
        import urllib.request
        import json as _json

        url = cfg.absstats_base_url.rstrip("/") + "/api/usernames"
        req = urllib.request.Request(url, headers={"Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            u = _json.loads(raw)

        if isinstance(u, dict):
            if isinstance(u.get("map"), dict):
                user_map = {str(k): str(v) for k, v in u["map"].items()}
            elif isinstance(u.get("users"), list):
                for row in u["users"]:
                    uid = row.get("id")
                    un = row.get("username")
                    if uid and un:
                        user_map[str(uid)] = str(un)

        if not user_map:
            print(f"[api] /api/usernames returned empty map from {url}")

    except Exception as e:
        print(f"[api] /api/usernames fetch failed (continuing without usernames): {e}")

    return user_map

def _safe_int(value, default: int = 0) -> int:
    try:
        return int(value)
    except Exception:
        return default

def _parse_xp_start_value(raw_value) -> Optional[int]:
    if raw_value is None:
        return None

    if isinstance(raw_value, (int, float)):
        n = int(raw_value)
        if n <= 0:
            return None
        if n >= 10_000_000_000:
            return int(n / 1000)
        return n

    s = str(raw_value).strip()
    if not s:
        return None

    if s.isdigit():
        n = int(s)
        if n <= 0:
            return None
        if n >= 10_000_000_000:
            return int(n / 1000)
        return n

    for fmt in ("%Y-%m-%d", "%Y/%m/%d"):
        try:
            dt = datetime.datetime.strptime(s, fmt).replace(tzinfo=datetime.timezone.utc)
            return int(dt.timestamp())
        except Exception:
            pass

    return None

_USER_XP_START_CACHE: Dict = {
    "path": "",
    "mtime": 0,
    "map": {},
}

def _load_user_xp_start_overrides() -> Dict[str, int]:
    path = (cfg.user_xp_start_overrides_path or "").strip()
    if not path:
        return {}

    try:
        mtime = int(os.stat(path).st_mtime)
    except FileNotFoundError:
        _USER_XP_START_CACHE["path"] = path
        _USER_XP_START_CACHE["mtime"] = 0
        _USER_XP_START_CACHE["map"] = {}
        return {}
    except Exception as e:
        print(f"[xp-start] failed stat on overrides file '{path}': {e}")
        return {}

    if _USER_XP_START_CACHE.get("path") == path and _USER_XP_START_CACHE.get("mtime") == mtime:
        return _USER_XP_START_CACHE.get("map") or {}

    parsed: Dict[str, int] = {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            raw = json.load(f)
        if isinstance(raw, dict):
            for k, v in raw.items():
                ts = _parse_xp_start_value(v)
                if ts:
                    parsed[str(k).strip().lower()] = ts
    except Exception as e:
        print(f"[xp-start] failed reading overrides '{path}': {e}")
        parsed = {}

    _USER_XP_START_CACHE["path"] = path
    _USER_XP_START_CACHE["mtime"] = mtime
    _USER_XP_START_CACHE["map"] = parsed
    return parsed

def _resolve_user_effective_start(user_id: str, username: str = "") -> int:
    start_ts = int(LAUNCH_TIMESTAMP)
    overrides = _load_user_xp_start_overrides()

    uid_key = str(user_id or "").strip().lower()
    un_key = str(username or "").strip().lower()

    for key in (uid_key, un_key):
        if key and key in overrides:
            start_ts = max(start_ts, int(overrides[key]))
    return start_ts

def _session_started_at_seconds(session: dict) -> int:
    raw = session.get("startedAt") or session.get("startTime") or session.get("started_at") or 0
    try:
        n = float(raw)
    except Exception:
        return 0
    if n <= 0:
        return 0
    if n >= 10_000_000_000:
        return int(n / 1000)
    return int(n)

def _filter_progression_for_user(user_id: str, username: str, finished_dates_raw: Dict[str, int], user_sessions_all: List[dict]):
    effective_start = _resolve_user_effective_start(user_id, username)

    finished_dates = {
        str(bid): int(ts)
        for bid, ts in (finished_dates_raw or {}).items()
        if int(ts or 0) >= effective_start
    }
    finished_ids = set(finished_dates.keys())

    if cfg.strict_verification:
        finished_ids = get_verified_book_ids(
            finished_ids,
            user_sessions_all or [],
            threshold=cfg.verify_listen_threshold,
            require_duration_for_credit=cfg.require_duration_for_credit,
            require_integration_session_for_credit=cfg.require_2026_session_for_credit,
        )
        finished_dates = {k: v for k, v in finished_dates.items() if k in finished_ids}

    # Phase 5: 95% Completion Threshold
    # Merge books that hit the threshold into finished_ids even if ABS hasn't marked them done.
    nearly_done = find_nearly_complete_books(
        finished_ids,
        user_sessions_all or [],
        threshold=cfg.completion_threshold,
        integration_timestamp=effective_start,
    )
    for bid, ts in nearly_done.items():
        finished_ids.add(bid)
        finished_dates[bid] = ts

    # Listening-time XP uses global launch scope (2026-01-01+), while
    # book/series progression remains gated by per-user effective_start.
    scoped_sessions = [
        s for s in (user_sessions_all or [])
        if _session_started_at_seconds(s) >= LAUNCH_TIMESTAMP
    ]

    return finished_dates, finished_ids, scoped_sessions, effective_start



def _listening_seconds_by_user(listening_time_payload) -> Dict[str, int]:
    """
    listening_time_payload shapes vary over time; normalize safely.
    Expected common shapes:
      - {"users":[{"userId": "...", "listeningSeconds": 123, ...}, ...]}
      - {"users":[{"id": "...", "listeningSeconds": 123, ...}, ...]}
      - {"byUser":{"<uuid>": {"listeningSeconds": 123}}}
    """
    out: Dict[str, int] = {}
    if not listening_time_payload:
        return out

    if isinstance(listening_time_payload, dict):
        # byUser map form
        by_user = listening_time_payload.get("byUser")
        if isinstance(by_user, dict):
            for uid, row in by_user.items():
                try:
                    sec = int((row or {}).get("listeningSeconds", 0))
                except Exception:
                    sec = 0
                out[str(uid)] = sec
            return out

        # users list form
        users = listening_time_payload.get("users")
        if isinstance(users, list):
            for row in users:
                if not isinstance(row, dict):
                    continue
                uid = row.get("userId") or row.get("id") or row.get("user_id")
                if not uid:
                    continue
                try:
                    sec = int(row.get("listeningSeconds", 0))
                except Exception:
                    sec = 0
                out[str(uid)] = sec
            return out

    return out
def _count_books_by_year(snap) -> Dict[str, int]:
    fd = getattr(snap, "finished_dates", None) or {}
    from datetime import datetime
    counts: Dict[str, int] = {}
    for book_id, ts in fd.items():
        try:
            y = str(datetime.fromtimestamp(ts).year)
            counts[y] = counts.get(y, 0) + 1
        except Exception:
            pass
    return counts


def _next_milestone(current: int, milestones: List[int]):
    """
    Given current value and milestone thresholds, return a simple next-up object.
    """
    ms = sorted([m for m in milestones if isinstance(m, int) and m > 0])
    if not ms:
        return None

    for target in ms:
        if current < target:
            remaining = target - current
            pct = 0.0 if target <= 0 else min(1.0, max(0.0, current / target))
            return {
                "current": current,
                "target": target,
                "remaining": remaining,
                "percent": pct
            }

    # already beyond max milestone
    top = ms[-1]
    return {
        "current": current,
        "target": top,
        "remaining": 0,
        "percent": 1.0
    }


# -----------------------------------------
# Cover Sync State (shared across threads)
# -----------------------------------------

_SYNC_STATE: Dict = {
    "running": False,
    "done": False,
    "total": 0,
    "synced": 0,
    "skipped": 0,
    "errors": 0,
    "message": "Idle",
}


def _sanitize_cover_filename(title: str) -> str:
    safe = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "", title)
    safe = re.sub(r"\s+", "_", safe.strip())
    return safe[:200] or "unknown"


def _download_cover(absstats_base_url: str, item_id: str, dest: str) -> bool:
    """Download a single cover by libraryItemId. Returns True on success."""
    import urllib.request
    cover_url = absstats_base_url.rstrip("/") + f"/api/cover/{item_id}"
    try:
        with urllib.request.urlopen(urllib.request.Request(cover_url), timeout=15) as resp:
            if resp.status != 200:
                return False
            cover_data = resp.read()
        if len(cover_data) > 100:
            with open(dest, "wb") as f:
                f.write(cover_data)
            return True
        return False
    except Exception:
        return False


def _run_cover_sync(absstats_base_url: str, covers_dir: str, force: bool = False):
    import urllib.request, json as _json

    _SYNC_STATE.update({"running": True, "done": False, "total": 0,
                        "synced": 0, "skipped": 0, "errors": 0,
                        "message": "Fetching series list from ABS…"})
    try:
        base = absstats_base_url.rstrip("/")
        os.makedirs(covers_dir, exist_ok=True)

        # Step 1: Fetch series index — one cover per series (first book only)
        try:
            with urllib.request.urlopen(urllib.request.Request(base + "/api/series"), timeout=30) as resp:
                series_data = _json.loads(resp.read())
            series_list = series_data.get("series") or []
        except Exception:
            series_list = []

        # Build set of all book IDs that belong to a series (to exclude from standalone sync)
        series_book_ids: set = set()
        # List of (series_name, first_book_item_id) to download
        series_covers: list = []

        for s in series_list:
            series_name = (s.get("seriesName") or "").strip()
            books = s.get("books") or []
            if not series_name or not books:
                continue

            # Track all book IDs in this series
            for b in books:
                bid = b.get("libraryItemId")
                if bid:
                    series_book_ids.add(bid)

            # Find first book by seriesSequence (numeric sort), fallback to list order
            def _seq(b):
                try:
                    return float(b.get("seriesSequence") or 9999)
                except Exception:
                    return 9999.0

            first_book = min(books, key=_seq)
            first_id = first_book.get("libraryItemId")
            if first_id:
                series_covers.append((series_name, first_id))

        # Step 2: Fetch all items — find standalones (not in any series)
        _SYNC_STATE["message"] = "Fetching full item list for standalone books…"
        try:
            with urllib.request.urlopen(urllib.request.Request(base + "/api/all-items"), timeout=30) as resp:
                items_data = _json.loads(resp.read())
            all_items = items_data.get("items") or []
        except Exception:
            all_items = []

        standalone_covers: list = []  # (title, item_id)
        for item in all_items:
            item_id = item.get("libraryItemId") or ""
            if not item_id or item_id in series_book_ids:
                continue
            title = (item.get("title") or "").strip() or item_id
            standalone_covers.append((title, item_id))

        total = len(series_covers) + len(standalone_covers)
        _SYNC_STATE["total"] = total
        _SYNC_STATE["message"] = (
            f"Downloading {len(series_covers)} series covers "
            f"and {len(standalone_covers)} standalone covers…"
        )

        # Step 3: Download series covers — saved as {series_name}.jpg
        for series_name, item_id in series_covers:
            filename = _sanitize_cover_filename(series_name) + ".jpg"
            dest = os.path.join(covers_dir, filename)
            if not force and os.path.exists(dest):
                _SYNC_STATE["skipped"] += 1
                continue
            if _download_cover(base, item_id, dest):
                _SYNC_STATE["synced"] += 1
            else:
                _SYNC_STATE["errors"] += 1

        # Step 4: Download standalone covers — saved as {book_title}.jpg
        for title, item_id in standalone_covers:
            filename = _sanitize_cover_filename(title) + ".jpg"
            dest = os.path.join(covers_dir, filename)
            if not force and os.path.exists(dest):
                _SYNC_STATE["skipped"] += 1
                continue
            if _download_cover(base, item_id, dest):
                _SYNC_STATE["synced"] += 1
            else:
                _SYNC_STATE["errors"] += 1

        skipped_part = f", {_SYNC_STATE['skipped']} already existed" if _SYNC_STATE["skipped"] else ""
        errors_part  = f", {_SYNC_STATE['errors']} errors" if _SYNC_STATE["errors"] else ""
        _SYNC_STATE["message"] = f"Done: {_SYNC_STATE['synced']} new{skipped_part}{errors_part}."
    except Exception as e:
        _SYNC_STATE["message"] = f"Sync failed: {e}"
    finally:
        _SYNC_STATE["running"] = False
        _SYNC_STATE["done"] = True


@app.post("/awards/api/sync-covers")
def start_cover_sync(force: bool = False):
    if _SYNC_STATE["running"]:
        return JSONResponse({"started": False, "message": "Sync already in progress."}, status_code=409)
    t = threading.Thread(target=_run_cover_sync, args=(cfg.absstats_base_url, COVERS_DIR, force), daemon=True)
    t.start()
    return JSONResponse({"started": True, "message": "Cover sync started."})


@app.get("/awards/api/sync-covers/status")
def cover_sync_status():
    return JSONResponse(dict(_SYNC_STATE))


@app.get("/")
def root_redirect():
    now = int(time.time())
    # If before Jan 1st, serve the file DIRECTLY
    if now < LAUNCH_TIMESTAMP:
        return FileResponse(_get_static_path("day_1.html"))
    return RedirectResponse(url="/landing", status_code=302)

@app.get("/landing")
def read_landing_root():
    return FileResponse(_get_static_path("landing.html"))

@app.get("/quests")
def read_quests_root():
    return FileResponse(_get_static_path("quest.html"))

@app.get("/system-alert")
def read_day_1():
    return FileResponse(_get_static_path("day_1.html"))

@app.get("/journal")
def read_dashboard_root():
    return FileResponse(_get_static_path("dashboard.html"))

@app.get("/champions")
def read_leaderboard_root():
    return FileResponse(_get_static_path("leaderboard.html"))

@app.get("/timeline")
def read_timeline_root():
    return FileResponse(_get_static_path("timeline.html"))

@app.get("/chronicle")
@app.get("/awards/chronicle")
def read_chronicle_root():
    return FileResponse(_get_static_path("chronicle.html"))

@app.get("/archives")
def read_archives_root():
    return FileResponse(_get_static_path("stats.html"))

@app.get("/tier")
def read_tier_root():
    return FileResponse(_get_static_path("tier.html"))

@app.get("/playlist")
def read_playlist_root():
    return FileResponse(_get_static_path("playlist.html"))

@app.get("/forge")
@app.get("/admin/radar")
def read_radar_admin():
    return FileResponse(_get_static_path("admin/radar.html"))

@app.get("/admin/forge")
def read_achievement_tester_root():
    return FileResponse(_get_static_path("admin/forge.html"))

@app.get("/template")
@app.get("/admin/template")
@app.get("/awards/template")
def read_template_root():
    return FileResponse(_get_static_path("admin/template.html"))

@app.get("/admin/template-builder")
def read_template_builder_root():
    return FileResponse(_get_static_path("admin/template-builder.html"))

@app.get("/wrapped")
def read_wrapped_root():
    if not _wrapped_is_enabled():
        raise HTTPException(status_code=404, detail="Wrapped is disabled")
    return FileResponse(WRAPPED_PATH)

# ── Wrapped slide pages ────────────────────────────────────────────────────────
_WRAPPED_SLIDES = ['intro','hours','books','author','months','personality','execute','gear','outro']

@app.get("/wrapped/{slide}")
def read_wrapped_slide(slide: str):
    if not _wrapped_is_enabled():
        raise HTTPException(status_code=404, detail="Wrapped is disabled")
    if slide not in _WRAPPED_SLIDES:
        return RedirectResponse(url="/wrapped", status_code=302)
    return FileResponse(_get_static_path(f"Wrapped/w-{slide}.html"))

@app.get("/character")
def read_character_sheet_root():
    return FileResponse(_get_static_path("character_sheet.html"))

@app.get("/roster")
def read_roster_root():
    return FileResponse(_get_static_path("roster.html"))

@app.get("/loot")
def read_loot_compendium_root():
    return FileResponse(_get_static_path("loot.html"))


@app.get("/awards/")
def awards_redirect():
    return RedirectResponse(url="/landing", status_code=302)

@app.get("/awards/landing")
def read_landing():
    return FileResponse(_get_static_path("landing.html"))

@app.get("/awards/journal")
def read_dashboard():
    return FileResponse(_get_static_path("dashboard.html"))

@app.get("/awards/champions")
def read_leaderboard():
    return FileResponse(_get_static_path("leaderboard.html"))

@app.get("/awards/timeline")
def read_timeline():
    return FileResponse(_get_static_path("timeline.html"))

@app.get("/awards/archives")
def read_archives():
    return FileResponse(_get_static_path("stats.html"))

@app.get("/awards/tier")
def read_tier():
    return FileResponse(_get_static_path("tier.html"))

@app.get("/awards/playlist")
def read_playlist():
    return FileResponse(_get_static_path("playlist.html"))

@app.get("/awards/forge")
def read_achievement_tester():
    return FileResponse(_get_static_path("tester.html"))

@app.get("/awards/quests")
def read_quests():
    return FileResponse(_get_static_path("quest.html"))


@app.get("/awards/wrapped")
def read_wrapped():
    if not _wrapped_is_enabled():
        raise HTTPException(status_code=404, detail="Wrapped is disabled")
    if not os.path.exists(WRAPPED_PATH):
        raise HTTPException(status_code=404, detail=f"Missing {WRAPPED_PATH}")
    return FileResponse(WRAPPED_PATH)


@app.get("/awards/character")
def read_character_sheet():
    return FileResponse(CHARACTER_SHEET_PATH)


@app.get("/awards/roster")
def read_roster():
    return FileResponse(ROSTER_PATH)

@app.get("/admin")
@app.get("/awards/admin")
def read_admin_hub():
    return FileResponse(_get_static_path("admin/index.html"))

@app.get("/admin/ops")
@app.get("/awards/admin/ops")
def read_admin_ops():
    return FileResponse(_get_static_path("admin/ops.html"))

@app.get("/admin/loot")
@app.get("/admin/armory")
@app.get("/awards/admin/loot")
@app.get("/awards/admin/armory")
def read_admin_armory():
    return FileResponse(_get_static_path("admin/loot.html"))

@app.get("/admin/quest")
@app.get("/admin/bounties")
@app.get("/awards/admin/quest")
@app.get("/awards/admin/bounties")
def read_admin_bounties():
    return FileResponse(_get_static_path("admin/quest.html"))

@app.get("/admin/setup")
@app.get("/awards/admin/setup")
def read_admin_setup():
    return FileResponse(_get_static_path("admin/setup-wizard.html"))

# --- Admin API: Script Execution ---
import subprocess

@app.post("/awards/api/admin/run-script/{script_id}")
async def api_admin_run_script(script_id: str):
    script_map = {
        "library_discovery": "audit_library.py",
        "generate_system_content": "generate_system_content.py",
        "achievement_summary": "audit_achievements.py",
        "system_chronicle": "system_chronicle.py",
        "system_sanity": "system_sanity.py",
        "fix_icons": "reassign_broken_icons.py",
        "forge_loot": "forge_artifact_batch.py",
        "generate_10": "generate_10.py"
    }
    
    script_file = script_map.get(script_id)
    if not script_file:
        raise HTTPException(status_code=404, detail="Script definition not found.")
    
    # Priority: /data/scripts -> /app -> current dir
    script_path = os.path.join("/data/scripts", script_file)
    if not os.path.exists(script_path):
        script_path = os.path.join("/app", script_file)
        if not os.path.exists(script_path):
            script_path = script_file
            if not os.path.exists(script_path):
                raise HTTPException(status_code=404, detail=f"Script file {script_file} not found on disk.")

    try:
        # Run the script and capture output
        result = subprocess.run(
            ["python", script_path],
            capture_output=True,
            text=True,
            timeout=120 # 2 minute timeout
        )
        return {
            "ok": result.returncode == 0,
            "stdout": result.stdout,
            "stderr": result.stderr,
            "returncode": result.returncode
        }
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": "Script timed out after 120 seconds."}
    except Exception as e:
        return {"ok": False, "error": str(e)}

# --- Admin API: Manual Loot/Quest Add ---
import csv

@app.post("/awards/api/admin/loot/add")
async def api_admin_loot_add(request: Request):
    data = await request.json()
    loot_path = _get_csv_path("loot.csv")
    
    # 1. Generate new ID
    new_id = "loot_001"
    try:
        with open(loot_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            last_id_num = 0
            for row in reader:
                try:
                    num = int(row['item_id'].split('_')[1])
                    if num > last_id_num: last_id_num = num
                except: pass
            new_id = f"loot_{last_id_num + 1:03}"
    except: pass

    # 2. Append row
    new_row = {
        "item_id": new_id,
        "item_name": data.get("item_name"),
        "slot": data.get("slot"),
        "str": data.get("str", 0),
        "mag": data.get("mag", 0),
        "def": data.get("def", 0),
        "hp": data.get("hp", 0),
        "special_ability": data.get("special_ability", "None"),
        "rarity": data.get("rarity", "Common"),
        "flavor_text": data.get("flavor_text", ""),
        "series_tag": data.get("series_tag", ""),
        "icon": data.get("icon", "")
    }
    
    try:
        with open(loot_path, 'a', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=new_row.keys(), quoting=csv.QUOTE_ALL)
            writer.writerow(new_row)
        # Clear gear cache
        _GEAR_CACHE["loot_mtime"] = 0
        return {"ok": True, "id": new_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/awards/api/admin/quest/backfill")
def api_admin_quest_backfill():
    """
    One-time backfill: scan all gear:series awards, match against quest CSV by series name,
    and record any missing quest completions. Safe to call multiple times (idempotent).
    """
    gc = _load_gear_cached()
    quests_by_series = gc.get("quests_by_series") or {}

    all_awards = store.get_all_awards()
    recorded = 0
    skipped = 0
    no_quest = 0

    for a in all_awards:
        ach_id = str(a.get("achievement_id") or "")
        if not ach_id.startswith("gear:series:"):
            continue

        user_id = str(a.get("user_id") or "")
        if not user_id or user_id == "SYSTEM":
            continue

        payload = a.get("payload") or {}
        series_name = payload.get("series") or ""
        ts = int(payload.get("_timestamp") or a.get("awarded_at") or 0)

        if not series_name:
            skipped += 1
            continue

        from .gear_engine import _norm
        quest = quests_by_series.get(_norm(series_name))
        if not quest:
            no_quest += 1
            continue

        quest_key = f"quest:series:{quest['quest_id']}"
        if not store.is_awarded(user_id, quest_key):
            store.record_awards(user_id, [(
                quest_key,
                {
                    "quest_id": quest["quest_id"],
                    "quest_name": quest["quest_name"],
                    "target_type": "series",
                    "target_name": quest["target_name"],
                    "xp_reward": quest["xp_reward"],
                    "series": series_name,
                    "_timestamp": ts,
                },
            )])
            print(f"[quest-backfill] {user_id} -> {quest['quest_name']} ({series_name})")
            recorded += 1
        else:
            skipped += 1

    return JSONResponse({"ok": True, "recorded": recorded, "skipped": skipped, "no_quest_defined": no_quest})


@app.post("/awards/api/admin/quest/add")
async def api_admin_quest_add(request: Request):
    data = await request.json()
    quest_path = _get_csv_path("quest.csv")
    
    # 1. Generate new ID
    new_id = "q_001"
    try:
        with open(quest_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            last_id_num = 0
            for row in reader:
                try:
                    # Handle q_### or just ###
                    id_str = row['quest_id']
                    if id_str.startswith('q_'):
                        num = int(id_str.split('_')[1])
                    else:
                        num = int(id_str)
                    if num > last_id_num: last_id_num = num
                except: pass
            new_id = f"q_{last_id_num + 1:03}"
    except: pass

    # 2. Append row
    new_row = {
        "quest_id": new_id,
        "target_type": data.get("target_type", "series"),
        "target_name": data.get("target_name"),
        "xp_reward": data.get("xp_reward", 0),
        "loot_rarity": data.get("loot_rarity", ""),
        "quest_name": data.get("quest_name", ""),
        "flavor_text": data.get("flavor_text", "")
    }
    
    try:
        with open(quest_path, 'a', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=new_row.keys(), quoting=csv.QUOTE_ALL)
            writer.writerow(new_row)
        # Clear gear cache
        _GEAR_CACHE["quest_mtime"] = 0
        return {"ok": True, "id": new_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- Test/Development Routes (For working on "good" pages while event is live) ---
@app.get("/test/{pagename}")
def read_test_page_root(pagename: str):
    # 1. Try the /static/test/ subfolder first (Cleaner: no prefix needed)
    test_folder_path = os.path.join("/data/static/test", f"{pagename}.html")
    if os.path.exists(test_folder_path):
        return FileResponse(test_folder_path)

    # 2. Try the test_ prefix in the static root (Compatibility)
    filename = f"test_{pagename}.html"
    path = _get_static_path(filename)
    if os.path.exists(path):
        return FileResponse(path)
    
    raise HTTPException(status_code=404, detail=f"Test page '{pagename}' not found. Place it in /static/test/{pagename}.html or /static/test_{pagename}.html")

@app.get("/awards/test/{pagename}")
def read_test_page(pagename: str):
    return read_test_page_root(pagename)



@app.get("/awards/api/tier-users")
def api_tier_users():
    user_map = _get_user_map_best_effort()
    users = []
    for uid, uname in (user_map or {}).items():
        username = str(uname or "").strip()
        if not username:
            continue
        if not _user_is_allowed(username):
            continue
        users.append({"user_id": str(uid), "username": username})
    users.sort(key=lambda x: str(x.get("username") or "").lower())
    return JSONResponse({"users": users})


@app.get("/api/tier-users")
def api_tier_users_root():
    return api_tier_users()


@app.get("/awards/api/tier-lists")
def api_tier_lists():
    user_map = _get_user_map_best_effort()
    rows = store.get_tier_lists()
    out = []
    for r in rows:
        uid = str(r.get("user_id") or "").strip()
        uname = str(r.get("username") or user_map.get(uid) or uid).strip()
        if not _user_is_allowed(uname):
            continue
        out.append({
            "user_id": uid,
            "username": uname,
            "name": str(r.get("list_name") or "Tier List"),
            "query": str(r.get("query") or ""),
            "updated_at": int(r.get("updated_at") or 0),
        })
    return JSONResponse({"lists": out})


@app.get("/api/tier-lists")
def api_tier_lists_root():
    return api_tier_lists()


@app.post("/awards/api/tier-lists")
async def api_tier_lists_save(request: Request):
    body = await request.json()
    raw_user = str((body or {}).get("user_id") or "").strip()
    raw_name = str((body or {}).get("name") or "").strip()
    raw_query = str((body or {}).get("query") or "").strip()
    raw_pin = str((body or {}).get("pin") or "").strip()

    if not raw_user:
        raise HTTPException(status_code=400, detail="user_id is required")
    if not raw_query:
        raise HTTPException(status_code=400, detail="query is required")
    if not raw_pin:
        raise HTTPException(status_code=400, detail="pin is required")

    user_map = _get_user_map_best_effort()
    user_id = raw_user
    username = user_map.get(user_id, "")
    if not username:
        lower = raw_user.lower()
        rev = {str(v).lower(): str(k) for k, v in user_map.items()}
        if lower in rev:
            user_id = rev[lower]
            username = raw_user
        else:
            username = raw_user

    if not _user_is_allowed(username):
        raise HTTPException(status_code=403, detail="user not allowed")

    stored_pin = store.get_pin(user_id)
    if stored_pin is None:
        raise HTTPException(status_code=403, detail="PIN not set for this user.")
    if stored_pin != raw_pin:
        raise HTTPException(status_code=401, detail="Invalid PIN.")

    list_name = raw_name or f"{username}'s Tier List"
    ts = int(time.time())
    store.upsert_tier_list(user_id=user_id, username=username, list_name=list_name, query=raw_query, updated_at=ts)
    return JSONResponse({
        "ok": True,
        "list": {
            "user_id": user_id,
            "username": username,
            "name": list_name,
            "query": raw_query,
            "updated_at": ts,
        }
    })


@app.post("/api/tier-lists")
async def api_tier_lists_save_root(request: Request):
    return await api_tier_lists_save(request)


@app.post("/awards/api/tier-lists/{user_id}/delete")
async def api_tier_lists_delete(user_id: str, request: Request):
    body = await request.json()
    raw_pin = str((body or {}).get("pin") or "").strip()
    if not raw_pin:
        raise HTTPException(status_code=400, detail="pin is required")

    target_uid = str(user_id).strip()
    stored_pin = store.get_pin(target_uid)
    if stored_pin is None:
        raise HTTPException(status_code=403, detail="PIN not set for this user.")
    if stored_pin != raw_pin:
        raise HTTPException(status_code=401, detail="Invalid PIN.")

    store.delete_tier_list(target_uid)
    return JSONResponse({"ok": True})


@app.post("/api/tier-lists/{user_id}/delete")
async def api_tier_lists_delete_root(user_id: str, request: Request):
    return await api_tier_lists_delete(user_id=user_id, request=request)
@app.get("/awards/api/character/{user_id}")
def api_character(user_id: str, admin: bool = False):
    """
    Return the full character sheet for a given user.
    Computes level, XP, base stats, equipped gear, and combat power.
    ONLY uses 2026 data.
    """
    import urllib.request, json as _json

    gc = _load_gear_cached()
    if not gc["gear"]:
        raise HTTPException(status_code=503, detail="Gear catalog not loaded yet.")

    base = cfg.absstats_base_url.rstrip("/")

    def fetch(path: str, timeout: int = 30):
        req = urllib.request.Request(base + path, headers={"Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return _json.loads(r.read())

    # Get completion snapshot for this user
    try:
        comp_data = fetch(cfg.completed_endpoint)
        users_raw = comp_data.get("users") or []
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch completions: {e}")

    snap = None
    for u in users_raw:
        uid = str(u.get("userId") or u.get("id") or "")
        if uid == user_id:
            from .models import UserSnapshot
            fd_raw = u.get("finishedDates") or {}
            finished_dates_raw = {k: int(v) // 1000 for k, v in fd_raw.items() if v}

            snap = UserSnapshot(
                user_id=uid,
                username=str(u.get("username") or ""),
                finished_ids=set(),
                finished_dates={},
                finished_count=0,
            )
            break

    if snap is None:
        raise HTTPException(status_code=404, detail=f"User {user_id} not found in completions.")

    # Get username map
    username = snap.username or user_id
    try:
        udata    = fetch("/api/usernames", timeout=10)
        user_map = udata.get("map") or {}
        username = user_map.get(user_id, username) or username
    except Exception:
        pass

    # Get listening hours and sessions for this user (Filtered to 2026+)
    listening_hours = 0.0
    currently_reading = None
    user_sessions = []
    try:
        # Fetch sessions for XP calculation
        s_data = client.get_listening_sessions() 
        all_sessions_payload = s_data.get("users") or []
        for u_sess in all_sessions_payload:
            if str(u_sess.get("userId")) == user_id:
                raw_sessions = u_sess.get("sessions") or []
                finished_dates, finished_ids, user_sessions, effective_start = _filter_progression_for_user(
                    user_id=user_id,
                    username=snap.username,
                    finished_dates_raw=finished_dates_raw,
                    user_sessions_all=raw_sessions,
                )
                snap.finished_ids = finished_ids
                snap.finished_dates = finished_dates
                snap.finished_count = len(finished_ids)

                sec = sum(int(s.get("timeListening", s.get("duration", 0))) for s in user_sessions)
                listening_hours = sec / 3600.0
                break

        udata_full = fetch("/api/users", timeout=30)
        users_list = udata_full.get("users") or []
        for u_info in users_list:
            if str(u_info.get("id")) == user_id:
                currently_reading = u_info.get("currentlyReading")
                break
    except Exception:
        pass

    # Get series index (cached in worker, but fetch fresh here for API)
    try:
        series_data  = fetch("/api/series", timeout=30)
        series_index = series_data.get("series") or []
    except Exception:
        series_index = []

    # Load achievement definitions for XP calculation
    defs = _load_defs_cached()
    achievements_dict = defs["by_id"]

    # Fetch awards for this user to calculate achievement XP (Filtered to 2026+)
    effective_start = _resolve_user_effective_start(user_id, snap.username)
    u_awards = [a for a in store.get_all_awards() if a["user_id"] == user_id and a["awarded_at"] >= effective_start]

    sheet = build_character_sheet(
        user_id=user_id,
        username=username,
        snap=snap,
        series_index=series_index,
        quests_by_series=gc["quests_by_series"],
        quests_by_book=gc["quests_by_book"],
        gear_catalog=gc["gear"],
        xp_per_level=gc["xp_per_level"],
        listening_hours=listening_hours,
        currently_reading=currently_reading,
        store=store,
        user_sessions=user_sessions,
        user_awards=u_awards,
        achievements_def=achievements_dict,
    )

    # LIMBO MASKING
    is_limbo = (time.time() < LAUNCH_TIMESTAMP) and not admin
    if is_limbo:
        sheet["level"] = 1
        sheet["combat_power"] = 0
        sheet["current_xp"] = 0
        sheet["total_xp"] = 0
        sheet["equipped"] = {slot: None for slot in ["Head", "Chest", "Weapon", "Neck", "Ring", "Trinket"]}
        sheet["total_stats"] = sheet.get("base_stats", {})
        sheet["is_limbo"] = True
    else:
        sheet["is_limbo"] = False

    return JSONResponse(sheet)


@app.get("/awards/api/inventory/{user_id}")
def api_inventory(user_id: str):
    """Return a user's full item inventory with gear details resolved. Filtered to 2026+."""
    gc = _load_gear_cached()
    inventory = store.get_inventory(user_id)
    items_out = []
    effective_start = _resolve_user_effective_start(user_id, "")
    for inv in inventory:
        # Progression scope filter
        if cfg.progression_scope != "all_time" and inv["acquired_at"] < effective_start:
            continue
            
        item = gc["gear"].get(inv["item_id"], {})
        from .gear_engine import item_level
        out = dict(item)
        out["acquired_at"] = inv["acquired_at"]
        out["source"]      = inv["source"]
        out["item_level"]  = item_level(item) if item else 0
        items_out.append(out)
    items_out.sort(key=lambda x: x["item_level"], reverse=True)
    
    # Check if pin is set
    pin_set = store.get_pin(user_id) is not None
    return JSONResponse({"user_id": user_id, "count": len(items_out), "items": items_out, "pin_set": pin_set})


@app.post("/awards/api/gear/set-pin")
async def api_set_pin(request: Request):
    data = await request.json()
    user_id = data.get("user_id")
    pin = str(data.get("pin", "")).strip()
    
    if not user_id or not pin:
        raise HTTPException(status_code=400, detail="user_id and pin required")
    
    if store.get_pin(user_id) is not None:
        raise HTTPException(status_code=403, detail="PIN already set. System reset required for changes.")
    
    store.set_pin(user_id, pin)
    return JSONResponse({"ok": True})


@app.post("/awards/api/gear/spend-points")
async def api_spend_points(request: Request):
    data = await request.json()
    user_id = data.get("user_id")
    stats = data.get("stats", {}) # e.g. {"spent_str": 5}
    pin = str(data.get("pin", "")).strip()
    
    if not user_id or not stats or not pin:
        raise HTTPException(status_code=400, detail="user_id, stats, and pin required")
        
    # Verify PIN
    stored_pin = store.get_pin(user_id)
    if stored_pin is None:
        raise HTTPException(status_code=403, detail="PIN not set for this user.")
    if stored_pin != pin:
        raise HTTPException(status_code=401, detail="Invalid PIN.")
        
    success = store.spend_stat_points(user_id, stats)
    if not success:
        raise HTTPException(status_code=400, detail="Insufficient unspent points or invalid stats.")
        
    return JSONResponse({"ok": True})


@app.post("/awards/api/gear/allocate-points")
async def api_allocate_points(request: Request):
    data = await request.json()
    user_id = data.get("user_id")
    pin = str(data.get("pin", "")).strip()
    stats = data.get("stats") or {}

    if not user_id or not pin:
        raise HTTPException(status_code=400, detail="user_id and pin required")

    stored_pin = store.get_pin(user_id)
    if stored_pin is None:
        raise HTTPException(status_code=403, detail="PIN not set for this user.")
    if stored_pin != pin:
        raise HTTPException(status_code=401, detail="Invalid PIN.")

    # Accept either short keys (str/mag/def/hp) or spent_* keys.
    try:
        spent_str = int(stats.get("str", stats.get("spent_str", 0)) or 0)
        spent_mag = int(stats.get("mag", stats.get("spent_mag", 0)) or 0)
        spent_def = int(stats.get("def", stats.get("spent_def", 0)) or 0)
        spent_hp = int(stats.get("hp", stats.get("spent_hp", 0)) or 0)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid stat allocation payload")

    if any(v < 0 or (v % 5) != 0 for v in [spent_str, spent_mag, spent_def, spent_hp]):
        raise HTTPException(status_code=400, detail="Stat allocations must be non-negative multiples of 5")

    ok = store.set_stat_allocation(user_id, spent_str, spent_mag, spent_def, spent_hp)
    if not ok:
        raise HTTPException(status_code=400, detail="Allocation failed. Check unspent pool and stat values.")

    base = store.get_base_stats(user_id) or {}
    return JSONResponse({
        "ok": True,
        "unspent_points": int(base.get("unspent_points", 0) or 0),
        "spent": {
            "str": int(base.get("spent_str", 0) or 0),
            "mag": int(base.get("spent_mag", 0) or 0),
            "def": int(base.get("spent_def", 0) or 0),
            "hp": int(base.get("spent_hp", 0) or 0),
        }
    })


@app.post("/awards/api/gear/equip")
async def api_equip(request: Request):
    data = await request.json()
    user_id = data.get("user_id")
    item_id = data.get("item_id")
    slot    = data.get("slot") # Optional, can resolve from item_id
    pin     = str(data.get("pin", "")).strip()

    print(f"[EQUIP] Request: user={user_id} item={item_id} slot={slot} pin_provided={bool(pin)}")

    if not user_id or not item_id or not pin:
        print(f"[EQUIP] 400 — missing fields")
        raise HTTPException(status_code=400, detail="user_id, item_id, and pin required")

    # Verify PIN
    stored_pin = store.get_pin(user_id)
    if stored_pin is None:
        print(f"[EQUIP] 403 — no PIN set for {user_id}")
        raise HTTPException(status_code=403, detail="PIN not set for this user.")
    if stored_pin != pin:
        print(f"[EQUIP] 401 — wrong PIN for {user_id}")
        raise HTTPException(status_code=401, detail="Invalid PIN.")

    # Verify Ownership
    if not store.has_item(user_id, item_id):
        print(f"[EQUIP] 403 — {user_id} does not own {item_id}")
        raise HTTPException(status_code=403, detail="Item not in inventory.")

    # Get Item details
    gc = _load_gear_cached()
    item = gc["gear"].get(item_id)
    if not item:
        print(f"[EQUIP] 404 — item {item_id} not in catalog")
        raise HTTPException(status_code=404, detail="Item not found in catalog.")

    target_slot = slot or item.get("slot")
    if not target_slot:
        print(f"[EQUIP] 400 — could not determine slot for {item_id}")
        raise HTTPException(status_code=400, detail="Could not determine equipment slot.")
    
    # Note: For accessories, the client should send Neck, Ring, or Trinket as the slot
    print(f"[EQUIP] {user_id} equipped item={item_id} slot={target_slot}")
    store.set_manual_equipment(user_id, target_slot, item_id)
    return JSONResponse({"ok": True, "equipped": item_id, "slot": target_slot})


def _run_monthly_review(snapshots, sessions_payload, store, gear_catalog):
    """
    Analyzes the last 30 days of data and awards Monthly Champions.
    """
    print("[SYSTEM] Initiating Monthly Asset Review...")
    from datetime import datetime, timedelta
    thirty_days_ago = datetime.now() - timedelta(days=30)
    ts_cutoff = int(thirty_days_ago.timestamp() * 1000)

    stats = {}
    for snap in snapshots:
        uid = snap.user_id
        stats[uid] = {"hours": 0, "books": 0, "longest_session": 0}
        
        # Count recent books
        fd = getattr(snap, "finished_dates", {})
        for bid, ts in fd.items():
            if ts * 1000 > ts_cutoff:
                stats[uid]["books"] += 1

    # Process sessions for hours/longest binge
    all_users_sessions = (sessions_payload or {}).get("users") or []
    for u_sess in all_users_sessions:
        uid = str(u_sess.get("userId"))
        if uid not in stats: continue
        
        for s in u_sess.get("sessions") or []:
            start = int(s.get("startedAt", 0))
            if start > ts_cutoff:
                dur = int(s.get("timeListening", s.get("duration", 0)))
                stats[uid]["hours"] += (dur / 3600.0)
                if dur > stats[uid]["longest_session"]:
                    stats[uid]["longest_session"] = dur

    # 1. THE CHRONOS PROTOCOL (Most Hours)
    top_timer = max(stats.items(), key=lambda x: x[1]["hours"], default=(None, None))
    if top_timer[0] and top_timer[1]["hours"] > 10:
        uid = top_timer[0]
        print(f"[SYSTEM] Awarding 'The Overclocked' to {uid}")
        store.record_awards(uid, [("monthly_chronos", {
            "title": "The Overclocked", "hours": round(top_timer[1]["hours"]), "xp": 50000
        })])
        owned_ids = {i.get("item_id") for i in store.get_inventory(uid) if i.get("item_id")}
        loot_id, slot = random_item_round_robin(gear_catalog, owned_ids, preferred_rarity="Rare")
        if loot_id:
            store.add_inventory_item(uid, loot_id, f"monthly_reward:chronos:{(slot or 'unknown').lower()}")

    # 2. THE CHAIN-CRACKER (Most Books)
    top_books = max(stats.items(), key=lambda x: x[1]["books"], default=(None, None))
    if top_books[0] and top_books[1]["books"] > 2:
        uid = top_books[0]
        print(f"[SYSTEM] Awarding 'The Librarian's Bane' to {uid}")
        store.record_awards(uid, [("monthly_chaincracker", {
            "title": "The Librarian's Bane", "books": top_books[1]["books"], "xp": 50000
        })])
        owned_ids = {i.get("item_id") for i in store.get_inventory(uid) if i.get("item_id")}
        loot_id, slot = random_item_round_robin(gear_catalog, owned_ids, preferred_rarity="Rare")
        if loot_id:
            store.add_inventory_item(uid, loot_id, f"monthly_reward:chaincracker:{(slot or 'unknown').lower()}")

    # 3. THE BINGE DIRECTIVE (Longest Single Session)
    top_binge = max(stats.items(), key=lambda x: x[1]["longest_session"], default=(None, None))
    if top_binge[0] and top_binge[1]["longest_session"] > 18000: # > 5 hours
        uid = top_binge[0]
        print(f"[SYSTEM] Awarding 'The Sleepless' to {uid}")
        store.record_awards(uid, [("monthly_sleepless", {
            "title": "The Sleepless", "session_hrs": round(top_binge[1]["longest_session"]/3600), "xp": 50000
        })])
        owned_ids = {i.get("item_id") for i in store.get_inventory(uid) if i.get("item_id")}
        loot_id, slot = random_item_round_robin(gear_catalog, owned_ids, preferred_rarity="Rare")
        if loot_id:
            store.add_inventory_item(uid, loot_id, f"monthly_reward:sleepless:{(slot or 'unknown').lower()}")


@app.get("/awards/api/gear/quests")
def api_gear_quests():
    """
    Return the full quest catalog built from the live ABS library (series index).
    Produces one series quest per series and one book quest per book,
    with XP/rarity derived from the same rules used by evaluate_gear_for_user.
    """
    from .gear_engine import _book_quest_xp, _book_quest_rarity, _series_quest_xp, _series_quest_rarity

    series_index = _SERIES_INDEX_CACHE["data"] or []
    if not series_index:
        raise HTTPException(status_code=503, detail="Series index not available yet.")

    quests: list = []

    for s in series_index:
        series_name = (s.get("seriesName") or "").strip()
        if not series_name:
            continue

        books_in_series = s.get("books") or []
        book_count = len(books_in_series)

        # --- Series quest ---
        s_xp     = _series_quest_xp(book_count)
        s_rarity = _series_quest_rarity(book_count)
        s_books  = [
            {"title": b.get("title"), "cover": _sanitize_cover_filename(b.get("title", "")) + ".jpg"}
            for b in books_in_series if b.get("title")
        ]
        quests.append({
            "id":             f"quest:series:auto_{re.sub(r'[^a-z0-9]+', '_', series_name.lower()).strip('_')}",
            "quest_name":     f"{series_name} Completionist",
            "achievement":    f"{series_name} Completionist",
            "title":          series_name,
            "target_name":    series_name,
            "target_type":    "series",
            "directive_type": "World Quest (Campaign)",
            "display_xp":     s_xp,
            "rarity":         s_rarity,
            "flavorText":     f"Complete all {book_count} book{'s' if book_count != 1 else ''} in the {series_name} series.",
            "trigger":        f"Finish every book in {series_name}",
            "tags":           "series",
            "category":       "series_complete",
            "book_count":     book_count,
            "books":          s_books,
            "sort_priority":  1,
        })

        # --- Individual book quests ---
        for b in books_in_series:
            btitle = (b.get("title") or "").strip()
            bdur   = float(b.get("duration") or 0)
            bid    = b.get("libraryItemId") or ""
            if not btitle:
                continue

            b_xp     = _book_quest_xp(bdur)
            b_rarity = _book_quest_rarity(bdur)
            hours    = round(bdur / 3600.0, 1) if bdur else 0

            quests.append({
                "id":             f"quest:book:{bid}" if bid else f"quest:book:{re.sub(r'[^a-z0-9]+','_',btitle.lower())}",
                "quest_name":     btitle,
                "achievement":    btitle,
                "title":          btitle,
                "target_name":    btitle,
                "target_type":    "book",
                "directive_type": "Side Quest",
                "display_xp":     b_xp,
                "rarity":         b_rarity,
                "flavorText":     f"{series_name} · {hours}h" if hours else series_name,
                "trigger":        f"Finish listening to {btitle}",
                "tags":           "book",
                "category":       "quest",
                "books":          [{"title": btitle, "cover": _sanitize_cover_filename(btitle) + ".jpg"}],
                "sort_priority":  2,
            })

    # Sort: series quests first, then by XP descending within each group
    quests.sort(key=lambda x: (x["sort_priority"], -x["display_xp"]))
    return JSONResponse(quests)


@app.get("/awards/api/gear/catalog")
def api_gear_catalog():
    """Return the full list of gear items from loot.csv sorted alphabetically."""
    gc = _load_gear_cached()
    if not gc["gear"]:
        raise HTTPException(status_code=503, detail="Gear catalog not loaded yet.")
    
    # Convert dict to list
    catalog = list(gc["gear"].values())
    
    # Sort alphabetically by item name
    catalog.sort(key=lambda x: (x.get("item_name", "").lower()))
    
    return JSONResponse(catalog)


@app.get("/awards/api/gear/boss-stats")
def api_gear_boss_stats(user_id: str = ""):
    """
    Aggregate all users' character sheets to compute Wrapped boss stats.
    Optionally include the requesting user's sheet and inventory when user_id is given.
    ONLY uses 2026 data.
    """
    import urllib.request, json as _json

    gc = _load_gear_cached()
    if not gc["gear"]:
        raise HTTPException(status_code=503, detail="Gear catalog not loaded yet.")

    base = cfg.absstats_base_url.rstrip("/")

    def fetch(path: str, timeout: int = 30):
        req = urllib.request.Request(base + path, headers={"Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return _json.loads(r.read())

    # Fetch all completions
    try:
        comp_data = fetch(cfg.completed_endpoint)
        users_raw = comp_data.get("users") or []
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch completions: {e}")

    # Username map
    try:
        udata    = fetch("/api/usernames", timeout=10)
        user_map = udata.get("map") or {}
    except Exception:
        user_map = {}

    # Resolve username → uid (picker passes usernames like "mrlarue77", not UUIDs)
    resolved_user_id = user_id
    if user_id:
        reverse_map = {v.lower(): k for k, v in user_map.items()}
        resolved_user_id = reverse_map.get(user_id.lower(), user_id)

    # Fetch sessions for 2026 listening time calculation
    try:
        s_data = client.get_listening_sessions()
        all_sessions_map = {str(u.get("userId")): u.get("sessions") for u in s_data.get("users", [])}
    except Exception:
        all_sessions_map = {}

    # Series index
    try:
        series_data  = fetch("/api/series", timeout=30)
        series_index = series_data.get("series") or []
    except Exception:
        series_index = []

    # Load achievement definitions for XP calculation
    defs = _load_defs_cached()
    achievements_dict = defs["by_id"]

    # Fetch all awards for achievement XP integration (Filtered to 2026+)
    try:
        all_awards = store.get_all_awards()
    except Exception:
        all_awards = []

    # Build a character sheet for every user
    from .models import UserSnapshot
    all_sheets: list = []
    user_sheet = None
    user_snap_obj = None # To hold the requesting user's snap for the log

    for u in users_raw:
        uid = str(u.get("userId") or u.get("id") or "")
        if not uid:
            continue
            
        fd_raw = u.get("finishedDates") or {}
        finished_dates_raw = {k: int(v) // 1000 for k, v in fd_raw.items() if v}
        raw_sessions = all_sessions_map.get(uid) or []
        finished_dates, finished_ids, user_sessions, effective_start = _filter_progression_for_user(
            user_id=uid,
            username=str(u.get("username") or ""),
            finished_dates_raw=finished_dates_raw,
            user_sessions_all=raw_sessions,
        )

        snap = UserSnapshot(
            user_id=uid,
            username=str(u.get("username") or ""),
            finished_ids=finished_ids,
            finished_dates=finished_dates,
            finished_count=len(finished_ids),
        )

        sec = sum(int(s.get("timeListening", s.get("duration", 0))) for s in user_sessions)
        lhours = sec / 3600.0

        uname  = user_map.get(uid, snap.username or uid)
        u_awards = [a for a in all_awards if a["user_id"] == uid and a["awarded_at"] >= _resolve_user_effective_start(uid, snap.username)]

        try:
            sheet = build_character_sheet(
                user_id=uid,
                username=uname,
                snap=snap,
                series_index=series_index,
                quests_by_series=gc["quests_by_series"],
                quests_by_book=gc["quests_by_book"],
                gear_catalog=gc["gear"],
                xp_per_level=gc["xp_per_level"],
                listening_hours=lhours,
                currently_reading=None,
                store=store,
                user_sessions=user_sessions,
                user_awards=u_awards,
                achievements_def=achievements_dict,
            )
            all_sheets.append(sheet)
            if uid == resolved_user_id:
                user_sheet = sheet
                user_snap_obj = snap
        except Exception as e:
            print(f"[boss-stats] Failed sheet for {uid}: {e}")

    boss = build_boss_stats(all_sheets, boss_hp=cfg.wrapped_boss_hp)

    # Combat log for the requesting user
    combat_log: dict = {}
    if user_sheet:
        # Fetch Peak Month for retaliation calculation
        peak_month_hours = 0
        try:
            year = _resolve_wrapped_year()
            w_data = fetch(f"/api/users/{resolved_user_id}/wrapped-data?year={year}", timeout=60)
            month_hours = w_data.get("hoursByMonth") or []
            if month_hours:
                peak_month_hours = max(month_hours)
        except Exception:
            pass

        combat_log  = generate_combat_log(
            user_sheet=user_sheet,
            boss=boss,
            total_hours=user_sheet.get("listening_hours", 0),
            total_books=user_sheet.get("books_finished", 0),
            user_sessions=_filter_progression_for_user(resolved_user_id, user_map.get(resolved_user_id, ""), {}, all_sessions_map.get(resolved_user_id) or [])[2],
            finished_dates=user_snap_obj.finished_dates if user_snap_obj else {},
            peak_month_hours=peak_month_hours,
        )

    # Recent inventory for the requesting user (for gear reveal slide)
    inventory: list = []
    if user_id:
        inv_raw = store.get_inventory(resolved_user_id)
        for inv in inv_raw:
            # 2026 Filter
            if inv["acquired_at"] < _resolve_user_effective_start(resolved_user_id, user_map.get(resolved_user_id, "")):
                continue
            item = gc["gear"].get(inv["item_id"], {})
            out  = dict(item)
            out["acquired_at"] = inv["acquired_at"]
            out["source"]      = inv["source"]
            from .gear_engine import item_level
            out["item_level"]  = item_level(item) if item else 0
            inventory.append(out)
        inventory.sort(key=lambda x: x.get("item_level", 0), reverse=True)

    return JSONResponse({
        "boss":        boss,
        "user_sheet":  user_sheet,
        "inventory":   inventory,
        "combat_log":  combat_log,
    })


@app.get("/awards/api/gear/roster")
def api_gear_roster(admin: bool = False):
    """
    Build a slim roster of all users sorted by Combat Power descending.
    Returns {roster: [...], boss: {...}}.
    ONLY uses 2026 data.
    """
    import urllib.request, json as _json

    def fetch(path: str, timeout: int = 30):
        req = urllib.request.Request(base + path, headers={"Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return _json.loads(r.read())


    gc = _load_gear_cached()
    if not gc["gear"]:
        raise HTTPException(status_code=503, detail="Gear catalog not loaded yet.")

    base = cfg.absstats_base_url.rstrip("/")

    try:
        comp_data = fetch(cfg.completed_endpoint)
        users_raw = comp_data.get("users") or []
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch completions: {e}")

    try:
        udata    = fetch("/api/usernames", timeout=10)
        user_map = udata.get("map") or {}
    except Exception:
        user_map = {}

    # Fetch sessions for 2026 listening time calculation
    try:
        s_data = client.get_listening_sessions()
        all_sessions_map = {str(u.get("userId")): u.get("sessions") for u in s_data.get("users", [])}
    except Exception:
        all_sessions_map = {}

    series_index = _fetch_abs_series_index(timeout=30)

    # Load achievement definitions for XP calculation
    defs = _load_defs_cached()
    achievements_dict = defs["by_id"]

    # Fetch all awards for achievement XP integration (Filtered to 2026+)
    try:
        all_awards = store.get_all_awards()
    except Exception:
        all_awards = []

    from .models import UserSnapshot
    all_sheets: list = []

    for u in users_raw:
        uid = str(u.get("userId") or u.get("id") or "")
        if not uid:
            continue
        
        # Filter to main users only
        uname  = user_map.get(uid, str(u.get("username") or uid))
        if not _user_is_allowed(uname):
            continue

        fd_raw = u.get("finishedDates") or {}
        finished_dates_raw = {k: int(v) // 1000 for k, v in fd_raw.items() if v}
        raw_sessions = all_sessions_map.get(uid) or []
        finished_dates, finished_ids, user_sessions, effective_start = _filter_progression_for_user(
            user_id=uid,
            username=str(u.get("username") or ""),
            finished_dates_raw=finished_dates_raw,
            user_sessions_all=raw_sessions,
        )

        snap = UserSnapshot(
            user_id=uid,
            username=str(u.get("username") or ""),
            finished_ids=finished_ids,
            finished_dates=finished_dates,
            finished_count=len(finished_ids),
        )

        sec = sum(int(s.get("timeListening", s.get("duration", 0))) for s in user_sessions)
        lhours = sec / 3600.0

        uname  = user_map.get(uid, snap.username or uid)
        u_awards = [a for a in all_awards if a["user_id"] == uid and a["awarded_at"] >= _resolve_user_effective_start(uid, snap.username)]

        try:
            sheet = build_character_sheet(
                user_id=uid,
                username=uname,
                snap=snap,
                series_index=series_index,
                quests_by_series=gc["quests_by_series"],
                quests_by_book=gc["quests_by_book"],
                gear_catalog=gc["gear"],
                xp_per_level=gc["xp_per_level"],
                listening_hours=lhours,
                currently_reading=None,
                store=store,
                user_sessions=user_sessions,
                user_awards=u_awards,
                achievements_def=achievements_dict,
            )
            all_sheets.append(sheet)
        except Exception as e:
            print(f"[roster] Failed sheet for {uid}: {e}")

    all_sheets.sort(key=lambda s: s.get("combat_power", 0), reverse=True)

    # LIMBO CHECK
    is_limbo = (time.time() < LAUNCH_TIMESTAMP) and not admin 
    roster = []
    for rank, sheet in enumerate(all_sheets, 1):
        equipped = sheet.get("equipped") or {}
        top_item = None
        if equipped.get("Weapon"):
            top_item = equipped["Weapon"]
        else:
            best_ilvl = -1
            for slot_item in equipped.values():
                if slot_item and slot_item.get("item_level", 0) > best_ilvl:
                    best_ilvl = slot_item["item_level"]
                    top_item = slot_item
        
        # Build Entry
        entry = {
            "rank":            rank,
            "user_id":         sheet["user_id"],
            "username":        sheet["username"],
            "level":           sheet.get("level", 0) if not is_limbo else 1, # MASKED
            "combat_power":    sheet.get("combat_power", 0) if not is_limbo else 0, # MASKED
            "total_stats":     sheet.get("total_stats", {}) if not is_limbo else sheet.get("base_stats", {}), # SHOW BASE ONLY
            "inventory_count": sheet.get("inventory_count", 0),
            "top_item":        top_item if not is_limbo else None, # HIDDEN
        }

        roster.append(entry)

    boss = build_boss_stats(all_sheets, boss_hp=cfg.wrapped_boss_hp)
    return JSONResponse({"roster": roster, "boss": boss, "is_limbo": is_limbo})


@app.get("/awards/api/usernames")
def awards_proxy_usernames():
    import urllib.request, json as _json
    url = cfg.absstats_base_url.rstrip("/") + "/api/usernames"
    try:
        with urllib.request.urlopen(urllib.request.Request(url), timeout=10) as r:
            body = r.read()
        data = _json.loads(body)
        # Apply achievement-engine ALLOWED_USERS filter on top of abs-stats ALLOWED_USERNAMES
        if _ALLOWED_USERS:
            if "users" in data:
                data["users"] = [u for u in data["users"] if _user_is_allowed(u.get("username", ""))]
            if "map" in data:
                data["map"] = {k: v for k, v in data["map"].items() if _user_is_allowed(v)}
        return JSONResponse(data)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@app.get("/awards/api/wrapped")
def api_wrapped(year: int = None, user_id: str = ""):
    if not _wrapped_is_enabled():
        raise HTTPException(status_code=404, detail="Wrapped is disabled")
    import urllib.request, json as _json
    year = _resolve_wrapped_year(year)
    if not user_id:
        raise HTTPException(status_code=400, detail="user_id is required")

    base = cfg.absstats_base_url.rstrip("/")

    def fetch(path, timeout=120):
        req = urllib.request.Request(base + path, headers={"Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return _json.loads(r.read())

    # Resolve username → UUID before calling abs-stats (picker passes usernames, not UUIDs)
    abs_user_id = user_id
    user_map    = {}
    try:
        udata    = fetch("/api/usernames", timeout=10)
        user_map = udata.get("map", {})           # UUID → username
        reverse  = {v.lower(): k for k, v in user_map.items()}
        abs_user_id = reverse.get(user_id.lower(), user_id)
    except Exception:
        pass

    # --- Pull raw data from abs-stats ---
    try:
        raw = fetch(f"/api/users/{abs_user_id}/wrapped-data?year={year}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch wrapped data: {e}")

    books            = raw.get("books", [])
    all_finished_ids = set(raw.get("allFinishedIds", []))

    # Align Wrapped book counts with progression scope so "mark complete" outside the
    # allowed window does not count on Wrapped slides.
    try:
        comp_data = fetch(cfg.completed_endpoint, timeout=60)
        comp_users = comp_data.get("users") or []
        comp_user = next(
            (
                u for u in comp_users
                if str(u.get("userId") or u.get("id") or "") == str(abs_user_id)
            ),
            None,
        )
        if comp_user:
            fd_raw = comp_user.get("finishedDates") or {}
            finished_dates_raw = {str(k): int(v) // 1000 for k, v in fd_raw.items() if v}
            sessions_payload = client.get_listening_sessions() or {}
            sessions_map = {
                str(u.get("userId")): (u.get("sessions") or [])
                for u in (sessions_payload.get("users") or [])
            }
            username_for_scope = str(user_map.get(str(abs_user_id), user_id) or "")
            _, scoped_finished_ids, _, _ = _filter_progression_for_user(
                user_id=str(abs_user_id),
                username=username_for_scope,
                finished_dates_raw=finished_dates_raw,
                user_sessions_all=sessions_map.get(str(abs_user_id), []),
            )
            scoped_set = set(scoped_finished_ids)
            books = [
                b for b in books
                if str(b.get("libraryItemId") or "") in scoped_set
            ]
            all_finished_ids = scoped_set
    except Exception as e:
        print(f"[wrapped] progression scope fallback for {abs_user_id}: {e}")

    # Split books into legacy (finished before Feb 27 2026 23:59:59 UTC) and new.
    # Computed here in Python so it works regardless of abs-stats version.
    # finishedAt is in milliseconds (epochMs in server.js returns ABS ms timestamps as-is).
    LEGACY_CUTOFF_MS = 1772236799999  # Feb 27, 2026 23:59:59.999 UTC
    year_book_ids    = {str(b.get("libraryItemId")) for b in books if b.get("libraryItemId")}
    pre_year_count   = len(all_finished_ids - year_book_ids)   # all prior-year books are legacy
    this_year_legacy = sum(1 for b in books if (b.get("finishedAt") or 0) <= LEGACY_CUTOFF_MS)
    this_year_new    = sum(1 for b in books if (b.get("finishedAt") or 0) >  LEGACY_CUTOFF_MS)
    legacy_book_count = pre_year_count + this_year_legacy
    new_book_count    = this_year_new
    hours_by_month    = raw.get("hoursByMonth", [0] * 12)
    hours_by_dow      = raw.get("hoursByDayOfWeek", [0] * 7)
    hours_by_hod      = raw.get("hoursByHourOfDay", [0] * 24)
    session_count     = raw.get("sessionCount", 0)
    binge_count       = raw.get("bingeSessionCount", 0)

    # Username — use the already-fetched user_map; fall back to user_id itself
    username = user_map.get(str(abs_user_id)) or str(user_id)

    # Longest streak (must use resolved ABS UUID, not username)
    try:
        streak_data    = fetch(f"/api/users/{abs_user_id}/streaks", timeout=15)
        longest_streak = int(streak_data.get("longestStreakDays", 0))
    except Exception:
        longest_streak = 0

    # Series completed (all books in series in all-time finished + at least one this year)
    year_book_ids = {str(b.get("libraryItemId")) for b in books if b.get("libraryItemId")}
    series_completed = []
    try:
        series_data = fetch("/api/series", timeout=30)
        for s in series_data.get("series", []):
            s_books = s.get("books", [])
            if len(s_books) < 2:
                continue
            s_ids = {str(b.get("libraryItemId")) for b in s_books if b.get("libraryItemId")}
            if s_ids.issubset(all_finished_ids) and s_ids & year_book_ids:
                series_completed.append({
                    "seriesName": s["seriesName"],
                    "bookCount": len(s_books),
                })
    except Exception:
        pass

    # --- Derived stats ---
    total_books  = len(books)
    total_hours  = round(sum(hours_by_month), 1)
    total_days   = round(total_hours / 24, 1)

    # Top author by hours
    author_hours = {}
    author_books = {}
    for b in books:
        for a in (b.get("authors") or []):
            author_hours[a] = author_hours.get(a, 0) + b.get("durationHours", 0)
            author_books[a] = author_books.get(a, 0) + 1
    top_author = None
    if author_hours:
        top_name = max(author_hours, key=lambda k: author_hours[k])
        top_author = {
            "name":      top_name,
            "hours":     round(author_hours[top_name], 1),
            "bookCount": author_books[top_name],
        }

    # Top narrator by hours
    narrator_hours = {}
    narrator_books = {}
    for b in books:
        for n in (b.get("narrators") or []):
            narrator_hours[n] = narrator_hours.get(n, 0) + b.get("durationHours", 0)
            narrator_books[n] = narrator_books.get(n, 0) + 1
    top_narrator = None
    if narrator_hours:
        top_nname = max(narrator_hours, key=lambda k: narrator_hours[k])
        top_narrator = {
            "name":      top_nname,
            "hours":     round(narrator_hours[top_nname], 1),
            "bookCount": narrator_books[top_nname],
        }

    # Longest / shortest
    books_with_dur = [b for b in books if b.get("durationHours", 0) > 0]
    longest_book  = max(books_with_dur, key=lambda b: b["durationHours"]) if books_with_dur else None
    shortest_book = min(books_with_dur, key=lambda b: b["durationHours"]) if books_with_dur else None

    most_active_month  = hours_by_month.index(max(hours_by_month)) if any(hours_by_month) else 0
    distinct_authors   = len(set(a for b in books for a in (b.get("authors") or [])))

    # Personality archetype
    total_hod   = sum(hours_by_hod) or 1
    night_frac  = sum(hours_by_hod[h] for h in [22, 23, 0, 1, 2]) / total_hod
    early_frac  = sum(hours_by_hod[h] for h in [5, 6, 7, 8])      / total_hod

    if len(series_completed) >= 3:
        personality = {"name": "The Completionist", "icon": "🏆",
                       "desc": f"You don't start what you can't finish. {len(series_completed)} complete series this year alone."}
    elif total_books >= 50:
        personality = {"name": "The Voracious", "icon": "📚",
                       "desc": f"{total_books} books. Most people don't read that in five years. You did it in one."}
    elif top_author and top_author["bookCount"] >= 8:
        personality = {"name": "The Loyalist", "icon": "⚔️",
                       "desc": f"When you find an author you love, you commit. {top_author['bookCount']} books by {top_author['name']} this year."}
    elif night_frac > 0.28:
        personality = {"name": "The Night Owl", "icon": "🦉",
                       "desc": "When the world goes quiet, you press play. Most of your listening happens after dark."}
    elif early_frac > 0.25:
        personality = {"name": "The Early Bird", "icon": "🌅",
                       "desc": "You greet every day with a story already in your ears. Dawn is your listening hour."}
    elif longest_streak >= 14:
        personality = {"name": "The Sprint Reader", "icon": "🔥",
                       "desc": f"A {longest_streak}-day streak. You don't just listen — you show up every single day."}
    elif binge_count >= 5:
        personality = {"name": "The Binge Reader", "icon": "🎧",
                       "desc": f"{binge_count} sessions over two hours this year. Once you start, you're in for the long haul."}
    elif distinct_authors >= 20:
        personality = {"name": "The Explorer", "icon": "🗺️",
                       "desc": f"{distinct_authors} different authors this year. You never stop looking for the next great voice."}
    else:
        personality = {"name": "The Devoted Listener", "icon": "📖",
                       "desc": f"You showed up for audio again and again. {total_books} books speak for themselves."}

    # --- Quests completed this year (achievements earned in `year`) ---
    quests_completed = 0
    quest_avg_dmg    = 50  # fallback
    try:
        award_ids = store.get_user_award_ids_in_year(abs_user_id, year)
        if award_ids and os.path.exists(ACHIEVEMENTS_JSON_PATH):
            with open(ACHIEVEMENTS_JSON_PATH, "r", encoding="utf-8") as _f:
                _ach_list = _json.load(_f)
            points_map = {a["id"]: a.get("points", 0) for a in _ach_list if isinstance(a, dict)}
            earned_points = [points_map[aid] for aid in award_ids if aid in points_map]
            quests_completed = len(award_ids)
            if earned_points:
                quest_avg_dmg = max(1, round(sum(earned_points) / len(earned_points)))
    except Exception as _e:
        print(f"[wrapped] quest stats error: {_e}")

    return JSONResponse({
        "year":     year,
        "userId":   str(abs_user_id),
        "username": username,
        "stats": {
            "totalBooks":        total_books,
            "totalHours":        total_hours,
            "totalDays":         total_days,
            "distinctAuthors":   distinct_authors,
            "topAuthor":         top_author,
            "topNarrator":       top_narrator,
            "longestBook":       longest_book,
            "shortestBook":      shortest_book,
            "seriesCompleted":   series_completed,
            "mostActiveMonth":   most_active_month,
            "longestStreak":     longest_streak,
            "sessionCount":      session_count,
            "bingeSessionCount": binge_count,
            "hoursByMonth":      hours_by_month,
            "hoursByDayOfWeek":  hours_by_dow,
            "hoursByHourOfDay":  hours_by_hod,
            "personality":       personality,
            "books":             books,
            "legacyBooks":       legacy_book_count,
            "newBooks":          new_book_count,
            "questsCompleted":   quests_completed,
            "questAvgDmg":       quest_avg_dmg,
        },
    })


@app.get("/awards/api/users")
def awards_proxy_users():
    import urllib.request
    import json
    url = cfg.absstats_base_url.rstrip("/") + "/api/users"
    try:
        with urllib.request.urlopen(urllib.request.Request(url), timeout=60) as r:
            body = r.read()

        # Filter the users list when ALLOWED_USERS is configured
        data = json.loads(body)
        if "users" in data and _ALLOWED_USERS:
            data["users"] = [u for u in data["users"] if _user_is_allowed(u.get("username"))]
            body = json.dumps(data).encode('utf-8')

        return Response(content=body, media_type="application/json")
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@app.get("/awards/api/playlists")
def awards_proxy_playlists():
    import urllib.request
    url = cfg.absstats_base_url.rstrip("/") + "/api/playlists"
    try:
        with urllib.request.urlopen(urllib.request.Request(url), timeout=10) as r:
            body = r.read()
            ct = r.headers.get("Content-Type", "application/json")
        return Response(content=body, media_type=ct)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@app.get("/awards/api/cover/{item_id}")
def awards_proxy_cover(item_id: str):
    import urllib.request
    url = cfg.absstats_base_url.rstrip("/") + f"/api/cover/{item_id}"
    try:
        with urllib.request.urlopen(urllib.request.Request(url), timeout=10) as r:
            body = r.read()
            ct = r.headers.get("Content-Type", "image/jpeg")
        return Response(content=body, media_type=ct)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@app.get("/awards/api/avatar/{uid}")
def awards_proxy_avatar(uid: str):
    import urllib.request
    url = cfg.absstats_base_url.rstrip("/") + f"/api/avatar/{uid}"
    try:
        with urllib.request.urlopen(urllib.request.Request(url), timeout=3) as r:
            body = r.read()
            ct = r.headers.get("Content-Type", "image/jpeg")
        return Response(content=body, media_type=ct)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@app.get("/awards/covers/")
def awards_covers_list():
    """Return a JSON listing of cover image files for the tier list page."""
    if not os.path.isdir(COVERS_DIR):
        return JSONResponse([])
    files = [
        {"name": f}
        for f in sorted(os.listdir(COVERS_DIR))
        if f.lower().endswith((".webp", ".png", ".jpg", ".jpeg"))
    ]
    return JSONResponse(files)

@app.get("/awards/covers/{cover_path:path}")
def awards_covers(cover_path: str):
    safe = cover_path.replace("\\", "/").lstrip("/")
    full_path = os.path.join(COVERS_DIR, safe)
    norm_covers = os.path.abspath(COVERS_DIR)
    norm_full = os.path.abspath(full_path)
    if not norm_full.startswith(norm_covers + os.sep) and norm_full != norm_covers:
        raise HTTPException(status_code=400, detail="Invalid cover path")
    if not os.path.exists(norm_full):
        raise HTTPException(status_code=404, detail=f"Cover not found: {safe}")
    return FileResponse(norm_full)

@app.get("/awards/api/portraits/{filename}")
def awards_portraits(filename: str):
    safe = os.path.basename(filename)
    
    # Priority 1: User-mapped /data/avatars volume (Unraid)
    # Most likely location for your portraits folder
    avatar_dirs = ["/data/avatars", "/avatars", "/data/static", "/data/static/avatars"]
    for adir in avatar_dirs:
        if os.path.isdir(adir):
            try:
                files = os.listdir(adir)
                for f in files:
                    if f.lower() == safe.lower():
                        return FileResponse(os.path.join(adir, f))
            except:
                pass

    # Priority 2: Built-in Static directory
    full_path = os.path.join("/app/static", safe)
    if os.path.exists(full_path):
        return FileResponse(full_path)
    
    raise HTTPException(status_code=404, detail=f"Portrait not found: {safe}")

@app.get("/achievements.points.json")
def achievements_points_json():
    if not os.path.exists(ACHIEVEMENTS_JSON_PATH):
        raise HTTPException(status_code=404, detail=f"Missing {ACHIEVEMENTS_JSON_PATH}")
    return FileResponse(ACHIEVEMENTS_JSON_PATH, media_type="application/json")


@app.get("/awards/api/achievements")
def api_achievements():
    # legacy endpoint for older dashboard versions
    defs = _load_defs_cached()
    return JSONResponse(defs["items"])


@app.get("/awards/api/definitions")
def api_definitions():
    # stable, explicit shape for the Awards Center
    defs = _load_defs_cached()
    return JSONResponse({
        "generated_at": int(time.time()),
        "total_definitions": len(defs["items"]),
        "achievements": defs["items"],
    })


@app.post("/awards/api/achievements/add")
async def api_achievements_add(request: Request):
    achievement = await request.json()

    if not os.path.exists(ACHIEVEMENTS_JSON_PATH):
        raise HTTPException(status_code=404, detail="achievements.points.json not found")

    with open(ACHIEVEMENTS_JSON_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)

    items = data["achievements"] if isinstance(data, dict) and "achievements" in data else data

    ach_id = achievement.get("id")
    if ach_id:
        for item in items:
            if item.get("id") == ach_id:
                raise HTTPException(status_code=409, detail=f"Achievement id '{ach_id}' already exists")

    items.append(achievement)

    if isinstance(data, dict) and "achievements" in data:
        data["achievements"] = items
    else:
        data = items

    with open(ACHIEVEMENTS_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    # Bust the definition cache so the engine picks it up immediately
    _DEFS_CACHE["mtime"] = 0

    return JSONResponse({"ok": True, "id": ach_id, "total": len(items)})



@app.get("/awards/api/icons")
@app.get("/api/icons")
def api_icons_list():
    """Return available icon file paths from ICONS_DIR for admin pickers."""
    exts = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"}
    icons = []

    if os.path.isdir(ICONS_DIR):
        for root, _dirs, files in os.walk(ICONS_DIR):
            for name in files:
                ext = os.path.splitext(name)[1].lower()
                if ext not in exts:
                    continue
                full = os.path.join(root, name)
                rel = os.path.relpath(full, ICONS_DIR).replace("\\", "/")
                icons.append(f"/icons/{rel}")

    icons.sort(key=lambda s: s.lower())
    return JSONResponse({"icons": icons, "total": len(icons)})
@app.get("/icons/{icon_path:path}")
def get_icon(icon_path: str):
    safe = icon_path.replace("\\", "/").lstrip("/")
    # Check if the path includes /icons/ prefix from the CSV and strip it for local lookup
    if safe.startswith("icons/"):
        safe = safe[6:]
        
    full_path = os.path.join(ICONS_DIR, safe)

    # prevent path traversal
    norm_icons = os.path.abspath(ICONS_DIR)
    norm_full = os.path.abspath(full_path)
    if not norm_full.startswith(norm_icons + os.sep) and norm_full != norm_icons:
        raise HTTPException(status_code=400, detail="Invalid icon path")

    if not os.path.exists(norm_full):
        raise HTTPException(status_code=404, detail=f"Icon not found: {safe}")

    return FileResponse(norm_full)


@app.get("/awards/api/awards")
def api_awards_all_users():
    """
    ALL USERS. Filtered to 2026+.
    Returns:
      - per-user awards (earned achievements AND gear acquisitions)
      - per-user point totals
      - leaderboard (sorted)
      - awards merged with definitions (title/icon/points/category/etc.)
      - user_map (uuid -> username) from ABSStats
    """
    # 1. Load Achievement Definitions
    defs = _load_defs_cached()
    by_id = defs["by_id"]

    # 2. Load Gear Definitions (Loot)
    gc = _load_gear_cached()
    gear_catalog = gc["gear"]

    user_map = _get_user_map_best_effort()

    def _coerce_event_ts(raw_value, fallback_ts: int) -> int:
        if raw_value is None:
            return int(fallback_ts or 0)
        try:
            if isinstance(raw_value, (int, float)):
                n = int(raw_value)
            else:
                s = str(raw_value).strip()
                if not s:
                    return int(fallback_ts or 0)
                if s.isdigit():
                    n = int(s)
                else:
                    # ISO-like timestamps
                    try:
                        iso = s.replace("Z", "+00:00")
                        n = int(datetime.datetime.fromisoformat(iso).timestamp())
                    except Exception:
                        return int(fallback_ts or 0)
            if n >= 10_000_000_000:
                n = int(n / 1000)
            return n if n > 0 else int(fallback_ts or 0)
        except Exception:
            return int(fallback_ts or 0)

    # 3. Process Achievements (Awards Table)
    awards = store.get_all_awards()
    users_map = {}

    for a in awards:
        user_id = a.get("user_id")
        # System awards aren't displayed on the user leaderboard
        if user_id == "SYSTEM":
            continue

        username = user_map.get(str(user_id), "")
        if not _user_is_allowed(username):
            continue

        payload = a.get("payload") or {}
        awarded_at = int(a.get("awarded_at") or 0)
        earned_at = _coerce_event_ts(
            payload.get("_timestamp")
            or payload.get("earned_at")
            or payload.get("finished_at")
            or payload.get("finishedAt")
            or payload.get("completed_at")
            or payload.get("completedAt"),
            awarded_at,
        )

        # Achievement scope filter (use earned timestamp)
        if cfg.achievements_scope != "all_time" and earned_at < _resolve_user_effective_start(str(user_id), username):
            continue

        achievement_id = str(a.get("achievement_id"))

        # HIDE DUPLICATES: If this is a raw gear/quest id or a direct loot id in awards,
        # skip it. We already pull the pretty version from the inventory table.
        if achievement_id.startswith("gear:") or achievement_id.startswith("quest:") or achievement_id in gear_catalog:
            continue

        d = by_id.get(achievement_id, {}) or {}

        pts = d.get("points", d.get("point", payload.get("points", 0)))
        try:
            pts = int(pts)
        except Exception:
            pts = 0

        merged = {
            "type": "achievement",
            "achievement_id": achievement_id,
            "awarded_at": awarded_at,
            "earned_at": earned_at,
            "points": pts,
            "category": d.get("category") or payload.get("category"),
            "achievement": d.get("achievement") or payload.get("achievement") or payload.get("title") or d.get("title") or achievement_id,
            "title": d.get("title") or payload.get("title") or d.get("achievement") or payload.get("achievement") or achievement_id,
            "flavorText": d.get("flavorText") or payload.get("flavorText") or "",
            "iconPath": d.get("iconPath") or d.get("icon") or payload.get("iconPath") or payload.get("icon") or "",
            "rarity": d.get("rarity") or payload.get("rarity") or "Common",
            "payload": payload,
        }

        if user_id not in users_map:
            users_map[user_id] = {
                "user_id": user_id,
                "username": username,
                "points": 0,
                "earned_count": 0,
                "awards": []
            }

        users_map[user_id]["awards"].append(merged)
        users_map[user_id]["points"] += pts
        users_map[user_id]["earned_count"] += 1

    # 4. Process Gear Acquisitions (Inventory Table)
    with store._conn() as c:
        c.row_factory = sqlite3.Row
        inv_rows = c.execute("SELECT user_id, item_id, acquired_at, source FROM user_inventory ORDER BY acquired_at DESC").fetchall()

    for inv in inv_rows:
        uid = inv["user_id"]
        uname = user_map.get(str(uid), "")
        if not _user_is_allowed(uname):
            continue

        effective_start = _resolve_user_effective_start(str(uid), uname)

        # Progression scope filter
        if cfg.progression_scope != "all_time" and inv["acquired_at"] < effective_start:
            continue

        if uid not in users_map:
            users_map[uid] = {
                "user_id": uid,
                "username": uname,
                "points": 0,
                "earned_count": 0,
                "awards": []
            }

        item = gear_catalog.get(inv["item_id"])
        if not item:
            continue

        gear_event = {
            "type": "gear",
            "achievement_id": inv["item_id"],
            "awarded_at": int(inv["acquired_at"]),
            "earned_at": int(inv["acquired_at"]),
            "points": 0,
            "category": "gear",
            "achievement": item.get("item_name"),
            "title": item.get("item_name"),
            "flavorText": item.get("flavor_text"),
            "iconPath": item.get("icon"),
            "rarity": item.get("rarity", "Common"),
            "source": inv["source"],
            "slot": item.get("slot"),
            "str": int(item.get("str", 0) or 0),
            "mag": int(item.get("mag", 0) or 0),
            "def": int(item.get("def", 0) or 0),
            "hp": int(item.get("hp", 0) or 0),
            "special_ability": item.get("special_ability") or "",
        }
        users_map[uid]["awards"].append(gear_event)

    # 5. Process Quest Completions (Awards Table — quest: prefix)
    quests_by_id = gc.get("quests_by_id") or {}
    for a in awards:
        user_id = a.get("user_id")
        if user_id == "SYSTEM":
            continue
        achievement_id = str(a.get("achievement_id") or "")
        if not achievement_id.startswith("quest:"):
            continue

        uname = user_map.get(str(user_id), "")
        if not _user_is_allowed(uname):
            continue

        payload = a.get("payload") or {}
        awarded_at = int(a.get("awarded_at") or 0)
        earned_at = _coerce_event_ts(payload.get("_timestamp"), awarded_at)

        effective_start = _resolve_user_effective_start(str(user_id), uname)
        # For quests, use awarded_at (when recorded) not earned_at (series completion date)
        # This prevents filtering when series was completed before user's effective_start
        if cfg.progression_scope != "all_time" and awarded_at < effective_start:
            continue

        if user_id not in users_map:
            users_map[user_id] = {
                "user_id": user_id,
                "username": uname,
                "points": 0,
                "earned_count": 0,
                "awards": []
            }

        quest_event = {
            "type": "quest",
            "achievement_id": achievement_id,
            "awarded_at": awarded_at,
            "earned_at": earned_at,
            "points": int(payload.get("xp_reward") or 0),
            "category": "quest",
            "achievement": payload.get("quest_name") or achievement_id,
            "title": payload.get("quest_name") or achievement_id,
            "flavorText": payload.get("target_name") or "",
            "iconPath": "",
            "rarity": str(payload.get("rarity") or "Common").lower(),
            "payload": payload,
        }
        users_map[user_id]["awards"].append(quest_event)

    # 6. Final Sort & Formatting
    for u in users_map.values():
        u["awards"].sort(key=lambda x: int(x.get("earned_at") or x.get("awarded_at") or 0), reverse=True)

    users_list = list(users_map.values())
    users_list.sort(key=lambda x: (x["points"], x["earned_count"]), reverse=True)

    leaderboard = [
        {
            "user_id": u["user_id"],
            "username": u.get("username") or user_map.get(str(u["user_id"]), ""),
            "points": u["points"],
            "earned_count": u["earned_count"]
        }
        for u in users_list
    ]

    return JSONResponse({
        "generated_at": int(time.time()),
        "total_users": len(users_list),
        "total_definitions": len(defs["items"]),
        "user_map": user_map,
        "leaderboard": leaderboard,
        "users": users_list,
    })


@app.get("/api/progress")
def api_progress_root():
    return api_progress()

@app.get("/api/awards")
def api_awards_root():
    return api_awards_all_users()

@app.get("/api/definitions")
def api_definitions_root():
    return api_definitions()

@app.get("/api/ui-config")
def api_ui_config_root():
    return api_ui_config()

@app.get("/api/users")
def api_users_root():
    return awards_proxy_users()

@app.get("/api/usernames")
def api_usernames_root():
    return awards_proxy_usernames()


@app.get("/awards/api/reading-history")
@app.get("/api/reading-history")
def api_reading_history():
    """
    Per-user book/series completion history, enriched with series membership,
    duration, rarity tier, and series-completion markers.
    Respects ALLOWED_USERS and progression scope filters.
    """
    import urllib.request as _req, json as _json

    base = cfg.absstats_base_url.rstrip("/")

    # client.get_completed() returns List[UserSnapshot] — iterate directly
    try:
        snapshots = client.get_completed(cfg.completed_endpoint)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Completions unavailable: {e}")

    # User map (uuid -> username)
    try:
        user_map = _json.loads(
            _req.urlopen(_req.Request(base + "/api/usernames"), timeout=10).read()
        ).get("map") or {}
    except Exception:
        user_map = {}

    # Sessions (for 95% threshold via _filter_progression_for_user)
    try:
        s_data = client.get_listening_sessions()
        all_sessions_map = {str(u.get("userId")): u.get("sessions") for u in s_data.get("users", [])}
    except Exception:
        all_sessions_map = {}

    # Series index — use cache, fall back to fresh fetch
    series_index = _SERIES_INDEX_CACHE["data"] or _fetch_abs_series_index()

    # Book metadata lookup: libraryItemId -> {duration, title}
    # Duration = actual book length from ABS, not listening time
    book_metadata: Dict[str, dict] = {}  # {libraryItemId: {duration: float(seconds), title: str}}

    # Fetch from all-items for accurate book duration and titles
    try:
        with _req.urlopen(_req.Request(base + "/api/all-items"), timeout=15) as _r:
            _items_data = _json.loads(_r.read())
        for _item in (_items_data.get("items") or []):
            _iid = _item.get("libraryItemId") or ""
            if _iid:
                # Try multiple possible duration field names (duration, durationMs, durationHours)
                _dur = _item.get("duration") or _item.get("durationMs") or 0
                _dur_sec = float(_dur) / 1000.0 if isinstance(_dur, (int, float)) else 0.0
                book_metadata[_iid] = {
                    "duration": _dur_sec,  # convert to seconds
                    "title": (_item.get("title") or "").strip(),
                }
    except Exception as e:
        print(f"[reading-history] all-items fetch failed: {e}")
        pass  # will fall back to series index data

    # Build book lookup: libraryItemId -> metadata
    book_lookup: Dict[str, dict] = {}
    series_book_sets: Dict[str, set] = {}  # series_name -> all libraryItemIds in series

    for s in series_index:
        sname = (s.get("seriesName") or "").strip()
        books = s.get("books") or []
        if not sname:
            continue
        bids: set = set()
        for b in books:
            bid = b.get("libraryItemId")
            if not bid:
                continue
            bids.add(bid)
            try:
                seq_f = float(b.get("seriesSequence") or 0)
            except Exception:
                seq_f = 0.0
            seq_str = (str(int(seq_f)) if seq_f > 0 and seq_f == int(seq_f) else str(seq_f)) if seq_f > 0 else ""
            # Use book_metadata for accurate duration; fall back to series index
            # Try multiple duration field names (duration, durationMs, durationHours)
            _dur_fallback = float(b.get("duration") or b.get("durationMs") or 0)
            if b.get("durationHours"):
                _dur_fallback = float(b.get("durationHours")) * 3600.0  # convert hours to seconds
            book_dur = book_metadata.get(bid, {}).get("duration", _dur_fallback)
            book_title = book_metadata.get(bid, {}).get("title") or (b.get("title") or "").strip()

            book_lookup[bid] = {
                "title":        book_title,
                "series_name":  sname,
                "sequence":     seq_f,
                "sequence_str": seq_str,
                "duration":     book_dur,
                "series_total": len(books),
                "cover":        _sanitize_cover_filename(sname) + ".jpg",
            }
        series_book_sets[sname] = bids

    result_users = []

    # Iterate over UserSnapshot objects returned by client.get_completed()
    for snap in snapshots:
        uid   = str(snap.user_id or "")
        uname = str(snap.username or user_map.get(uid, uid))
        if not uid or not _user_is_allowed(uname):
            continue

        # snap.finished_dates is already in seconds (client converts ms → s)
        # Chronicle shows ALL-TIME reading history, not filtered by XP scope
        finished_dates = {str(bid): int(ts) for bid, ts in (snap.finished_dates or {}).items()}
        finished_ids = set(finished_dates.keys())

        # Calculate total listening hours from user's sessions (all-time)
        # This matches the stats page calculation
        user_sessions = all_sessions_map.get(uid) or []
        user_listening_seconds = sum(int(s.get("timeListening", s.get("duration", 0))) for s in user_sessions)
        user_listening_hours = user_listening_seconds / 3600.0

        # Build per-book entries
        books_out = []
        for bid, ts in finished_dates.items():
            info  = book_lookup.get(bid, {})
            title = info.get("title") or book_metadata.get(bid, {}).get("title") or bid
            sname = info.get("series_name") or ""
            dur   = info.get("duration") or book_metadata.get(bid, {}).get("duration", 0.0)
            books_out.append({
                "book_id":          bid,
                "title":            title,
                "series_name":      sname,
                "sequence":         info.get("sequence") or 0,
                "sequence_str":     info.get("sequence_str") or "",
                "duration_seconds": dur,
                "duration_hours":   round(dur / 3600, 1),
                "series_total":     info.get("series_total") or 0,
                "finished_at":      ts,
                "cover":            info.get("cover") or (_sanitize_cover_filename(sname or title) + ".jpg"),
            })

        books_out.sort(key=lambda x: x["finished_at"], reverse=True)

        # Determine completed series + their completion timestamp/metadata
        completed_series = []
        for sname, bids in series_book_sets.items():
            if not bids or not bids.issubset(finished_ids):
                continue
            # Completion timestamp = when the LAST book in the series was finished
            completed_ts = max((finished_dates.get(bid, 0) for bid in bids), default=0)
            # Sum actual book durations (not listening time) for series total
            total_dur = sum(book_lookup.get(bid, {}).get("duration") or book_metadata.get(bid, {}).get("duration", 0.0) for bid in bids)
            # Books sorted by sequence for display
            s_books = sorted(
                [book_lookup[bid] for bid in bids if bid in book_lookup],
                key=lambda b: float(b.get("sequence") or 9999),
            )
            completed_series.append({
                "series_name":  sname,
                "completed_at": completed_ts,
                "book_count":   len(bids),
                "total_hours":  round(total_dur / 3600, 1),
                "cover":        _sanitize_cover_filename(sname) + ".jpg",
                "books":        [b.get("title") for b in s_books],
            })

        completed_series.sort(key=lambda s: s["completed_at"], reverse=True)

        result_users.append({
            "user_id":         uid,
            "username":        uname,
            "books":           books_out,
            "completed_series": completed_series,
            "stats": {
                "total_books":      len(books_out),
                "total_hours":      round(user_listening_hours, 1),
                "series_completed": len(completed_series),
            },
        })

    return JSONResponse({"users": result_users, "user_map": user_map})


@app.get("/awards/api/progress")
def api_progress():
    """
    Progress data for the Awards Center (for "Next Up" + progress bars).
    Filtered to 2026+.

    Returns per-user:
      - metrics: finished_count, completed_series_count, listening_seconds, listening_hours
      - next_up: simple milestone progress objects (starter set)
      - user_map: uuid -> username
    """
    user_map = _get_user_map_best_effort()

    # Pull current stats (best-effort, don't crash the UI)
    try:
        snapshots = client.get_completed(cfg.completed_endpoint)
    except Exception as e:
        print(f"[api] /api/progress failed to fetch completions: {e}")
        snapshots = []

    # Fetch sessions for 2026 listening time calculation
    try:
        s_data = client.get_listening_sessions()
        all_sessions_map = {str(u.get("userId")): u.get("sessions") for u in s_data.get("users", [])}
    except Exception as e:
        print(f"[api] /api/progress failed to fetch listening sessions: {e}")
        all_sessions_map = {}

    # Fetch series data for progress tracking
    try:
        import urllib.request, json as _json
        _sreq = urllib.request.Request(f"{cfg.absstats_base_url}/api/series")
        _sresp = urllib.request.urlopen(_sreq, timeout=10)
        all_series = _json.loads(_sresp.read()).get("series", [])
    except Exception as e:
        print(f"[api] /api/progress failed to fetch series: {e}")
        all_series = []

    # Starter milestone sets (we can swap these to match your evaluator IDs later)
    BOOK_MILESTONES = [5, 10, 20, 25, 50, 100]
    TIME_HOUR_MILESTONES = [1, 10, 50, 100, 500, 1000]

    users_out = []

    for snap in snapshots or []:
        raw_uid = getattr(snap, "user_id", None) or getattr(snap, "id", None) or getattr(snap, "userId", None)
        if not raw_uid:
            continue
        user_id = str(raw_uid)
        
        username = user_map.get(str(user_id), "")
        if not _user_is_allowed(username):
            continue

        effective_start = _resolve_user_effective_start(user_id, username)
        # Progression-scope filter for books
        fd_raw = getattr(snap, "finished_dates", {})
        finished_ids_2026 = [bid for bid, ts in fd_raw.items() if ts >= effective_start]
        finished_count = len(finished_ids_2026)

        # Count completed series by checking finished_ids_2026 against all_series
        completed_series_count = 0
        for sr in all_series:
            sr_books = sr.get("books", [])
            if len(sr_books) < 2:
                continue
            sr_book_ids = {b["libraryItemId"] for b in sr_books}
            if sr_book_ids.issubset(set(finished_ids_2026)):
                completed_series_count += 1

        # Progression-scope filter for listening time
        user_sessions = all_sessions_map.get(user_id, [])
        sec = sum(int(s.get("timeListening", s.get("duration", 0))) for s in user_sessions if _session_started_at_seconds(s) >= LAUNCH_TIMESTAMP)
        hours = sec / 3600.0

        # Series progress: find series >50% finished but not 100% (2026 only)
        series_progress = []
        for sr in all_series:
            sr_books = sr.get("books", [])
            if len(sr_books) < 2:
                continue
            sr_book_ids = {b["libraryItemId"] for b in sr_books}
            done = len(sr_book_ids & set(finished_ids_2026))
            total = len(sr_books)
            if done > 0 and done < total:
                series_progress.append({
                    "seriesName": sr.get("seriesName", ""),
                    "done": done,
                    "total": total,
                    "percent": round(done / total, 3),
                })
        series_progress.sort(key=lambda x: x["percent"], reverse=True)

        users_out.append({
            "user_id": user_id,
            "username": user_map.get(str(user_id), ""),
                        "metrics": {
                "finished_count": finished_count,
                "completed_series_count": completed_series_count,
                "listening_seconds": sec,
                "listening_hours": hours,
                "books_by_year": _count_books_by_year(snap),
            },
            "next_up": {
                "books_total": _next_milestone(finished_count, BOOK_MILESTONES),
                "listening_hours": _next_milestone(int(hours), TIME_HOUR_MILESTONES),
            },
            "series_progress": series_progress,
        })

    # Sort by listening hours then finished count (just so it's stable)
    users_out.sort(
        key=lambda u: (u["metrics"].get("listening_hours", 0), u["metrics"].get("finished_count", 0)),
        reverse=True
    )

    return JSONResponse({
        "generated_at": int(time.time()),
        "total_users": len(users_out),
        "user_map": user_map,
        "users": users_out,
    })


@app.get("/health")
def health():
    return JSONResponse({
        "status": "ok",
        "state_db_path": cfg.state_db_path,
        "achievements_path": cfg.achievements_path,
    })


@app.get("/awards/api/routes")
def list_routes():
    out = []
    for r in app.routes:
        methods = getattr(r, "methods", None)
        out.append({
            "path": getattr(r, "path", ""),
            "methods": sorted(list(methods)) if methods else [],
            "name": getattr(r, "name", ""),
        })
    return JSONResponse(out)


@app.get("/awards/api/ui-config")
def api_ui_config():
    """Serve user aliases and icon mappings for the frontend dashboards."""
    aliases = {}
    for pair in (os.getenv("USER_ALIASES", "") or "").split(","):
        pair = pair.strip()
        if ":" in pair:
            key, val = pair.split(":", 1)
            aliases[key.strip()] = val.strip()

    icons = {}
    for pair in (os.getenv("USER_ICONS", "") or "").split(","):
        pair = pair.strip()
        if ":" in pair:
            key, val = pair.split(":", 1)
            icons[key.strip()] = val.strip()

    return JSONResponse({"aliases": aliases, "icons": icons, "wrapped_enabled": _wrapped_is_enabled()})


# -----------------------------------------
# Section 5b: Release Radar Routes
# -----------------------------------------

@app.get("/radar")
def read_radar():
    return FileResponse(RADAR_PATH)


@app.get("/radar/api/series")
def radar_get_series():
    """Return all tracked series."""
    return JSONResponse({"series": store.get_tracked_series()})


@app.post("/radar/api/series")
async def radar_add_series(request: Request):
    """
    Add a series to track.
    Body: { series_asin, series_name, author, cover_url }
    """
    body = await request.json()
    series_asin = (body.get("series_asin") or "").strip()
    series_name = (body.get("series_name") or "").strip()
    author      = (body.get("author") or "").strip()
    cover_url   = (body.get("cover_url") or "").strip()

    if not series_asin or not series_name:
        raise HTTPException(status_code=400, detail="series_asin and series_name are required")

    row_id = store.add_tracked_series(series_name, series_asin, author, cover_url)
    return JSONResponse({"ok": True, "id": row_id})


@app.delete("/radar/api/series/{series_id}")
def radar_delete_series(series_id: int):
    # Look up the ASIN before deleting so we can ignore it
    series = store.get_tracked_series_by_id(series_id)
    if series:
        store.ignore_series(series["series_asin"])
    store.delete_tracked_series(series_id)
    return JSONResponse({"ok": True})


@app.get("/radar/api/releases")
def radar_get_releases(days_back: int = 90):
    """Return upcoming + recent releases."""
    releases = store.get_releases(days_back=days_back)
    return JSONResponse({"releases": releases})


@app.get("/radar/releases.ics")
def radar_ics():
    """Downloadable/subscribable ICS calendar feed."""
    releases = store.get_releases(days_back=30)
    ics_content = generate_ics(releases)
    return Response(
        content=ics_content,
        media_type="text/calendar; charset=utf-8",
        headers={"Content-Disposition": "inline; filename=audiobook-releases.ics"},
    )


@app.get("/radar/api/search")
def radar_search(q: str = ""):
    """Search Audible for series candidates to add."""
    if not q.strip():
        raise HTTPException(status_code=400, detail="q parameter required")
    candidates = search_series_candidates(q.strip())
    return JSONResponse({"candidates": candidates})


@app.post("/radar/api/check")
def radar_manual_check():
    """Manually trigger a full series poll (runs synchronously, may be slow)."""
    found = radar_check_all(store, cfg.discord_proxy_url)
    return JSONResponse({"ok": True, "new_releases": found})


@app.post("/radar/api/seed-from-abs")
def radar_seed_from_abs():
    """Pull all series from ABS and auto-add any not already tracked."""
    added, unmatched = seed_from_abs(store, cfg.absstats_base_url)
    return JSONResponse({"ok": True, "added": added, "unmatched": unmatched})


@app.get("/request")
def read_request():
    return FileResponse(REQUEST_PATH)


@app.get("/api/request-config")
def api_request_config():
    return JSONResponse({
        "admin_email": cfg.admin_email,
        "smtp_enabled": notifier.enabled() and bool(cfg.admin_email),
    })


@app.post("/request/submit")
async def request_submit(request: Request):
    body = await request.json()
    series_name = (body.get("series_name") or "").strip()
    series_asin = (body.get("series_asin") or "").strip()
    author      = (body.get("author") or "").strip()
    cover_url   = (body.get("cover_url") or "").strip()
    note        = (body.get("note") or "").strip()

    if not series_name:
        return JSONResponse({"ok": False, "error": "Series name is required."}, status_code=400)
    if not cfg.admin_email:
        return JSONResponse({"ok": False, "error": "Requests are not configured on this server."}, status_code=503)
    if not notifier.enabled():
        return JSONResponse({"ok": False, "error": "Email is not configured on this server."}, status_code=503)

    subject = f"Series Request: {series_name}"
    lines = ["A user has requested the following series be added to Release Radar:", ""]
    lines.append(f"Series: {series_name}")
    if author:      lines.append(f"Author: {author}")
    if series_asin: lines.append(f"Audible ASIN: {series_asin}")
    if series_asin: lines.append(f"Link: https://www.audible.com/series/{series_asin}")
    if note:        lines += ["", f"Note: {note}"]

    try:
        notifier.send_simple(cfg.admin_email, subject, "\n".join(lines), cover_url=cover_url)
        return JSONResponse({"ok": True})
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


@app.get("/radar/api/library-check")
def radar_library_check():
    """
    Cross-check released books against the ABS library.
    Returns {asin: bool|null} — true=in library, false=missing, null=unknown.
    """
    releases = store.get_releases(days_back=365)
    status = check_library_status(releases, cfg.absstats_base_url)
    return JSONResponse({"status": status})


# -----------------------------------------
# Section 6: Core Engine Logic (run_once)
# -----------------------------------------

def _build_progression_snapshots(snapshots_raw, sessions_payload):
    """Build progression snapshots scoped to each user effective start date."""
    from .models import UserSnapshot

    sessions_map: Dict[str, list] = {}
    if sessions_payload:
        for u in (sessions_payload.get("users") or []):
            uid = str(u.get("userId") or "")
            if uid:
                sessions_map[uid] = u.get("sessions") or []

    snapshots = []
    for s_raw in snapshots_raw:
        user_sessions_all = sessions_map.get(str(s_raw.user_id)) or []
        fd_filtered, ids_filtered, _scoped_sessions, _effective_start = _filter_progression_for_user(
            user_id=str(s_raw.user_id),
            username=str(getattr(s_raw, "username", "") or ""),
            finished_dates_raw=s_raw.finished_dates,
            user_sessions_all=user_sessions_all,
        )

        snapshots.append(UserSnapshot(
            user_id=s_raw.user_id,
            username=s_raw.username,
            finished_ids=ids_filtered,
            finished_dates=fd_filtered,
            finished_count=len(ids_filtered),
            email=s_raw.email,
        ))
    return snapshots

def _save_system_report(filename: str, data: any):
    """Saves any system data to the /data/json/ folder for admin review."""
    path = os.path.join("/data/json", filename)
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            if isinstance(data, str):
                f.write(data)
            else:
                json.dump(data, f, indent=2)
    except Exception as e:
        print(f"[report] Failed to save {filename}: {e}")


def _estimate_ai_xp_from_awards(user_awards: List[Dict]) -> int:
    """
    Shadow-only estimate of explicit AI/manual XP grants from award payloads.
    This is logged for audit visibility but not applied to progression calculations.
    """
    total = 0
    keys = ("xp", "xp_reward", "ai_xp", "bonus_xp", "extra_xp")
    for a in (user_awards or []):
        ach_id = str(a.get("achievement_id") or "").lower()
        payload = a.get("payload") if isinstance(a.get("payload"), dict) else {}
        if not payload:
            continue
        marker = str(payload.get("source", "")).lower()
        is_ai = ach_id.startswith("ai:") or payload.get("ai_generated") is True or "ai" in marker
        if not is_ai:
            continue
        for k in keys:
            try:
                total += int(payload.get(k) or 0)
            except Exception:
                continue
    return int(total)


def run_once(
    client,
    store,
    notifier,
    achievements_filtered,
    series_index,
    completed_endpoint,
    allow_playlist_fallback,
    achievements_scope: str = None,
    process_progression: bool = True,
    send_notifications: bool = True,
    run_monthly_review: bool = True,
):
    snapshots_raw = []
    sessions_payload = None
    listening_time_payload = None
    run_started = int(time.time())

    achievements_scope = (achievements_scope or cfg.achievements_scope or "all_time").strip().lower()

    # quick lookup so we can convert ids -> Achievement objects for email
    achievements_by_id = {str(a.id): a for a in achievements_filtered if getattr(a, "id", None) is not None}

    try:
        snapshots_raw = client.get_completed(completed_endpoint)
    except Exception as e:
        print(f"Failed to fetch completions from ABSStats: {e}")
        return

    if not snapshots_raw:
        return

    try:
        sessions_payload = client.get_listening_sessions()
    except Exception as e:
        print(f"Failed to fetch listening sessions (duration/behavior awards may be skipped): {e}")
        sessions_payload = None

    try:
        listening_time_payload = client.get_listening_time()
    except Exception as e:
        print(f"Failed to fetch listening time (milestone_time awards may be skipped): {e}")
        listening_time_payload = None

    progression_snapshots = _build_progression_snapshots(snapshots_raw, sessions_payload)
    progression_by_user = {str(s.user_id): s for s in progression_snapshots}

    sessions_by_user: Dict[str, list] = {}
    if sessions_payload:
        for u in (sessions_payload.get("users") or []):
            uid = str(u.get("userId") or "")
            if uid:
                sessions_by_user[uid] = u.get("sessions") or []

    all_awards = store.get_all_awards() if process_progression else []
    awards_by_user: Dict[str, list] = {}
    for a in all_awards:
        awards_by_user.setdefault(str(a.get("user_id") or ""), []).append(a)

    defs_cache = _load_defs_cached() if process_progression else {"by_id": {}}
    achievements_def_by_id = defs_cache.get("by_id") or {}
    gc_cached = _load_gear_cached() if process_progression else {
        "gear": {},
        "quests_by_series": {},
        "quests_by_book": {},
        "xp_per_level": [],
    }

    # Achievements may be all-time, while progression stays 2026-scoped.
    if achievements_scope == "all_time":
        achievement_snaps = snapshots_raw
    else:
        achievement_snaps = progression_snapshots

    all_users = achievement_snaps

    # --- MONTHLY SYSTEM REVIEW (Phase 4) ---
    if run_monthly_review and process_progression:
        try:
            from datetime import datetime
            now_dt = datetime.now()
            if now_dt.day == 1:  # On the first of every month
                month_key = f"monthly_review_{now_dt.year}_{now_dt.month}"
                if not store.is_awarded("SYSTEM", month_key):
                    gc = _load_gear_cached()
                    _run_monthly_review(progression_snapshots, sessions_payload, store, gc["gear"])
                    store.record_awards("SYSTEM", [(month_key, {"executed_at": int(time.time())})])
        except Exception as e:
            print(f"[monthly-review] Critical Error: {e}")

    def _award_in_scope(a, scope_start: int):
        ts = int(a.get("awarded_at") or 0)
        if achievements_scope == "all_time":
            return True
        return ts >= scope_start

    for snap in achievement_snaps:
        user_id = snap.user_id
        username = (getattr(snap, "username", "") or str(user_id)).strip()
        user_new_awards = []

        user_new_awards.extend(evaluate_phase1(snap, achievements_filtered, series_index))
        user_new_awards.extend(evaluate_social_overlap(snap, achievements_filtered, all_users, absstats_base_url=cfg.absstats_base_url))
        user_new_awards.extend(evaluate_duration(snap, achievements_filtered, sessions_payload))
        user_new_awards.extend(evaluate_milestone_time(snap, achievements_filtered, sessions_payload))

        user_new_awards.extend(
            evaluate_title_keyword(
                user=snap,
                achievements=achievements_filtered,
                finished_ids=snap.finished_ids,
                client=client,
            )
        )

        user_new_awards.extend(
            evaluate_author(
                user=snap,
                achievements=achievements_filtered,
                finished_ids=snap.finished_ids,
                client=client,
                series_index=series_index,
            )
        )

        user_new_awards.extend(
            evaluate_narrator(
                user=snap,
                achievements=achievements_filtered,
                finished_ids=snap.finished_ids,
                client=client,
            )
        )

        user_new_awards.extend(evaluate_behavior_time(snap, achievements_filtered, sessions_payload))

        user_new_awards.extend(
            evaluate_behavior_session(
                user=snap,
                achievements=achievements_filtered,
                sessions_payload=sessions_payload,
            )
        )

        user_new_awards.extend(
            evaluate_behavior_streak(
                user=snap,
                achievements=achievements_filtered,
                sessions_payload=sessions_payload,
            )
        )
        user_new_awards.extend(
            evaluate_series_shape(
                user=snap,
                achievements=achievements_filtered,
                series_index=series_index,
                finished_ids=snap.finished_ids,
                client=client,
            )
        )

        # --- Yearly milestone: Century Club (100 books in a calendar year) ---
        yearly_achs = [a for a in achievements_filtered if a.category == "milestone_yearly"]
        for ya in yearly_achs:
            trig = (ya.trigger or "").lower()
            if "books" in trig and "year" in trig:
                import re
                from datetime import datetime
                target = int(re.search(r"(\d+)", trig).group(1)) if re.search(r"(\d+)", trig) else 0
                if target > 0 and hasattr(snap, "finished_dates") and snap.finished_dates:
                    year_counts = {}
                    year_last_ts = {}
                    for book_id, ts in snap.finished_dates.items():
                        y = datetime.fromtimestamp(ts).year
                        year_counts[y] = year_counts.get(y, 0) + 1
                        if ts > year_last_ts.get(y, 0):
                            year_last_ts[y] = ts
                    for y, count in year_counts.items():
                        if count >= target:
                            user_new_awards.append((ya, {
                                "books": count,
                                "target": target,
                                "year": y,
                                "_timestamp": year_last_ts[y]
                            }))
                            break

        # --- Meta: The Completionist (earn N achievements) ---
        meta_achs = [a for a in achievements_filtered if a.category == "meta"]
        for ma in meta_achs:
            if store.is_awarded(user_id, ma.id):
                continue
            trig = (ma.trigger or "").lower()
            if "earn" in trig and "achievement" in trig:
                import re
                target = int(re.search(r"(\d+)", trig).group(1)) if re.search(r"(\d+)", trig) else 0
                if target > 0:
                    existing_count = len([
                        a for a in store.get_all_awards()
                        if a["user_id"] == user_id
                        and _award_in_scope(a, _resolve_user_effective_start(str(user_id), getattr(snap, "username", "")))
                        and not str(a.get("achievement_id", "")).startswith("gear:")
                        and not str(a.get("achievement_id", "")).startswith("quest:")
                    ])
                    if existing_count >= target:
                        user_new_awards.append((ma, {
                            "total_achievements": existing_count,
                            "target": target,
                            "_timestamp": int(__import__("time").time())
                        }))

        # --- Gear System (progression-only snapshot) ---
        if process_progression:
            try:
                snap_prog = progression_by_user.get(str(user_id))
                gc = gc_cached
                if snap_prog and gc["gear"] and gc["quests_by_series"] and gc["xp_per_level"]:
                    effective_start = _resolve_user_effective_start(str(user_id), getattr(snap_prog, "username", "") or "")
                    raw_sessions = sessions_by_user.get(str(user_id), [])
                    scoped_sessions = [
                        s for s in raw_sessions
                        if _session_started_at_seconds(s) >= LAUNCH_TIMESTAMP
                    ]
                    listening_hours = sum(int(s.get("timeListening", s.get("duration", 0))) for s in scoped_sessions) / 3600.0
                    user_awards = [
                        a for a in awards_by_user.get(str(user_id), [])
                        if int(a.get("awarded_at") or 0) >= effective_start
                    ]
                    xp_time = int(xp_from_hours(listening_hours, scoped_sessions))
                    xp_books = int(xp_from_quests(snap_prog.finished_ids, snap_prog.finished_dates, series_index, gc["quests_by_series"]))
                    xp_achievements = int(xp_from_achievements(user_awards, achievements_def_by_id))
                    xp_ai = int(_estimate_ai_xp_from_awards(user_awards))
                    total_xp = xp_time + xp_books + xp_achievements
                    shadow_total_with_ai = total_xp + xp_ai
                    current_level = level_from_xp(total_xp, gc["xp_per_level"])[0]
                    shadow_level_with_ai = level_from_xp(shadow_total_with_ai, gc["xp_per_level"])[0]
                     
                    new_items = evaluate_gear_for_user(
                        snap_prog, series_index, gc["quests_by_series"], gc["gear"], store,
                        current_level=current_level,
                    )
                    if new_items:
                        print(f"[gear] {user_id} received {len(new_items)} new item(s): {new_items}")
            except Exception as e:
                print(f"[gear] Gear evaluation failed for {user_id}: {e}")

        if not user_new_awards:
            continue

        # --- Normalize: SQLite needs string achievement IDs (not Achievement objects) ---
        normalized_awards = []
        for ach, p_dict in user_new_awards:
            if hasattr(ach, "id"):
                ach_id = getattr(ach, "id")
            elif hasattr(ach, "key"):
                ach_id = getattr(ach, "key")
            elif hasattr(ach, "achievement_id"):
                ach_id = getattr(ach, "achievement_id")
            else:
                ach_id = ach  # assume already a string

            ach_id = str(ach_id)
            normalized_awards.append((ach_id, p_dict))

        # --- Filter out already-awarded achievements ---
        final_to_award = []
        for ach_id, p_dict in normalized_awards:
            already = store.is_awarded(user_id, ach_id)
            if not already:
                final_to_award.append((ach_id, p_dict))

        if not final_to_award:
            continue

        inserted_ids = store.record_awards(user_id, final_to_award)
        if not inserted_ids:
            continue

        print(f"Awarded {len(inserted_ids)} new achievements to {user_id}")

        # --- Build award objects for notifications ---
        awards_for_notify = []
        for ach_id, _payload in final_to_award:
            a = achievements_by_id.get(str(ach_id))
            if a is not None:
                awards_for_notify.append(a)

        if not send_notifications:
            continue

        # --- Discord notification ---
        if awards_for_notify:
            try:
                discord_payloads = [p for _, p in final_to_award]
                discord_notifier.send_awards(username=username, awards=awards_for_notify, payloads=discord_payloads)
            except Exception as e:
                print(f"Discord failed: {e}")

        # --- Email notification ---
        _user_email_map = {}
        for pair in (os.getenv("USER_EMAILS", "") or "").split(","):
            pair = pair.strip()
            if ":" in pair:
                uname, uemail = pair.split(":", 1)
                _user_email_map[uname.strip()] = uemail.strip()
        to_addr = _user_email_map.get(username, "") or cfg.smtp_to_override or getattr(snap, "email", "") or ""
        to_addr = to_addr.strip()
        if not to_addr:
            print(f"Email skipped: no email for user {username} ({user_id})")
            continue
        if not awards_for_notify:
            print(f"Email skipped: could not map awarded ids for user {username}")
            continue
        try:
            notifier.send_awards(to_addr=to_addr, username=username, awards=awards_for_notify)
        except Exception as e:
            print(f"Email failed: {e}")


def run_achievement_backfill_once():
    """One-time admin action: backfill all-time achievements without progression or notifications."""
    key = (cfg.backfill_once_key or "ach_backfill_v1").strip()
    if store.is_awarded("SYSTEM", key):
        print(f"[backfill] skipped: marker '{key}' already present")
        return

    print("[backfill] starting all-time achievement backfill...")
    achievements = load_achievements(cfg.achievements_path)
    achievements_filtered = filter_phase1(achievements)

    series_index = _SERIES_INDEX_CACHE.get("data") or []
    if not series_index:
        series_index = client.get_series_index()
        _SERIES_INDEX_CACHE["data"] = series_index
        _SERIES_INDEX_CACHE["updated_at"] = int(time.time())

    run_once(
        client=client,
        store=store,
        notifier=notifier,
        achievements_filtered=achievements_filtered,
        series_index=series_index,
        completed_endpoint=cfg.completed_endpoint,
        allow_playlist_fallback=cfg.allow_playlist_fallback,
        achievements_scope="all_time",
        process_progression=False,
        send_notifications=False,
        run_monthly_review=False,
    )

    store.record_awards("SYSTEM", [(key, {"executed_at": int(time.time())})])
    print("[backfill] complete")


def trigger_manual_poll():
    """Logic to run the engine exactly once."""
    print("[manual-poll] Starting manual sync pass...")
    try:
        achievements = load_achievements(cfg.achievements_path)
        achievements_filtered = filter_phase1(achievements)
        
        # Get series index (use cache or fetch)
        series_index = _SERIES_INDEX_CACHE["data"]
        if not series_index:
            series_index = client.get_series_index()
            _SERIES_INDEX_CACHE["data"] = series_index
            _SERIES_INDEX_CACHE["updated_at"] = int(time.time())

        ledger = run_once(
            client=client,
            store=store,
            notifier=notifier,
            achievements_filtered=achievements_filtered,
            series_index=series_index,
            completed_endpoint=cfg.completed_endpoint,
            allow_playlist_fallback=cfg.allow_playlist_fallback,
        )
        print("[manual-poll] Manual sync pass complete.")
    except Exception as e:
        print(f"[manual-poll] Error during manual sync: {e}")

@app.get('/system/poll')
def manual_poll():
    thread = threading.Thread(target=trigger_manual_poll, daemon=True)
    thread.start()
    return PlainTextResponse('Manual poll initiated. The System is now recalculating your inventory. Please wait 10 seconds and refresh your character sheet.')







































