# Achievement Engine — Upgrade Guide

This document covers everything that has changed from the original upstream project
(`yxqzme2/achievement-engine`) to the heavily expanded fork documented here.
If you are migrating from the original, read this first.

---

## At a Glance

| Area | Original | This Fork |
|---|---|---|
| Total achievements | 57 | 322 |
| Web pages | 3 (dashboard, leaderboard, timeline) | 14+ (full portal) |
| Achievement categories | 15 | 17 |
| LitRPG gear system | None | Full (XP, levels, loot, quests, boss fights) |
| Wrapped / Year-in-Review | None | 9-slide animated experience |
| Tier list | None | Interactive, cover-art backed |
| Character sheets | None | Full LitRPG character sheets with equipment |
| Loot compendium | None | Browsable item catalog |
| Quest system | None | 182 quests tied to books/series |
| Cover sync | None | Background sync from Audiobookshelf |
| URL scheme | Positional (`/`, `/leaderboard`) | Semantic (`/journal`, `/champions`, `/landing`) |
| Design theme | Plain / dark | Parchment fantasy ("Listener's Sanctum") |
| SQLite tables | 1 (`awards`) | 6 (`awards`, `user_inventory`, `user_base_stats`, `grandfather_done`, `user_equipment`, `user_pins`) |
| Config variables | 14 | 30+ |

---

## New Environment Variables

The following variables are **new** and have no equivalent in the original.

### Achievement Engine (`.env`)

| Variable | Default | Description |
|---|---|---|
| `XP_START_TIMESTAMP` | `1767225600` | Unix timestamp of the integration launch date (Jan 1 2026). Books/sessions before this date are treated as "legacy". |
| `ACHIEVEMENTS_SCOPE` | `all_time` | Whether achievements are evaluated against `all_time` history or only activity `since_xp_start`. |
| `PROGRESSION_SCOPE` | `since_xp_start` | Scope for XP/level progression calculations. |
| `VERIFY_LISTEN_THRESHOLD` | `0.80` | Fraction of a book's duration that must be covered by listening sessions to count as "verified." |
| `STRICT_VERIFICATION` | `false` | When `true`, books must pass the listen-threshold check to count toward any achievement. |
| `REQUIRE_DURATION_FOR_CREDIT` | `true` | Require that an item has a known duration before counting it for achievements. |
| `REQUIRE_2026_SESSION_FOR_CREDIT` | `true` | Require at least one listening session dated 2026+ for a book to receive credit. |
| `USER_XP_START_OVERRIDES_PATH` | `/data/json/user_xp_start.json` | Path to a JSON file that defines per-user XP start dates (overrides the global `XP_START_TIMESTAMP` per user). |
| `WRAPPED_BOSS_HP` | `250000` | Base boss HP used in the Wrapped year-in-review combat sequence. |
| `WRAPPED_YEAR` | `0` | Force the Wrapped feature to display a specific year. `0` = current year. |
| `RUN_ACHIEVEMENT_BACKFILL` | `false` | On startup, retroactively award any achievements earned before the engine was installed. One-shot, idempotency-keyed. |
| `BACKFILL_ONCE_KEY` | `ach_backfill_v1` | The key used to prevent the backfill from running more than once. Change to re-run. |

---

## New API Endpoints

### Achievement Engine (port 8000)

**Gear / LitRPG System**

| Endpoint | Description |
|---|---|
| `GET /awards/api/character/{user_id}` | Full character sheet: stats, level, XP, equipped gear, combat power. |
| `GET /awards/api/inventory/{user_id}` | All items in the user's inventory. |
| `POST /awards/api/gear/equip` | Equip an item from the user's inventory to a slot. |
| `POST /awards/api/gear/spend-points` | Spend unallocated stat points (STR/MAG/DEF/HP). |
| `POST /awards/api/gear/set-pin` | Set a user's PIN for character sheet access. |
| `GET /awards/api/gear/quests` | All quests with completion status for a user. |
| `GET /awards/api/gear/catalog` | Full loot catalog (all items). |
| `GET /awards/api/gear/boss-stats?user_id=xxx` | Boss stats + user's combat sheet + 8-line combat log (used by Wrapped). |
| `GET /awards/api/gear/roster` | All users' slim character sheets sorted by Combat Power; includes aggregated boss stats. |

**Wrapped / Year-in-Review**

| Endpoint | Description |
|---|---|
| `GET /awards/api/wrapped?user_id=xxx&year=2026` | Full Wrapped data payload (hours, books, authors, months, personality, gear). |

**Cover Art Sync**

