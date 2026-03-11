# Achievement Engine — Wrapped

A LitRPG achievement and progression companion for [Audiobookshelf](https://www.audiobookshelf.org/). Turns listening activity into XP, levels, gear, quests, leaderboards, and a year-end animated boss battle — all driven by real listening data.

---

## Quick Start

See **[INSTALL.md](MD%20Files/INSTALL.md)** for full details. Two browser-based wizards are included — no prior config knowledge needed.

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

---

## What's Inside

| Area | Details |
|---|---|
| **322 achievements** | Milestones, campaigns, streaks, social overlap, behavior, and more |
| **LitRPG progression** | XP, levels, stat points (STR / MAG / DEF / HP), gear, and Combat Power |
| **Year-end Wrapped** | 9-slide animated boss battle driven by your real listening data and gear |
| **14+ portal pages** | Dashboard, character sheet, leaderboard, quests, loot compendium, tier list |
| **Multi-user** | Track a family or group with individual API tokens |
| **User avatars** | Per-user portrait images on the Roster, Character Sheet, and Wrapped win screen |
| **Notifications** | Discord webhook and SMTP email |

---

## Requirements

- Running [Audiobookshelf](https://www.audiobookshelf.org/) server
- API token per user &nbsp;(**ABS → Settings → Users → [user] → API Token**)
- Docker and Docker Compose, or Unraid with Community Applications

---

## Documentation

| Doc | What it covers |
|---|---|
| [INSTALL.md](MD%20Files/INSTALL.md) | Web wizard, terminal script, and Unraid install paths |
| [FEATURES.md](MD%20Files/FEATURES.md) | Portal pages, achievement system, gear, Wrapped, API reference |
| [TEMPLATE_EXPLANATION.md](MD%20Files/TEMPLATE_EXPLANATION.md) | Every environment variable explained |
| [UPGRADE_GUIDE.md](MD%20Files/UPGRADE_GUIDE.md) | Migrating from the original Achievement Engine |
| [DAMAGE_CALC.md](MD%20Files/DAMAGE_CALC.md) | Wrapped boss battle damage formulas |

---

## License

MIT
