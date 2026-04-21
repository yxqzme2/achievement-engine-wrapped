# Achievement Engine: 2026 Wrapped Battle System
## Technical Documentation & Damage Formulas

This document outlines the mathematical foundation for the "Wrapped" combat simulation. In this encounter, the Player (Asset) faces off against the System Administrator (Boss) in a multi-stage battle based on their 2026 listening data and RPG stats.

---

## 1. Core Battle Parameters
*   **Boss Health (Administrator HP):** **250,000 HP** (Fixed)
*   **Data Scope:** **2026 Only.** All "Legacy" or "Pre-System" data is excluded from damage calculations to ensure the Wrapped experience reflects only the current year's achievements.
*   **Victory Condition:** Total Damage (Slides 1-4 + 6) ≥ 250,000.
*   **Survival Condition:** User Current HP > Boss Retaliation Damage (Slide 5).

---

## 2. Multi-Stage Combat Log (The Slides)

### Phase 1: The Chronos Strike (Hours)
*Reflects the sheer volume of time spent within the System.*
*   **Formula:** `Math.min(75000, Hours * 125)`
*   **Damage Cap:** **30% (75,000 DMG)**
*   **Max Threshold:** 600 Hours for 100% efficiency.

### Phase 2: The Arsenal Expansion (Books & STR)
*Combines the quantity of books finished with the player's physical Strength (STR).*
*   **Formula:** `Math.min(62500, (Books * 400) + (STR * 22))`
*   **Damage Cap:** **25% (62,500 DMG)**
*   **Ideal Build:** ~100 Books and ~1,000+ STR to hit the cap.

### Phase 3: The Author's Summons (Magic/MAG)
*A magical strike powered by the player's affinity for their top creators.*
*   **Formula:** `Math.min(37500, (MAG * 25) + (TopAuthorHours * 50))`
*   **Damage Cap:** **15% (37,500 DMG)**
*   **Primary Stat:** MAG (Magic).

### Phase 4: Personality Poison (Sustain/MAG)
*A persistent DoT based on listening habits and "Binge" frequency.*
*   **Formula (DMG):** `Math.min(25000, (MAG * 15) + (BingeSessions * 1000))`
*   **Damage Cap:** **10% (25,000 DMG)**
*   **Sustain (HEAL):** `(MAG * 2) + (TotalBooks * 10)` (Restores User HP).

### Phase 5: The Administrator's Retaliation (DEF/Survival)
*The Boss strikes back. This is a survival check, not a damage phase.*
*   **Boss Attack Formula:** `(2500 + PeakMonthHours * 15) - (Total_DEF * 3)`
*   **Survival Check:** If `User_HP - Boss_Attack <= 0`, the status is **"ASSET LIQUIDATED"** (Failure).
*   **Primary Stat:** DEF (Defense) and Max HP.

### Phase 6: Final Execute (CP)
*The ultimate purge, utilizing the player's total Combat Power (CP).*
*   **Formula:** `Math.min(62500, CP * 15)`
*   **Damage Cap:** **25% (62,500 DMG)**
*   **Note:** This phase provides a 5% "Overkill" buffer if previous phases were sub-optimal.

---

## 3. Gear Point System (The "Rule of Stats")
To prevent "God Tier" items and force strategic builds (Warrior vs. Mage), all gear must follow a strict point budget based on rarity.

### Stat Budgets (Total Points)
*   **Legendary:** 100 Points
*   **Epic:** 80 Points
*   **Rare:** 60 Points
*   **Uncommon:** 40 Points
*   **Common:** 20 Points

### Point Conversion Rates
*   **1 Point** = 1 STR, 1 MAG, or 1 DEF
*   **1 Point** = 5 HP

### The Stat Concentration Rule
No single item may have more than **60% of its total budget** in one stat (STR, MAG, or DEF). 
*Example: A Legendary Item (100 pts) can have at most **60 STR**. The remaining 40 points must be distributed into other stats or HP.*

---

## 4. Win/Loss Logic (Recursion Protocol)
*   **Victory (PURGE ABORTED):** The System yields. The player proceeds to the Outro and rewards.
*   **Failure (ASSET LIQUIDATED):** The simulation resets.
*   **Retry Mechanic:** Players are informed that sub-optimal configurations led to failure and are encouraged to adjust their gear or stat points in the **Forge** before attempting the **Recursion Protocol** (Retry).
