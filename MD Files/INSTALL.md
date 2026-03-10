# Achievement Engine — Install Reference

Four ways to get up and running. Options A and C use browser-based wizards — no prior config knowledge needed.

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

A browser-based form that generates both Unraid XML template files for you.

```bash
git clone https://github.com/yxqzme2/achievement-engine-wrapped.git
cd achievement-engine-wrapped
xdg-open template-builder.html &>/dev/null &   # Linux
open template-builder.html                      # macOS
```

1. Fill in your ABS URL, token(s), timezone, and any optional settings
2. Click **⬇ Download Both Templates** — you'll get:
   - `my-achievement-engine.xml`
   - `my-abs-stats.xml`
3. Copy both XML files into your Unraid user templates folder:
   ```text
   /boot/config/plugins/dockerMan/templates-user/
   ```
4. In Unraid, go to **Docker → Add Container** — both templates will appear
5. Install **abs-stats** first, then **achievement-engine**
6. Put both containers on the same Docker network
7. Apply and start both containers
8. Open `http://<unraid-ip>:8000`

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

## Cleanup / Reset (Testing)

Remove containers, images, and the cloned folder completely:

```bash
cd ~/achievement-engine-wrapped && sudo docker compose down --rmi all && cd ~ && rm -rf ~/achievement-engine-wrapped
```
