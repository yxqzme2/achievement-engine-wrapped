# Achievement Engine: 2026 Evolution (Upgrade Guide)

This document outlines the major changes, new features, and architectural shifts in the **Achievement Engine** since the original version. The system has evolved from a simple achievement tracker into a full-scale **LitRPG Progression System**.

## 1. The 2026 System Shift
The engine now operates on a strict **Launch Date** of **January 01, 2026**. 
- **Data Filtering:** All statistics (Hours, Books, Series, Achievements, Loot) are filtered to include *only* data acquired on or after this date. 
- **Progression Scope:** Legacy data prior to 2026 is ignored for leveling and loot, ensuring a fresh start for all users in the new economy.
- **Limbo Mode:** A pre-launch state that hides character stats and displays "System Chatter" until the launch date is reached.

## 2. LitRPG Progression Layer (New!)
The most significant addition is the comprehensive RPG layer that transforms listening activity into character growth.

### Character Stats
Every user now has a persistent character sheet with core stats:
- **STR (Strength):** Influences book completion damage and physical gear efficiency.
- **MAG (Magic):** Influences author/narrator-based damage and specialized gear.
- **DEF (Defense):** Reduces damage taken during boss encounters.
- **HP (Health):** Determines survival in the "Wrapped" boss fight. Hard-capped at 9,999.

### Leveling & XP Economy
- **Balanced XP Model:** 
    - **Listening:** 250 XP per hour.
    - **Books:** 15,000 XP per book completion.
    - **Series:** 100,000 XP per series completion.
    - **Achievements:** Variable XP based on rarity and difficulty.
- **Anti-Double-Dip Rule:** Achievements in 'quest' or 'series_complete' categories do not grant bonus XP, as their value is already included in the hardcoded completion rewards.
- **Unspent Points:** Users earn 5 points per level (plus +20 bonus points every 10 levels) to manually distribute into stats via the new UI (PIN protected).

## 3. Gear & Loot System (New!)
Users now earn tangible rewards for their progress.
- **Inventory Management:** Earn gear from book completions, series milestones, and level-up rewards.
- **Equipment Slots:** Six slots: **Head, Chest, Weapon, Neck, Ring, Trinket**.
- **Combat Power (CP):** A unified "strength" score derived from level, stats, and equipped gear.
- **Loot Catalog:** Managed via `csv/loot.csv` with automated balancing tools (`audit_loot_points.py`).
- **PIN Protection:** Equipping gear and spending stat points requires a user-set PIN for security.

## 4. Quests & Directives (New!)
The system now treats content as "Directives" on a quest board:
- **World Quests (Campaign):** Epic objectives tied to full series.
- **Side Quests:** Targeted missions for individual books.
- **Standard Bounties:** General behavioral and milestone achievements.

## 5. The "Wrapped" Boss Event (New!)
A massive year-end event where all users' stats and listening history are used to combat a global boss.
- **Fixed Boss HP:** 250,000 HP.
- **Dynamic Damage:** Five distinct strikes based on total hours, books, top authors, binge sessions, and Combat Power.
- **Survival Check:** Your DEF and HP determine if you survive the boss's retaliation.

## 6. Library Discovery & Automation (New!)
New administrative tools to keep the engine updated as your library grows:
- **`audit_library.py`:** Scans Audiobookshelf for new content not yet in the engine.
- **`generate_system_content.py`:** Automatically generates themed achievements and loot for new books/series.

## 7. Architectural Enhancements
- **Enhanced Evaluators:** New modules for `behavior_session`, `behavior_streak`, `narrator`, `author`, `series_shape`, and more.
- **Cover Sync:** Automated downloading of book covers from Audiobookshelf to power the new visual UIs.
- **Unified API:** A vastly expanded REST API for character sheets, inventory, quests, and boss stats.
- **Static Asset Fallback:** Supports volume-mounted `/static` files for easy UI customization without rebuilding containers.

## 8. Upgrade Steps for Existing Users
If you are moving from the original version to the 2026 Edition:
1. **Grandfather Init:** The first time an existing user is processed, the system runs a one-time "Grandfather" routine.
2. **Legacy Badge:** Awards the "Echo of the Ancestor" (`loot_000b`) badge.
3. **Historical Scan:** Evaluates all pre-2026 completions to populate your initial inventory (though XP remains scoped to 2026+).
4. **PIN Setup:** You will be prompted to set a PIN in the new Character Sheet UI before you can equip gear or spend points.

---
*The System has evolved. Welcome to the new era of the Achievement Engine.*
