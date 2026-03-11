# Achievement Engine Upgrade Guide (Original -> Current)

This document explains what changed from the original GitHub project to this upgraded build.

## 1) What Stayed the Same

- Core concept: `abs-stats` provides listening/reading data and `achievement-engine` turns it into achievements, dashboards, and progression.
- Main deployment model: Docker/Unraid with persistent appdata mounts.
- Achievement points still come from JSON rule sets and are surfaced in leaderboard/character views.

## 2) Major Additions

- Full LitRPG-style progression layer:
  - XP and level progression
  - Loot drops and inventory
  - Gear slots and equipped character state
- Wrapped experience expanded into themed slides/pages with narrative/stat visuals.
- Verification and progression gating controls were added (strict verification modes, ratio thresholds, timestamp boundaries).
- Per-user XP start boundary support via JSON overrides.
- More admin controls in container template variables (behavior tuning without code edits).

## 3) Data Layout Changes

- JSON support files are now standardized under a dedicated JSON folder path.
- Project direction is to keep all operational JSON files together (instead of mixed root placement).
- Persistent SQLite state remains separate as `state.db`.

## 4) Behavior Changes (Progression)

- Progression can be constrained to start from a configured epoch (`XP_START_TIMESTAMP`), so historical completions do not automatically count toward XP/loot/levels.
- Optional strict verification can require evidence of actual listening (not only completion status).
- Book/quest credit and loot logic has been tuned beyond the original implementation, including slot balancing work and rotation behavior.

## 5) Wrapped-Year Support

- Wrapped reporting now supports a selected year through container config.
- Important: wrapped-year filtering and progression reset are different concerns:
  - Wrapped year controls what Wrapped pages show.
  - XP/loot/level reset boundaries are controlled by progression settings and/or DB lifecycle.

## 6) New Operational Workflow

- Build/deploy workflow includes custom sync/build scripts used in your environment.
- Backfill and reset operations are now explicit admin actions:
  - Backfill restores achievements/history data into a fresh DB.
  - XP boundary settings control which events impact progression economy.

## 7) Template/Config Evolution

- Container template now includes expanded variable descriptions to guide non-developer admins.
- Variables related to verification, timestamp boundaries, and wrapped-year behavior are documented for release prep.

## 8) Upgrade Checklist (From Original Install)

1. Back up current `state.db` and JSON config files.
2. Move/standardize JSON files into the expected JSON folder for this build.
3. Verify container env vars match desired policy:
   - XP boundary
   - strict verification flags
   - wrapped year
4. If doing a seasonal reset:
   - start fresh DB as needed
   - run backfill if you want historical achievements preserved
   - confirm XP start boundary before enabling users
5. Rebuild container and validate:
   - leaderboard totals
   - character progression
   - wrapped pages
   - character sheet deep links

## 9) Release Notes Guidance

When publishing this upgrade, call out these items clearly:

- This is not a cosmetic update; it adds a progression economy layer.
- Wrapped year and progression start are separate controls.
- Strict verification may change who receives credit compared to legacy behavior.
- JSON file location conventions are now stricter to reduce install drift.