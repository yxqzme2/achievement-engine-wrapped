// ===========================================================
// CONFIG & API
// ===========================================================
const API_AWARDS = "/api/awards";
const API_DEFS = "/api/definitions";
const API_PROGRESS = "/api/progress";
let TARGET_USERS = [];  // populated from ui-config if available
let USER_ICONS = {};
let USER_ALIASES = {};

const CATEGORY_ALIASES = {
    "author": "Author Mastery",
    "behavior_session": "Session Rituals",
    "behavior_streak": "Streak Discipline",
    "behavior_time": "Listening Habits",
    "milestone_yearly": "Persistent Listening",
    "duration": "Endurance",
    "milestone_books": "Book Milestones",
    "milestone_series": "Series Milestones",
    "milestone_time": "Time Milestones",
    "misc": "Special Feats",
    "narrator": "Narrator Mastery",
    "series_complete": "Series Completion",
    "series_shape": "Series Patterns",
    "social": "Social Achievements",
    "title_keyword": "Title Themes"
};

// ===========================================================
// STATE
// ===========================================================
const state = {
    awards: null,
    defs: null,
    progress: null,
    selectedUserId: null,
    view: "all",
    category: "",
    search: "",
    rarity: null
};

// Cache rendered HTML by state key so switching back to a user is instant
const renderCache = new Map();

const $ = (id) => document.getElementById(id);
const safeStr = (v) => (v === null || v === undefined) ? "" : String(v);
const iconUrl = (def) => {
    const p = safeStr(def.iconPath || "");
    if (!p) return "";
    return p.startsWith("/") ? p : ("/icons/" + p);
};
const fmtDate = (epochSec) => epochSec ? new Date(epochSec * 1000).toLocaleDateString() : "";

const inferMilestoneTarget = (def) => {
    const id = safeStr(def.id || def.achievement_id || "");
    let m = id.match(/^finish_(\d+)_books_total_/i);
    if (m) return { type: "books_total", target: parseInt(m[1], 10) };
    m = id.match(/^finish_(\d+)_hours_total_/i);
    if (m) return { type: "listening_hours", target: parseInt(m[1], 10) };
    const trig = safeStr(def.trigger || "");
    m = trig.match(/finish\s+(\d+)\s+books?\s+total/i);
    if (m) return { type: "books_total", target: parseInt(m[1], 10) };
    m = trig.match(/(\d+)\s+hours?/i);
    if (m && /hours?/i.test(trig) && /listening|listen/i.test(trig)
        && !/single.*session/i.test(trig) && !/weekend/i.test(trig)) {
        return { type: "listening_hours", target: parseInt(m[1], 10) };
    }
    // Series completion: "Complete all books in <SeriesName>"
    m = trig.match(/complete all books in\s+(.+)/i);
    if (m) return { type: "series_complete", seriesName: m[1].trim() };
            // Yearly books: "Finish 100 books in a single calendar year"
    m = trig.match(/finish\s+(\d+)\s+books?\s+in\s+a\s+single\s+calendar\s+year/i);
    if (m) return { type: "books_yearly", target: parseInt(m[1], 10) };

    return null;
};

// ===========================================================
// TOOLTIP & RARITY LOGIC
// ===========================================================
const tooltip = document.getElementById('cursorTooltip');

function initTooltips() {
    document.querySelectorAll('.rarity-icon').forEach(icon => {
        icon.addEventListener('mouseenter', (e) => {
            const tooltip = document.getElementById('cursorTooltip');
            tooltip.innerText = icon.getAttribute('data-rarity');
            tooltip.style.opacity = '1';
        });
        icon.addEventListener('mousemove', (e) => {
            const tooltip = document.getElementById('cursorTooltip');
            tooltip.style.left = (e.clientX + 15) + 'px';
            tooltip.style.top = (e.clientY + 15) + 'px';
        });
        icon.addEventListener('mouseleave', () => {
            const tooltip = document.getElementById('cursorTooltip');
            tooltip.style.opacity = '0';
        });
    });
}

function toggleRarity(rarity, element) {
    state.rarity = rarity; // Null for All, String for others
    document.querySelectorAll('.rarity-icon').forEach(el => el.classList.remove('active'));
    if (element) element.classList.add('active');
    render();
}

