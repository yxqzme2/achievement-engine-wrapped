# Request Page — Implementation Notes

## Goal
A public-facing page where listeners can search for an audiobook series and submit a request to the admin to have it tracked in Release Radar. No automation — just a form that generates an email.

## User Flow
1. User navigates to `/request`
2. Types a series name into a search box
3. Results populate from the existing `/radar/api/search?q=` endpoint (Audible search — already built for admin/radar.html)
4. User clicks a result to select it (autofills series name, ASIN if available)
5. Optional free-text "notes" field (e.g. "I'm on book 3 and obsessed")
6. Clicks "Send Request" → opens their email client with a pre-filled subject + body via `mailto:`

## Tech Approach

### MVP: mailto (no backend changes)
- JS builds: `mailto:ADMIN_EMAIL?subject=Series Request: [name]&body=...`
- Body includes: series name, ASIN, Audible URL, user note
- `ADMIN_EMAIL` fetched from a new tiny endpoint: `GET /api/request-config` → `{"admin_email": "..."}`
- No SMTP, no auth, no risk of spam/abuse

### Future upgrade: SMTP POST
- `POST /request/submit` with JSON body `{series_name, asin, note}`
- Backend sends email via `smtplib` using env vars `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `ADMIN_EMAIL`
- Add rate limiting (e.g. 3 requests per IP per hour) to prevent abuse

## Files to Create / Modify

### New
- `static/request.html` — parchment theme, matches other public pages
- `static/admin/request.html` (optional future) — admin view of pending requests if we add a DB table

### Modified
- `app/main.py`
  - Add `GET /request` route → `FileResponse("request.html")`
  - Add `GET /api/request-config` → `{"admin_email": cfg.admin_email}`
- `app/config.py`
  - Add `admin_email: str = Field(default="")` to Settings
  - Add `admin_email=os.environ.get("ADMIN_EMAIL", "")` to `load_settings()`
- All 10 public nav pages — add `<a href="/request">Requests</a>` after Radar link:
  - `static/landing.html`, `dashboard.html`, `leaderboard.html`, `timeline.html`
  - `static/roster.html`, `playlist.html`, `tier.html`
  - `static/quest.html`, `loot.html`, `stats.html`
  - `static/radar.html`
- `abs.subdomain.conf` — add `request` to the nginx location regex
- All 5 installer files — add `ADMIN_EMAIL` env var field:
  - `portainer-stack-builder.html`
  - `setup-wizard.html` (root)
  - `template-builder.html` (root)
  - `static/admin/setup-wizard.html`
  - `static/admin/template.html`
- `README.md` — document the Request page

## request.html Structure
```
Nav (parchment theme, Request active)
Page header: "Series Request" / subtitle
Search bar + button
Results area (cards like admin/radar.html search results, but read-only style)
Selected series panel (autofilled, editable name field as fallback)
Notes textarea
"Send Request" button → mailto
Small note: "Opens your email client. Your request goes directly to the admin."
```

## Config
- `ADMIN_EMAIL` — email address for requests. Required for mailto to work.
  - If empty/unset, show a message: "Requests are not currently configured. Contact the admin directly."

## Nginx
Add `request` to the location regex in `abs.subdomain.conf`:
```nginx
location ~ ^/(landing|journal|...|radar|request|admin)(/.*)?$ {
```

## Notes / Decisions
- No login/auth required — this is intentionally open
- No DB table needed for MVP (email is the record)
- The search reuses `/radar/api/search` which already works — no new backend endpoint needed for search
- Keep the UI simple: search → pick → send. Don't overcomplicate with series metadata display
- Consider adding a "Can't find it? Enter manually" fallback for series not on Audible
