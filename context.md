# Achievement Engine — Project Context

**Status**: Production-ready, deployed to GitHub. Supports both Unraid and Docker Compose deployment.
**Last Updated**: April 21, 2026

---

## Project Overview

**Achievement Engine** is an achievement + gear system for Audiobookshelf (ABS). It:
- **Polls listening data** from ABS and awards achievements (quests), XP, and gear
- **LitRPG game mechanics**: users earn gear (loot) with stats, equip items in a WoW-style inventory, level up
- **Annual "Wrapped" system**: interactive slides that gamify listening stats and pit users against a boss
- **Release Radar**: tracks audiobook series for new releases, manages wishlists
- **Series Review Log**: tier-list style review page for tracking book series ratings
- **UI**: Retro sci-fi / system status aesthetic with consistent parchment + dark theme

---

## Repository & Deployment

**GitHub**: `https://github.com/yxqzme2/achievement-engine-wrapped`

**Deployment Modes**:
1. **Unraid** (primary): Docker image, app data at `/mnt/user/appdata/achievement-engine`, volumes for covers/csv/data
2. **Docker Compose** (dev/alternate): Full stack with abs-stats, achievment-engine, and all volumes wired up

---

## Directory Structure

```
achievement-engine/
├── app/                          # Python backend (FastAPI)
│   ├── main.py                   # Routes, API, polling logic (4019 lines)
│   ├── gear_engine.py            # Loot rolling, inventory, character sheets (1280 lines)
│   ├── state_sqlite.py           # Database schema + ORM (482 lines)
│   ├── release_radar.py          # Series tracking, .ics generation (548 lines)
│   ├── evaluator_*.py            # Achievement evaluation rules (10+ files)
│   ├── config.py                 # Environment + path resolution
│   ├── absstats_client.py        # ABS API client
│   ├── notifier_*.py             # Discord + SMTP notifications
│   └── models.py
│
├── static/                       # HTML + CSS + JS (served to browser)
│   ├── landing.html              # Home page
│   ├── dashboard.html            # User's achievement log (journal)
│   ├── leaderboard.html          # User rankings (champions)
│   ├── timeline.html             # Achievement timeline graph
│   ├── stats.html                # Annual stats (archives)
│   ├── tier.html                 # Series tier-list editor
│   ├── playlist.html             # Gear loot table browser
│   ├── quest.html                # Achievement quest board
│   ├── character_sheet.html      # User's WoW-style gear + stats (v46)
│   ├── chronicle.html            # User listening history (book covers + stats)
│   ├── loot.html                 # Inventory grid (admin)
│   ├── radar.html                # Public release radar + series tracker
│   ├── review.html               # Series review/tier-list page (new)
│   ├── request.html              # Request new series for tracking
│   ├── Wrapped/                  # Annual wrapped slides
│   │   ├── wrapped.html          # Picker page (userId → slide flow)
│   │   ├── w-intro.html/css/js   # Slide 1: intro
│   │   ├── w-hours.html/css/js   # Slide 2: listening hours damage
│   │   ├── w-books.html/css/js   # Slide 3: books read damage (shelf visual)
│   │   ├── w-author.html/css/js  # Slide 4: top author bonus
│   │   ├── w-months.html/css/js  # Slide 5: peak month retaliation (lethal)
│   │   ├── w-personality.html/css/js # Slide 6: personality class bonus
│   │   ├── w-execute.html/css/js # Slide 7: all-out attack
│   │   ├── w-gear.html/css/js    # Slide 8: victory dossier (gear loadout + chronicle)
│   │   ├── w-outro.html/css/js   # Slide 9: win/lose screen
│   │   ├── w-shared.css/js       # Shared utilities (v4)
│   │   └── wrapped.css/js        # Picker styles/logic
│   ├── admin/                    # Admin tools
│   │   ├── index.html            # Admin dashboard
│   │   ├── radar.html            # Manage tracked series
│   │   ├── forge.html            # Gear item editor
│   │   ├── quest.html            # Achievement editor
│   │   ├── loot.html             # Inventory browser
│   │   ├── ops.html              # Operations (backups, resets)
│   │   ├── setup-wizard.html     # Initial setup
│   │   └── template.html         # Unraid template previewer
│   ├── shared/
│   │   └── particle-engine.js    # Ambient background canvas effect
│   └── *.css / *.js              # Page-specific styles and scripts
│
├── csv/                          # Loot + quest data
│   ├── loot.csv                  # 183 gear items (rarity, stats, flavor)
│   ├── quest.csv                 # 186 achievements/quests
│   ├── xpcurve.csv               # XP progression curve
│   └── loot_*.csv                # Component CSVs (prefixes, suffixes, flavor)
│
├── json/                         # Configuration + metadata
│   ├── achievements.points.json  # Achievement IDs and point values
│   └── user_xp_start.json        # Optional: bootstrap XP for new users
│
├── covers/                       # Series cover images (synced from ABS)
├── icons/                        # User avatars + UI icons
├── avatars/                      # Portrait images
│
├── scripts/                      # Build + deployment helpers
│   ├── unraid/
│   │   ├── build-image.sh        # Docker image builder (runs docker build)
│   │   ├── abs-stats-template.xml # Unraid container template
│   │   └── achievement-engine-template.xml
│   ├── docker/
│   │   └── docker-compose.sh     # Docker Compose dev launcher
│   ├── install.sh                # Data setup
│   ├── setup.sh                  # Container entrypoint setup
│   ├── generate_system_content.py # Auto-generate static content
│   ├── audit_*.py                # Diagnostic utilities
│   └── builders/                 # HTML UI builders (Portainer, setup wizard)
│
├── abs-stats/                    # Separate ABS stats aggregator (submodule or sibling)
│   ├── Dockerfile                # Build abs-stats image
│   ├── server.js                 # Node.js API server
│   ├── package.json
│   └── README.md
│
├── Dockerfile                    # Achievement Engine container image
├── docker-compose.yml            # Full-stack orchestration (both images)
├── .env.example                  # Environment template
├── README.md                      # Public project README
├── requirements.txt              # Python dependencies
├── context.md                    # THIS FILE — multi-machine sync guide
│
├── .github/workflows/            # CI/CD (GitHub Actions)
├── .gitignore
├── coverage/                     # Release Radar work-in-progress
├── Daniel litRPG/                # Series review page development
│   ├── litrpg-profile.md         # LitRPG series research
│   ├── litrpg-icon.svg           # Icon for tier list
│   └── series-review.html        # Early prototype (kept for reference)
│
├── achievement-engine_bak/       # Old backup (pre-git)
├── achievement-engine_git/       # Old backup (early git state)
├── release-radar/                # Release Radar exploration
└── screenshots/                  # User-captured screenshots for testing
```