// ===========================================================
// MAIN LOGIC
// ===========================================================
async function loadData() {
    try {
        const [aw, defs, prog, uiCfg] = await Promise.all([
            fetch(API_AWARDS).then(r => r.json()),
            fetch(API_DEFS).then(r => r.json()),
            fetch(API_PROGRESS).then(r => r.json()),
            fetch("/api/ui-config").then(r => r.json()).catch(() => ({})),
        ]);
        USER_ALIASES = uiCfg.aliases || {};
        USER_ICONS = uiCfg.icons || {};
        TARGET_USERS = Object.keys(USER_ALIASES);
        state.awards = aw;
        state.defs = defs;
        state.progress = prog;
        renderCache.clear();

        initUserTabs();
        populateCategoryList();
        render();
        
    } catch (e) {
        $("achievementList").innerHTML = `<div class="loader" style="color:#a00">Error loading data.<br>${e.message}</div>`;
    }
}

function initUserTabs() {
    const users = state.awards?.users || [];
    const userMap = state.awards?.user_map || {};
    
    let roster = users.map(u => ({
        id: u.user_id,
        username: u.username || userMap[u.user_id] || u.user_id
    }));

    roster.sort((a,b) => {
        const ai = TARGET_USERS.indexOf(a.username);
        const bi = TARGET_USERS.indexOf(b.username);
        if (ai !== -1 && bi !== -1) return ai - bi;
        if (ai !== -1) return -1;
        if (bi !== -1) return 1;
        return a.username.localeCompare(b.username);
    });

    const shelf = $("userTabShelf");
    shelf.innerHTML = "";
    if (!state.selectedUserId && roster.length > 0) state.selectedUserId = roster[0].id;

    roster.forEach(u => {
        const tab = document.createElement("div");
        tab.className = "user-tab";
        if (u.id === state.selectedUserId) tab.classList.add("active");
        
        const alias = USER_ALIASES[u.username] || u.username;
        const iconSrc = USER_ICONS[u.username] || "/icons/avatar_default.png";
        
        const label = document.createElement("span");
        label.className = "user-tab-label";
        label.innerText = alias;
        
        const img = document.createElement("img");
        img.className = "user-tab-avatar";
        img.src = iconSrc;
        img.onerror = () => { img.style.display = 'none'; }; 

        tab.appendChild(label);
        tab.appendChild(img);

        tab.onclick = () => {
            state.selectedUserId = u.id;
            document.querySelectorAll(".user-tab").forEach(t => t.classList.remove("active"));
            tab.classList.add("active");
            requestAnimationFrame(() => render());
        };
        shelf.appendChild(tab);
    });
}

// Global selectUser for mobile strip
window.selectUser = function(userId) {
    state.selectedUserId = userId;
    document.querySelectorAll(".user-tab").forEach(t => t.classList.remove("active"));
    initUserTabs(); // re-render tabs with correct active state
    render();
};

function populateCategoryList() {
    let rawCats = [];
    if (Array.isArray(state.defs)) {
        rawCats = state.defs;
    } else if (state.defs && state.defs.achievements) {
        rawCats = state.defs.achievements;
    }

    const cats = new Set();
    rawCats.forEach(d => {
        if(d.category) cats.add(d.category);
    });
    
    const listContainer = $("categoryList");
    listContainer.innerHTML = "";
    
    const allDiv = document.createElement("div");
    allDiv.className = "cat-item active";
    allDiv.innerText = "All Categories";
    allDiv.onclick = () => selectCategory("", allDiv);
    listContainer.appendChild(allDiv);

    const catArray = Array.from(cats).map(c => ({
        id: c,
        name: CATEGORY_ALIASES[c] || c.charAt(0).toUpperCase() + c.slice(1) 
    }));

    catArray.sort((a,b) => a.name.localeCompare(b.name));

    catArray.forEach(c => {
        const div = document.createElement("div");
        div.className = "cat-item";
        div.innerText = c.name;
        div.onclick = () => selectCategory(c.id, div);
        listContainer.appendChild(div);
    });
}

