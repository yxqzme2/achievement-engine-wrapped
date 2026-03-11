# Achievement Engine — Listener's Sanctum for Audiobookshelf

A full-featured achievement, progression, and LitRPG companion system for [Audiobookshelf](https://www.audiobookshelf.org/). It turns listening activity into achievements, XP, levels, loot, character builds, leaderboards, and a year-end Wrapped experience with a boss battle. It is built for people who want to turn audiobook listening into a persistent RPG-style system for themselves, their family, or a shared listening group.

---

## What This Project Does

Achievement Engine adds a game layer on top of your Audiobookshelf server. As users listen and complete books, the system can:

- Award achievements for milestones, streaks, behavior patterns, series completions, shared listening, and themed events
- Track progression with XP, levels, unspent stat points, and character growth
- Drop loot and equip gear into build-defining slots
- Show dashboards, timelines, leaderboards, quests, loot catalogs, and character sheets
- Run a Wrapped year-in-review sequence with animated combat and community boss damage
- Send Discord and email notifications when achievements or rewards are earned

---

## Architecture

The stack is built around two services:

```text
┌──────────────────┐      ┌───────────┐      ┌───────────────────┐
│  Audiobookshelf  │─────▶│ abs-stats │─────▶│ achievement-engine│
│   (your server)  │      │ (port 3000)│     │    (port 8000)    │
└──────────────────┘      └───────────┘      └───────────────────┘
```

### `abs-stats`

Node.js service that connects to Audiobookshelf, gathers listening sessions, completions, user stats, series data, and related metadata, then exposes it through a simplified REST API. It can also proxy Discord webhook traffic.

### `achievement-engine`

Python/FastAPI service that polls `abs-stats`, applies achievement and progression logic, stores runtime state in SQLite, manages gear and inventory, and serves the portal UI and APIs.

---

## Core Features

- LitRPG progression with XP, levels, and manual stat allocation
- Gear and loot system with equippable items and Combat Power
- Achievement engine covering milestones, campaigns, social overlap, streaks, behavior, and more
- Directive or quest-style tracking for books and series
- Wrapped year-end experience with boss battle logic
- Backfill support for restoring historical achievements
- Web portal with dashboards, character sheets, leaderboards, archives, and timelines
- Discord and email notifications
- Library audit and content generation scripts for expanding the system over time

---

## Prerequisites

For all installation methods:

- A running [Audiobookshelf](https://www.audiobookshelf.org/) server
- An Audiobookshelf API token for each user you want to track
- Docker and Docker Compose, or Unraid if you are installing through templates

For Unraid:

- Unraid 6.10 or later
- Community Applications plugin installed

Get each user's API token from:

**Audiobookshelf → Settings → Users → [user] → API Token**

If you are upgrading from an older version, add an upgrade note or separate `UPGRADE.md` so users can handle path, DB, or config changes cleanly.

---

## Quick Start

### Option A — Docker Compose (interactive setup)

```bash
git clone https://github.com/yxqzme2/achievement-engine.git
cd achievement-engine
chmod +x setup.sh
./setup.sh
docker compose up -d
```

The setup script prompts for your Audiobookshelf URL, API tokens, and optional notification settings. It generates the needed local config for startup.

After startup, open:

```text
http://localhost:8000
```

### Option B — Docker Compose (manual setup)

```bash
git clone https://github.com/yxqzme2/achievement-engine.git
cd achievement-engine
cp .env.example .env
# Edit .env
docker compose up -d
```

Then open:

```text
http://localhost:8000
```

### Option C — Unraid

1. Copy both XML templates from `unraid-templates/` into:

```text
/boot/config/plugins/dockerMan/templates-user/
```

2. Install **abs-stats** first.
3. Install **achievement-engine** second.
4. Put both containers on the same Docker network.
5. Open port `8000` after the first poll cycle completes.

---

## Multi-User Setup

For multi-user tracking, define tokens like this:

```yaml
environment:
  - ABS_TOKENS=alice:token1,bob:token2,carol:token3
```

To limit tracking to selected users:

```yaml
environment:
  - ALLOWED_USERNAMES=alice,bob
```

Set friendly names and avatar mappings like this:

```env
USER_ALIASES=alice:Alice,bob:Bob
USER_ICONS=alice:/icons/alice.png,bob:/icons/bob.png
```

Place avatar files in your icons path or mapped data folder.

---

## Progression and Gear

### XP and Levels

Users earn XP from listening time, achievements, quests, and completions. The progression model is built for long-term growth. Levels grant unspent stat points that can be allocated into build choices.

Common stat types include:

- STR
- MAG
- DEF
- HP

### Gear and Loot

Users can earn themed gear from books and series. Gear affects Combat Power and character builds.

Common gear slots:

- Weapon
- Head
- Chest
- Neck
- Ring
- Trinket

### PIN Note

Equipped gear can be swapped for min maxxing. Users may need to set a PIN before spending stat points or changing equipment from the character sheet.

---

## Achievement System

The project supports a large rule-driven achievement library across milestone, behavior, campaign, title, author, narrator, streak, social, and system categories. Achievements are defined in JSON and reloaded by the engine during poll cycles.

Example achievement definition:

```json
{
  "id": "my_achievement",
  "achievement": "My Achievement",
  "title": "My Achievement",
  "category": "milestone_books",
  "trigger": "finish 10 books",
  "points": 100,
  "rarity": "common",
  "flavorText": "Ten books in the bag.",
  "iconPath": "/icons/myicon.png"
}
```

Typical source file:

```text
/data/json/achievements.points.json
```

Helpful workflow notes:

- Edit the JSON directly for production changes
- Use a CSV builder workflow if you want easier bulk editing
- Use the **Forge** page to validate trigger strings before rollout
- Keep achievement definitions in a consistent mounted path

---

## Wrapped

`/wrapped` provides the year-in-review experience. It combines listening totals, top authors, monthly activity, listening style, character progression, and a boss battle sequence.

Important distinction:

- `WRAPPED_YEAR` controls what Wrapped displays
- `XP_START_TIMESTAMP` controls when progression economy starts
- Changing Wrapped alone does **not** reset XP, loot, or levels

---

## Web Portal

The portal is served from port `8000`. Common pages include:

| Page | URL |
|---|---|---|
| Landing Hub | `/` or `/landing` |
| Journal | `/journal` |
| Champions | `/champions` |
| Timeline | `/timeline` |
| Archives | `/archives` |
| Roster | `/roster` |
| Character Sheet | `/character?userId=xxx` |
| Tier List | `/tier` |
| Playlist | `/playlist` |
| Loot Compendium | `/loot` |
| Quests | `/quests` |
| Wrapped | `/wrapped` | 

Page description

  🌐 Landing Hub (/landing)
  The primary uplink gateway. This portal serves as the initial handshake between the listener and The System, providing
  a high-level overview of the 2026 Shift and immediate access to all progression sub-modules.


  📓 Journal (/journal)
  A personalized record of deeds. This dashboard tracks your current Level, XP progression, and recently unlocked
  milestones, serving as the definitive log of your journey through the library.

  🏆 Champions (/champions)
  The Apex Registry. A global leaderboard that ranks listeners by total achievement points and completion density. Only
  those with the highest listening endurance earn a spot at the top of the stack.


  ⏳ Timeline (/timeline)
  The Chronos Feed. A real-time stream of system events documenting every achievement earned and piece of loot claimed
  by listeners across the entire network.


  📊 Archives (/archives)
  Metric Deep-Dive. Access the historical data stores to visualize your listening habits through interactive charts,
  monthly hour distributions, and comprehensive genre analytics.

  👥 Roster (/roster)
  The Subject Registry. A public directory of all active listeners. This view allows for comparison of Combat Power (CP)
  and a quick inspection of the top gear currently equipped by the collective.


  👤 Character Sheet (/character)
  The Identity Matrix. The core interface for managing your RPG progression. Here, listeners can distribute stat points
  earned from leveling, review their base attributes, and manage their equipped inventory to optimize Combat Power.


  📉 Tier List (/tier)
  The Evaluator. A subjective ranking interface that allows listeners to categorize completed series and books into
  tiers, establishing a personal "Source of Truth" for library quality.

  🎼 Playlist (/playlist)
  Sequential Data Streams. A browser for curated book collections that allows listeners to track their progress through
  specific reading orders and thematic groupings.


  📦 Loot Compendium (/loot)
  The Artifact Registry. A complete, searchable database of every item recognized by The System, including rarity tiers,
  stat budgets, and unique flavor text for all gear in the engine.


  🗺️ Quests (/quests)
  The Directive Board. A log of active World Quests and Side Bounties. Listeners can inspect multi-book objectives,
  review the fiction behind each directive, and identify the guaranteed loot rewards tied to completion.


  ⚔️ Wrapped (/wrapped)
  The Final Reckoning. A comprehensive year-in-review experience that synthesizes twelve months of listening data into a
  tactical combat simulation. Use your hard-earned stats and gear to survive a final encounter with the System
  Administrator.

---

## Configuration

### Achievement Engine `.env`

There are included HTML files to help you deploy the template (unraid) or script (docker compose) 

These are the main variables most users need to understand:

| Variable | Example / Default | What it does |
|---|---|---|
| `ABSSTATS_BASE_URL` | `http://abs-stats:3000` | URL for the `abs-stats` service |
| `POLL_SECONDS` | `300` | Poll interval in seconds |
| `STATE_DB_PATH` | `/data/state.db` | SQLite runtime database path |
| `ACHIEVEMENTS_PATH` | `/data/json/achievements.points.json` | Achievement definition file |
| `XP_START_TIMESTAMP` | `1767225600` | Start boundary for progression economy |
| `WRAPPED_YEAR` | `0` | `0` for current year, or force a specific year |
| `RUN_ACHIEVEMENT_BACKFILL` | `false` | One-time historical restore of achievements |
| `BACKFILL_ONCE_KEY` | `ach_backfill_v1` | Change this to force another one-time backfill |
| `STRICT_VERIFICATION` | `false` | Require stronger listening evidence before credit |
| `VERIFY_LISTEN_THRESHOLD` | `0.80` | Completion verification ratio |
| `REQUIRE_DURATION_FOR_CREDIT` | `true` | Require known duration metadata |
| `REQUIRE_2026_SESSION_FOR_CREDIT` | `true` | Optional session gating for progression credit |
| `USER_XP_START_OVERRIDES_PATH` | `/data/json/user_xp_start.json` | Per-user progression start dates |
| `USER_ALIASES` | empty | Friendly display names |
| `USER_ICONS` | empty | Avatar/icon mappings |
| `DISCORD_PROXY_URL` | empty | Discord notification endpoint |
| `SMTP_HOST` and related SMTP vars | empty | Email notification settings |

### `abs-stats` Environment

| Variable | Example / Default | What it does |
|---|---|---|
| `ABS_URL` | `http://audiobookshelf:80` | Audiobookshelf server URL |
| `ABS_TOKEN` | required for single-user setups | API token |
| `ABS_TOKENS` | empty | Multi-user token mapping |
| `ENGINE_URL` | `http://localhost:8000` | Achievement engine URL |
| `ALLOWED_USERNAMES` | all users | Optional allowlist |
| `DISCORD_WEBHOOK_URL` | empty | Discord webhook |
| `PORT` | `3000` | Service port |

---

## Required Persistent Data

A typical persistent data layout should include:

- `state.db`
- `avatars/`
- `covers/`
- `csv/`
- `json/`
- `static/` or `pages/`

Operational JSON files should live in a consistent JSON directory, including:

- `achievements.points.json`
- `user_xp_start.json`
- `limbo_chatter.json`

Common data files and paths:

| File | Typical Path | Purpose |
|---|---|---|
| `achievements.points.json` | `/data/json/achievements.points.json` | Achievement definitions |
| `state.db` | `/data/state.db` | Runtime database |
| `loot.csv` | `/app/csv/loot.csv` or `/data/csv/loot.csv` | Loot balance data |
| `quest.csv` | `/app/csv/quest.csv` or `/data/csv/quest.csv` | Quest definitions |
| `xpcurve.csv` | `/app/csv/xpcurve.csv` | XP curve |
| `user_xp_start.json` | `/data/json/user_xp_start.json` | Per-user progression overrides |
| `covers/` | `/data/covers/` | Synced cover art |
| `icons/` | `/data/icons/` | Avatars and icons |

Override data files by placing your custom copies in the mapped `/data` paths first.

---

## Notifications

### Discord

Create a webhook in the target Discord channel, then pass it into your config through `DISCORD_WEBHOOK_URL` or `DISCORD_PROXY_URL`, depending on your setup.

### Email

Any SMTP provider can work. Example:

```env
SMTP_HOST=smtp.mailgun.org
SMTP_PORT=587
SMTP_USERNAME=postmaster@your-domain.com
SMTP_PASSWORD=your-smtp-password
SMTP_FROM=achievements@your-domain.com
USER_EMAILS=alice:alice@example.com,bob:bob@example.com
```

Use `SMTP_TO_OVERRIDE` during testing to route all mail to a single inbox.

---

## API Reference

### Achievement Engine

Useful endpoints include:

- `GET /health`
- `GET /system/poll`
- `GET /awards/api/awards`
- `GET /awards/api/progress`
- `GET /awards/api/definitions`
- `GET /awards/api/ui-config`
- `GET /awards/api/character/{user_id}`
- `GET /awards/api/inventory/{user_id}`
- `GET /awards/api/gear/roster`
- `GET /awards/api/gear/boss-stats`
- `GET /awards/api/gear/quests`
- `GET /awards/api/gear/catalog`
- `GET /awards/api/wrapped`
- `POST /awards/api/sync-covers`
- `GET /awards/api/sync-covers/status`

### abs-stats

Useful endpoints include:

- `GET /api/users`
- `GET /api/usernames`
- `GET /api/completed`
- `GET /api/series`
- `GET /api/item/:id`
- `GET /api/listening-sessions`
- `GET /api/listening-time`
- `GET /api/leaderboard`
- `GET /api/users/:userId/completions`
- `GET /api/users/:userId/streaks`
- `GET /api/users/:userId/wrapped-data`
- `GET /health`

---

## Automation and Admin Tools

The project includes a browser-based admin hub and backend script triggers for day-to-day operations.

### How to access admin pages after deployment

Serve the app from your container (not `file://`) and use:

- `http://<unraid-ip>:8000/admin` (hub)
- `http://<unraid-ip>:8000/admin/forge`
- `http://<unraid-ip>:8000/admin/loot`
- `http://<unraid-ip>:8000/admin/quest`
- `http://<unraid-ip>:8000/admin/ops`
- `http://<unraid-ip>:8000/admin/template`

Notes:

- The `admin` folder must be deployed under your served static path (for example `/data/static/admin` mapped to `/app/static/admin`).
- If your container/compose uses a different host port, replace `8000` with that port.

### Admin pages and purpose

- **Hub** (`/admin`):
  📡 Command Deck (index.html)
  The central administrative uplink. A unified launcher for all sub-modules, providing high-level system status and
  rapid access to the specialized forging and operation centers.
- **Forge** (`/admin/forge`):
  ⚡ Achievement Forge (forge.html)
  The primary station for milestone fabrication. Use this interface to construct achievement definitions, calibrate
  point values, and validate the logic triggers that reward users for their listening behavior.
- **Armory** (`/admin/loot`):
 ⚔️ Item Armory (loot.html)
  Where artifacts are tempered. Manually forge new pieces of gear by defining primary stats (STR/MAG/DEF/HP), rarity
  tiers, and flavor text. All items created here are automatically synchronized with the global Loot Compendium.
- **Bounties** (`/admin/quest`):
 📜 Bounty Board (quest.html)
  The hub for manual Directives. Issue specific Side Quests or World Campaigns by linking book and series completions to
  massive XP yields and guaranteed loot drops, overriding the standard drop logic for targeted objectives.
- **Ops** (`/admin/ops`):
  🌀 System Core (ops.html)
  The terminal for low-level maintenance protocols. Execute critical scripts including Library Discovery (ABS scanning),
  Database Audits, and Sanity Checks to ensure the integrity of user progression and the XP economy.
- **Template** (`/admin/template`):
  📝 Template Manager (template.html)
  The linguistic nexus of the engine. Manage the structural blueprints for system notifications and Unraid XML
  templates, ensuring all automated proclamations maintain the appropriate tone of "System Snark."


### Related script examples

- `python audit_library.py`
- `python generate_system_content.py`
- `python audit_achievements.py`

---

## Season Rollover Notes

For a new season or year:

1. Set `WRAPPED_YEAR`
2. Set `XP_START_TIMESTAMP`
3. Reset or replace `state.db` if you want a hard reset
4. Run one-time backfill if you want historical achievements restored
5. Restart or rebuild
6. Validate user levels, loot behavior, Wrapped totals, and character links

This matters because Wrapped display year and progression boundaries are separate controls.

---

## Unraid Notes

Typical Unraid volume mappings include:

| Container Path | Host Path | Purpose |
|---|---|---|
| `/data` | `/mnt/user/appdata/achievement-engine` | Main persistent data |
| `/app/static` | `/mnt/user/appdata/achievement-engine/static` | Editable UI assets |
| `/data/covers` | `/mnt/user/appdata/achievement-engine/covers` | Synced cover art |

If your build uses a mounted `/app/static`, you can edit HTML, CSS, and JS directly without a rebuild. If you change Python or Node code, rebuild the affected image.

---

## Troubleshooting

### User level looks too high

Check:

- `XP_START_TIMESTAMP`
- `user_xp_start.json`
- strict verification settings
- session gating
- whether the DB was reset with the wrong boundary setup

### Character page says missing `userId` or user not found

Check:

- the URL includes `?userId=<id>`
- Wrapped links are using the true user ID, not the display name
- the stats source actually contains that user ID

### JSON edits do not take effect

Check:

- file location
- container path mapping
- duplicate legacy copies
- that the restart or rebuild actually used the updated file

---

## Maintainer Notes

- Keep config paths documented and consistent
- Do not let the app silently fall back to stale root-level JSON files
- Make sure README, templates, and live behavior match
- Call out new env vars and path changes in release notes
- Document rollover behavior clearly for each season or year

---

## License

MIT

