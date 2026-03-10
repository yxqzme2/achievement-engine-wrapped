# Achievement Engine Upgrade Guide

A unified upgrade and migration guide for moving from the original upstream **Achievement Engine** to the current expanded build. This version combines the major system changes, architectural differences, migration steps, and operational notes from all three source documents.

---

## Overview

The current Achievement Engine is no longer just a lightweight achievement tracker layered on top of Audiobookshelf. It has grown into a full **LitRPG progression system** with character stats, XP, levels, loot, quests, equipment, Wrapped boss combat, and expanded portal pages. fileciteturn1file0L1-L7 fileciteturn1file1L1-L8 fileciteturn1file2L1-L10

This guide focuses on what changed, what stayed the same, and what you need to do when upgrading an existing install.

---

## At a Glance

| Area | Original | Current Build |
|---|---|---|
| Core purpose | Achievement tracker | LitRPG progression system with achievements, XP, loot, quests, and Wrapped |
| Total achievements | 57 | 322 |
| Pages | 3 | 14+ |
| Character system | None | Full character sheets with stats, equipment, and Combat Power |
| Gear system | None | Inventory, loot, equipment slots, PIN protection |
| Wrapped | None | 9-slide animated year-in-review |
| Quest system | None | 182 quests tied to books and series |
| SQLite tables | 1 | 6 |
| Config surface | Small | 30+ environment variables |

These changes reflect a major platform shift, not a visual refresh. fileciteturn1file1L9-L26 fileciteturn1file2L31-L40

---

## What Stayed the Same

Some core design ideas remain unchanged:

- `abs-stats` still collects listening and library activity from Audiobookshelf
- `achievement-engine` still evaluates rules and serves UI and APIs
- Docker and Unraid remain the main deployment models
- Achievement definitions still rely on JSON-driven rule sets
- Persistent SQLite state still lives separately from config and content files fileciteturn1file2L5-L10

---

## The 2026 System Shift

The biggest functional change is the introduction of a **2026-era progression economy**. The engine now supports a hard progression start date, with the default launch point set to **January 1, 2026**. fileciteturn1file0L5-L10 fileciteturn1file1L33-L45

### What this means

- Progression can be limited to activity on or after the launch date
- Older listening history can remain visible for some reporting, but not count toward XP, loot, or levels
- Wrapped year filtering and progression boundaries are now treated as separate controls
- A pre-launch or “Limbo” mode can hide character progression and show system chatter until the launch window is active fileciteturn1file0L5-L10 fileciteturn1file2L21-L30

This is one of the most important upgrade concepts to understand: **Wrapped display year is not the same as progression reset logic**. fileciteturn1file2L21-L30

---

## Major Additions

## 1. LitRPG Progression Layer

The system now includes a persistent character model with four core stats:

- **STR** — impacts attack and some gear scaling
- **MAG** — impacts magic-style power and some gear scaling
- **DEF** — defensive scaling for encounters
- **HP** — character survivability, capped in the current model at 9,999 fileciteturn1file0L12-L18

### XP and Levels

The current model adds a structured XP economy:

- 250 XP per listening hour
- 15,000 XP per completed book
- 100,000 XP per completed series
- Achievement XP based on rarity or difficulty
- Anti-double-dip rules so certain quest or series completion achievements do not stack extra XP on top of hardcoded completion rewards fileciteturn1file0L19-L25

Users also gain manual stat points:

- 5 points per level
- +20 bonus points every 10 levels
- Points are distributed through the UI
- Spending points is PIN protected fileciteturn1file0L24-L25

## 2. Gear and Loot System

The upgrade adds a full inventory and equipment layer.

### Core features

- Inventory persistence per user
- Loot drops from books, quests, level progression, and milestones
- Six equipment slots:
  - Head
  - Chest
  - Weapon
  - Neck
  - Ring
  - Trinket
- Combat Power as a rolled-up strength metric based on level, stats, and gear
- PIN-protected equip and stat-spend actions fileciteturn1file0L27-L32 fileciteturn1file1L208-L247

Loot data is managed through `csv/loot.csv`, and balancing tools were added to audit point values and progression fairness. fileciteturn1file0L31-L32

## 3. Quests and Directives

Content can now be treated as quest-board style progression:

- **World Quests / Campaigns** for major series objectives
- **Side Quests** for individual books
- **Standard Bounties** for milestone or behavior-based actions fileciteturn1file0L34-L38

The current build includes **182 quests** defined in `csv/quest.csv`, and quest completion can award XP and gear. fileciteturn1file1L286-L287 fileciteturn1file1L329-L330

## 4. Wrapped Boss Event

Wrapped is now a major feature, not just a stats recap. It includes a year-end boss event where user progression and listening data drive combat outcomes. Key details include:

- Fixed base boss HP of 250,000 in the documented model
- Multi-strike damage logic tied to hours, books, authors, binge behavior, and Combat Power
- Survival checks using DEF and HP
- 9-slide narrative and visual Wrapped flow fileciteturn1file0L40-L44 fileciteturn1file1L289-L303

## 5. Library Discovery and Automation

New admin tooling supports library expansion and system maintenance:

- `audit_library.py`
- `generate_system_content.py`
- `rebalance_xp.py`
- loot and achievement audit utilities fileciteturn1file0L46-L49 fileciteturn1file1L305-L314

These tools help detect new content, generate themed system content, and rebalance the economy as the library grows.

---

## Architecture and UI Changes

The project now includes broader evaluator coverage, cover syncing, and a larger portal surface. New or expanded areas include:

- behavior/session evaluators
- streak logic
- narrator and author evaluators
- series-shape logic
- cover sync from Audiobookshelf
- expanded REST API for character, inventory, quest, boss, and Wrapped data
- volume-mountable static assets for UI editing without image rebuilds fileciteturn1file0L51-L55 fileciteturn1file1L74-L121

### Static file layout

The original version used root-level HTML. The current build moves UI files into a dedicated `pages/` structure with matching CSS and JS files, plus a dedicated `Wrapped/` subtree. fileciteturn1file1L170-L236

### Portal growth

The UI now includes many more pages beyond the original dashboard, leaderboard, and timeline. This includes character sheets, tier lists, quest browsers, loot compendiums, archives, landing pages, and Wrapped flows. fileciteturn1file1L13-L19 fileciteturn1file1L170-L236

---

## New Environment Variables

The current build adds a large set of new config options. The most important ones are below.

| Variable | Default | Purpose |
|---|---|---|
| `XP_START_TIMESTAMP` | `1767225600` | Global progression start date, defaulting to Jan 1, 2026 |
| `ACHIEVEMENTS_SCOPE` | `all_time` | Controls how achievements are evaluated |
| `PROGRESSION_SCOPE` | `since_xp_start` | Controls XP and level calculation scope |
| `VERIFY_LISTEN_THRESHOLD` | `0.80` | Fraction of duration that must be covered by sessions |
| `STRICT_VERIFICATION` | `false` | Forces verification rules before credit is granted |
| `REQUIRE_DURATION_FOR_CREDIT` | `true` | Requires known duration metadata |
| `REQUIRE_2026_SESSION_FOR_CREDIT` | `true` | Requires a qualifying 2026+ session for credit |
| `USER_XP_START_OVERRIDES_PATH` | `/data/json/user_xp_start.json` | Per-user XP start boundary overrides |
| `WRAPPED_BOSS_HP` | `250000` | Wrapped boss HP |
| `WRAPPED_YEAR` | `0` | Forced display year for Wrapped |
| `RUN_ACHIEVEMENT_BACKFILL` | `false` | One-shot achievement backfill trigger |
| `BACKFILL_ONCE_KEY` | `ach_backfill_v1` | Idempotency key for backfill |

These variables are central to how the upgraded build handles migration, verification, seasonal resets, and release prep. fileciteturn1file1L31-L47 fileciteturn1file2L31-L40

---

## New API Endpoints

The API surface is much larger than the original.

### Achievement Engine additions

Key new endpoints include:

- `GET /awards/api/character/{user_id}`
- `GET /awards/api/inventory/{user_id}`
- `POST /awards/api/gear/equip`
- `POST /awards/api/gear/spend-points`
- `POST /awards/api/gear/set-pin`
- `GET /awards/api/gear/quests`
- `GET /awards/api/gear/catalog`
- `GET /awards/api/gear/boss-stats?user_id=xxx`
- `GET /awards/api/gear/roster`
- `GET /awards/api/wrapped?user_id=xxx&year=2026`
- `POST /awards/api/sync-covers?force=false`
- `GET /awards/api/sync-covers/status`
- `GET /awards/api/limbo-chatter`
- `POST /awards/api/achievements/add`
- `GET /system/poll`
- `GET /awards/api/routes` fileciteturn1file1L49-L105

### abs-stats additions

New endpoints include:

- `GET /api/users/:userId/completions`
- `GET /api/users/:userId/streaks`
- `GET /api/users/:userId/listening-windows`
- `GET /api/users/:userId/achievement-progress`
- `GET /api/series-hours`
- `GET /api/series/:seriesId/books`
- `GET /api/users/:userId/wrapped-data`
- `GET /api/catalog`
- `GET /api/all-items`
- `GET /api/leaderboard` fileciteturn1file1L107-L120

---

## Achievement and Database Expansion

### Achievement growth

The category model expanded sharply:

| Category | Original Count | New Count |
|---|---|---|
| `campaign` | 0 | 163 |
| `quest` | 0 | 83 |
| `series_complete` | 1 | 17 |
| `meta` | 1 | 4 |
| All other categories | 55 | 55 |
| **Total** | **57** | **322** |