function selectCategory(catName, element) {
    state.category = catName;
    document.querySelectorAll('.cat-item').forEach(el => el.classList.remove('active'));
    element.classList.add('active');
    render();
}

function setFilter(viewMode, el) {
    state.view = viewMode;
    document.querySelectorAll('.side-tab').forEach(d => d.classList.remove('active'));
    el.classList.add('active');
    render();
}

function handleSearch() {
    state.search = $("searchBox").value.toLowerCase();
    render();
}

// --- Tooltip Handlers (New) ---
window.showAchTooltip = function(el) {
    const title = el.getAttribute('data-title');
    const rarity = el.getAttribute('data-rarity');
    const points = el.getAttribute('data-points');
    const trigger = el.getAttribute('data-trigger');
    const flavor = el.getAttribute('data-flavor');
    
    const tip = document.getElementById('cursorTooltip');
    const colorVar = `var(--r-${rarity.toLowerCase()})`;
    
    // Update border color and add a matching glow
    tip.style.borderColor = colorVar;
    tip.style.boxShadow = `0 0 8px ${colorVar}, 0 4px 20px rgba(0,0,0,0.8)`;

    tip.innerHTML = `
        <div class="tt-title" style="color:${colorVar}">${title}</div>
        <div class="tt-type" style="color:${colorVar}">${rarity} Achievement (${points} pts)</div>
        <div class="tt-desc">${trigger}</div>
        ${flavor ? `<div class="tt-divider"></div><div class="tt-flavor">"${flavor}"</div>` : ''}
    `;
    tip.style.opacity = '1';
};
window.moveAchTooltip = function(e) {
    const tip = document.getElementById('cursorTooltip');
    tip.style.left = (e.clientX + 15) + 'px';
    tip.style.top = (e.clientY + 15) + 'px';
};
window.hideAchTooltip = function() {
    document.getElementById('cursorTooltip').style.opacity = '0';
};

// --- Batched DOM renderer ---
// Inserts first FIRST_N cards immediately (visible above fold), then adds the
// rest in background batches so the tab click feels instant.
function renderBatched(cards, listEl) {
    const FIRST_N = 30;
    const BATCH = 50;
    listEl.innerHTML = "";
    if (cards.length === 0) return;

    listEl.insertAdjacentHTML('beforeend', cards.slice(0, FIRST_N).join(''));

    if (cards.length <= FIRST_N) return;

    let offset = FIRST_N;
    function nextBatch() {
        listEl.insertAdjacentHTML('beforeend', cards.slice(offset, offset + BATCH).join(''));
        offset += BATCH;
        if (offset < cards.length) setTimeout(nextBatch, 0);
    }
    setTimeout(nextBatch, 0);
}

