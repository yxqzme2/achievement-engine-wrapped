# Template Explanation

This document explains the container template variables and how they affect progression, Wrapped reporting, and verification.

## 1) Core Boundaries (Most Important)

### `XP_START_TIMESTAMP`
- Purpose: progression season boundary.
- Used by: XP, level, loot, progression credit filters.
- Meaning: only data at/after this timestamp counts for progression (plus per-user overrides in `user_xp_start.json`).

### `WRAPPED_YEAR`
- Purpose: admin-only Wrapped report year selector.
- Used by: Wrapped summary endpoints/reporting.
- Meaning: controls what year Wrapped displays.
- Important: does **not** reset progression XP/loot/levels.

## 2) Progression Verification Controls

### `STRICT_VERIFICATION`
- `true`: progression credit requires listening-proof checks.
- `false`: progression trusts completion timestamps.

### `VERIFY_LISTEN_THRESHOLD`
- Only used when `STRICT_VERIFICATION=true`.
- Formula: `timeListening / duration`.
- Example: `0.80` means at least 80% listened.

### `REQUIRE_DURATION_FOR_CREDIT`
- Only relevant in strict mode.
- If `true`, books with unknown duration are excluded.

### `REQUIRE_2026_SESSION_FOR_CREDIT`
- Legacy variable name kept for compatibility.
- Actual meaning: require at least one **in-scope** session (`>= XP_START_TIMESTAMP`) per credited book when strict mode is enabled.

## 3) Season Reset Policy

If you want a new progression season:
1. Set new `XP_START_TIMESTAMP`.
2. Delete `state.db`.
3. Start once with `RUN_ACHIEVEMENT_BACKFILL=true`.
4. Set `RUN_ACHIEVEMENT_BACKFILL=false` after that boot.

Why backfill: deleting DB wipes awards/inventory/progression state. Backfill restores historical achievements for non-progression dashboards/history views. Progression still remains gated by `XP_START_TIMESTAMP`.

## 4) Wrapped vs Progression

- Wrapped can be set to a year using `WRAPPED_YEAR`.
- Progression is still governed by `XP_START_TIMESTAMP` and strict verification settings.
- Older historical Wrapped years can appear incomplete if progression gating excludes that period; this is expected.

## 5) Template Sections (Quick Reference)

### Path Mappings
- `data`: host folder mounted to `/data` (DB/runtime files).
- `covers`: optional local cover path.
- `static`: HTML/CSS/JS override folder.

### Core System Variables
- `ABSSTATS_BASE_URL`, `POLL_SECONDS`, `TZ`.
- `XP_START_TIMESTAMP`: progression boundary.

### Logic & Thresholds
- `VERIFY_LISTEN_THRESHOLD`
- `STRICT_VERIFICATION`
- `REQUIRE_DURATION_FOR_CREDIT`
- `REQUIRE_2026_SESSION_FOR_CREDIT` (legacy name, in-scope session rule)
- `WRAPPED_BOSS_HP`
- `WRAPPED_YEAR` (admin-only Wrapped report year)

### Maintenance
- `RUN_ACHIEVEMENT_BACKFILL`
- `BACKFILL_ONCE_KEY`

### Notification Settings (SMTP)
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM`, `SMTP_TO_OVERRIDE`

### User & Dashboard Customization
- `USER_ICONS`
- `USER_ALIASES`

