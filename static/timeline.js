const API_AWARDS = "/api/awards";
const API_DEFS = "/api/definitions";

let USER_ICONS = {};
let USER_ALIASES = {};

const colorMap = {
    common: "var(--r-common)",
    uncommon: "var(--r-uncommon)",
    rare: "var(--r-rare)",
    epic: "var(--r-epic)",
    legendary: "var(--r-legendary)",
};

const $ = (id) => document.getElementById(id);
let allEntries = [];
let currentFilter = "all";

function cleanItemText(value) {
    const s = String(value ?? "").trim();
    return !s || s.toLowerCase() === "none" ? "" : s;
}

function displayName(username) {
    return USER_ALIASES[username] || username;
}

function avatarUrl(username) {
    return USER_ICONS[username] || "";
}

function iconSrc(path) {
    if (!path) return "";
    return path.startsWith("/") ? path : "/icons/" + path;
}

function toEpochSec(raw, fallback = 0) {
    if (raw === null || raw === undefined || raw === "") return fallback;

    if (typeof raw === "number" && Number.isFinite(raw)) {
        let n = Math.trunc(raw);
        if (n >= 10000000000) n = Math.trunc(n / 1000);
        return n > 0 ? n : fallback;
    }

    const s = String(raw).trim();
    if (!s) return fallback;

    if (/^\d+$/.test(s)) {
        let n = parseInt(s, 10);
        if (n >= 10000000000) n = Math.trunc(n / 1000);
        return n > 0 ? n : fallback;
    }

    const parsed = Date.parse(s);
    if (!Number.isNaN(parsed)) {
        return Math.trunc(parsed / 1000);
    }

    return fallback;
}

function entryTs(a) {
    const payload = a?.payload || {};
    return toEpochSec(
        a?.earned_at ?? payload._timestamp ?? payload.earned_at ?? payload.finished_at ?? payload.finishedAt ?? payload.completed_at ?? payload.completedAt,
        toEpochSec(a?.awarded_at, 0)
    );
}

