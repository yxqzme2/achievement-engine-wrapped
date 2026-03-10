# Achievement Engine — Feature Reference

A full-featured achievement, progression, and LitRPG companion system for [Audiobookshelf](https://www.audiobookshelf.org/). It turns listening activity into achievements, XP, levels, loot, character builds, leaderboards, and a year-end Wrapped experience with a boss battle.

---

## Architecture

The stack is two services:

```text
┌──────────────────┐      ┌────────────────┐      ┌───────────────────┐
│  Audiobookshelf  │─────▶│   abs-stats    │─────▶│ achievement-engine│
│   (your server)  │      │  (port 3000)   │      │    (port 8000)    │
└──────────────────┘      └────────────────┘      └───────────────────┘
```

### `abs-stats`

Node.js service that connects to Audiobookshelf, gathers listening sessions, completions, user stats, series data, and related metadata, then exposes it through a simplified REST API. It also proxies Discord webhook traffic.

### `achievement-engine`

Python/FastAPI service that polls `abs-stats`, applies achievement and progression logic, stores runtime state in SQLite, manages gear and inventory, and serves the portal UI and APIs.

---

## Core Features

- LitRPG progression with XP, levels, and manual stat allocation
- Gear and loot system with equippable items and Combat Power
- Achievement engine covering milestones, campaigns, social overlap, streaks, behavior, and more
- Directive and quest-style tracking for books and series
- Wrapped year-end experience with a boss battle
- Backfill support for restoring historical achievements
- Web portal with dashboards, character sheets, leaderboards, archives, and timelines
- Discord and email notifications
- Library audit and content generation scripts for expanding the system over time

---

## Progression and Gear

### XP and Levels

Users earn XP from listening time, achievements, quests, and completions. The progression model is built for long-term growth. Levels grant unspent stat points that can be allocated into build choices.

Stat types:

- **STR** — attack scaling and some gear scaling
- **MAG** — magic-style power and some gear scaling
- **DEF** — defensive scaling for encounters
- **HP** — survivability, capped at 9,999

XP sources:

- 250 XP per listening hour
- 15,000 XP per completed book
- 100,000 XP per completed series
- Achievement XP based on rarity or difficulty

Level rewards:

- 5 stat points per level
- +20 bonus points every 10 levels
- Points are distributed through the character sheet UI
- Spending points and equipping gear are PIN protected

### Gear and Loot

Users earn themed gear from books, series, quests, and milestones. Gear affects Combat Power and character builds.

Equipment slots:

- Weapon
- Head
- Chest
- Neck
- Ring
- Trinket

Gear rarity tiers: Common, Uncommon, Rare, Epic, Legendary. Each rarity tier has a stat point budget, and no single stat may exceed 60% of that budget, forcing strategic build choices rather than pure min-maxing.

Loot data is managed through `csv/loot.csv`. Combat Power is a rolled-up metric based on level, stats, and equipped gear.

---

## Achievement System

The project supports a large rule-driven achievement library across milestone, behavior, campaign, title, author, narrator, streak, social, and system categories. Achievements are defined in JSON and reloaded during poll cycles.

Current achievement counts:

| Category | Count |
|---|---|
| `campaign` | 163 |
| `quest` | 83 |
| `series_complete` | 17 |
| `meta` | 4 |
| All other categories | 55 |
| **Total** | **322** |

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

Typical definition file path:

```text
/data/json/achievements.points.json
```

Workflow notes:

- Edit the JSON directly for production changes
- Use the **Forge** page (`/forge`) to validate trigger strings before rollout
- Use the backfill workflow to restore historical achievements after a DB reset

---

## Quests and Directives

Content is treated as quest-board style progression:

- **World Quests / Campaigns** — multi-book series objectives
- **Side Quests** — individual book completions
- **Standard Bounties** — milestone or behavior-based actions

The current build includes **182 quests** defined in `csv/quest.csv`. Quest completion awards XP and gear drops.

---

## Wrapped

`/wrapped` provides the year-end experience. It combines listening totals, top authors, monthly activity, listening style, character progression, and a multi-phase boss battle sequence.

The 9-slide flow:

1. Intro
2. Hours strike (Chronos)
3. Books strike (Arsenal)
4. Author summons (Magic)
5. Monthly breakdown
6. Personality / Binge DoT
7. Final Execute (Combat Power)
8. Gear showcase
9. Outro / result

Boss HP is calculated dynamically from the group's average Combat Power. The battle outcome depends on your actual listening stats, character build, and gear — not a fixed formula.

Important distinction:

- `WRAPPED_YEAR` controls what year Wrapped displays
- `XP_START_TIMESTAMP` controls when the progression economy starts
- Changing Wrapped display year does **not** reset XP, loot, or levels

See [DAMAGE_CALC.md](DAMAGE_CALC.md) for the full battle math.

---

## Web Portal

The portal is served on port `8000`. Pages include:

| Page | URL | Description |
|---|---|---|
| Landing Hub | `/landing` | Main gateway — overview and links to all sub-modules |
| Journal | `/journal` | Personal dashboard — level, XP bar, recent achievements |
| Champions | `/champions` | Global leaderboard ranked by achievement points |
| Timeline | `/timeline` | Live feed of achievements and loot drops across the group |
| Archives | `/archives` | Listening stats, monthly charts, genre analytics |
| Roster | `/roster` | All active listeners with CP and top gear at a glance |
| Character Sheet | `/character?userId=xxx` | Stat allocation, equipped gear, Combat Power |
| Tier List | `/tier` | Subjective tier ranking of books and series |
| Playlist | `/playlist` | Curated reading orders and thematic collections |
| Loot Compendium | `/loot` | Searchable database of every item — stats, rarity, flavor text |
| Quests | `/quests` | Active directives, campaign objectives, and guaranteed drops |
| Wrapped | `/wrapped` | Year-end animated boss battle experience |

---

## Admin Tools

The project includes a browser-based admin hub accessible after deployment.

| Page | URL | Purpose |
|---|---|---|
| Command Deck | `/admin` | Launcher for all admin sub-modules |
| Forge | `/admin/forge` | Build and validate achievement definitions |
| Armory | `/admin/loot` | Manually create and edit gear items |
| Bounties | `/admin/quest` | Issue quests linked to books and series |
| Ops | `/admin/ops` | Library scans, DB audits, economy sanity checks |
| Template | `/admin/template` | Manage notification templates and Unraid XML |

The `admin/` folder must be deployed under your served static path (e.g., `/data/static/admin` mapped to `/app/static/admin`).

Related backend scripts:

```bash
python audit_library.py
python generate_system_content.py
python audit_achievements.py
python rebalance_xp.py
```

---

## Notifications

### Discord

Create a webhook in the target Discord channel, then set `DISCORD_WEBHOOK_URL` (in `abs-stats`) or `DISCORD_PROXY_URL` (in `achievement-engine`).

### Email

Any SMTP provider works:

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

| Endpoint | Notes |
|---|---|
| `GET /health` | |
| `GET /system/poll` | |
| `GET /awards/api/awards` | |
| `GET /awards/api/progress` | |
| `GET /awards/api/character/{user_id}` | |
| `GET /awards/api/inventory/{user_id}` | |
| `GET /awards/api/gear/roster` | All users' slim character sheets, sorted by CP |
| `GET /awards/api/gear/boss-stats?user_id=xxx` | |
| `GET /awards/api/gear/quests` | |
| `GET /awards/api/gear/catalog` | |
| `GET /awards/api/wrapped?user_id=xxx&year=2026` | |
| `POST /awards/api/sync-covers` | Start background cover download from ABS |
| `GET /awards/api/sync-covers/status` | Poll sync progress |

### abs-stats

| Endpoint | Notes |
|---|---|
| `GET /api/users` | |
| `GET /api/completed` | |
| `GET /api/series` | |
| `GET /api/leaderboard` | |
| `GET /api/users/:userId/completions` | |
| `GET /api/users/:userId/streaks` | |
| `GET /api/users/:userId/wrapped-data` | |
| `GET /api/all-items` | Full ABS library with id + title |
| `GET /health` | |

---

## Persistent Data Layout

A typical mounted data folder should include:

| Path | Purpose |
|---|---|
| `state.db` | SQLite runtime database |
| `json/achievements.points.json` | Achievement definitions |
| `json/user_xp_start.json` | Per-user progression start overrides |
| `json/limbo_chatter.json` | Pre-launch system chatter messages |
| `csv/loot.csv` | Gear item definitions (183 items) |
| `csv/quest.csv` | Quest definitions (182 quests) |
| `csv/xpcurve.csv` | XP curve table |
| `covers/` | Synced cover art from ABS |
| `icons/` | Avatars and custom icons |

Override any file by placing a custom copy in your mapped `/data` path before startup.

---

## Troubleshooting

**User level looks too high**
- Check `XP_START_TIMESTAMP` and `user_xp_start.json`
- Check strict verification settings and session gating
- Verify the DB was not reset with the wrong progression boundary

**Character page shows "missing userId" or user not found**
- URL must include `?userId=<id>` (the true user ID, not the display name)
- Wrapped links must use the true user ID from abs-stats

**JSON edits do not take effect**
- Check file location and container path mapping
- Look for duplicate legacy copies at root or wrong paths
- Confirm the container was restarted after the file was updated

**Covers not appearing**
- Trigger a sync from the Tier List page or POST to `/awards/api/sync-covers`
- Check that the covers volume is mapped correctly in your compose or Unraid template

---

## Season Rollover

For a new progression season:

1. Set `WRAPPED_YEAR` to the display year
2. Update `XP_START_TIMESTAMP` to the new season start
3. Delete or replace `state.db` if you want a hard reset
4. Run one-time backfill (`RUN_ACHIEVEMENT_BACKFILL=true`) to restore historical achievements
5. Restart containers
6. Validate levels, loot behavior, Wrapped totals, and character links

See [TEMPLATE_EXPLANATION.md](TEMPLATE_EXPLANATION.md) for all variable details and [UPGRADE_GUIDE.md](UPGRADE_GUIDE.md) for migration from older builds.

---

## Unraid Volume Mappings

| Container Path | Host Path | Purpose |
|---|---|---|
| `/data` | `/mnt/user/appdata/achievement-engine` | Main persistent data |
| `/app/static` | `/mnt/user/appdata/achievement-engine/static` | Editable UI assets (no rebuild needed) |
| `/data/covers` | `/mnt/user/appdata/achievement-engine/covers` | Synced cover art |

With `/app/static` volume-mounted, HTML, CSS, and JS can be edited directly. Python or Node code changes require a full image rebuild.
