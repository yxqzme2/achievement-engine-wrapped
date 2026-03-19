import sqlite3
import json
import time
import datetime
from typing import Dict, List, Tuple, Optional

SCHEMA = """
CREATE TABLE IF NOT EXISTS awards (
  user_id TEXT NOT NULL,
  achievement_id TEXT NOT NULL,
  awarded_at INTEGER NOT NULL,
  payload_json TEXT,
  PRIMARY KEY (user_id, achievement_id)
);

CREATE TABLE IF NOT EXISTS user_inventory (
  user_id    TEXT    NOT NULL,
  item_id    TEXT    NOT NULL,
  acquired_at INTEGER NOT NULL,
  source     TEXT,
  PRIMARY KEY (user_id, item_id)
);

CREATE TABLE IF NOT EXISTS user_base_stats (
  user_id  TEXT    NOT NULL PRIMARY KEY,
  base_str INTEGER NOT NULL,
  base_mag INTEGER NOT NULL,
  base_def INTEGER NOT NULL,
  base_hp  INTEGER NOT NULL,
  unspent_points INTEGER DEFAULT 0,
  spent_str INTEGER DEFAULT 0,
  spent_mag INTEGER DEFAULT 0,
  spent_def INTEGER DEFAULT 0,
  spent_hp  INTEGER DEFAULT 0,
  rolled_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS grandfather_done (
  user_id TEXT NOT NULL PRIMARY KEY,
  done_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS user_equipment (
  user_id TEXT NOT NULL,
  slot    TEXT NOT NULL,
  item_id TEXT NOT NULL,
  PRIMARY KEY (user_id, slot)
);

CREATE TABLE IF NOT EXISTS user_pins (
  user_id TEXT NOT NULL PRIMARY KEY,
  pin     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tier_lists (
  user_id    TEXT NOT NULL PRIMARY KEY,
  username   TEXT NOT NULL,
  list_name  TEXT NOT NULL,
  query      TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tracked_series (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  series_name  TEXT NOT NULL,
  series_asin  TEXT NOT NULL UNIQUE,
  author       TEXT,
  last_asin    TEXT,
  last_title   TEXT,
  last_sequence TEXT,
  last_release_date TEXT,
  last_checked INTEGER,
  cover_url    TEXT,
  added_at     INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS radar_releases (
  asin         TEXT PRIMARY KEY,
  series_asin  TEXT NOT NULL,
  series_name  TEXT NOT NULL,
  title        TEXT NOT NULL,
  sequence     TEXT,
  author       TEXT,
  narrator     TEXT,
  release_date TEXT NOT NULL,
  cover_url    TEXT,
  is_preorder  INTEGER DEFAULT 0,
  discovered_at INTEGER NOT NULL,
  notified     INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS radar_ignored_series (
  series_asin TEXT PRIMARY KEY,
  ignored_at  INTEGER NOT NULL
);

"""