---

## Theme & Design System

All pages use a consistent **parchment + dark** palette:

```css
--bg-dark: #121212                /* Body background */
--window-bg: #e8dbc3              /* Content parchment */
--border-color: #4a3b2a           /* Dark brown borders */
--gold-accent: #b89548            /* Gold headings/accents */
--ink: #2b2018                    /* Dark text on parchment */
--ink-muted: #665243              /* Muted text */
--tab-bg: #3d2f24                 /* Nav/button backgrounds */
--tab-text: #a89582               /* Nav text */
--tab-hover: #4f3d2f              /* Nav hover state */

Fonts: Cinzel (titles), Lato (body)
Nav: full-width, dark bar with gold accent on active links
```

---

## API Routes (FastAPI — app/main.py)

### Public Pages
| Route | Serves | Notes |
|---|---|---|
| `GET /` | → `/landing` | Redirect |
| `GET /landing` | landing.html | Home page |
| `GET /journal` | dashboard.html | Achievement log |
| `GET /champions` | leaderboard.html | User rankings |
| `GET /timeline` | timeline.html | Achievement timeline |
| `GET /chronicle` | chronicle.html | Listening history (books + hours) |
| `GET /archives` | stats.html | Year stats |
| `GET /tier` | tier.html | Series tier-list editor |
| `GET /playlist` | playlist.html | Loot browser |
| `GET /quests` | quest.html | Quest board |
| `GET /character` | character_sheet.html | User gear + stats |
| `GET /roster` | roster.html | All users' CP rankings |
| `GET /loot` | loot.html | Inventory (admin) |
| `GET /radar` | radar.html | Release radar + series tracker |
| `GET /review` | review.html | Series review tier-list |
| `GET /request` | request.html | Request series for tracking |
| `GET /wrapped` | wrapped.html (picker) | Annual wrapped: pick user → start slide flow |
| `GET /wrapped/{slide}` | Individual wrapped slides | intro, hours, books, author, months, personality, execute, gear, outro |