function fmtTime(epochSec) {
    if (!epochSec) return "";
    const d = new Date(epochSec * 1000);
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function fmtDayHeader(dateStr) {
    const d = new Date(dateStr + "T12:00:00");
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const yesterday = new Date(now - 86400000).toISOString().slice(0, 10);

    if (dateStr === today) return "Today";
    if (dateStr === yesterday) return "Yesterday";
    return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

function setFilter(filter, el) {
    currentFilter = filter;
    document.querySelectorAll(".filter-btn").forEach((b) => b.classList.remove("active"));
    el.classList.add("active");
    render();
}

function buildLootMeta(e) {
    const parts = [];
    if (e.slot) parts.push(cleanItemText(e.slot));

    const stats = [];
    if (e.str > 0) stats.push(`+${e.str} STR`);
    if (e.mag > 0) stats.push(`+${e.mag} MAG`);
    if (e.def > 0) stats.push(`+${e.def} DEF`);
    if (e.hp > 0) stats.push(`+${e.hp} HP`);
    if (stats.length) parts.push(stats.join(" • "));

    if (e.specialAbility) parts.push(cleanItemText(e.specialAbility));

    return parts.filter(Boolean).join(" • ");
}

async function load() {
    try {
        const [awardsResp, defsResp, uiCfg] = await Promise.all([
            fetch(API_AWARDS).then((r) => r.json()),
            fetch(API_DEFS).then((r) => r.json()),
            fetch("/api/ui-config").then((r) => r.json()).catch(() => ({})),
        ]);
        USER_ALIASES = uiCfg.aliases || {};
        USER_ICONS = uiCfg.icons || {};

        const defs = Array.isArray(defsResp) ? defsResp : (defsResp.achievements || []);
        const defMap = new Map();
        defs.forEach((d) => {
            defMap.set(String(d.id), d);
        });

        const userMap = awardsResp.user_map || {};

        allEntries = [];
        for (const u of awardsResp.users || []) {
            const uid = String(u.user_id);
            const username = userMap[uid] || u.username || uid.slice(0, 8);

            for (const a of u.awards || []) {
                const ts = entryTs(a);
                if (!ts) continue;

                const def = defMap.get(String(a.achievement_id));
                const rarity = String(a.rarity || def?.rarity || "common").toLowerCase();
                const type = String(a.type || "achievement").toLowerCase();

                allEntries.push({
                    uid,
                    username,
                    type,
                    achId: a.achievement_id,
                    name: a.achievement || a.title || def?.achievement || def?.title || a.achievement_id,
                    flavor: a.flavorText || def?.flavorText || "",
                    icon: a.iconPath || def?.iconPath || def?.icon || "",
                    rarity,
                    points: Number(a.points ?? def?.points ?? 0) || 0,
                    ts,
                    slot: cleanItemText(a.slot ?? a.payload?.slot),
                    str: Number(a.str || 0) || 0,
                    mag: Number(a.mag || 0) || 0,
                    def: Number((a.def ?? a.payload?.def ?? 0)) || 0,
                    hp: Number(a.hp || 0) || 0,
                    specialAbility: cleanItemText(a.special_ability ?? a.specialAbility ?? a.payload?.special_ability ?? a.payload?.specialAbility),
                });
            }
        }

        allEntries.sort((a, b) => b.ts - a.ts);
        render();
    } catch (e) {
        $("content").innerHTML = `<div class="loader">Failed to load: ${e.message}</div>`;
    }
}

function render() {
    let entries = allEntries;
    if (currentFilter !== "all") {
        entries = entries.filter((e) => e.rarity === currentFilter);
    }

    if (!entries.length) {
        $("content").innerHTML = `
            <div class="empty-state">
                <div class="icon">📜</div>
                <div>No deeds recorded${currentFilter !== "all" ? " for this rarity" : ""}.</div>
            </div>`;
        return;
    }

    const groups = {};
    for (const e of entries) {
        const dateStr = new Date(e.ts * 1000).toISOString().slice(0, 10);
        if (!groups[dateStr]) groups[dateStr] = [];
        groups[dateStr].push(e);
    }

    const sortedDates = Object.keys(groups).sort().reverse();

    let html = "";
    for (const dateStr of sortedDates) {
        const dayEntries = groups[dateStr];
        html += `
            <div class="day-group">
                <div class="day-header">
                    <span>${fmtDayHeader(dateStr)}</span>
                    <span class="day-count">${dayEntries.length} achievement${dayEntries.length !== 1 ? "s" : ""}</span>
                </div>
                <div class="tl-line">
        `;

        for (const e of dayEntries) {
            const c = colorMap[e.rarity] || colorMap.common;
            const src = iconSrc(e.icon);
            const iconHtml = src
                ? `<div class="tl-icon"><img src="${src}" onerror="this.parentElement.innerHTML='🏆'"></div>`
                : `<div class="tl-icon" style="font-size:1.4rem">🏆</div>`;

            const avSrc = avatarUrl(e.username);
            const avatarHtml = avSrc
                ? `<img class="tl-avatar" src="${avSrc}" onerror="this.style.background='#2a2118'">`
                : `<div class="tl-avatar" style="display:flex;align-items:center;justify-content:center;font-size:1rem;background:#2a2118;color:#a89582">?</div>`;

            const flavorHtml = e.flavor ? `<div class="tl-flavor">"${e.flavor}"</div>` : "";
            const isLoot = e.type === "gear";
            const lootMeta = isLoot ? buildLootMeta(e) : "";
            const lootMetaHtml = lootMeta ? `<div class="tl-loot-meta">${lootMeta}</div>` : "";
            const lootBadgeHtml = isLoot ? `<span class="tl-loot-badge">Loot</span>` : "";

            html += `
                <div class="tl-entry r-${e.rarity} ${isLoot ? "is-loot" : ""}">
                    ${avatarHtml}
                    ${iconHtml}
                    <div class="tl-info">
                        <div class="tl-ach-name ${isLoot ? "tl-ach-name-loot" : ""}" style="color:${c}">${e.name} ${lootBadgeHtml}</div>
                        ${flavorHtml}
                        ${lootMetaHtml}
                        <div class="tl-user">${displayName(e.username)}</div>
                    </div>
                    <div class="tl-right">
                        <div class="tl-points ${isLoot ? "tl-points-loot" : ""}" style="color:${isLoot ? c : c}">${isLoot ? "LOOT" : `+${e.points}`}</div>
                        <div class="tl-time">${fmtTime(e.ts)}</div>
                    </div>
                </div>
            `;
        }

        html += `</div></div>`;
    }

    $("content").innerHTML = html;
}

window.setFilter = setFilter;
document.addEventListener("DOMContentLoaded", load);

