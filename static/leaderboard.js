const API_AWARDS = "/api/awards";
const API_PROGRESS = "/api/progress";
const API_DEFS = "/api/definitions";
const API_GEAR_CATALOG = "/awards/api/gear/catalog";

let USER_ICONS = {};
let USER_ALIASES = {};

const $ = id => document.getElementById(id);

function showTT(e, el) {
    const tt = $("tooltip");
    if (!tt) return;
    const rc = el.dataset.rarity || "common";
    const colorMap = { common: "var(--r-common)", uncommon: "var(--r-uncommon)", rare: "var(--r-rare)", epic: "var(--r-epic)", legendary: "var(--r-legendary)" };
    const c = colorMap[rc] || colorMap.common;
    const isLoot = (el.dataset.kind || "").toLowerCase() === "gear";
    const rarityLabel = (rc || "common").toUpperCase();
    const footer = isLoot
        ? `<div class="tt-pts" style="color:${c}">LOOT</div>`
        : `<div class="tt-pts" style="color:${c}">+${el.dataset.pts} pts</div>`;
    tt.innerHTML = `
        <div class="tt-name" style="color:${c}">${el.dataset.name}</div>
        ${el.dataset.flavor ? `<div class="tt-flavor">"${el.dataset.flavor}"</div>` : ""}
        ${footer}
    `;
    tt.style.display = "block";
    moveTT(e);
}

function moveTT(e) {
    const tt = $("tooltip");
    if (!tt) return;
    tt.style.left = (e.clientX + 14) + "px";
    tt.style.top = (e.clientY + 14) + "px";
}

function hideTT() { 
    const tt = $("tooltip");
    if (tt) tt.style.display = "none"; 
}

async function load() {
    try {
        const [awardsResp, progResp, defsResp, uiCfg, gearCatalogResp] = await Promise.all([
            fetch(API_AWARDS).then(r => r.json()),
            fetch(API_PROGRESS).then(r => r.json()),
            fetch(API_DEFS).then(r => r.json()),
            fetch("/api/ui-config").then(r => r.json()).catch(() => ({})),
            fetch(API_GEAR_CATALOG).then(r => (r.ok ? r.json() : [])).catch(() => []),
        ]);
        USER_ALIASES = uiCfg.aliases || {};
        USER_ICONS = uiCfg.icons || {};

        const defs = Array.isArray(defsResp) ? defsResp : (defsResp.achievements || []);
        
        // Optimization: Use a Map for O(1) definition lookups
        const defMap = new Map();
        defs.forEach(d => { defMap.set(String(d.id), d); });
        const gearMap = new Map();
        (Array.isArray(gearCatalogResp) ? gearCatalogResp : []).forEach(g => {
            const id = String(g.item_id || "").trim();
            if (id) gearMap.set(id.toLowerCase(), g);
        });

        const userMap = awardsResp.user_map || {};
        const awardsUsers = awardsResp.users || [];
        
        // Optimization: Use a Map for O(1) progress lookups
        const progMap = new Map();
        if (progResp.users) {
            progResp.users.forEach(p => { progMap.set(String(p.user_id), p); });
        }

        const board = awardsUsers.map(u => {
            const uid = String(u.user_id);
            const username = userMap[uid] || uid.slice(0, 8);
            const awards = u.awards || [];
            const points = u.points || 0;
            const prog = progMap.get(uid);

            const rarityCounts = { common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 0 };
            awards.forEach(a => {
                const def = defMap.get(String(a.achievement_id));
                const gear = gearMap.get(String(a.achievement_id || "").toLowerCase());
                const r = String(a.rarity || gear?.rarity || def?.rarity || "common").toLowerCase();
                if (rarityCounts.hasOwnProperty(r)) rarityCounts[r]++;
            });

            const sorted = [...awards].sort((a, b) => ((b.earned_at || b.awarded_at || 0) - (a.earned_at || a.awarded_at || 0)));
            const recent = sorted.slice(0, 5).map(a => {
                const def = defMap.get(String(a.achievement_id));
                const gear = gearMap.get(String(a.achievement_id || "").toLowerCase());
                return {
                    name: a.achievement || a.title || gear?.item_name || def?.achievement || def?.title || a.achievement_id,
                    icon: a.iconPath || gear?.icon || def?.iconPath || def?.icon || "",
                    rarity: String(a.rarity || gear?.rarity || def?.rarity || "common").toLowerCase(),
                    kind: String(a.type || (String(a.achievement_id || "").toLowerCase().startsWith("loot_") ? "gear" : "achievement")).toLowerCase(),
                    date: a.earned_at || a.awarded_at,
                    flavor: a.flavorText || gear?.flavor_text || def?.flavorText || def?.title || "",
                    points: Number(a.points ?? def?.points ?? 0) || 0,
                };
            });

            return {
                uid, username, points,
                totalAwards: awards.length,
                rarityCounts,
                recent,
                hours: prog?.metrics?.listening_hours || 0,
                books: prog?.metrics?.finished_count || 0,
            };
        });

        board.sort((a, b) => b.points - a.points);
        board.forEach((u, i) => { u.rank = i + 1; });

        render(board);
    } catch (e) {
        const content = $("content");
        if (content) content.innerHTML = `<div class="loader">Failed to load: ${e.message}</div>`;
    }
}