// --- Main Render Function ---
function render() {
    if (!state.awards || !state.selectedUserId) return;

    const listEl = $("achievementList");
    const cacheKey = `${state.selectedUserId}|${state.view}|${state.category}|${state.rarity || ''}|${state.search}`;

    if (renderCache.has(cacheKey)) {
        const cached = renderCache.get(cacheKey);
        $("userPoints").innerText = cached.points;
        $("pageTitle").innerText = cached.title;
        renderBatched(cached.cards, listEl);
        return;
    }

    const userAwardData = state.awards.users.find(u => u.user_id === state.selectedUserId);
    const userProgData = state.progress.users.find(u => u.user_id === state.selectedUserId);
    $("userPoints").innerText = userAwardData ? (userAwardData.points || 0) : 0;
    
    // Optimization: Create a Map for O(1) lookups instead of .find() inside a loop
    const earnedMap = new Map();
    if (userAwardData?.awards) {
        userAwardData.awards.forEach(a => {
            earnedMap.set(String(a.achievement_id), a);
        });
    }
    
    let definitions = [];
    if (Array.isArray(state.defs)) {
        definitions = state.defs;
    } else if (state.defs && state.defs.achievements) {
        definitions = state.defs.achievements;
    }

    const finishedCount = userProgData?.metrics?.finished_count ?? 0;
    const listeningHours = userProgData?.metrics?.listening_hours ?? 0;
    const booksByYear = userProgData?.metrics?.books_by_year || {};
    const maxBooksYear = Math.max(...Object.values(booksByYear).map(Number), 0);
    
    // Optimization: Map series progress for O(1) lookup
    const seriesProgMap = new Map();
    if (userProgData?.series_progress) {
        userProgData.series_progress.forEach(sp => {
            seriesProgMap.set(sp.seriesName.toLowerCase(), sp);
        });
    }

    let items = definitions.map(def => {
        const id = String(def.id || "");
        const earnedRow = earnedMap.get(id);
        const isEarned = !!earnedRow;
        
        let current = 0, target = 0, percent = 0;
        
        if (isEarned) {
            percent = 100;
            current = target = 1; 
        } else {
            const mil = inferMilestoneTarget(def);
            if (mil) {
                if (mil.type === "series_complete") {
                    const sp = seriesProgMap.get(mil.seriesName.toLowerCase());
                    if (sp) {
                        current = sp.done;
                        target = sp.total;
                        percent = Math.min(100, (current / target) * 100);
                    }
                } else {
                    target = mil.target;
                    if (mil.type === "books_total") current = finishedCount;
                    if (mil.type === "listening_hours") current = Math.floor(listeningHours);
                    if (mil.type === "books_yearly") current = maxBooksYear;
                    if (target > 0) percent = Math.min(100, (current / target) * 100);
                }
            }
        }

        return {
            def, id, isEarned,
            earnedAt: earnedRow?.awarded_at,
            points: def.points || 0,
            progress: { current, target, percent },
            sharedDetail: (() => {
                const p = earnedRow?.payload;
                if (!p || !p.otherUser) return "";
                const alias = USER_ALIASES[p.otherUser] || p.otherUser;
                const title = p.bookTitle || "";
                return title ? `${title} — with ${alias}` : `with ${alias}`;
            })()
        };
    });

    // Filtering logic (remains mostly same, but uses pre-calculated fields)
    items = items.filter(item => {
        if (state.search) {
            const searchableFields = [
                item.def.achievement,
                item.def.title,      
                item.def.trigger,    
                item.def.category    
            ];
            const text = searchableFields.map(s => (s || "").toLowerCase()).join(" ");
            if (!text.includes(state.search)) return false;
        }
        if (state.category && item.def.category !== state.category) return false;
        if (state.rarity && (item.def.rarity || "Common") !== state.rarity) return false;

        if (state.view === "earned") return item.isEarned;
        if (state.view === "unearned") return !item.isEarned;
        if (state.view === "near") return !item.isEarned && item.progress.percent >= 50;
        if (state.view === "recommended") return !item.isEarned && (item.progress.percent > 25 || item.points <= 10);
        return true;
    });

    // Sorting
    items.sort((a, b) => {
        if (a.isEarned !== b.isEarned) return a.isEarned ? 1 : -1;
        if (!a.isEarned) return b.progress.percent - a.progress.percent;
        return (b.earnedAt || 0) - (a.earnedAt || 0);
    });

    const titleMap = {
        'all': 'All Records', 'earned': 'Completed', 'unearned': 'Locked',
        'near': 'Near Completion', 'recommended': 'Recommended'
    };
    $("pageTitle").innerText = titleMap[state.view] || "Journal";

    if (items.length === 0) {
        listEl.innerHTML = `<div class="loader">No achievements found in this section.</div>`;
        return;
    }

    const TRIGGER_MASKS = {
        "finish_your_first_book_first_word": "Finish your first book."
    };

    const cards = items.map(item => {
        const d = item.def;
        const p = item.progress;
        const rarity = d.rarity || "Common";
        const displayName = d.achievement || d.title || "Unknown";
        const displayTrigger = TRIGGER_MASKS[item.id] || d.trigger || "";
        let statusHtml = '';
        if (!item.isEarned && p.target > 0) {
            statusHtml = `<div class="meta-bottom">${p.current} / ${p.target}<div class="prog-bar-bg"><div class="prog-bar-fill" style="width:${p.percent}%"></div></div></div>`;
        } else if (item.isEarned) {
            statusHtml = `<div class="meta-bottom" style="color:#2b1b00">${fmtDate(item.earnedAt)}</div>`;
        } else {
            statusHtml = `<div class="meta-bottom" style="font-style:italic">Locked</div>`;
        }
        return `<div class="ach-card ${item.isEarned ? 'earned' : ''}" data-title="${safeStr(displayName)}" data-rarity="${rarity}" data-points="${item.points}" data-trigger="${safeStr(displayTrigger).replace(/"/g, '&quot;')}" data-flavor="${safeStr(d.flavorText || "").replace(/"/g, '&quot;')}" onmouseenter="showAchTooltip(this)" onmousemove="moveAchTooltip(event)" onmouseleave="hideAchTooltip()"><div class="ach-icon" style="border-color:var(--r-${rarity.toLowerCase()})">${iconUrl(d) ? `<img src="${iconUrl(d)}" onerror="this.style.display='none'">` : ''}</div><div class="ach-info"><div class="ach-title">${safeStr(displayName)}</div>${d.flavorText ? `<div class="ach-desc" style="font-style:italic;color:#b89548">"${d.flavorText}"</div>` : ''}${item.sharedDetail ? `<div class="ach-desc" style="color:#7ec8e3;font-size:0.85em;margin-top:4px">📖 ${item.sharedDetail}</div>` : ''}</div><div class="ach-meta"><div class="point-shape glow-${rarity}"><span>${item.points}</span></div>${statusHtml}</div></div>`;
    });

    renderCache.set(cacheKey, {
        cards,
        points: $("userPoints").innerText,
        title: $("pageTitle").innerText
    });

    renderBatched(cards, listEl);

    if (typeof buildMobileUserStrip === 'function') buildMobileUserStrip();
}

