/* Chronicle of Conquest — reading history page */

let allUsers    = [];
let selectedUid = null;
let curFilter   = 'all';
let curYear     = 'all';
let aliases     = {};
let icons       = {};

// ── Bootstrap ────────────────────────────────────────────────────────────────

async function loadChronicle() {
    try {
        const [histResp, uiCfg] = await Promise.all([
            fetch('/awards/api/reading-history').then(r => r.json()),
            fetch('/api/ui-config').then(r => r.json()).catch(() => ({})),
        ]);

        aliases  = uiCfg.aliases || {};
        icons    = uiCfg.icons   || {};
        allUsers = histResp.users || [];

        if (!allUsers.length) {
            document.getElementById('chronicle-feed').innerHTML =
                '<div class="loader">No completed books found in the archives.</div>';
            return;
        }

        renderUserTabs();
        selectUser(allUsers[0].user_id);
    } catch (e) {
        document.getElementById('chronicle-feed').innerHTML =
            `<div class="loader">Failed to load: ${e.message}</div>`;
    }
}

// ── User tabs ────────────────────────────────────────────────────────────────

function renderUserTabs() {
    const tabs = document.getElementById('user-tabs');
    tabs.innerHTML = allUsers.map(u => {
        const name   = aliases[u.username] || u.username;
        const avatar = icons[u.username]   || `/api/avatar/${u.user_id}`;
        return `<button class="user-tab" data-uid="${u.user_id}" onclick="selectUser('${u.user_id}')">
            <img src="${avatar}" class="tab-avatar" onerror="this.style.display='none'" alt="">
            <span>${name}</span>
        </button>`;
    }).join('');
}

function selectUser(uid) {
    selectedUid = uid;
    curYear = 'all';
    document.querySelectorAll('.user-tab').forEach(t =>
        t.classList.toggle('active', t.dataset.uid === uid)
    );
    const user = allUsers.find(u => u.user_id === uid);
    if (!user) return;

    renderStats(user);
    buildYearFilter(user);
    document.getElementById('stats-banner').style.display  = 'flex';
    document.getElementById('controls-row').style.display  = 'flex';
    renderFeed(user);
}

// ── Stats banner ─────────────────────────────────────────────────────────────

function renderStats(user) {
    const s = user.stats;
    const hrs = s.total_hours >= 1000
        ? (s.total_hours / 1000).toFixed(1) + 'k'
        : s.total_hours.toLocaleString();

    document.getElementById('stats-banner').innerHTML = `
        <div class="stat-block">
            <div class="stat-icon">📚</div>
            <div class="stat-num">${s.total_books}</div>
            <div class="stat-lbl">Books Completed</div>
        </div>
        <div class="stat-sep"></div>
        <div class="stat-block">
            <div class="stat-icon">⏱</div>
            <div class="stat-num">${hrs}</div>
            <div class="stat-lbl">Hours Listened</div>
        </div>
        <div class="stat-sep"></div>
        <div class="stat-block">
            <div class="stat-icon">⚔</div>
            <div class="stat-num">${s.series_completed}</div>
            <div class="stat-lbl">Campaigns Complete</div>
        </div>
    `;
}

// ── Year filter ───────────────────────────────────────────────────────────────

function buildYearFilter(user) {
    const yearSet = new Set();
    user.books.forEach(b => {
        if (b.finished_at) yearSet.add(new Date(b.finished_at * 1000).getFullYear());
    });
    user.completed_series.forEach(c => {
        if (c.completed_at) yearSet.add(new Date(c.completed_at * 1000).getFullYear());
    });

    const years = Array.from(yearSet).sort((a, b) => b - a);
    const el = document.getElementById('year-filters');

    if (years.length <= 1) {
        el.innerHTML = '';
        return;
    }

    el.innerHTML =
        `<button class="year-btn active" data-year="all" onclick="setYear('all',this)">All Years</button>` +
        years.map(y =>
            `<button class="year-btn" data-year="${y}" onclick="setYear('${y}',this)">${y}</button>`
        ).join('');
}

function setYear(year, btn) {
    curYear = year;
    document.querySelectorAll('.year-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.year === String(year))
    );
    const user = allUsers.find(u => u.user_id === selectedUid);
    if (user) renderFeed(user);
}

// ── Filters ───────────────────────────────────────────────────────────────────

function setFilter(f, btn) {
    curFilter = f;
    document.querySelectorAll('.filter-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.filter === f)
    );
    const user = allUsers.find(u => u.user_id === selectedUid);
    if (user) renderFeed(user);
}

// ── Feed renderer ─────────────────────────────────────────────────────────────