### Admin Pages
| Route | Serves | Notes |
|---|---|---|
| `GET /admin/radar` | Manage tracked series | Track/Sync/Check |
| `GET /admin/forge` | Gear item editor | Browse/edit loot.csv |
| `GET /admin/template` | Setup wizard | Initial data load |
| `GET /admin/template-builder` | Unraid template UI | (for reference) |

### API Endpoints
| Route | Method | Returns | Notes |
|---|---|---|---|
| `GET /awards/api/character/{user_id}` | — | Full character sheet JSON | Name, level, XP, equipped gear, stats |
| `GET /awards/api/inventory/{user_id}` | — | All inventory items | Unequipped items for user |
| `GET /awards/api/gear/roster` | — | All users' slim sheets | Sorted by combat power (CP) |
| `GET /awards/api/gear/boss-stats?user_id=xxx` | — | Boss + user sheet + combat log | For wrapped boss fight |
| `GET /awards/api/wrapped?user_id=xxx` | — | Annual stats + personality | Books, hours, authors, top narrator, quests completed |
| `GET /awards/api/portraits/{filename}` | — | PNG image | Portrait from `/data/avatars` |
| `GET /awards/api/avatar/{uid}` | — | PNG image | Proxy to ABS avatar (3s timeout) |
| `POST /awards/api/sync-covers` | — | Start background sync | ?force=true to re-download |
| `GET /awards/api/sync-covers/status` | — | JSON progress | {total, completed, running} |
| `GET /awards/api/covers-meta` | — | JSON file listing | {covers: [{filename, series_name, asin}]} |
| `GET /radar/releases.ics` | — | iCalendar feed | Subscribe link for new releases |
| `GET /radar/api/library-check` | — | Async check status | Fuzzy-match series in ABS library |
| `POST /radar/api/track` | — | Add series to tracker | {asin, series_name} |
| `DELETE /radar/api/untrack/{asin}` | — | Remove from tracker | |

### Backward-Compat Routes
Old `/awards/*` routes are kept for backward compatibility but redirect to clean URLs.

---

## Wrapped Slides — Damage System

**Boss HP**: ~100,000 (standard). User HP: `HP_stat * 10`.

| Slide | Mechanic | Formula | Max % of Boss HP |
|---|---|---|---|
| **Hours** | Damage | `min(30000, totalHours * 100)` | 30% |
| **Books** | Damage | `(totalBooks * 200) + (STR * 100)` | 20% |
| **Author** | Damage | `MAG * 150` | 15% |
| **Months** | **Retaliation** | `(2000 + peakHrs * 20) - (DEF * 5)` | **Lethal if > User HP** |
| **Personality** | Damage | `MAG * 50` | 5% |
| **Execute** | Damage | `CP * 15` | 35% |

**Win condition**: Boss HP ≤ 0 before user HP ≤ 0. Gear builds matter.

---

## Gear System (LitRPG)

### Loot Pipeline
1. **CSV loader** (`loot.csv`) → 183 items with rarity (Common→Legendary) and stats
2. **Roll loot** on achievements/quests: random draw from item pool
3. **Auto-equip**: best item-level per slot (Weapon, Head, Chest, Neck, Ring, Trinket)
4. **Character sheet**: WoW-style inventory grid + equipped gear display
5. **Combat Power (CP)**: sum of all equipped stats (STR, MAG, DEF, HP) × rarity multiplier

### Inventory System
- **25×10 grid** in modal
- **Slot tabs**: filter by equip slot (Weapon, Head, Chest, Accessory, etc.)
- **Stat filters**: sort by STR, MAG, DEF, HP
- **Drag-and-drop equip**: click + drag item to slot
- **Tooltips**: compare currently equipped vs. hovered item
- **PIN-gated**: equipping requires user PIN (from ABS)

