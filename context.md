# Achievement Engine - Project Context

## Overview
This project is an achievement and gear engine for Audiobookshelf. It polls listening data and awards achievements, XP, and gear (LitRPG style). The UI is a retro sci-fi / system status aesthetic.

**System Source of Truth**: The file `project.md` contains the authoritative record of all core mechanics, XP rewards, gear point budgets, and combat formulas. Refer to it before making any balancing changes.

## RPG & Inventory System — Current Vision
**The Vision**: Users manage a WoW-style character sheet. Every book finished drops gear. Gear has slots (Head/Chest/Weapon/Neck/Ring/Trinket), stats (STR/MAG/DEF/HP), rarity (Common→Legendary), and item level. Combat Power aggregates all equipped stats.

**What is Working**:
- Full gear pipeline: CSV loaders → loot rolling → auto-equip → character sheet builder
- WoW-style inventory modal (25×10 grid, slot tabs, stat filters, drag-and-drop equip)
- Character sheet: level, XP bar, equipped gear with icons, stat panel, quest widget
- Tooltips with item comparison (shows currently equipped vs hovered)
- Roster page: all users' slim character sheets sorted by CP
- Boss stats: aggregated from all users' CP/DEF; boss HP/ATK auto-calculated
- Wrapped slide `s-gear` shows boss combat result for each user
- PIN-gated inventory equipping

**Gear Slots** (after loot.csv reclassification):
- Head, Chest, Weapon (main slots)
- Neck, Ring, Trinket (accessory slots — previously all called "Accessory")

**Avatar / Portrait Loading Chain** (character_sheet.js):
1. `GET /awards/api/portraits/{username}.png` (no cache-buster — browser caches)
2. On 404 → `GET /awards/api/portraits/{userId}.png`
3. On 404 → `GET /awards/api/avatar/{userId}` (ABS proxy, 3s timeout)
4. On error → img removed

**Ambient Background**: `shared/particle-engine.js` (createjs/TweenMax, `#projector` canvas). Always running. Avatar display has a 9-color cycling glow border (`@keyframes avatar-glow`, 9s).

---

## Wrapped Slide System

### Architecture
- **Picker page**: `pages/Wrapped/wrapped.html` → `/wrapped`
  - Fires two parallel fetches: `/awards/api/gear/boss-stats?user_id=xxx` and `/awards/api/wrapped?user_id=xxx`
  - Stores all data in `sessionStorage` as `w_state`
  - Navigates to `/wrapped/intro`
- **Slide pages**: `w-intro`, `w-hours`, `w-books`, `w-author`, `w-months`, `w-personality`, `w-execute`, `w-gear`, `w-outro`
- **Shared assets**: `w-shared.css` (v=4), `w-shared.js` (v=4) — loaded by every slide
- **Slide order** (SLIDE_ORDER array): `['intro','hours','books','author','months','personality','execute','gear','outro']`

### Session State (`s = getState()`)
All data flows through `sessionStorage['w_state']`. Key fields:
| Field | Source | Notes |
|---|---|---|
| `userId` | picker | username string (e.g. "mrlarue77") |
| `username` | wrapped API | display name |
| `bossMaxHP` / `bossCurrentHP` | boss-stats API | persists across slides |
| `userMaxHP` / `userCurrentHP` | boss-stats API | `max(1200, hp_stat * 5)` |
| `userSheet` | boss-stats API | full character sheet; `userSheet.equipped` is a `{slot: item}` dict |
| `inventory` | boss-stats API | full item list (NOT used for equipped detection — use `userSheet.equipped`) |
| `stats.*` | wrapped API | all listening stats for the year |
| `win` | set on execute slide | true if boss is defeated |

### Username → UUID Resolution
Both the wrapped API and boss-stats API use a reverse map to resolve usernames to ABS UUIDs:
```python
reverse = {v.lower(): k for k, v in user_map.items()}
abs_user_id = reverse.get(user_id.lower(), user_id)
```

### Wrapped API (`GET /awards/api/wrapped?user_id=xxx`)
Returns a `stats` object with:
- `totalBooks`, `totalHours`, `totalDays`, `distinctAuthors`
- `topAuthor`, `topNarrator`, `longestBook`, `shortestBook`
- `seriesCompleted`, `mostActiveMonth`, `longestStreak`
- `sessionCount`, `bingeSessionCount`
- `hoursByMonth`, `hoursByDayOfWeek`, `hoursByHourOfDay`
- `personality` (object: name/icon/desc)
- `books` (list of book objects for the year)
- `questsCompleted` — count of achievements earned by user in the year (non-gear)
- `questAvgDmg` — average `points` value of those achievements (from achievements.points.json)