function renderFeed(user) {
    const feed = document.getElementById('chronicle-feed');

    // Merge book + campaign events into one timeline
    const events = [];

    if (curFilter !== 'books') {
        user.completed_series.forEach(c => {
            if (curYear !== 'all' && new Date(c.completed_at * 1000).getFullYear() !== Number(curYear)) return;
            events.push({ type: 'campaign', ts: c.completed_at, data: c });
        });
    }

    if (curFilter !== 'campaigns') {
        user.books.forEach(b => {
            if (curYear !== 'all' && new Date(b.finished_at * 1000).getFullYear() !== Number(curYear)) return;
            events.push({ type: 'book', ts: b.finished_at, data: b });
        });
    }

    // Newest first; at same timestamp, campaign banners appear above the book that triggered them
    events.sort((a, b) => b.ts - a.ts || (a.type === 'campaign' ? -1 : 1));

    if (!events.length) {
        feed.innerHTML = '<div class="loader">No entries match this filter.</div>';
        return;
    }

    let html       = '';
    let lastMonth  = '';

    for (const ev of events) {
        const month = fmtMonth(ev.ts);
        if (month !== lastMonth) {
            html += `<div class="month-header">${month}</div>`;
            lastMonth = month;
        }
        html += ev.type === 'campaign'
            ? campaignCard(ev.data)
            : bookCard(ev.data);
    }

    feed.innerHTML = html;

    // Staggered fade-in via IntersectionObserver
    const entries = feed.querySelectorAll('.entry');
    if ('IntersectionObserver' in window) {
        const io = new IntersectionObserver((recs) => {
            recs.forEach(r => {
                if (r.isIntersecting) {
                    r.target.classList.add('animate-in');
                    io.unobserve(r.target);
                }
            });
        }, { threshold: 0.05 });
        entries.forEach((el, i) => {
            el.style.animationDelay = Math.min(i * 0.035, 0.7) + 's';
            io.observe(el);
        });
    } else {
        entries.forEach((el, i) => {
            el.style.animationDelay = Math.min(i * 0.035, 0.7) + 's';
            el.classList.add('animate-in');
        });
    }
}

// ── Card templates ────────────────────────────────────────────────────────────

function bookRarity(hours) {
    if (hours >= 20) return 'epic';
    if (hours >= 12) return 'rare';
    if (hours >= 6)  return 'uncommon';
    return 'common';
}

function rarityLabel(hours) {
    if (hours >= 20) return 'Epic';
    if (hours >= 12) return 'Rare';
    if (hours >= 6)  return 'Uncommon';
    return 'Common';
}

function coverUrl(cover) {
    return `/awards/covers/${encodeURIComponent(cover)}`;
}

function campaignCard(c) {
    const books    = c.books || [];
    const shown    = books.slice(0, 10);
    const overflow = books.length - shown.length;
    const chips    = shown.map(t => `<span class="book-chip" title="${t}">${t}</span>`).join('');
    const more     = overflow > 0 ? `<span class="book-chip chip-more">+${overflow} more</span>` : '';

    return `
    <div class="entry campaign-entry">
        <div class="campaign-badge">⚔ &nbsp;CAMPAIGN COMPLETE</div>
        <div class="campaign-body">
            <div class="campaign-cover-wrap">
                <img class="campaign-cover" src="${coverUrl(c.cover)}"
                     onerror="this.parentNode.style.display='none'" alt="${esc(c.series_name)}">
            </div>
            <div class="campaign-info">
                <div class="campaign-date">${fmtDate(c.completed_at)}</div>
                <div class="campaign-title">${esc(c.series_name)}</div>
                <div class="campaign-meta">${c.book_count} ${c.book_count === 1 ? 'book' : 'books'} &nbsp;·&nbsp; ${c.total_hours}h total</div>
                <div class="campaign-books">${chips}${more}</div>
            </div>
        </div>
    </div>`;
}

function bookCard(b) {
    const rarity  = bookRarity(b.duration_hours);
    const seqPart = b.sequence_str ? `Book ${b.sequence_str}` : '';
    const ofPart  = b.series_total > 1 ? ` of ${b.series_total}` : '';
    let seriesLine = '';
    if (b.series_name) {
        seriesLine = b.series_name + (seqPart ? ` · ${seqPart}${ofPart}` : '');
    }
    const durLabel = b.duration_hours > 0
        ? `${b.duration_hours}h · ${rarityLabel(b.duration_hours)}`
        : rarityLabel(b.duration_hours);

    return `
    <div class="entry book-entry rarity-${rarity}">
        <div class="rarity-stripe"></div>
        <div class="book-cover-wrap">
            <img class="book-cover" src="${coverUrl(b.cover)}"
                 onerror="this.classList.add('no-cover'); this.src=''; this.textContent='${esc(b.title[0] || '?')}';"
                 alt="${esc(b.title)}">
        </div>
        <div class="book-info">
            <div class="book-title">${esc(b.title)}</div>
            ${seriesLine ? `<div class="book-series">${esc(seriesLine)}</div>` : ''}
        </div>
        <div class="book-meta">
            <span class="duration-pill">${durLabel}</span>
            <span class="book-date">${fmtDate(b.finished_at)}</span>
        </div>
    </div>`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function esc(s) {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function fmtDate(ts) {
    if (!ts) return '';
    return new Date(ts * 1000).toLocaleDateString('en-US',
        { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtMonth(ts) {
    if (!ts) return '';
    return new Date(ts * 1000).toLocaleDateString('en-US',
        { month: 'long', year: 'numeric' }).toUpperCase();
}

// ── Expose globals ────────────────────────────────────────────────────────────

window.selectUser = selectUser;
window.setFilter  = setFilter;
window.setYear    = setYear;

document.addEventListener('DOMContentLoaded', loadChronicle);
