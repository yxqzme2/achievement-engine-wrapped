# Achievement Engine — Wrapped

A LitRPG achievement and progression companion for [Audiobookshelf](https://www.audiobookshelf.org/). Turns listening activity into XP, levels, gear, quests, leaderboards, and a year-end animated boss battle — all driven by real listening data.

---

## Quick Start

See **[INSTALL.md](MD%20Files/INSTALL.md)** for full details. Three browser-based builders are included — no prior config knowledge needed.

### Docker Compose — Web Wizard

```bash
git clone https://github.com/yxqzme2/achievement-engine-wrapped.git
cd achievement-engine-wrapped
open setup-wizard.html            # macOS
xdg-open setup-wizard.html &     # Linux
start setup-wizard.html           # Windows
```

Fill in your ABS URL and token(s), download the two config files, then:

```bash
sudo docker compose up --build -d
```

Open `http://localhost:8000`

### Unraid — Template Builder

On Windows, you can also [download template-builder.html directly](https://raw.githubusercontent.com/yxqzme2/achievement-engine-wrapped/main/template-builder.html) — no git needed.

```bash
git clone https://github.com/yxqzme2/achievement-engine-wrapped.git
cd achievement-engine-wrapped
open template-builder.html        # macOS
xdg-open template-builder.html & # Linux
start template-builder.html       # Windows
```

Fill in your settings, download both XML files, and drop them onto your Unraid flash drive to install as container templates. See **[INSTALL.md](MD%20Files/INSTALL.md)** for the full Windows path.

### Portainer — Stack Builder

If your user runs Portainer instead of raw Compose or Unraid templates, use the dedicated stack builder:

- [portainer-stack-builder.html](portainer-stack-builder.html)
- [Direct download](https://raw.githubusercontent.com/yxqzme2/achievement-engine-wrapped/main/portainer-stack-builder.html)

It generates:
- One Portainer-ready stack YAML for both containers, defaulting to portable Docker named volumes
- An optional `user_xp_start.json` file for per-user progression start dates

Open the builder, keep the default named-volume mode for the most portable stack, or switch to bind mounts if you need host-specific paths, then paste the generated YAML into **Portainer → Stacks → Add stack**.

---

## What's Inside

| Area | Details |
|---|---|
| **322 achievements** | Milestones, campaigns, streaks, social overlap, behavior, and more |
| **LitRPG progression** | XP, levels, stat points (STR / MAG / DEF / HP), gear, and Combat Power |
| **Year-end Wrapped** | 9-slide animated boss battle driven by your real listening data and gear |
| **17+ portal pages** | Dashboard, character sheet, leaderboard, quests, loot compendium, tier list, Release Radar, Series Request |
| **Release Radar** | Audiobook series tracker — upcoming releases, `.ics` calendar feed, Discord alerts |
| **Series Request** | Users search Audible and submit series requests directly to the admin via SMTP email |
| **Multi-user** | Track a family or group with individual API tokens |
| **User avatars** | Per-user portrait images on the Roster, Character Sheet, and Wrapped win screen |
| **Notifications** | Discord webhook and SMTP email |

---

## Requirements

- Running [Audiobookshelf](https://www.audiobookshelf.org/) server
- API token per user &nbsp;(**ABS → Settings → Users → [user] → API Token**)
- Docker and Docker Compose, or Unraid with Community Applications

---

## Release Radar

Release Radar tracks upcoming and recent audiobook releases across your favourite series. It polls the Audible public catalog API automatically and cross-checks releases against your ABS library to flag books you haven't added yet.

**Key features:**
- Auto-seeds tracked series from your existing ABS library on startup
- Polls Audible every 12 hours by default (`RADAR_CHECK_INTERVAL_HOURS` env var)
- Grid view (upcoming / recent) and monthly calendar view
- Subscribe to a live `.ics` feed in any calendar app (Google Calendar, Outlook, Apple Calendar)
- Discord notifications when new releases are discovered
- "Released / Missing" badge for audiobooks not yet in your ABS library

**Routes:**
- `GET /radar` — public release view (grid + calendar)
- `GET /admin/radar` — management page (track series, sync, check now)
- `GET /radar/releases.ics` — calendar feed subscription
- `GET /radar/api/releases` — JSON releases (query: `days_back=365`)
- `GET /radar/api/series` — tracked series list
- `POST /radar/api/series` — add a series
- `DELETE /radar/api/series/{id}` — stop tracking a series
- `POST /radar/api/seed-from-abs` — sync series from ABS library
- `POST /radar/api/check` — trigger a manual release check
- `GET /radar/api/search?q=` — search Audible for series candidates
- `GET /radar/api/library-check` — cross-check releases against ABS

**New env vars:**
- `RADAR_CHECK_INTERVAL_HOURS` (default: `12`) — how often the background worker polls Audible
- `ADMIN_EMAIL` — admin email address; required for the Series Request page to send emails

**Storage:** all radar data is stored in the existing `state.db` SQLite database (`tracked_series`, `radar_releases`, `radar_ignored_series` tables).

---

## Series Request

The Series Request page (`/request`) lets users search the Audible catalog and submit a request for a new series to be tracked in Release Radar. No admin access required — it's a public-facing form.

**How it works:**
1. User searches for a series by name — results come from the same Audible search used by the admin radar page
2. User selects a result (or types a name manually if not found)
3. User optionally adds a note, then clicks **Send Request**
4. The server sends an email to the admin via the existing SMTP configuration, including the series cover art

**Requirements:** `ADMIN_EMAIL` env var set, and SMTP configured (`SMTP_HOST`, `SMTP_FROM`, etc.). If either is missing the page shows a notice instead of the form.

**Routes:**
- `GET /request` — public request form
- `POST /request/submit` — submit handler (server-side SMTP send)
- `GET /api/request-config` — returns `smtp_enabled` flag used by the frontend

---

## Documentation

| Doc | What it covers |
|---|---|
| [INSTALL.md](MD%20Files/INSTALL.md) | Web wizard, terminal script, and Unraid install paths |
| [portainer-stack-builder.html](portainer-stack-builder.html) | Browser-based Portainer stack generator for both containers |
| [FEATURES.md](MD%20Files/FEATURES.md) | Portal pages, achievement system, gear, Wrapped, API reference |
| [TEMPLATE_EXPLANATION.md](MD%20Files/TEMPLATE_EXPLANATION.md) | Every environment variable explained |
| [UPGRADE_GUIDE.md](MD%20Files/UPGRADE_GUIDE.md) | Migrating from the original Achievement Engine |
| [DAMAGE_CALC.md](MD%20Files/DAMAGE_CALC.md) | Wrapped boss battle damage formulas |

---

## License

MIT