function buildMobileUserStrip() {
    const strip = $("mobileUserStrip");
    if (!strip) return;
    const users = state.awards?.users || [];
    const userMap = state.awards?.user_map || {};
    let roster = users.map(u => ({
        id: u.user_id,
        username: u.username || userMap[u.user_id] || u.user_id
    }));
    if (TARGET_USERS.length) {
        roster = roster.filter(u => TARGET_USERS.includes(u.username));
        roster.sort((a, b) => TARGET_USERS.indexOf(a.username) - TARGET_USERS.indexOf(b.username));
    }

    strip.innerHTML = roster.map(u => {
        const alias = USER_ALIASES[u.username] || u.username;
        const icon = USER_ICONS[u.username] || "";
        const isActive = u.id === state.selectedUserId;
        return `<div class="mobile-user-btn ${isActive ? 'active' : ''}" onclick="selectUser('${u.id}')">
            ${icon ? `<img src="${icon}" onerror="this.style.display='none'">` : ''}
            ${alias}
        </div>`;
    }).join("");
}

function mobileSetFilter(view, el) {
    document.querySelectorAll('.mobile-filter-btn').forEach(b => b.classList.remove('active'));
    if (el) el.classList.add('active');
    state.view = view;
    document.querySelectorAll('.side-tab').forEach(t => t.classList.remove('active'));
    render();
}

function toggleMobileSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const overlay = $("sidebarOverlay");
    sidebar.classList.toggle('mobile-open');
    overlay.classList.toggle('visible');
}

function setupMobileTapTooltip() {
    if (window.innerWidth > 768) return;
    document.addEventListener('click', function(e) {
        const card = e.target.closest('.ach-card');
        const tip = document.getElementById('cursorTooltip');
        if (card) {
            showAchTooltip(card);
            tip.style.opacity = '1';
            e.stopPropagation();
        } else {
            tip.style.opacity = '0';
        }
    });
}

// Ensure these functions are globally accessible for HTML handlers
window.toggleRarity = toggleRarity;
window.selectCategory = selectCategory;
window.setFilter = setFilter;
window.handleSearch = handleSearch;
window.mobileSetFilter = mobileSetFilter;
window.toggleMobileSidebar = toggleMobileSidebar;

// Initial Load
document.addEventListener('DOMContentLoaded', () => {
    initTooltips();
    loadData();

    setTimeout(() => {
        buildMobileUserStrip();
        setupMobileTapTooltip();
    }, 500);
});