| Endpoint | Description |
|---|---|
| `POST /awards/api/sync-covers?force=false` | Start a background thread that downloads cover art from Audiobookshelf. `force=true` re-downloads existing covers. |
| `GET /awards/api/sync-covers/status` | Poll sync progress (`{running, done, total, synced, skipped, errors, message}`). |
| `GET /awards/covers/` | JSON listing of all synced cover filenames. |
| `GET /awards/covers/{path}` | Serve a synced cover file. |

**Miscellaneous**

| Endpoint | Description |
|---|---|
| `GET /awards/api/limbo-chatter` | System lore chatter messages (from `json/limbo_chatter.json`). |
| `POST /awards/api/achievements/add` | Dynamically award an achievement to a user without waiting for the poll cycle. |
| `GET /awards/api/portraits/{filename}` | Serve avatar portrait images. |
| `GET /awards/api/avatar/{uid}` | Proxy to abs-stats for a user's ABS avatar. |
| `GET /system/poll` | Manually trigger one poll/evaluation cycle immediately. |
| `GET /awards/api/routes` | List all registered API routes (debug). |

### abs-stats (port 3000) — New Endpoints

| Endpoint | Description |
|---|---|
| `GET /api/users/:userId/completions` | Per-user completion list with timestamps. |
| `GET /api/users/:userId/streaks` | Per-user listening streak data. |
| `GET /api/users/:userId/listening-windows` | Listening time broken into time-of-day windows. |
| `GET /api/users/:userId/achievement-progress` | Progress toward specific achievement thresholds. |
| `GET /api/series-hours` | Listening hours broken down by series. |
| `GET /api/series/:seriesId/books` | All books in a given series with metadata. |
| `GET /api/users/:userId/wrapped-data` | Full Wrapped data aggregation for a user. |
| `GET /api/catalog` | Slim catalog of all library items (id + title). |
| `GET /api/all-items` | Full library item list used by the cover sync feature. |
| `GET /api/leaderboard` | Pre-computed leaderboard data. |

---

## New Achievement Categories

| Category | Original Count | New Count | Notes |
|---|---|---|---|
| `campaign` | 0 | 163 | Book/series-specific narrative achievements tied to titles. |
| `quest` | 0 | 83 | Gear quest completion achievements. |
| `series_complete` | 1 | 17 | Major series completion achievements. |
| `meta` | 1 | 4 | Meta/engine-level achievements. |
| All others | 55 | 55 | Unchanged from original. |
| **Total** | **57** | **322** | |

---

## Database Schema Changes

The original schema had a single table. This fork adds five more.

```sql
-- NEW in this fork:

CREATE TABLE user_inventory (
  user_id     TEXT    NOT NULL,
  item_id     TEXT    NOT NULL,
  acquired_at INTEGER NOT NULL,
  source      TEXT,
  PRIMARY KEY (user_id, item_id)
);

CREATE TABLE user_base_stats (
  user_id         TEXT    NOT NULL PRIMARY KEY,
  base_str        INTEGER NOT NULL,
  base_mag        INTEGER NOT NULL,
  base_def        INTEGER NOT NULL,
  base_hp         INTEGER NOT NULL,
  unspent_points  INTEGER DEFAULT 0,
  spent_str       INTEGER DEFAULT 0,
  spent_mag       INTEGER DEFAULT 0,
  spent_def       INTEGER DEFAULT 0,
  spent_hp        INTEGER DEFAULT 0,
  rolled_at       INTEGER NOT NULL
);

CREATE TABLE grandfather_done (
  user_id TEXT NOT NULL PRIMARY KEY,
  done_at INTEGER NOT NULL
);

CREATE TABLE user_equipment (
  user_id TEXT NOT NULL,
  slot    TEXT NOT NULL,
  item_id TEXT NOT NULL,
  PRIMARY KEY (user_id, slot)
);

CREATE TABLE user_pins (
  user_id TEXT NOT NULL PRIMARY KEY,
  pin     TEXT NOT NULL
);
```

All tables are created automatically by the engine on first startup — no migration scripts are needed.

---

## File Layout Changes

### Static Files (pages)

The original placed HTML files in the repo root. This fork moves them to `pages/` with dedicated CSS/JS companions:

```
pages/
  landing.html / landing.css / landing.js       # Hub page
  dashboard.html / dashboard.css / dashboard.js # Journal/achievements
  leaderboard.html / ...                        # Champions
  timeline.html / ...                           # Timeline
  stats.html                                    # Archives
  tier.html / tier.css / tier.js                # Tier list
  playlist.html / ...                           # Playlist browser
  roster.html / ...                             # All characters
  character_sheet.html / ...                    # Single character
  loot.html / loot.css / loot.js                # Loot compendium
  quest.html / quest.css / quest.js             # Quest browser
  tester.html / tester.css / tester.js          # Achievement forge
  shared/                                       # Shared CSS/JS
  Wrapped/
    wrapped.html / wrapped.css / wrapped.js     # Orchestrator
    w-intro.html/css/js                         # Slide 0
    w-hours.html/css/js                         # Slide 1
    w-books.html/css/js                         # Slide 2
    w-author.html/css/js                        # Slide 3
    w-months.html/css/js                        # Slide 4
    w-personality.html/css/js                   # Slide 5
    w-execute.html/css/js                       # Slide 6 (combat)
    w-gear.html/css/js                          # Slide 7 (gear reveal)
    w-outro.html/css/js                         # Slide 8
    w-shared.css / w-shared.js                  # Shared Wrapped utilities
```

The Dockerfile now copies the entire `pages/` tree to `/app/static/` inside the container, and `/app/static` can be volume-mounted so files are editable without an image rebuild.

### Data Files

```
csv/
  loot.csv        # 208 loot items
  quest.csv       # 182 quests
  xpcurve.csv     # XP per level table
json/
  user_xp_start.json  # Per-user XP start date overrides (template)
  limbo_chatter.json  # System lore messages
```

---

## Gear System Overview

This fork adds a complete LitRPG gear system managed by `app/gear_engine.py`.

### XP Sources
- **Listening hours** — XP from hours listened since the integration date
- **Quests** — each completed quest awards XP
- **Achievements** — each achievement earned awards XP

### Character Stats
Every user has four base stats that grow with level:
- **STR** (Strength) — contributes to attack power
- **MAG** (Magic) — contributes to attack power
- **DEF** (Defense) — contributes to boss defense; feeds boss DEF calculations
- **HP** — health pool; feeds boss HP calculations

### Item Levels and Rarity
Item level = `floor((STR×1.5 + MAG×1.5 + DEF×1.2 + HP×0.8) × rarity_multiplier)`

| Rarity | Multiplier |
|---|---|
| Common | 1.0 |
| Uncommon | 1.15 |
| Rare | 1.35 |
| Epic | 1.6 |
| Legendary | 2.0 |

### Gear Slots
`Weapon`, `Head`, `Chest`, `Neck`, `Ring`, `Trinket`

### Grandfather Init
Users who had significant listening history before the gear system launched get their books/hours retroactively counted for a starting XP/level. Level is then squished:
`level > 20 → 20 + floor(sqrt(level - 20))`

### Quest System
182 quests are defined in `csv/quest.csv`, each tied to a specific book or series. Completing the associated item awards the quest's XP and a gear drop.

---

## Wrapped (Year-in-Review)

The Wrapped feature is a 9-slide animated experience at `/wrapped`.

| Slide | Content |
|---|---|
| 0 — Intro | User greeting, year summary |
| 1 — Hours | Listening hours with animated damage-hit sequence |
| 2 — Books | Per-book spine wall with animated hit combos |
| 3 — Author | Top authors breakdown |
| 4 — Months | Listening activity by month |
| 5 — Personality | Derived listening personality archetype |
| 6 — Execute | Boss combat sequence (win/lose) |
| 7 — Gear | Gear drop reveal (only shown on boss win) |
| 8 — Outro | Final summary card |

The hours and books slides use a custom damage formula (see `damage_calc.md` in the project root for full documentation).

---

## Dockerfile Changes

```diff
+ COPY pages/ /app/static/
+ COPY pages/Wrapped/ /app/static/Wrapped/
+ COPY csv/loot.csv /app/csv/loot.csv
+ COPY csv/quest.csv /app/csv/quest.csv
+ COPY csv/xpcurve.csv /app/csv/xpcurve.csv
+ COPY json/user_xp_start.json /app/data/user_xp_start.json
+ COPY audit_achievements.py /app/
+ COPY audit_library.py /app/
+ COPY rebalance_xp.py /app/
```

---

## Migrating an Existing Installation

1. **Pull the updated code** and rebuild the image (`docker compose build` or `build.sh`).
2. **No database migration needed** — all new tables are created automatically on startup.
3. **Add new env vars** to your `.env` as needed. All new variables have sensible defaults and the engine will work without them.
4. **Gear grandfather init** — on the first poll after upgrade, the engine automatically runs grandfather init for all existing users, backfilling their XP/level from historical data. This is a one-time operation.
5. **Cover art** — browse to `/tier` and click "Sync Covers" to download cover art from your Audiobookshelf server.
6. **Unraid** — if you volume-mount `/app/static`, copy the new `pages/` tree to your Unraid appdata path to get the updated UI without rebuilding.
