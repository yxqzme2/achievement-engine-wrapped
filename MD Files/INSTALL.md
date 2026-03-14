# Achievement Engine — Install Reference

Five ways to get up and running. Options A, C, and D use browser-based builders — no prior config knowledge needed.

---

## What You Need First (All Methods)

- A running [Audiobookshelf](https://www.audiobookshelf.org/) server
- An API token for each user you want to track
  - **ABS → Settings → Users → [username] → API Token**
- Docker installed (or Unraid for Option C)

---

## Option A — Web Wizard (Recommended for new users)

A browser-based form that generates your config files for you.

```bash
git clone https://github.com/yxqzme2/achievement-engine-wrapped.git
cd achievement-engine-wrapped
xdg-open setup-wizard.html &>/dev/null &   # Linux
open setup-wizard.html                      # macOS
```

1. Fill in your ABS URL, token(s), timezone, and any optional settings
2. Click **⬇ docker-compose.override.yml** and **⬇ env.txt**
3. Move the downloaded files into your project folder:

```bash
mv ~/Downloads/env.txt ~/achievement-engine-wrapped/.env
mv ~/Downloads/docker-compose.override.yml ~/achievement-engine-wrapped/docker-compose.override.yml
```

4. Build and start:

```bash
cd ~/achievement-engine-wrapped
sudo docker compose up --build -d
```

5. Open `http://localhost:8000`

---

## Option B — Terminal Script

An interactive script that asks questions and writes the config files for you.

```bash
git clone https://github.com/yxqzme2/achievement-engine-wrapped.git
cd achievement-engine-wrapped
bash install.sh
docker compose up --build -d
```

Open `http://localhost:8000`

> On Linux, use `sudo docker compose up --build -d` if you get a permission error.
> To avoid needing sudo permanently: `sudo usermod -aG docker $USER` then log out and back in.

---

## Option C — Unraid Template Builder (Recommended for Unraid users)

A browser-based form that generates both Unraid XML template files for you. No Docker needed on your local machine — your Unraid server handles everything.

### On Linux or macOS

```bash
git clone https://github.com/yxqzme2/achievement-engine-wrapped.git
cd achievement-engine-wrapped
xdg-open template-builder.html &>/dev/null &   # Linux
open template-builder.html                      # macOS
```

### On Windows

No terminal needed. Download the builder directly and open it:

1. Download **[template-builder.html](https://raw.githubusercontent.com/yxqzme2/achievement-engine-wrapped/main/template-builder.html)** — right-click the link → Save As
2. Double-click the saved file to open it in your browser

Or from PowerShell if you have Git installed:

```powershell
git clone https://github.com/yxqzme2/achievement-engine-wrapped.git
cd achievement-engine-wrapped
start template-builder.html
```

### After opening the builder (all platforms)

1. Fill in your ABS URL, token(s), timezone, and any optional settings
2. Click **⬇ Download Both Templates** — you'll get:
   - `my-achievement-engine.xml`
   - `my-abs-stats.xml`
3. Copy both XML files to your Unraid flash drive's user templates folder:
   - **Windows:** open `\\<unraid-ip>\flash\config\plugins\dockerMan\templates-user\` in Explorer and drop the files in
   - **Linux/macOS:** `scp my-*.xml root@<unraid-ip>:/boot/config/plugins/dockerMan/templates-user/`
4. In Unraid, go to **Docker → Add Container** — both templates will appear
5. Install **abs-stats** first, then **achievement-engine**
6. Put both containers on the same Docker network
7. Apply and start both containers
8. Open `http://<unraid-ip>:8000`

> **No git or terminal at all?** Skip the builder entirely — see Option C (manual) below. You only need the Unraid web UI.

### Option C (manual) — Unraid without the builder

If you prefer to configure templates directly in the Unraid UI:

1. In Unraid, go to **Docker → Add Container → Template Repositories**
2. Add this repo URL to your template list
3. Install **abs-stats** first, then **achievement-engine**
4. In the **abs-stats** template, set:
   - `ABS_URL` — your Audiobookshelf server address
   - `ABS_TOKEN` (single user) or `ABS_TOKENS` (multi-user: `alice:token1,bob:token2`)
5. In the **achievement-engine** template, set:
   - `TZ` — your timezone (e.g. `America/New_York`)
   - `ALLOWED_USERS` — comma-separated usernames (leave blank for all)
   - `USER_ALIASES` — optional friendly names (`alice:Alice,bob:Bob`)
6. Put both containers on the same Docker network
7. Apply and start both containers
8. Open `http://<unraid-ip>:8000`

---

## Option D — Portainer Stack Builder

Use this when the host is managed through Portainer and the user needs a single stack file instead of Compose overrides or Unraid XML templates.

### On any platform

Open the builder from the repo root:

- `portainer-stack-builder.html`
- Direct download: [portainer-stack-builder.html](https://raw.githubusercontent.com/yxqzme2/achievement-engine-wrapped/main/portainer-stack-builder.html)

### What it generates

1. A single Portainer stack YAML that defines:
   - `achievement-engine`
   - `abs-stats`
   - a shared Docker network
2. An optional `user_xp_start.json` file for per-user progression boundaries

### Steps

1. Fill in:
   - image names
   - container names
   - host ports
   - data/icons/covers/static paths
   - ABS URL and token(s)
   - SMTP settings if needed
   - wrapped/progression options
2. Copy or download the generated stack YAML
3. In Portainer, open **Stacks → Add stack**
4. Paste the YAML into the web editor
5. Deploy the stack
6. If using XP start overrides, place `user_xp_start.json` inside the achievement engine data folder before or after deploy
7. Open `http://<host-ip>:<dashboard-port>`

### Notes

- Put custom user icon files in the mapped icons folder before starting the stack
- If you use a static override, map it to the host path you want mounted at `/app/static`
- If covers are stored locally, point the covers path at the folder abs-stats and the engine should share

---

## What the Two Config Files Do

| File | Purpose |
|---|---|
| `.env` | Engine config — timezone, poll interval, users, SMTP, Wrapped settings |
| `docker-compose.override.yml` | ABS connection secrets — URL, tokens, Discord webhook |

Secrets stay in `docker-compose.override.yml` which is gitignored and never committed.

---

## Multi-User Quick Reference

Single user — one token:
```yaml
- ABS_TOKEN=your-token-here
```

Multiple users — one token per user:
```yaml
- ABS_TOKENS=alice:token1,bob:token2,carol:token3
```

Restrict to specific users only:
```env
ALLOWED_USERS=alice,bob
```

Friendly display names:
```env
USER_ALIASES=alice:Alice,bob:Bob
```

---

## First Steps After Install

Once both containers are running and you can reach the portal, do a cover sync before exploring the rest of the pages.

1. Open the **Tier List** page — `http://localhost:8000/tier` (or `http://<your-ip>:8000/tier` on Unraid)
2. Click the **Sync Covers** button
3. The engine connects to your Audiobookshelf server and downloads cover art for every book in your library
4. Wait for the progress indicator to finish — it runs in the background

**Why this matters:** Cover art is used across multiple pages — the Tier List, Wrapped slides, and other views pull from the synced covers folder. These screens will appear incomplete or show blank tiles until the first sync is done.

The sync saves covers to your data folder (`/data/covers`) and only needs to be re-run when you add new books or want to refresh existing art.

---

## User Avatars

User avatars are larger portrait images displayed in three places: the **Roster** page, the **Character Sheet / Inventory**, and the **gear combat win screen** in Wrapped. They are not configured through the template builder — you add them manually by placing image files in your data folder.

### Where to put them

Place avatar files in your appdata avatars folder:

- **Unraid:** `/mnt/user/appdata/achievement-engine/avatars/`
- **Docker Compose:** whatever host path you mapped to `/data` — create an `avatars/` subfolder inside it

### Naming convention

Files must be named after the ABS username in **lowercase**. For a user named `Alice`:

| File | Used by |
|---|---|
| `alice.png` | Roster, Character Sheet, Wrapped win screen |
| `alice.gif` | Roster only (animated avatars) |
| `win-alice.png` | Wrapped win screen only — optional hero/victory portrait |

### Format support and fallback chain

Each surface tries formats in order and falls back gracefully:

**Roster**
1. `username.gif`
2. `username.png`
3. ABS profile picture (proxied automatically)
4. First letter of username displayed as a text initial

**Character Sheet / Inventory**
1. `username.png`
2. ABS profile picture
3. Image element removed (no placeholder shown)

**Wrapped gear win screen**
1. `win-username.png` *(optional victory portrait — separate from the standard avatar)*
2. `username.png`
3. ABS profile picture
4. First letter of username displayed as a text initial

### Supported formats

| Format | Roster | Character Sheet | Win Screen |
|---|---|---|---|
| PNG | ✅ | ✅ | ✅ |
| GIF | ✅ (animated) | ❌ | ❌ |
| SVG | ❌ | ❌ | ❌ |

### Image size

No strict size requirements — CSS controls the display dimensions on each page. A **square image** works best across all three surfaces. Recommended minimum: **256×256 px** for clean display at all screen sizes.

### The win portrait

`win-username.png` is optional. If present, it replaces the standard avatar specifically on the Wrapped boss battle win screen — useful if you want a more dramatic or styled victory pose separate from the everyday roster portrait. If not found, the system falls back to `username.png`.

---

## Cleanup / Reset (Testing)

Remove containers, images, and the cloned folder completely:

```bash
cd ~/achievement-engine-wrapped && sudo docker compose down --rmi all && cd ~ && rm -rf ~/achievement-engine-wrapped
```