This shows how much of the new system is tied to content-specific progression and directed play. fileciteturn1file1L122-L132

### Database changes

The original engine used a single `awards` table. The current build adds multiple new tables:

- `user_inventory`
- `user_base_stats`
- `grandfather_done`
- `user_equipment`
- `user_pins` fileciteturn1file1L136-L168

These tables are designed to auto-create on first startup in the upgraded build, so no manual migration SQL should be required in the normal upgrade path. fileciteturn1file1L168-L168

---

## Data Layout Changes

The current direction standardizes operational data more cleanly.

### Key layout changes

- JSON support files are expected under a dedicated JSON folder
- SQLite state remains separate as `state.db`
- New structured content appears in `csv/` and `json/` folders
- Volume-mounted static UI files are supported for easier customization fileciteturn1file2L12-L20 fileciteturn1file1L238-L249

### Typical new data files

- `csv/loot.csv`
- `csv/quest.csv`
- `csv/xpcurve.csv`
- `json/user_xp_start.json`
- `json/limbo_chatter.json` fileciteturn1file1L238-L249

---

## Behavior Changes That Matter in Production

This upgrade changes how credit can be granted.

### Progression gating

- XP and loot can be constrained to a configured epoch
- Historical completions do not automatically count toward the new progression economy
- Per-user XP boundaries can override the global start date fileciteturn1file2L16-L20 fileciteturn1file1L31-L41

### Verification gating

- Strict verification can require real listening evidence, not just completion status
- Ratio thresholds can define how much session coverage is needed
- Duration metadata can be required before credit is granted fileciteturn1file1L36-L41 fileciteturn1file2L16-L20

### Progression economy tuning

- Gear drop logic is more structured
- Slot balancing and rotation logic were added
- Quest and loot logic are tuned beyond the original implementation fileciteturn1file2L16-L20

These controls can materially change who gets credit compared with legacy behavior, so they should be reviewed carefully during migration. fileciteturn1file2L42-L46

---

## Grandfathering and Existing Users

If you are upgrading an existing install, the current build includes one-time logic for users with pre-upgrade history.

### Expected upgrade behavior

1. Existing users go through a one-time grandfather routine
2. A legacy badge can be awarded, including the documented “Echo of the Ancestor” badge
3. Historical completions can seed starting inventory and level state
4. XP still remains scoped to the new progression rules unless you change config
5. Users may need to set a PIN before equipping gear or spending points fileciteturn1file0L57-L62 fileciteturn1file1L279-L287

The documented level squish for grandfather init is:

`level > 20 -> 20 + floor(sqrt(level - 20))` fileciteturn1file1L283-L284

---

## Upgrade Checklist

Use this as the practical migration path.

1. Back up your current `state.db` and JSON config files. fileciteturn1file2L34-L40
2. Pull the updated code and rebuild the image. fileciteturn1file1L315-L320
3. Move or standardize JSON support files into the expected JSON folder layout. fileciteturn1file2L12-L20
4. Review env vars before first startup, especially:
   - `XP_START_TIMESTAMP`
   - verification settings
   - `WRAPPED_YEAR`
   - backfill settings
   - per-user XP override path fileciteturn1file1L31-L47 fileciteturn1file2L34-L40
5. Start the upgraded containers. New database tables should be created automatically. fileciteturn1file1L136-L168
6. Allow the one-time grandfather routine to run for existing users. fileciteturn1file0L57-L62 fileciteturn1file1L279-L287
7. If you want historical achievements restored into a fresh DB, use the explicit backfill workflow. fileciteturn1file2L26-L30 fileciteturn1file1L44-L47
8. Validate the install by checking:
   - leaderboard totals
   - character progression
   - Wrapped pages
   - character sheet deep links
   - gear/inventory actions
   - cover sync behavior fileciteturn1file2L34-L40 fileciteturn1file1L319-L320
9. On Unraid, if `/app/static` is volume-mounted, copy the new `pages/` tree into appdata so the new UI loads without relying on stale files. fileciteturn1file1L319-L320

---

## Release Notes Guidance

If you are publishing this upgrade for other users or admins, make these points explicit:

- This is a major system upgrade, not a cosmetic fork
- Wrapped year and progression start are separate controls
- Strict verification can change who gets credit compared with older installs
- JSON file location conventions are stricter now
- The system now includes a progression economy with levels, gear, quests, and boss logic fileciteturn1file2L42-L46

---

## Final Notes

This upgraded build keeps the original project’s base concept intact, but it changes the operating model in a big way. The most important admin decisions now revolve around:

- how to scope progression
- how strict verification should be
- how to handle legacy users
- how to separate Wrapped presentation from actual progression reset logic

If you treat those four areas carefully during upgrade, the rest of the migration is straightforward. fileciteturn1file0L5-L10 fileciteturn1file1L31-L47 fileciteturn1file2L21-L30