### Per-Slide Damage / Survival Mechanics (Balanced Scaling)
Total Boss HP: ~100,000 (standard single-player).

| Slide | Mechanic | Formula | Max Potential |
|---|---|---|---|
| **Hours** | Damage | `Math.min(30000, totalHours * 100)` | 30% |
| **Books** | Damage | `(totalBooks * 200) + (STR * 100)` | 20% |
| **Author** | Damage | `MAG * 150` | 15% |
| **Months** | Retaliation | `(2000 + peakHrs * 20) - (DEF * 5)` | **Lethal** |
| **Personality** | Damage | `MAG * 50` | 5% |
| **Execute** | Damage | `CP * 15` | 35% |

**Survival Requirement**: User HP is scaled to `HP_Stat * 10` on picker load. If boss retaliation > User HP, the user is "liquidated" and cannot reach the gear reveal.

**Build Check**:
- **Pure physical**: Low MAG builds lose ~20% of win potential.
- **Pure mage**: Low STR builds lose ~15% of win potential.
- **Under-geared**: Low CP (<1500) makes the Execute slide insufficient to finish the boss.
- **No Defense**: High activity (high retaliation) without DEF gear causes immediate liquidation.

### Quest Data Pipeline
- `state_sqlite.py`: `get_user_award_ids_in_year(user_id, year)` — queries `awards` table filtered by timestamp range, excludes `gear:` prefixed entries
- `achievements.points.json` (`ACHIEVEMENTS_JSON_PATH`): list of achievement objects with `id` and `points` fields
- Cross-referenced in the wrapped API handler to compute `questsCompleted` + `questAvgDmg`

---

## Environment

| Location | Path |
|---|---|
| Source (host) | `/mnt/user/Downloads/achievement-engine` |
| Appdata (host) | `/mnt/user/appdata/achievement-engine` |
| Static volume (container) | `/static/` → serves CSS/JS/HTML |
| Covers volume (container) | `/data/covers/` |
| CSVs (container) | `/data/csv/` or `/app/static/Wrapped/` |

**`_get_static_path()`** checks `/static/` (volume) first, falls back to `/app/static/` (baked into image).

---

## Live Container Structure
```
/mnt/user/appdata/achievement-engine/
├── csv/               loot.csv, quest.csv, xpcurve.csv
├── data/              achievements.points.json, limbo_chatter.json
├── static/            ALL pages/ files synced here by build.sh
│   ├── character_sheet.html / .css (v=46) / .js (v=14)
│   ├── dashboard, leaderboard, timeline, stats, tier, playlist, roster, tester, loot, landing
│   ├── shared/        particle-engine.js
│   └── Wrapped/       wrapped.html + all w-*.html/css/js slides
└── state.db
```

Screenshots are kept in a folder at the root called `screenshots`.
User will say "new screenshot" when they want you to check code instead of looking at images.

---

## Rebuild & Deploy Workflow
`build.sh` (run on Unraid host): must be run by user.
1. Syncs `csv/` and `data/` to appdata
2. **Wipes** `appdata/static/` entirely, then copies all of `pages/` into it
3. Rebuilds Docker image (no-cache) and stops/removes old container
4. User starts the new container from Unraid UI