function avatarUrl(uid, username) {
    return USER_ICONS[username] || `/api/avatar/${uid}`;
}

function displayName(username) {
    return USER_ALIASES[username] || username;
}

function formatHours(h) {
    return h >= 1000 ? (h/1000).toFixed(1) + "k" : Math.floor(h).toLocaleString();
}

function rarityBar(counts) {
    const total = Object.values(counts).reduce((s, v) => s + v, 0);
    if (!total) return '<div class="rarity-bar"></div>';
    const colors = {
        legendary: "var(--r-legendary)",
        epic: "var(--r-epic)",
        rare: "var(--r-rare)",
        uncommon: "var(--r-uncommon)",
        common: "var(--r-common)",
    };
    let segments = "";
    for (const [rarity, color] of Object.entries(colors)) {
        const pct = (counts[rarity] || 0) / total * 100;
        if (pct > 0) {
            segments += `<div class="seg" style="width:${pct}%;background:${color}" title="${rarity}: ${counts[rarity]}"></div>`;
        }
    }
    return `<div class="rarity-bar">${segments}</div>`;
}

function iconSrc(path) {
    if (!path) return "";
    return path.startsWith("/") ? path : "/icons/" + path;
}

function render(board) {
    const content = $("content");
    if (!content) return;
    
    if (!board.length) {
        content.innerHTML = '<div class="loader">No champions yet...</div>';
        return;
    }

    const totalPoints = board.reduce((s, u) => s + u.points, 0);
    const subtitle = $("subtitle");
    if (subtitle) subtitle.textContent = `${board.length} champions · ${totalPoints.toLocaleString()} total points earned`;

    const podiumOrder = [1, 0, 2];
    const top3 = board.slice(0, 3);
    let podiumHtml = '<div class="podium">';
    for (const idx of podiumOrder) {
        if (idx >= top3.length) continue;
        const u = top3[idx];
        const rankClass = `rank-${u.rank}`;
        const medal = u.rank === 1 ? "👑" : u.rank === 2 ? "⚔️" : "🗡️";
        podiumHtml += `
            <div class="podium-slot ${rankClass}">
                <div class="podium-badge">${medal}</div>
                <img class="podium-avatar" src="${avatarUrl(u.uid, u.username)}" 
                     onerror="this.style.background='#2a2118'" alt="${displayName(u.username)}">
                <div class="podium-name">${displayName(u.username)}</div>
                <div class="podium-points">${u.points.toLocaleString()}</div>
                <div class="podium-pedestal">${u.rank}</div>
            </div>
        `;
    }
    podiumHtml += '</div>';

    let tableHtml = `
        <div class="stats-section">
            <h2>Full Rankings</h2>
            <table class="stats-table">
                <thead>
                    <tr>
                        <th style="width:50px">Rank</th>
                        <th>Champion</th>
                        <th style="text-align:center">Points</th>
                        <th style="text-align:center">Awards</th>
                        <th style="text-align:center">Books</th>
                        <th style="text-align:center">Hours</th>
                        <th>Rarity Breakdown</th>
                        <th>Recent Achievements</th>
                    </tr>
                </thead>
                <tbody>
    `;

    for (const u of board) {
        const rankColor = u.rank === 1 ? "gold" : u.rank === 2 ? "silver" : u.rank === 3 ? "bronze" : "";

        const recentHtml = u.recent.map(r => {
            const src = iconSrc(r.icon);
            const imgTag = src ? `<img class="recent-ach-icon" src="${src}" onerror="this.style.display='none'">` : "";
            const flavor = r.flavor ? r.flavor.replace(/"/g, '&quot;') : "";
            return `<span class="recent-ach" 
                data-name="${r.name}" data-flavor="${flavor}" data-pts="${r.points}" data-rarity="${r.rarity}" data-kind="${r.kind || 'achievement'}"
                onmouseenter="showTT(event,this)" onmousemove="moveTT(event)" onmouseleave="hideTT()"
                >${imgTag}${r.name}</span>`;
        }).join("");

        tableHtml += `
            <tr>
                <td class="rank-cell ${rankColor}">${u.rank}</td>
                <td>
                    <div class="user-cell">
                        <img class="table-avatar" src="${avatarUrl(u.uid, u.username)}"
                             onerror="this.style.background='#2a2118'" alt="${displayName(u.username)}">
                        <span class="table-username">${displayName(u.username)}</span>
                    </div>
                </td>
                <td style="text-align:center"><span class="stat-value">${u.points.toLocaleString()}</span></td>
                <td style="text-align:center"><span class="stat-value">${u.totalAwards}</span></td>
                <td style="text-align:center">
                    <span class="stat-value">${u.books}</span>
                </td>
                <td style="text-align:center">
                    <span class="stat-value">${formatHours(u.hours)}</span>
                </td>
                <td>${rarityBar(u.rarityCounts)}</td>
                <td style="max-width:300px">${recentHtml}</td>
            </tr>
        `;
    }

    tableHtml += '</tbody></table></div>';
    content.innerHTML = podiumHtml + tableHtml;
}

// Global exposure
window.showTT = showTT;
window.moveTT = moveTT;
window.hideTT = hideTT;

document.addEventListener('DOMContentLoaded', load);