### Character Sheet Page
- **Hero image**: user's portrait (1040×390px ideal), name + level overlaid
- **Equipped gear grid**: 3-column layout of 6 equipped items with icons + tooltips
- **Year chronicle**: 2-column grid of key stats (Books, Hours, Streak, Top Author, Top Narrator)
- **Screenshot feature**: html2canvas integration to save victory card as PNG

---

## Release Radar Feature

### What It Does
- **Series tracking**: users add series to track (via ASIN or search)
- **Release notifications**: polls Audible API for new book releases
- **.ics calendar**: subscribe to release calendar in any calendar app
- **Library cross-check**: fuzzy-match release against user's ABS library (shows "Released / Missing")
- **Ignore list**: users can blacklist series (stored in DB, skips ABS auto-seed)

### Data Storage
- `tracked_series`: ASIN, series name, user who added it
- `radar_releases`: release date, book title, ASIN
- `radar_ignored_series`: blacklist entries

### Routes
| Route | Method | Purpose |
|---|---|---|
| `GET /radar` | — | Public release radar page |
| `GET /admin/radar` | — | Management page (track/sync/check) |
| `GET /radar/releases.ics` | — | Calendar feed |
| `POST\|GET\|DELETE /radar/api/*` | — | CRUD operations |

---

## Release Radar Feature