class StateStore:
    def __init__(self, db_path: str):
        self.db_path = db_path
        self._init_db()

    def _conn(self):
        return sqlite3.connect(self.db_path)

    def _init_db(self):
        with self._conn() as c:
            c.executescript(SCHEMA)

    # -----------------------------------------
    # Achievements / Awards
    # -----------------------------------------

    def is_awarded(self, user_id: str, achievement_id: str) -> bool:
        with self._conn() as c:
            row = c.execute(
                "SELECT 1 FROM awards WHERE user_id=? AND achievement_id=?",
                (user_id, achievement_id),
            ).fetchone()
            return row is not None

    def record_awards(self, user_id: str, awards: List[Tuple[str, dict]]) -> List[str]:
        inserted = []
        with self._conn() as c:
            for ach_id, payload in awards:
                try:
                    c.execute(
                        "INSERT INTO awards (user_id, achievement_id, awarded_at, payload_json) VALUES (?, ?, ?, ?)",
                        (user_id, ach_id, int(time.time()), json.dumps(payload)),
                    )
                    inserted.append(ach_id)
                except sqlite3.IntegrityError:
                    pass
        return inserted

    def get_user_awards_count(self, user_id: str) -> int:
        """Return the total number of achievements earned by a specific user."""
        with self._conn() as c:
            row = c.execute("SELECT COUNT(*) FROM awards WHERE user_id=?", (user_id,)).fetchone()
            return row[0] if row else 0

    def get_user_award_ids_in_year(self, user_id: str, year: int) -> List[str]:
        """Return achievement IDs earned by a user in a given year, excluding gear: prefixed entries."""
        import calendar
        start_ts = int(time.mktime(time.strptime(f"{year}-01-01", "%Y-%m-%d")))
        end_ts   = int(time.mktime(time.strptime(f"{year + 1}-01-01", "%Y-%m-%d")))
        with self._conn() as c:
            rows = c.execute(
                "SELECT achievement_id FROM awards WHERE user_id=? AND awarded_at>=? AND awarded_at<? AND achievement_id NOT LIKE 'gear:%'",
                (user_id, start_ts, end_ts),
            ).fetchall()
            return [r[0] for r in rows]

    def get_all_awards(self) -> List[Dict]:
        with self._conn() as c:
            c.row_factory = sqlite3.Row
            rows = c.execute("SELECT * FROM awards ORDER BY awarded_at DESC").fetchall()
            awards = []
            for r in rows:
                d = dict(r)
                if d["payload_json"]:
                    try:
                        d["payload"] = json.loads(d["payload_json"])
                    except json.JSONDecodeError:
                        d["payload"] = {}
                awards.append(d)
            return awards

    # -----------------------------------------
    # Gear: Inventory
    # -----------------------------------------

    def add_inventory_item(self, user_id: str, item_id: str, source: str = "", acquired_at: int = None):
        if acquired_at is None:
            acquired_at = int(time.time())
        with self._conn() as c:
            try:
                c.execute(
                    "INSERT INTO user_inventory (user_id, item_id, acquired_at, source) VALUES (?, ?, ?, ?)",
                    (user_id, item_id, acquired_at, source),
                )
            except sqlite3.IntegrityError:
                pass

    def get_inventory(self, user_id: str) -> List[Dict]:
        with self._conn() as c:
            c.row_factory = sqlite3.Row
            rows = c.execute(
                "SELECT item_id, acquired_at, source FROM user_inventory WHERE user_id=? ORDER BY acquired_at DESC",
                (user_id,),
            ).fetchall()
            return [dict(r) for r in rows]

    def get_manual_equipment(self, user_id: str) -> Dict[str, str]:
        """Return {slot: item_id} map of manually equipped items."""
        with self._conn() as c:
            rows = c.execute(
                "SELECT slot, item_id FROM user_equipment WHERE user_id=?",
                (user_id,),
            ).fetchall()
            return {r[0]: r[1] for r in rows}

    def has_item(self, user_id: str, item_id: str) -> bool:
        with self._conn() as c:
            row = c.execute(
                "SELECT 1 FROM user_inventory WHERE user_id=? AND item_id=?",
                (user_id, item_id),
            ).fetchone()
            return row is not None

    def set_manual_equipment(self, user_id: str, slot: str, item_id: str):
        with self._conn() as c:
            c.execute(
                "INSERT INTO user_equipment (user_id, slot, item_id) VALUES (?, ?, ?) "
                "ON CONFLICT(user_id, slot) DO UPDATE SET item_id=excluded.item_id",
                (user_id, slot, item_id),
            )

    # -----------------------------------------
    # Gear: PINs
    # -----------------------------------------

    def get_pin(self, user_id: str) -> Optional[str]:
        with self._conn() as c:
            row = c.execute("SELECT pin FROM user_pins WHERE user_id=?", (user_id,)).fetchone()
            return row[0] if row else None

    def set_pin(self, user_id: str, pin: str) -> None:
        with self._conn() as c:
            c.execute(
                "INSERT INTO user_pins(user_id, pin) VALUES(?,?) "
                "ON CONFLICT(user_id) DO UPDATE SET pin=excluded.pin",
                (user_id, pin),
            )

    # -----------------------------------------
    # Gear: Base Stats
    # -----------------------------------------

    def get_base_stats(self, user_id: str) -> Optional[Dict]:
        """Return base stats dict or None if not yet set."""
        with self._conn() as c:
            c.row_factory = sqlite3.Row
            row = c.execute("SELECT * FROM user_base_stats WHERE user_id=?", (user_id,)).fetchone()
            return dict(row) if row else None

    def set_base_stats(self, user_id: str, s: int, m: int, d: int, hp: int, unspent: int = 0):
        with self._conn() as c:
            c.execute("""
                INSERT OR REPLACE INTO user_base_stats 
                (user_id, base_str, base_mag, base_def, base_hp, unspent_points, rolled_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (user_id, s, m, d, hp, unspent, int(time.time())))

    def spend_stat_points(self, user_id: str, stats: Dict[str, int]) -> bool:
        """
        Spend unspent_points on specific stats.
        stats: {'spent_str': 2, 'spent_hp': 1}
        Returns True if successful.
        """
        total_to_spend = sum(stats.values())
        if total_to_spend <= 0: return False

        with self._conn() as c:
            row = c.execute("SELECT unspent_points FROM user_base_stats WHERE user_id=?", (user_id,)).fetchone()
            if not row or row[0] < total_to_spend:
                return False
            
            # Update unspent and the individual spent columns
            updates = []
            params = []
            for stat, val in stats.items():
                if stat in ('spent_str', 'spent_mag', 'spent_def', 'spent_hp'):
                    updates.append(f"{stat} = {stat} + ?")
                    params.append(val)
            
            if not updates: return False
            
            params.append(total_to_spend)
            params.append(user_id)
            
            c.execute(f"UPDATE user_base_stats SET {', '.join(updates)}, unspent_points = unspent_points - ? WHERE user_id = ?", params)
            return True

    def set_stat_allocation(self, user_id: str, spent_str: int, spent_mag: int, spent_def: int, spent_hp: int) -> bool:
        """
        Set absolute spent stat-point allocation (supports respec up/down).
        Keeps unspent_points balanced using the delta from current allocation.
        """
        values = [spent_str, spent_mag, spent_def, spent_hp]
        if any((not isinstance(v, int)) or v < 0 for v in values):
            return False

        with self._conn() as c:
            c.row_factory = sqlite3.Row
            row = c.execute(
                "SELECT unspent_points, spent_str, spent_mag, spent_def, spent_hp FROM user_base_stats WHERE user_id=?",
                (user_id,)
            ).fetchone()
            if not row:
                return False

            current_total = int(row["spent_str"] or 0) + int(row["spent_mag"] or 0) + int(row["spent_def"] or 0) + int(row["spent_hp"] or 0)
            new_total = spent_str + spent_mag + spent_def + spent_hp
            delta = new_total - current_total
            unspent_now = int(row["unspent_points"] or 0)

            if delta > unspent_now:
                return False

            c.execute(
                """
                UPDATE user_base_stats
                SET spent_str=?, spent_mag=?, spent_def=?, spent_hp=?,
                    unspent_points = unspent_points - ?
                WHERE user_id=?
                """,
                (spent_str, spent_mag, spent_def, spent_hp, delta, user_id)
            )
            return True
    def update_unspent_points(self, user_id: str, new_total_calculated: int):
        """Set the total pool of unspent points (calculated based on level)."""
        with self._conn() as c:
            c.execute("UPDATE user_base_stats SET unspent_points = ? WHERE user_id = ?", (new_total_calculated, user_id))

    # -----------------------------------------
    # Gear: Grandfathering
    # -----------------------------------------

    def is_grandfather_done(self, user_id: str) -> bool:
        with self._conn() as c:
            row = c.execute("SELECT 1 FROM grandfather_done WHERE user_id=?", (user_id,)).fetchone()
            return row is not None

    def set_grandfather_done(self, user_id: str):
        with self._conn() as c:
            c.execute("INSERT OR IGNORE INTO grandfather_done (user_id, done_at) VALUES (?, ?)", (user_id, int(time.time())))

    def mark_grandfather_done(self, user_id: str):
        """Alias for set_grandfather_done to match gear_engine calls."""
        self.set_grandfather_done(user_id)

    # -----------------------------------------
    # Tier Lists
    # -----------------------------------------

    def upsert_tier_list(self, user_id: str, username: str, list_name: str, query: str, updated_at: int = None):
        if updated_at is None:
            updated_at = int(time.time())
        with self._conn() as c:
            c.execute(
                "INSERT INTO tier_lists (user_id, username, list_name, query, updated_at) VALUES (?, ?, ?, ?, ?) "
                "ON CONFLICT(user_id) DO UPDATE SET username=excluded.username, list_name=excluded.list_name, query=excluded.query, updated_at=excluded.updated_at",
                (user_id, username, list_name, query, int(updated_at)),
            )

    def get_tier_lists(self) -> List[Dict]:
        with self._conn() as c:
            c.row_factory = sqlite3.Row
            rows = c.execute(
                "SELECT user_id, username, list_name, query, updated_at FROM tier_lists ORDER BY updated_at DESC"
            ).fetchall()
            return [dict(r) for r in rows]

    def delete_tier_list(self, user_id: str):
        with self._conn() as c:
            c.execute("DELETE FROM tier_lists WHERE user_id=?", (user_id,))

    # -----------------------------------------
    # Release Radar: Tracked Series
    # -----------------------------------------

    def add_tracked_series(self, series_name: str, series_asin: str, author: str = "",
                           cover_url: str = "") -> int:
        with self._conn() as c:
            cur = c.execute(
                "INSERT INTO tracked_series (series_name, series_asin, author, cover_url, added_at) "
                "VALUES (?, ?, ?, ?, ?) ON CONFLICT(series_asin) DO NOTHING",
                (series_name, series_asin, author, cover_url, int(time.time())),
            )
            return cur.lastrowid or 0

    def get_tracked_series(self) -> List[Dict]:
        with self._conn() as c:
            c.row_factory = sqlite3.Row
            rows = c.execute(
                "SELECT * FROM tracked_series ORDER BY series_name COLLATE NOCASE"
            ).fetchall()
            return [dict(r) for r in rows]

    def update_series_last_seen(self, series_asin: str, asin: str, title: str,
                                sequence: str, release_date: str) -> None:
        with self._conn() as c:
            c.execute(
                "UPDATE tracked_series SET last_asin=?, last_title=?, last_sequence=?, "
                "last_release_date=?, last_checked=? WHERE series_asin=?",
                (asin, title, sequence, release_date, int(time.time()), series_asin),
            )

    def touch_series_checked(self, series_asin: str) -> None:
        with self._conn() as c:
            c.execute(
                "UPDATE tracked_series SET last_checked=? WHERE series_asin=?",
                (int(time.time()), series_asin),
            )

    def get_tracked_series_by_id(self, series_id: int) -> Optional[Dict]:
        with self._conn() as c:
            c.row_factory = sqlite3.Row
            row = c.execute(
                "SELECT * FROM tracked_series WHERE id=?", (series_id,)
            ).fetchone()
            return dict(row) if row else None

    def delete_tracked_series(self, series_id: int) -> None:
        with self._conn() as c:
            c.execute("DELETE FROM tracked_series WHERE id=?", (series_id,))

    # -----------------------------------------
    # Release Radar: Ignored Series
    # -----------------------------------------

    def ignore_series(self, series_asin: str) -> None:
        """Mark a series as manually removed so seed_from_abs won't re-add it."""
        with self._conn() as c:
            c.execute(
                "INSERT OR REPLACE INTO radar_ignored_series (series_asin, ignored_at) VALUES (?, ?)",
                (series_asin, int(time.time())),
            )

    def get_ignored_asins(self) -> set:
        with self._conn() as c:
            rows = c.execute("SELECT series_asin FROM radar_ignored_series").fetchall()
            return {r[0] for r in rows}

    def unignore_series(self, series_asin: str) -> None:
        """Allow a previously removed series to be re-added by seeding."""
        with self._conn() as c:
            c.execute("DELETE FROM radar_ignored_series WHERE series_asin=?", (series_asin,))

    # -----------------------------------------
    # Release Radar: Releases
    # -----------------------------------------

    def upsert_release(self, asin: str, series_asin: str, series_name: str, title: str,
                       sequence: str, author: str, narrator: str, release_date: str,
                       cover_url: str, is_preorder: bool) -> bool:
        """Insert or ignore. Returns True if this is a new record."""
        with self._conn() as c:
            cur = c.execute(
                "INSERT INTO radar_releases (asin, series_asin, series_name, title, sequence, "
                "author, narrator, release_date, cover_url, is_preorder, discovered_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(asin) DO NOTHING",
                (asin, series_asin, series_name, title, sequence, author, narrator,
                 release_date, cover_url, int(is_preorder), int(time.time())),
            )
            return (cur.rowcount or 0) > 0

    def get_releases(self, days_back: int = 90) -> List[Dict]:
        """Return all upcoming releases plus those within days_back days."""
        cutoff = (datetime.date.today() - datetime.timedelta(days=days_back)).isoformat()
        with self._conn() as c:
            c.row_factory = sqlite3.Row
            rows = c.execute(
                "SELECT * FROM radar_releases WHERE release_date >= ? "
                "ORDER BY release_date ASC",
                (cutoff,),
            ).fetchall()
            return [dict(r) for r in rows]

    def get_unnotified_releases(self) -> List[Dict]:
        with self._conn() as c:
            c.row_factory = sqlite3.Row
            rows = c.execute(
                "SELECT * FROM radar_releases WHERE notified=0 ORDER BY release_date ASC"
            ).fetchall()
            return [dict(r) for r in rows]

    def mark_release_notified(self, asin: str) -> None:
        with self._conn() as c:
            c.execute("UPDATE radar_releases SET notified=1 WHERE asin=?", (asin,))