**IMPORTANT**: Changes to `app/*.py` require a full `build.sh rebuild.
**IMPORTANT**: Changes to `pages/` only require file copy + hard-refresh, but build.sh handles both.
**IMPORTANT**: Changes to `abs-stats/server.js` require a full rebuild of the **abs-stats** container (separate image), not just achievement-engine.

---

## Key Routes (app/main.py)
| Route | Serves |
|---|---|
| `GET /` | → redirect to `/landing` |
| `GET /character` | character_sheet.html |
| `GET /journal` | dashboard.html |
| `GET /champions` | leaderboard.html |
| `GET /timeline` | timeline.html |
| `GET /archives` | stats.html |
| `GET /tier` | tier.html |
| `GET /playlist` | playlist.html |
| `GET /forge` | tester.html |
| `GET /roster` | roster.html |
| `GET /loot` | loot.html |
| `GET /wrapped` | wrapped.html (picker) |
| `GET /wrapped/{slide}` | individual slide pages (intro, hours, books, …) |
| `GET /awards/api/character/{user_id}` | Full character JSON |
| `GET /awards/api/inventory/{user_id}` | Inventory items |
| `GET /awards/api/gear/roster` | All users slim sheets, sorted by CP |
| `GET /awards/api/gear/boss-stats?user_id=xxx` | Boss + user sheet + combat log |
| `GET /awards/api/wrapped?user_id=xxx` | Wrapped stats for the year |
| `GET /awards/api/portraits/{filename}` | Portrait image from /data/avatars |
| `GET /awards/api/avatar/{uid}` | Proxy to ABS avatar (3s timeout) |

---

## Current Status / What Was Last Worked On

### Wrapped Slides — Status
| Slide | Status | Versions |
|---|---|---|
| `w-intro` | Done | — |
| `w-hours` | Done | — |
| `w-books` | Done | js v10, css v6 |
| `w-author` | Not yet tuned | — |
| `w-months` | Not yet tuned | — |
| `w-personality` | Not yet tuned | — |
| `w-execute` | Done | js v7, css v5 |
| `w-gear` | Done | js v8, css v16 |
| `w-outro` | Done | js v6, css v6 |

### w-books (v10/v6)
- Two-row shelf layout: legacy books on top row, new books on bottom row
- Hover tooltips on each spine: title, author, narrator, length, completed date
- `#spine-tooltip` div in HTML, mouse-following via mouseover/mousemove/mouseout handlers
- Data stored as `data-*` attributes on each spine element

### w-execute (v7/v5)
- Crowd simulator canvas fixed: `crowdCanvas.style.opacity = '1'` added in `setupCrowd()`
- Dynamic sub-text: epic phrasing using real `estChars = totalBooks * 26`, CP, EXECUTE_DMG, and actual boss % hit
- Hit fires at **14 seconds** (was 7s)
- `setState()` (not `saveState`) used correctly in both win/lose branches — fixes black screen on navigate

### w-gear (v8/v16) — Victory Dossier card
- **Hero section**: full-width rectangular image, `aspect-ratio: 16/6` (8:3 ratio)
  - Ideal avatar size: **1040 × 390px** (or 2080 × 780px at 2x for retina)
  - `object-position: center top` — subject should be in upper half of frame
  - Avatar loads from `win-{username.toLowerCase()}.png`, falls back to standard portrait → generated avatar → first initial
  - Name overlaid bottom-left, Level overlaid bottom-right of hero image
- **Gear Loadout**: uses `userSheet.equipped` (a `{slot: item}` dict).
- **Item Tooltips**: Hovering equipped gear shows a WoW-style tooltip with rarity colors, stats, and flavor text.
- **Year Chronicle**: Displays key stats including Books, Hours, Streak, Top Author, and **Top Narrator**.
- **Screenshot Feature**: Integrated `html2canvas` to allow users to save their victory card as a PNG.
- **Navigation**: Removed global tap-to-continue; users must now explicitly click "Continue" or "View Character Sheet".
- **Layout**: gear (3-column grid) above chronicle (2-column grid). Max-width 1040px, full-width hero.

### w-outro (v6/v6)
- Two states: `#outro-lose` and `#outro-win`, both nested inside `#slide-content` (centering requirement)
- Both set `style.display = 'flex'` (not 'block') to preserve centering CSS
- **Lose state**: "UNWORTHY" glitch text, "ASSET LIQUIDATED", dynamic verdict based on boss HP% remaining (4 tiers: ≤5%, ≤15%, ≤35%, worse), two action buttons (recursion / forge)
- **Win state**: victory message + 7 fireworks

### abs-stats/server.js — Hours Fix (Applied)
Three bugs fixed that caused ~6.6x over-counting for some users:
1. **Dedup**: added session deduplication after pagination (`_seen` Set on session ID)
2. **Year filter**: uses `startedAt` only (removed `|| s.updatedAt` fallback that leaked old sessions)
3. **Duration**: uses `timeListening` only (removed `|| s.duration` fallback that used full book length)

### Known Issues / Pending


### ToDo
- remove references to removed scripts
  | Loot Audit          │ loot_audit              │ audit_loot_points.py       │
  │ XP Rebalance        │ xp_rebalance            │ rebalance_xp.py            │
  │ XP Audit            │ xp_audit                │ xp_audit.py                │
  │ Achievement Audit   │ achievement_audit       │ achievement_audit.py       │
  │ XP Comparison       │ xp_compare              │ audit_xp_compare_users.py