### What It Does
- **Series tracking**: users add series ASIN to follow for releases
- **Audible polling**: checks for new book releases on schedule
- **Release calendar**: .ics export (subscribe in any calendar app)
- **Library cross-check**: fuzzy-match series releases against user's ABS library
- **Ignore list**: blacklist series (won't auto-seed from ABS)

### Data Tables
- `tracked_series`: (asin, series_name, user_id, added_at)
- `radar_releases`: (asin, title, sequence, release_date)
- `radar_ignored_series`: (asin, user_id) — blacklist

---

## Environment & Deployment

### Unraid Deployment (Primary)

**Build**:
```bash
cd /path/to/achievement-engine
./scripts/unraid/build-image.sh
# → Builds Docker image, ready to apply in Unraid UI
```

**Directory Layout on Unraid Host**:
```
/mnt/user/appdata/achievement-engine/
├── csv/              # Synced from host by build.sh
├── data/             # Config + app data
├── covers/           # Series cover images
├── static/           # HTML/CSS/JS (copied from host pages/)
└── state.db          # SQLite database
```

**Volume Mounts** (container):
- `/static/` → `/mnt/user/appdata/achievement-engine/static/` (read-only HTML)
- `/data/` → `/mnt/user/appdata/achievement-engine/data/` (app data)
- `/data/covers/` → `/mnt/user/appdata/achievement-engine/covers/` (cover sync)

**Environment**: `.env` file in appdata directory. Variables:
- `ABS_URL` / `ABS_TOKEN` — ABS connection
- `DISCORD_WEBHOOK_URL` (optional) — notifications
- `POLL_SECONDS` — check interval (default 60)
- `RADAR_CHECK_INTERVAL_HOURS` — series check interval (default 12)

### Docker Compose Deployment (Dev/Alternate)

**Setup**:
```bash
cd /path/to/achievement-engine
./scripts/docker/docker-compose.sh build    # Build images
./scripts/docker/docker-compose.sh up       # Start stack
./scripts/docker/docker-compose.sh logs     # Tail logs
```

**Stack**:
- `abs-stats:3000` — Audible Book Stats aggregator (Node.js)
- `achievement-engine:8000` — Achievement Engine (FastAPI)
- Both share volumes: `./static/`, `./data/`, `./covers/`, etc.

**Config**: `.env` file (auto-created on first run).

---

## Recent Work (April 2026)

### Series Review Page (`/review`)
- Full-page series tier-list editor
- Integrates with Release Radar: shows tracked series, release status, library check
- Tier-list drag-drop UI (tiers: S, A, B, C, D, F)
- User ratings per series, persistent storage in `tier_lists` table
- Claude output integration: AI-generated series summaries

### Tier List (`/tier`)
- Interactive series tier-list with drag-drop equip
- Synced to `/data/tier-lists.json` on every change
- Backfill from DB on container startup

### Release Radar Enhancements
- Pre-order filtering: skips books not yet released
- Library sync: one cover per series (first book), standalones as-is
- Ignore list: preserved across syncs

### Chronicle Page (`/chronicle`)
- User's listening history with book covers
- All-time hours + sessions (not just current year)
- Synced with abs-stats for accurate durations

### Wrapped Slide Fixes
- `w-books.js` (v8): Legacy vs. new books split, correct spine colors
- `w-execute.js` (v7): Hit fires at 14s, crowd canvas opacity fixed
- `w-gear.js` (v8): Victory dossier with hero image, year chronicle, screenshot feature

---

## Key Codebase Facts

### Main.py (4019 lines)
- All FastAPI routes + HTML serving
- Achievement polling + XP award logic
- Wrapped API + boss-stats calculation
- Cover sync coordination

### Gear Engine (1280 lines)
- CSV loading + gear generation
- Character sheet building
- Auto-equip algorithm

### State SQLite (482 lines)
- Database schema (8 tables)
- ORM-style methods for all data access

### Release Radar (548 lines)
- Audible API polling
- Series tracking + release matching
- .ics calendar generation

### Achievement Evaluators (10+ files, 10 total)
- Modular rule system
- Each evaluator checks one type of achievement
- Results merged in main.py polling loop

---

## How to Set Up on a New Machine

### Option 1: Unraid (Recommended)
1. Clone repo to `/mnt/user/Downloads/achievement-engine`
2. Ensure `.env` is populated with ABS credentials
3. Run `./scripts/unraid/build-image.sh`
4. Click APPLY in Unraid UI with the generated template
5. Container starts, creates `state.db`, begins polling

### Option 2: Docker Compose (Dev)
1. Clone repo
2. Run `./scripts/docker/docker-compose.sh` (auto-creates `.env`)
3. Wait for containers to start, check logs
4. Access at `http://localhost:8000` (engine) and `:3000` (abs-stats)

### Option 3: Raw Python (Debug)
```bash
pip install -r requirements.txt
python app/main.py
# Serves on http://localhost:8000
# Requires .env with ABS_URL + ABS_TOKEN
```

---

## Important Notes

### Rebuild Requirements
- **`app/*.py` changes** → Full `build.sh` rebuild required
- **`static/` changes** → Just copy HTML/CSS/JS (hard-refresh browser)
- **`abs-stats/server.js` changes** → Full rebuild of abs-stats Docker image (not achievement-engine)

### Database Persistence
- `state.db` is persistent (lives in appdata on Unraid, volume on Docker)
- Backups: user must manually backup appdata directory
- Recovery: restore state.db, restart container

### Image Caching
- CSS/JS files use query-string versioning: `file.css?v=4`
- **Bump version number** on every CSS/JS change to bust browser cache
- Nginx caches by URL, so `?v=4` vs. `?v=5` are different resources

### Port Assignments
- Achievement Engine: **8000**
- abs-stats: **3000**
- Nginx (if used): **80/443** (external facing)

---

## Useful Commands

### Building
```bash
# Unraid image
./scripts/unraid/build-image.sh

# Docker Compose stack
./scripts/docker/docker-compose.sh build && ./scripts/docker/docker-compose.sh up -d
```

### Development
```bash
# Tail logs
docker logs achievement-engine -f

# Access database
sqlite3 /path/to/state.db

# Run Python diagnostic
python scripts/audit_library.py
```

### Cleanup
```bash
# Wipe database + restart (fresh state)
rm state.db && docker restart achievement-engine

# Full reset (lose all data)
docker system prune -a
```

---

## Project Links

- **GitHub**: https://github.com/yxqzme2/achievement-engine-wrapped
- **Deployed at**: abs.laruenet.com (Unraid instance)
- **ABS integration**: Audiobookshelf API (v0.16+)
- **Architecture**: FastAPI backend + vanilla JS frontend
